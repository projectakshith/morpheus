import { text, isCancel } from "@clack/prompts";
import dotenv from "dotenv";
import type { ChatMessage } from "../core/types";
import { runAgent } from "../core/agent";
import { UI } from "./ui";
import { theme } from "./theme";
import { MORPHEUS_VERSION } from "../index";
import { isToolError } from "../utils/errors";
import { parseCLIArgs } from "./args";
import { setupEscapeListener } from "./escape";

dotenv.config();

/* Creates unified terminal UI event callbacks for the agent loop. */
function createAgentCallbacks(ui: UI) {
  return {
    onStepStart: (step: number) => ui.startStep(step),
    onReasoningDelta: (chunk: string) => ui.streamReasoning(chunk),
    onTextDelta: (chunk: string) => ui.streamChunk(chunk),
    onToolCall: (name: string, toolArgs: Record<string, unknown>) => {
      ui.startTool(name, toolArgs);
    },
    onToolResult: (name: string, res: { output: string; metadata?: Record<string, unknown> }) => {
      const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
      ui.finishTool(name, res.output, isError);
    },
  };
}

export async function runCLI(args: string[] = process.argv.slice(2)) {
  const parsed = parseCLIArgs(args);
  const isVerbose = parsed.isVerbose;
  const isLocal = parsed.isLocal;
  let model = parsed.model;
  const baseURL = parsed.baseURL;
  const initialTask = parsed.task;

  const ui = new UI({ verbose: isVerbose });
  ui.banner(MORPHEUS_VERSION);

  if (isLocal) {
    if (!model) {
      model = process.env.MORPHEUS_LOCAL_MODEL || "qwen2.5-coder:7b";
    }
    console.log(theme.dim(`Local engine: Ollama (${model})\n`));
  }

  const agentCallbacks = createAgentCallbacks(ui);

  if (initialTask) {
    const abortController = new AbortController();
    const cleanupEscape = setupEscapeListener(() => {
      ui.stopped("Esc");
      abortController.abort();
    });

    try {
      console.log(`${theme.brightGreen("▶")} ${initialTask}\n`);

      const result = await runAgent(initialTask, [], {
        abortSignal: abortController.signal,
        verbose: isVerbose,
        isLocal,
        model,
        baseURL,
        ...agentCallbacks,
      });

      ui.flushStream();
      ui.showUsage(result.usage);
      if (result.logPath) {
        ui.showLog(result.logPath);
      }

      if (result.aborted) {
        process.exit(130);
      }

      console.log("\n" + theme.dim("Task finished."));
      process.exit(0);
    } catch (err: unknown) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      cleanupEscape();
    }
  }

  console.log(
    theme.dim(
      "Interactive session started. Press Esc to stop generation. Type 'exit' or Ctrl+C to quit.\n"
    )
  );

  let history: ChatMessage[] = [];

  while (true) {
    const input = await text({
      message: theme.brightGreen("morpheus>"),
      placeholder: "Describe task or ask a question...",
    });

    if (
      isCancel(input) ||
      (typeof input === "string" && input.trim().toLowerCase() === "exit")
    ) {
      console.log(theme.dim("\nSession terminated."));
      process.exit(0);
    }

    const task = (input as string).trim();
    if (!task) continue;

    console.log();

    const abortController = new AbortController();
    const cleanupEscape = setupEscapeListener(() => {
      ui.stopped("Esc");
      abortController.abort();
    });

    try {
      const result = await runAgent(task, history, {
        abortSignal: abortController.signal,
        verbose: isVerbose,
        isLocal,
        model,
        baseURL,
        ...agentCallbacks,
      });

      ui.flushStream();
      ui.showUsage(result.usage);
      if (result.logPath) {
        ui.showLog(result.logPath);
      }

      history = result.messages;
      console.log("\n");
    } catch (err: unknown) {
      ui.error(err instanceof Error ? err.message : String(err));
    } finally {
      cleanupEscape();
    }
  }
}
