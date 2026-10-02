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
    const helpText = `available slash commands:

• \`/model [model-id]\` - open interactive model selector or switch models
• \`/login [provider] [token]\` - authenticate claude, codex, antigravity, openrouter, or local
• \`/auth\` or \`/whoami\` - view active provider credentials & connection health
• \`/neo\` or \`/status\` - open neo proxy router inspector and status window
• \`/usage\` or \`/tokens\` - open dedicated token usage, quotas, and pricing dashboard
• \`/diff\` - view current git working tree modifications against head
• \`/session\` - view active session details and token metrics
• \`/sessions\` - list recent persistent sessions in this repository
• \`/queue\` or \`/clear-queue\` - view or clear background queued tasks
• \`/stop\` or \`/abort\` - halt active execution and clear pending queue
• \`/morpheus\` or \`/avatar\` - display operative morpheus truecolor avatar
• \`/resume [id]\` - restore past session and conversation history
• \`/new\` - start a fresh conversation session
• \`/help\` - show this overview
• \`/cua setup|status|enable|disable\` - configure and check Cua Driver computer use

type any instruction or question to run an agentic task.`;

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
