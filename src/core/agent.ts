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
  const maxSteps = options.maxSteps ?? 6;
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
      recentStepsToProtect: 1,
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
      /* Guard against conversational stalls where model narrates plans or asks permission without invoking tools */
      const isConversationalStall =
        stepCount < maxSteps - 1 &&
        conversationalNudges < 2 &&
        /(\b(let's|let us|i'll|i will|we can|we should|we will)\s+(?:try\s+(?:to\s+)?|first\s+)?(check|explore|look|investigate|search|inspect|scan|list|read|outline|see|find|examine|start|locate)|\bdoes this help\b|\bshall i\b|\bshould we\b|\bwould you like\b|\bwhat's next\b)/i.test(
          assistantContent
        );

      if (isConversationalStall) {
        conversationalNudges++;
        workingMessages.push({
          role: "assistant",
          content: assistantContent,
        });
        workingMessages.push({
          role: "user",
          content:
            "[System Notice: You are an autonomous coding assistant. Do not ask for user permission or narrate future intentions in text. Directly invoke the appropriate tool (list_dir, grep_code, outline_code, read_file) right now to proceed.]",
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
          "You have completed your code exploration. Synthesize all findings, architecture, and evidence from the inspected files above and provide your direct, comprehensive final answer to the user now.",
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
