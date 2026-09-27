import { createTools } from "../tools/index";
import { Operator } from "../provider/operator";
import { gatherContext, buildSystemPrompt } from "./context";
import { compactHistory } from "./compaction";
import { SessionLogger } from "./logger";
import { isToolError, formatError } from "../utils/errors";
import { tryExtractTextToolCalls } from "../utils/toolExtraction";
import type {
  AgentOptions,
  AgentRunResult,
  ChatMessage,
  Finding,
  TokenUsage,
  ToolCall,
} from "./types";

const DOOM_LOOP_THRESHOLD = 3;

/* Evaluates whether assistant content is an advisory deflection, future narrative,
 * or permission prompt that stalls autonomous tool execution. */
export function isConversationalStall(
  content: string,
  stepCount: number,
  maxSteps: number,
  nudges: number
): boolean {
  if (stepCount >= maxSteps || nudges >= 3) {
    return false;
  }

  const matchesFutureAction =
    /(\b(let's|let us|i'll|i will|we will|we can|we should|we need to)\s+(?:try\s+(?:to\s+)?|first\s+|now\s+|also\s+|proceed\s+to\s+|go\s+ahead\s+and\s+)?(?:take\s+(?:a\s+)?(?:look|peek)|check(?:\s+out)?|dig\s+into|dive\s+into|turn\s+(?:our\s+)?attention\s+to|look(?:\s+at|\s+into)?|explore|investigate|search|inspect|scan|list|read|outline|see\s+(?:if|whether)|find\s+out|examine|start\s+(?:by|with)?|locate|head\s+over\s+to)\b|\bdoes this help\b|\bshall i\b|\bshould we\b|\bwould you like\b|\bwhat's next\b)/i.test(
      content
    );

  const matchesAdvisory =
    /\b(you can|you may|feel free to|you should|you might want to)\s+(?:check|read|inspect|look at|explore|see|review|find|open)\b/i.test(
      content
    );

  const endsWithColon = /:[\s\n]*$/.test(content);

  return matchesFutureAction || matchesAdvisory || endsWithColon;
}

/**
 * Runs the Morpheus ReAct loop for a given prompt and message history.
 * Driven natively by the Operator client with intra-step micro-compaction.
 */
