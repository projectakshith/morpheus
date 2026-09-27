import { text, isCancel } from "@clack/prompts";
import dotenv from "dotenv";
import type { CoreMessage } from "ai";
import { runAgent } from "../core/agent.js";
import { UI } from "./ui.js";
import { theme } from "./theme.js";
import { MORPHEUS_VERSION } from "../index.js";

dotenv.config();

export async function runCLI(args: string[] = process.argv.slice(2)) {
  const ui = new UI();
  ui.banner(MORPHEUS_VERSION);

  const initialTask = args.join(" ").trim();

  // Mode 1: Non-interactive single command
  if (initialTask) {
    try {
      console.log(`${theme.brightGreen("▶")} ${initialTask}\n`);

      await runAgent(initialTask, [], {
        onTextDelta: (chunk) => ui.streamChunk(chunk),
        onToolCall: (name, toolArgs) => {
          ui.startTool(name, toolArgs);
        },
        onToolResult: (name, result) => {
          const isError = result.output.toLowerCase().includes("error") || result.output.toLowerCase().includes("failed");
          ui.finishTool(name, result.output, isError);
        },
      });

      ui.flushStream();
      console.log("\n" + theme.dim("Task finished."));
      process.exit(0);
    } catch (err: unknown) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Mode 2: Interactive session
  console.log(theme.dim("Interactive session started. Type 'exit' or Ctrl+C to quit.\n"));

  let history: CoreMessage[] = [];

  while (true) {
    const input = await text({
      message: theme.brightGreen("morpheus>"),
      placeholder: "Describe task or ask a question...",
    });

    if (isCancel(input) || (typeof input === "string" && input.trim().toLowerCase() === "exit")) {
      console.log(theme.dim("\nSession terminated."));
      process.exit(0);
    }

    const task = (input as string).trim();
    if (!task) continue;

    console.log();

    try {
      const result = await runAgent(task, history, {
        onTextDelta: (chunk) => ui.streamChunk(chunk),
        onToolCall: (name, toolArgs) => {
          ui.startTool(name, toolArgs);
        },
        onToolResult: (name, toolResult) => {
          const isError = toolResult.output.toLowerCase().includes("error") || toolResult.output.toLowerCase().includes("failed");
          ui.finishTool(name, toolResult.output, isError);
        },
      });

      ui.flushStream();
      history = result.messages;
      console.log("\n");
    } catch (err: unknown) {
      ui.error(err instanceof Error ? err.message : String(err));
    }
  }
}
