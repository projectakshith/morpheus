import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";
import { MORPHEUS_ANSI_LINES } from "../ascii/morpheusArt.js";

export class MorpheusCommand implements CommandHandler {
  public readonly name = "morpheus";
  public readonly description = "Display Morpheus operator TrueColor avatar and status";
  public readonly aliases = ["/morpheus", "/avatar", "/face", "/matrix"];

  public matches(trimmed: string): boolean {
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    return this.aliases.includes(cmd);
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    // Show top 38 lines covering sunglasses and head, or full if specified
    const showFull = _trimmed.includes("--full") || _trimmed.includes("-f");
    const linesToTake = showFull ? MORPHEUS_ANSI_LINES.length : 38;
    const portrait = MORPHEUS_ANSI_LINES.slice(0, linesToTake).join("\n");

    const response = `${portrait}\n\n> *"Free your mind."*\n\n**Morpheus Operational Agentic Harness** — ready for instructions.`;

    const morpheusThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, morpheusThread]);
    return true;
  }
}

export const morpheusCommand = new MorpheusCommand();
