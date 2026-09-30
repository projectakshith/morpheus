import { createTools } from "../tools/index";
import { Operator } from "../provider/operator";
import { gatherContext, buildSystemPrompt } from "./context";
import { compactHistory } from "./compaction";
import { SessionLogger } from "./logger";
import { isToolError, formatError } from "../utils/errors";
import { tryExtractTextToolCalls } from "../utils/toolExtraction";
import { isConversationalStall } from "./stallGuard";
import { matchSkills } from "./skills";
import {
  calculateInitialStepBudget,
  shouldExtendStepBudget,
  DEFAULT_HARD_MAX_STEPS,
} from "./stepBudget";
import type {
  AgentOptions,
  AgentRunResult,
  ChatMessage,
  Finding,
  Skill,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from "./types";

export { isConversationalStall };

const DOOM_LOOP_THRESHOLD = 3;
const MAX_FINDINGS = 12;
const MAX_FINDING_TAKEAWAY_CHARS = 320;

function compactFindingText(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trimEnd()}…`;
}

/* Safely executes a tool handler, extracting output and detecting errors cleanly. */
async function executeToolSafely(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  cwd: string,
  signal?: AbortSignal
): Promise<{ output: string; isError: boolean }> {
  try {
    const res = await tool.execute(args, cwd, signal);
    const output = typeof res === "string" ? res : res.output;
    const isError = isToolError(
      output,
      typeof res === "object" ? (res.metadata?.isError as boolean) : undefined
    );
    return { output, isError };
  } catch (err: unknown) {
    return { output: `Error: ${formatError(err)}`, isError: true };
  }
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
  const rememberFinding = (finding: Finding) => {
    const topic = compactFindingText(finding.topic, 80);
    const takeaway = compactFindingText(finding.takeaway, MAX_FINDING_TAKEAWAY_CHARS);
    if (!topic || !takeaway) return;
    const existingIndex = findings.findIndex(
      (item) => item.topic.toLowerCase() === topic.toLowerCase()
    );
    if (existingIndex !== -1) findings.splice(existingIndex, 1);
    findings.push({ topic, takeaway });
    if (findings.length > MAX_FINDINGS) findings.splice(0, findings.length - MAX_FINDINGS);
  };
  for (const finding of options.findings ?? []) rememberFinding(finding);
  const baseContext = gatherContext(cwd);
  const matchedSkills = matchSkills(prompt, baseContext.skills ?? []);
  const activeSkills: Skill[] = [...matchedSkills];

  const tools = createTools(
    cwd,
    rememberFinding,
    baseContext.skills,
    (skill) => {
      if (!activeSkills.some((s) => s.name === skill.name)) {
        activeSkills.push(skill);
      }
    }
  );

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
  let loopStopReason: string | undefined;
  let fullResponse = "";
  let accumulatedResponse = "";
  let lengthContinuations = 0;
  let truncatedToolRetries = 0;
  let finalError: string | undefined;
  let finalFinishReason: string | undefined;
  let completedCleanly = false;
  let stepCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let currentPromptTokens = 0;
  let peakContextTokens = 0;
  let wasAborted = false;
  const userSpecifiedMaxSteps = options.maxSteps;
  let maxSteps = calculateInitialStepBudget({ prompt, userSpecifiedMaxSteps });
  const hardMaxSteps = userSpecifiedMaxSteps ?? DEFAULT_HARD_MAX_STEPS;
  const tokenSafetyCeiling = operator.getContextSafetyLimit();
  let hasModifiedFiles = false;
  let lastModificationStep = 0;
  const readFiles = new Map<string, number>();
  const modifiedFiles = new Set<string>();
  const executedBashCommands = new Map<string, number>();
  let conversationalNudges = 0;

  while (stepCount < maxSteps) {
    if (options.abortSignal?.aborted) {
      wasAborted = true;
      break;
    }

    /* Context safety ceiling guard: halt tool loop if active context window approaches provider limit */
    if (currentPromptTokens >= tokenSafetyCeiling) {
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
    let finishReason: string | undefined;

    const currentSystemPrompt = buildSystemPrompt({
      ...baseContext,
      findings: [...findings],
      activeSkills: [...activeSkills],
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
          currentPromptTokens = event.usage.promptTokens;
          if (currentPromptTokens > peakContextTokens) {
            peakContextTokens = currentPromptTokens;
          }
          promptTokens += event.usage.promptTokens;
          completionTokens += event.usage.completionTokens;
        } else if (event.type === "finish") {
          finishReason = event.finishReason;
        }
      }
    } catch (err: unknown) {
      if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        wasAborted = true;
        break;
      }
      finalError = formatError(err);
      fullResponse = accumulatedResponse;
      if (assistantContent.trim() && toolCalls.length === 0) {
        fullResponse = accumulatedResponse + assistantContent;
        workingMessages.push({ role: "assistant", content: assistantContent });
      }
      break;
    }

    if (wasAborted) {
      if (assistantContent.trim() && toolCalls.length === 0) {
        fullResponse = accumulatedResponse + assistantContent;
        workingMessages.push({ role: "assistant", content: assistantContent });
      }
      break;
    }

    if (toolCalls.length === 0 && assistantContent.trim()) {
      const extracted = tryExtractTextToolCalls(assistantContent, tools);
      if (extracted.toolCalls.length > 0) {
        toolCalls.push(...extracted.toolCalls);
        assistantContent = extracted.remainingText;
      }
    }

    if (toolCalls.length === 0) {
      if (finishReason === "length" && !assistantContent.trim()) {
        if (truncatedToolRetries < 1) {
          truncatedToolRetries++;
          workingMessages.push({ role: "assistant", content: null });
          workingMessages.push({
            role: "user",
            content:
              "[System Notice: A tool call was cut off before it was complete. Discard it and issue one complete valid tool call, or give a concise answer if no tool is needed.]",
          });
          continue;
        }
        loopStopReason = "The provider truncated a tool call twice before it could be executed.";
        break;
      }

      if (finishReason === "length") {
        accumulatedResponse += assistantContent;
        if (lengthContinuations < 2) {
          lengthContinuations++;
          workingMessages.push({ role: "assistant", content: assistantContent });
          workingMessages.push({
            role: "user",
            content:
              "[System Notice: Your answer hit the output limit. Continue from where it stopped without repeating earlier text.]",
          });
          continue;
        }
        fullResponse = `${accumulatedResponse}\n\n[Response stopped at the model's output limit.]`;
        completedCleanly = true;
        workingMessages.push({
          role: "assistant",
          content: `${assistantContent}\n\n[Response stopped at the model's output limit.]`,
        });
        break;
      }

      if (!assistantContent.trim()) {
        /* Model emitted thinking or empty output, but no user-facing response text.
         * Nudge the model to output its answer, or fall through to final synthesis. */
        if (conversationalNudges < 2) {
          conversationalNudges++;
          workingMessages.push({
            role: "user",
            content:
              "[System Notice: You provided thinking or empty output, but no final response text. Provide your concise, direct answer to the user now.]",
          });
          continue;
        }
        break;
      }

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
      fullResponse = accumulatedResponse + assistantContent;
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

      options.onToolCall?.(toolName, parsedArgs, toolCall.id);
      await logger.logToolCall(stepCount, toolName, parsedArgs);

      const targetTool = tools[toolName];
      let outputStr = "";
      let isError = false;
      let toolExecuted = false;

      if (loopStopReason) {
        outputStr = "[Tool skipped after the repeated-error stop.]";
      } else if (options.abortSignal?.aborted) {
        wasAborted = true;
        outputStr = "[Tool cancelled before execution.]";
      } else if (!targetTool) {
        outputStr = `Error: Tool '${toolName}' not found. Available tools: ${Object.keys(tools).join(", ")}`;
        isError = true;
      } else if (toolName === "read_file" && typeof parsedArgs.filePath === "string") {
        const offset = Number(parsedArgs.offset ?? 1);
        const limit = Number(parsedArgs.limit ?? 2000);
        const readKey = `${parsedArgs.filePath}:${offset}:${limit}`;
        const isAlreadyRead = readFiles.has(readKey) && !modifiedFiles.has(parsedArgs.filePath);
        if (isAlreadyRead) {
          const prevStep = readFiles.get(readKey);
          outputStr = `[Notice: '${parsedArgs.filePath}' was already read in Step ${prevStep} and has not changed. Contents are already in context. Do not re-read unmodified files—proceed directly to edit or answer.]`;
          isError = false;
        } else {
          toolExecuted = true;
          const executed = await executeToolSafely(targetTool, parsedArgs, cwd, options.abortSignal);
          outputStr = executed.output;
          isError = executed.isError;
          if (!isError) {
            readFiles.set(readKey, stepCount);
          }
        }
      } else if (toolName === "bash" && typeof parsedArgs.command === "string") {
        const cmd = parsedArgs.command.trim();
        const prevBashStep = executedBashCommands.get(cmd);
        if (prevBashStep !== undefined && lastModificationStep <= prevBashStep) {
          outputStr = `[Notice: Command '${cmd}' was already run in Step ${prevBashStep} with no files modified since. Do not rerun duplicate commands without making changes.]`;
          isError = false;
        } else {
          toolExecuted = true;
          const executed = await executeToolSafely(targetTool, parsedArgs, cwd, options.abortSignal);
          outputStr = executed.output;
          isError = executed.isError;
          if (!isError) {
            executedBashCommands.set(cmd, stepCount);
          }
        }
      } else {
        toolExecuted = true;
        const executed = await executeToolSafely(targetTool, parsedArgs, cwd, options.abortSignal);
        outputStr = executed.output;
        isError = executed.isError;
      }

      options.onToolResult?.(toolName, { output: outputStr, metadata: { isError } }, toolCall.id);
      await logger.logToolResult(stepCount, toolName, outputStr, isError);
      if (options.abortSignal?.aborted) wasAborted = true;

      if (toolExecuted && !isError && (toolName === "edit_file" || toolName === "write_file")) {
        hasModifiedFiles = true;
        lastModificationStep = stepCount;
        const targetPath = typeof parsedArgs.filePath === "string" ? parsedArgs.filePath : "";
        if (targetPath) {
          modifiedFiles.add(targetPath);
          for (const k of Array.from(readFiles.keys())) {
            if (k.startsWith(`${targetPath}:`)) {
              readFiles.delete(k);
            }
          }
        }
      }

      if (isError) {
        const stableOutput = outputStr.replace(/tool_\d+_[a-z0-9]+\.log/g, "tool_<id>.log");
        const signature = `${toolName}:${stableOutput}`;
        if (signature === lastErrorSignature) {
          consecutiveErrors++;
        } else {
          consecutiveErrors = 1;
          lastErrorSignature = signature;
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

      if (consecutiveErrors >= DOOM_LOOP_THRESHOLD) {
        loopStopReason = `Tool '${toolName}' returned the same error ${DOOM_LOOP_THRESHOLD} times in a row.`;
      }
    }

    if (wasAborted || loopStopReason) break;

    if (
      shouldExtendStepBudget({
        userSpecifiedMaxSteps,
        hasModifiedFiles,
        stepCount,
        maxSteps,
        hardMaxSteps,
        totalTokens: currentPromptTokens,
        tokenSafetyCeiling,
      })
    ) {
      maxSteps = Math.min(hardMaxSteps, maxSteps + 5);
    }
  }

  if (!wasAborted && !finalError && (!completedCleanly || !fullResponse.trim())) {
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
        content: loopStopReason
          ? `${loopStopReason} Summarize what succeeded, what failed, and the next useful step. Do not retry the failed tool.`
          : "Provide your concise, direct final answer to the user now based on your findings above.",
      },
    ];

    fullResponse = "";

    const currentSystemPrompt = buildSystemPrompt({
      ...baseContext,
      findings: [...findings],
      activeSkills: [...activeSkills],
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
          currentPromptTokens = event.usage.promptTokens;
          if (currentPromptTokens > peakContextTokens) {
            peakContextTokens = currentPromptTokens;
          }
          promptTokens += event.usage.promptTokens;
          completionTokens += event.usage.completionTokens;
        } else if (event.type === "finish") {
          finalFinishReason = event.finishReason;
        }
      }

      if (fullResponse.trim()) {
        if (finalFinishReason === "length") {
          fullResponse += "\n\n[Response stopped at the model's output limit.]";
        }
        workingMessages.push({
          role: "assistant",
          content: fullResponse,
        });
      }
    } catch (err: unknown) {
      if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        wasAborted = true;
      } else {
        finalError = formatError(err);
        if (fullResponse.trim()) {
          workingMessages.push({ role: "assistant", content: fullResponse });
        }
      }
    }
  }

  if (!wasAborted && !finalError && !fullResponse.trim()) {
    finalError = "The model returned no final response.";
  }

  const usage: TokenUsage = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    peakContextTokens,
    contextLimit: operator.getNumCtx(),
  };

  options.onUsage?.(usage);
  await logger.logAssistantResponse(fullResponse);
  await logger.logFinish(usage, wasAborted);

  return {
    text: fullResponse,
    steps: stepCount,
    messages: workingMessages,
    usage,
    findings,
    aborted: wasAborted,
    error: finalError,
    logPath: logger.getLogPath(),
  };
}
