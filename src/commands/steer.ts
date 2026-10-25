import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

export class SteerCommand implements CommandHandler {
  public readonly name = "steer";
  public readonly description = "Intervene in an active agent run with mid-turn guidance";
  public readonly aliases = ["/steer", "/intervene", "/guide"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/steer" ||
      trimmed.startsWith("/steer ") ||
      trimmed === "/intervene" ||
      trimmed.startsWith("/intervene ") ||
      trimmed === "/guide" ||
      trimmed.startsWith("/guide ")
    );
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.trim().split(/\s+/);
    const instruction = parts.slice(1).join(" ").trim();

    if (!instruction) {
      const thread: Thread = {
        id: `thread_${Date.now()}`,
        index: ctx.threadsCount + 1,
        prompt: ctx.taskText,
        response: "Usage: `/steer <instruction>`\nProvide mid-run guidance or course-correction for the active agent turn.",
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      ctx.setThreads((prev) => [...prev, thread]);
      return true;
    }

    if (ctx.isAgentRunning && ctx.steer) {
      const ok = ctx.steer(instruction);
      const thread: Thread = {
        id: `thread_${Date.now()}`,
        index: ctx.threadsCount + 1,
        prompt: ctx.taskText,
        response: ok
          ? `⚡ **Steering Note Injected**\n"${instruction}" queued. The agent will adjust its next action at the step boundary.`
          : "Could not inject steering note: active runner rejected the instruction.",
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      ctx.setThreads((prev) => [...prev, thread]);
      return true;
    }

    const thread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: "ℹ **No Active Run to Steer**\nType your instruction directly as a new prompt to start a turn.",
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };
    ctx.setThreads((prev) => [...prev, thread]);
    return true;
  }
}

export const steerCommand = new SteerCommand();
