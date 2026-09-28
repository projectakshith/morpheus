import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class HelpCommand implements CommandHandler {
  public readonly name = "help";
  public readonly description = "Display all available slash commands";
  public readonly aliases = ["/help", "/?"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed);
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    const helpText = `### Available Slash Commands

• \`/model [model-id]\` - Open interactive model selector or switch models
• \`/login [provider] [args]\` - Authenticate with Antigravity, OpenRouter, or Local
• \`/auth\` or \`/whoami\` - View active provider credentials & connection health
• \`/diff\` - View current git working tree modifications against HEAD
• \`/session\` - View active session details and token metrics
• \`/sessions\` - List recent persistent sessions in this repository
• \`/queue\` or \`/clear-queue\` - View or clear background queued tasks
• \`/stop\` or \`/abort\` - Halt active execution and clear pending queue
• \`/resume [id]\` - Restore past session and conversation history
• \`/new\` - Start a fresh conversation session
• \`/help\` - Show this overview

*Or simply type any instruction or question to run an agentic task.*`;

    const helpThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: helpText,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, helpThread]);
    return true;
  }
}

export const helpCommand = new HelpCommand();
