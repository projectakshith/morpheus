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

  const stream = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: options.maxSteps ?? 25,
    onStepFinish: async (step) => {
      // Monitor tool calls and outputs for doom-loops
      for (const toolCall of step.toolCalls) {
        options.onToolCall?.(toolCall.toolName, toolCall.args as Record<string, unknown>);
      }

      for (const toolResult of step.toolResults) {
        const outputStr = typeof toolResult.result === "string"
          ? toolResult.result
          : JSON.stringify(toolResult.result);

        options.onToolResult?.(toolResult.toolName, { output: outputStr });

        const isError = outputStr.toLowerCase().includes("error") || outputStr.toLowerCase().includes("failed");

        if (isError) {
          const signature = `${toolResult.toolName}:${outputStr.slice(0, 100)}`;
          if (signature === lastErrorSignature) {
            consecutiveErrors++;
          } else {
            consecutiveErrors = 1;
            lastErrorSignature = signature;
          }

          if (consecutiveErrors >= DOOM_LOOP_THRESHOLD) {
            throw new Error(
              `[Morpheus Doom-Loop Guard] Tool '${toolResult.toolName}' failed ${DOOM_LOOP_THRESHOLD} times consecutively with identical error. Halting loop to prevent token burn.`
            );
          }
        } else {
          consecutiveErrors = 0;
        }
      }
    },
  });

  let fullResponse = "";

  for await (const chunk of stream.textStream) {
    fullResponse += chunk;
    options.onTextDelta?.(chunk);
  }

  const finalMessages = await stream.response;

  return {
    text: fullResponse,
    steps: stream.steps ? (await stream.steps).length : 1,
    messages: [...messages, ...finalMessages.messages],
  };
}
