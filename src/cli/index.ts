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
        onTextDelta: (chunk) => process.stdout.write(chunk),
        onToolCall: (name, toolArgs) => {
          const detail = (toolArgs.filePath as string) || (toolArgs.command as string) || "";
          ui.startTool(name, detail);
        },
        onToolResult: (_, result) => {
          const isError = result.output.toLowerCase().includes("error");
          ui.finishTool(!isError);
        },
      });

      console.log("\n\n" + theme.dim("Task finished."));
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
        onTextDelta: (chunk) => process.stdout.write(chunk),
        onToolCall: (name, toolArgs) => {
          const detail = (toolArgs.filePath as string) || (toolArgs.command as string) || "";
          ui.startTool(name, detail);
        },
        onToolResult: (_, toolResult) => {
          const isError = toolResult.output.toLowerCase().includes("error");
          ui.finishTool(!isError);
        },
      });

      history = result.messages;
      console.log("\n");
    } catch (err: unknown) {
      ui.error(err instanceof Error ? err.message : String(err));
    }
  }
}
