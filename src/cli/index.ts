import { text, isCancel } from "@clack/prompts";
import dotenv from "dotenv";
import type { ChatMessage } from "../core/types";
import { runAgent } from "../core/agent";
import { UI } from "./ui";
import { theme } from "./theme";
import { MORPHEUS_VERSION } from "../index";
import { isToolError } from "../utils/errors";

dotenv.config();

/**
 * Listens for the Escape key on stdin to abort the current generation.
 * Returns a cleanup function that restores stdin to its previous state.
 */
function setupEscapeListener(onAbort: () => void): () => void {
  if (!process.stdin.isTTY) {
    return () => {};
  }

  let wasRaw = false;
  try {
    wasRaw = process.stdin.isRaw ?? false;
  } catch {
  }

  const onData = (chunk: Buffer) => {
    if (chunk.length === 1 && chunk[0] === 27) {
      onAbort();
    } else if (chunk.length === 1 && chunk[0] === 3) {
      onAbort();
      process.exit(0);
    }
  };

  try {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  } catch {
  }

  return () => {
    try {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode?.(wasRaw);
      process.stdin.pause();
    } catch {
    }
  };
}

export async function runCLI(args: string[] = process.argv.slice(2)) {
  let isVerbose = false;
  let isLocal = false;
  let model: string | undefined;
  let baseURL: string | undefined;
  const remainingArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-v" || arg === "--verbose") {
      isVerbose = true;
    } else if (arg === "--local" || arg === "--ollama") {
      isLocal = true;
    } else if (arg === "-m" || arg === "--model") {
      if (i + 1 < args.length) {
        model = args[++i];
      }
    } else if (arg === "--base-url") {
      if (i + 1 < args.length) {
        baseURL = args[++i];
      }
    } else {
      remainingArgs.push(arg);
    }
  }

  const initialTask = remainingArgs.join(" ").trim();

  const ui = new UI({ verbose: isVerbose });
  ui.banner(MORPHEUS_VERSION);

  if (isLocal) {
    if (!model) {
      model = process.env.MORPHEUS_LOCAL_MODEL || "qwen2.5-coder:7b";
    }
    console.log(theme.dim(`Local engine: Ollama (${model})\n`));
  }

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
        onStepStart: (step) => ui.startStep(step),
        onReasoningDelta: (chunk) => ui.streamReasoning(chunk),
        onTextDelta: (chunk) => ui.streamChunk(chunk),
        onToolCall: (name, toolArgs) => {
          ui.startTool(name, toolArgs);
        },
        onToolResult: (name, res) => {
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          ui.finishTool(name, res.output, isError);
        },
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
        onStepStart: (step) => ui.startStep(step),
        onReasoningDelta: (chunk) => ui.streamReasoning(chunk),
        onTextDelta: (chunk) => ui.streamChunk(chunk),
        onToolCall: (name, toolArgs) => {
          ui.startTool(name, toolArgs);
        },
        onToolResult: (name, toolResult) => {
          const isError = isToolError(
            toolResult.output,
            toolResult.metadata?.isError as boolean | undefined
          );
          ui.finishTool(name, toolResult.output, isError);
        },
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
