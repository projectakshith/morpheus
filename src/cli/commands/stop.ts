import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class StopCommand implements CommandHandler {
  public readonly name = "stop";
  public readonly description = "Stop currently executing agent task and clear queued prompts";
  public readonly aliases = ["/stop", "/abort", "/cancel"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed);
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.abort) {
      ctx.abort();
    }

    const stopThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: "● *Active execution stopped by user and pending queue cleared.*",
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, stopThread]);
    return true;
  }
}

export const stopCommand = new StopCommand();
