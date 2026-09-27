import { streamText, type CoreMessage } from "ai";
import { createTools } from "../tools/index.js";
import { resolveModel } from "../provider/index.js";
import { gatherContext, buildSystemPrompt } from "./context.js";
import type { AgentOptions, AgentRunResult } from "./types.js";

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

  const messages: CoreMessage[] = [
    ...history,
    { role: "user", content: prompt },
  ];

  let consecutiveErrors = 0;
  let lastErrorSignature = "";
  let fullResponse = "";
  let stepCount = 0;

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: options.maxSteps ?? 25,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "step-start":
        stepCount++;
        break;

      case "text-delta":
        fullResponse += part.textDelta;
        options.onTextDelta?.(part.textDelta);
        break;

      case "reasoning":
        options.onReasoningDelta?.(part.textDelta);
        break;

      case "tool-call":
        options.onToolCall?.(part.toolName, part.args as Record<string, unknown>);
        break;

      case "tool-result": {
        const outputStr = typeof part.result === "string"
          ? part.result
          : JSON.stringify(part.result);

        options.onToolResult?.(part.toolName, { output: outputStr });

        const isError = outputStr.toLowerCase().includes("error") || outputStr.toLowerCase().includes("failed");

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

      case "error":
        throw part.error;
    }
  }

  return {
    text: fullResponse,
    steps: stepCount,
    messages: [...messages, { role: "assistant" as const, content: fullResponse }],
  };
}