export async function runAgent(
  prompt: string,
  history: ChatMessage[] = [],
  options: AgentOptions = {}
): Promise<AgentRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const findings: Finding[] = [];
  const baseContext = gatherContext(cwd);
  const tools = createTools(cwd, (f) => findings.push(f));

  const operator = new Operator({
    model: options.model,
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    isLocal: options.isLocal,
  });

  const logger = new SessionLogger();
  await logger.init(prompt, cwd, operator.getModel());

  const workingMessages: ChatMessage[] = [
    ...compactHistory(history),
    { role: "user", content: prompt },
  ];

  let consecutiveErrors = 0;
  let lastErrorSignature = "";
  let fullResponse = "";
  let completedCleanly = false;
  let stepCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let wasAborted = false;
  const userSpecifiedMaxSteps = options.maxSteps;
  /* Dynamic step budgeting:
   * Tasks requiring modifications (add, fix, implement, test, etc.) start with 12 steps
   * so they have adequate runway to edit code, write test cases, and verify.
   * Inquiry or exploration queries start with 8 steps to keep tokens frugal. */
  const isCodingTask = /\b(add|fix|create|implement|update|refactor|test|write|build|solve|patch)\b/i.test(prompt);
  let maxSteps = userSpecifiedMaxSteps ?? (isCodingTask ? 12 : 8);
  const hardMaxSteps = userSpecifiedMaxSteps ?? 16;
  const tokenSafetyCeiling = 85_000;
  let hasModifiedFiles = false;
  const readFiles = new Map<string, number>();
  let conversationalNudges = 0;

  while (stepCount < maxSteps) {
    if (options.abortSignal?.aborted) {
      wasAborted = true;
      break;
    }

    stepCount++;
    options.onStepStart?.(stepCount);
    await logger.logStep(stepCount);

    const compactedMessages = compactHistory(workingMessages, {
      recentTurnsToProtect: 2,
      recentStepsToProtect: 2,
    });

    let assistantContent = "";
    const toolCalls: ToolCall[] = [];

    const currentSystemPrompt = buildSystemPrompt({
      ...baseContext,
      findings: [...findings],
    });

    try {
      const stream = operator.chatStream({
        system: currentSystemPrompt,
        messages: compactedMessages,
        tools,
        abortSignal: options.abortSignal,
      });

      for await (const event of stream) {
        if (options.abortSignal?.aborted) {
          wasAborted = true;
          break;
        }

        if (event.type === "text" && event.text) {
          assistantContent += event.text;
          options.onTextDelta?.(event.text);
        } else if (event.type === "reasoning" && event.reasoning) {
          options.onReasoningDelta?.(event.reasoning);
          await logger.logReasoning(event.reasoning);
        } else if (event.type === "tool_call" && event.toolCall) {
          toolCalls.push(event.toolCall);
        } else if (event.type === "usage" && event.usage) {
          promptTokens += event.usage.promptTokens;
          completionTokens += event.usage.completionTokens;
        }
      }
    } catch (err: unknown) {
      if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        wasAborted = true;
        break;
      }
      throw err;
    }

    if (wasAborted) break;

    if (toolCalls.length === 0 && assistantContent.trim()) {
      const extracted = tryExtractTextToolCalls(assistantContent, tools);
      if (extracted.toolCalls.length > 0) {
        toolCalls.push(...extracted.toolCalls);
        assistantContent = extracted.remainingText;
      }
    }

    if (toolCalls.length === 0) {
      if (isConversationalStall(assistantContent, stepCount, maxSteps, conversationalNudges)) {
        conversationalNudges++;
        workingMessages.push({
          role: "assistant",
          content: assistantContent,
        });
        workingMessages.push({
          role: "user",
          content:
            "[System Notice: You are an autonomous coding assistant, NOT an advisory chatbot. Do not ask for user permission, narrate future plans, or tell the user to check/read files. Directly invoke the appropriate tool (list_dir, grep_code, outline_code, read_file) right now to inspect the code and answer the question completely.]",
        });
        continue;
      }

      completedCleanly = true;
      fullResponse = assistantContent;
      workingMessages.push({
        role: "assistant",
        content: assistantContent,
      });
      break;
    }

    workingMessages.push({
      role: "assistant",
      content: assistantContent || null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        parsedArgs = { raw: toolCall.function.arguments };
      }

      options.onToolCall?.(toolName, parsedArgs);
      await logger.logToolCall(stepCount, toolName, parsedArgs);

      const targetTool = tools[toolName];
      let outputStr = "";
      let isError = false;

      if (!targetTool) {
        outputStr = `Error: Tool '${toolName}' not found. Available tools: ${Object.keys(tools).join(", ")}`;
        isError = true;
      } else if (toolName === "read_file" && typeof parsedArgs.filePath === "string") {
        const offset = Number(parsedArgs.offset ?? 1);
        const limit = Number(parsedArgs.limit ?? 2000);
        const readKey = `${parsedArgs.filePath}:${offset}:${limit}`;
        if (readFiles.has(readKey) && readFiles.get(readKey) === stepCount - 1) {
          const prevStep = readFiles.get(readKey);
          outputStr = `[Notice: '${parsedArgs.filePath}' was just read in Step ${prevStep}. The contents are already present in your immediate context above.]`;
          isError = false;
        } else {
          try {
            const res = await targetTool.execute(parsedArgs, cwd);
            outputStr = typeof res === "string" ? res : res.output;
            isError = isToolError(
              outputStr,
              typeof res === "object" ? (res.metadata?.isError as boolean) : undefined
            );
            if (!isError) {
              readFiles.set(readKey, stepCount);
            }
          } catch (err: unknown) {
            outputStr = `Error: ${formatError(err)}`;
            isError = true;
          }
        }
      } else {
        try {
          const res = await targetTool.execute(parsedArgs, cwd);
          outputStr = typeof res === "string" ? res : res.output;
          isError = isToolError(
            outputStr,
            typeof res === "object" ? (res.metadata?.isError as boolean) : undefined
          );
        } catch (err: unknown) {
          outputStr = `Error: ${formatError(err)}`;
          isError = true;
        }
      }

      options.onToolResult?.(toolName, { output: outputStr, metadata: { isError } });
      await logger.logToolResult(stepCount, toolName, outputStr, isError);

      if (!isError && (toolName === "edit_file" || toolName === "write_file")) {
        hasModifiedFiles = true;
      }

      if (isError) {
        const signature = `${toolName}:${outputStr.slice(0, 100)}`;
        if (signature === lastErrorSignature) {
          consecutiveErrors++;
        } else {
          consecutiveErrors = 1;
          lastErrorSignature = signature;
        }

        if (consecutiveErrors >= DOOM_LOOP_THRESHOLD) {
          throw new Error(
            `[Morpheus Doom-Loop Guard] Tool '${toolName}' failed ${DOOM_LOOP_THRESHOLD} times consecutively with identical error. Halting loop to prevent token burn.`
          );
        }
      } else {
        consecutiveErrors = 0;
      }

      workingMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: outputStr,
        isError,
      });
    }

    /* Dynamic step extension: if files were modified and model needs runway to test,
     * allow extending up to hardMaxSteps as long as token usage is within budget */
    if (
      !userSpecifiedMaxSteps &&
      hasModifiedFiles &&
      stepCount >= maxSteps - 1 &&
      maxSteps < hardMaxSteps &&
      promptTokens + completionTokens < tokenSafetyCeiling
    ) {
      maxSteps = Math.min(hardMaxSteps, maxSteps + 3);
    }
  }

  if (!wasAborted && !completedCleanly) {
    stepCount++;
    options.onStepStart?.(stepCount);
    await logger.logStep(stepCount);

    const compactedMessages: ChatMessage[] = [
      ...compactHistory(workingMessages, {
        recentTurnsToProtect: 2,
        recentStepsToProtect: 2,
      }),
      {
        role: "user",
        content:
          "Provide your concise, direct final answer to the user now based on your findings above.",
      },
    ];

    fullResponse = "";

    const currentSystemPrompt = buildSystemPrompt({
      ...baseContext,
      findings: [...findings],
    });

    try {
      const finalStream = operator.chatStream({
        system: currentSystemPrompt,
        messages: compactedMessages,
        tools: {},
        abortSignal: options.abortSignal,
      });

      for await (const event of finalStream) {
        if (options.abortSignal?.aborted) {
          wasAborted = true;
          break;
        }

        if (event.type === "text" && event.text) {
          fullResponse += event.text;
          options.onTextDelta?.(event.text);
        } else if (event.type === "reasoning" && event.reasoning) {
          options.onReasoningDelta?.(event.reasoning);
          await logger.logReasoning(event.reasoning);
        } else if (event.type === "usage" && event.usage) {
          promptTokens += event.usage.promptTokens;
          completionTokens += event.usage.completionTokens;
        }
      }

      if (fullResponse.trim()) {
        workingMessages.push({
          role: "assistant",
          content: fullResponse,
        });
      }
    } catch (err: unknown) {
      if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        wasAborted = true;
      }
    }
  }

  const usage: TokenUsage = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };

  options.onUsage?.(usage);
  await logger.logAssistantResponse(fullResponse);
  await logger.logFinish(usage, wasAborted);

  return {
    text: fullResponse,
    steps: stepCount,
    messages: workingMessages,
    usage,
    aborted: wasAborted,
    logPath: logger.getLogPath(),
  };
}
