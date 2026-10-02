/*
 * SettingsCommand: Slash command to open interactive settings and auth dashboard.
 */

import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

export class SettingsCommand implements CommandHandler {
  public readonly name = "settings";
  public readonly description = "Open interactive settings, providers, and authentication dashboard";
  public readonly aliases = ["/settings", "/config", "/preferences"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed);
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("settings");
      return true;
    }

    const thread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: `## Settings Overview\n- Active Model: \`${ctx.currentModel}\`\n- Session: \`${ctx.sessionId || "active"}\`\n- Router: \`${ctx.baseURL}\``,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, thread]);
    return true;
  }
}

export const settingsCommand = new SettingsCommand();
