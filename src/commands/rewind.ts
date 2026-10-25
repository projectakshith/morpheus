import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

export class RewindCommand implements CommandHandler {
  public readonly name = "rewind";
  public readonly description = "Rewind conversation history by N turns (reverts context mistakes)";
  public readonly aliases = ["/rewind", "/undo"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/rewind" ||
      trimmed.startsWith("/rewind ") ||
      trimmed === "/undo" ||
      trimmed.startsWith("/undo ")
    );
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.trim().split(/\s+/);
    const countArg = Number.parseInt(parts[1], 10);
    const count = Number.isFinite(countArg) && countArg > 0 ? countArg : 1;

    let removed = 0;
    let remaining = 0;

    ctx.setThreads((prev) => {
      if (prev.length === 0) {
        const emptyNotice: Thread = {
          id: `thread_${Date.now()}`,
          index: 1,
          prompt: ctx.taskText,
          response: "↺ Nothing to rewind (session has no prior turns).",
          isStreaming: false,
          steps: [],
          isExpanded: false,
          status: "completed",
          stepCount: 0,
          startTime: Date.now(),
          durationMs: 0,
        };
        return [emptyNotice];
      }

      removed = Math.min(count, prev.length);
      const next = prev.slice(0, prev.length - removed);
      remaining = next.length;

      const notice: Thread = {
        id: `thread_${Date.now()}`,
        index: remaining + 1,
        prompt: ctx.taskText,
        response: `↺ **Rewound ${removed} turn${removed === 1 ? "" : "s"}**\nConversation context restored to turn #${remaining}.`,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };

      return [...next, notice];
    });

    if (ctx.setHistory) {
      ctx.setHistory((prev) => {
        const messagesToRemove = removed * 2;
        return prev.slice(0, Math.max(0, prev.length - messagesToRemove));
      });
    }

    return true;
  }
}

export const rewindCommand = new RewindCommand();
