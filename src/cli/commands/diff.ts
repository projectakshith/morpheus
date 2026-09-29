import { execSync } from "node:child_process";
import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class DiffCommand implements CommandHandler {
  public readonly name = "diff";
  public readonly description = "View git diff against HEAD";
  public readonly aliases = ["/diff", "/changes"];

  public matches(trimmed: string): boolean {
    return trimmed === "/diff" || trimmed === "/changes";
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("diff");
      return true;
    }

    let diffOut = "";
    try {
      diffOut = execSync("git diff HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      if (!diffOut.trim()) {
        diffOut = "No unstaged or staged git changes against HEAD.";
      }
    } catch (e: unknown) {
      diffOut = `Error reading git diff: ${e instanceof Error ? e.message : String(e)}`;
    }

    const diffThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: `Git diff (HEAD):\n\`\`\`diff\n${diffOut}\n\`\`\``,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, diffThread]);
    return true;
  }
}

export const diffCommand = new DiffCommand();
