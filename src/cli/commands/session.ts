import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class SessionCommand implements CommandHandler {
  public readonly name = "session";
  public readonly description = "View the latest session execution log";
  public readonly aliases = ["/log", "/logs", "/session"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    let logContent = "";
    try {
      const latestPath = path.join(os.homedir(), ".morpheus", "logs", "latest.log");
      const raw = await fs.readFile(latestPath, "utf-8");
      const lines = raw.trim().split("\n");
      logContent = lines.slice(-40).join("\n");
    } catch {
      logContent = "No previous session log found at ~/.morpheus/logs/latest.log";
    }

    const logThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: `Latest session log (~/.morpheus/logs/latest.log):\n\`\`\`\n${logContent}\n\`\`\``,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, logThread]);
    return true;
  }
}

export const sessionCommand = new SessionCommand();
