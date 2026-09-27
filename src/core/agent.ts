import { streamText, type CoreMessage } from "ai";
import { createTools } from "../tools/index";
import { resolveModel } from "../provider/index";
import { gatherContext, buildSystemPrompt } from "./context";
import { compactHistory } from "./compaction";
import { SessionLogger } from "./logger";
import { isToolError } from "../utils/errors";
import type { AgentOptions, AgentRunResult, TokenUsage } from "./types";

const DOOM_LOOP_THRESHOLD = 3;

/**
 * Runs the Morpheus ReAct loop for a given prompt and message history.
 */
export async function runAgent(
  prompt: string,
  history: CoreMessage[] = [],
  options: AgentOptions = {}
): Promise<AgentRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const context = gatherContext(cwd);
  const systemPrompt = buildSystemPrompt(context);
  const { model } = resolveModel({ model: options.model, apiKey: options.apiKey });
  const tools = createTools(cwd);

  const compactedHistory = compactHistory(history);

  const messages: CoreMessage[] = [
    ...compactedHistory,
    { role: "user", content: prompt },
  ];

  const logger = new SessionLogger();
  await logger.init(prompt, cwd, options.model || "default");

  let consecutiveErrors = 0;
  let lastErrorSignature = "";
  let fullResponse = "";
  let stepCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let wasAborted = false;

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: options.maxSteps ?? 25,
    abortSignal: options.abortSignal,
  });

  try {
    for await (const part of result.fullStream) {
      if (options.abortSignal?.aborted) {
        wasAborted = true;
        break;
      }

      switch (part.type) {
        case "step-start":
          stepCount++;
          await logger.logStep(stepCount);
          break;

        case "text-delta":
          fullResponse += part.textDelta;
          options.onTextDelta?.(part.textDelta);
          break;

        case "reasoning":
          options.onReasoningDelta?.(part.textDelta);
          await logger.logReasoning(part.textDelta);
          break;

        case "tool-call":
          options.onToolCall?.(part.toolName, part.args as Record<string, unknown>);
          await logger.logToolCall(stepCount, part.toolName, part.args as Record<string, unknown>);
          break;

        case "tool-result": {
          const outputStr =
            typeof part.result === "string"
              ? part.result
              : JSON.stringify(part.result);

          const isError = isToolError(outputStr, (part as { isError?: boolean }).isError);

          options.onToolResult?.(part.toolName, { output: outputStr, metadata: { isError } });
          await logger.logToolResult(stepCount, part.toolName, outputStr, isError);

          if (isError) {
            const signature = `${part.toolName}:${outputStr.slice(0, 100)}`;
            if (signature === lastErrorSignature) {
              consecutiveErrors++;
            } else {
              consecutiveErrors = 1;
              lastErrorSignature = signature;
            }

            if (consecutiveErrors >= DOOM_LOOP_THRESHOLD) {
              throw new Error(
                `[Morpheus Doom-Loop Guard] Tool '${part.toolName}' failed ${DOOM_LOOP_THRESHOLD} times consecutively with identical error. Halting loop to prevent token burn.`
              );
            }
          } else {
            consecutiveErrors = 0;
          }
          break;
        }

        case "finish":
          if (part.usage) {
            promptTokens += part.usage.promptTokens ?? 0;
            completionTokens += part.usage.completionTokens ?? 0;
          }
          break;

        case "error":
          if (options.abortSignal?.aborted) {
            wasAborted = true;
            break;
          }
          throw part.error;
      }
    }
  } catch (err: unknown) {
    if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      wasAborted = true;
    } else {
      throw err;
    }
  }

  if (promptTokens === 0 && completionTokens === 0) {
    try {
      const finalUsage = await result.usage;
      if (finalUsage) {
        promptTokens = finalUsage.promptTokens ?? 0;
        completionTokens = finalUsage.completionTokens ?? 0;
      }
    } catch {
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

  let updatedMessages: CoreMessage[] = [
    ...messages,
    { role: "assistant" as const, content: fullResponse },
  ];

  try {
    const response = await result.response;
    if (response?.messages && response.messages.length > 0) {
      updatedMessages = [...messages, ...(response.messages as CoreMessage[])];
    }
  } catch {
  }

  return {
    text: fullResponse,
    steps: stepCount,
    messages: updatedMessages,
    usage,
    aborted: wasAborted,
    logPath: logger.getLogPath(),
  };
}
