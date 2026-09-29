import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";
import { sessionCommand } from "./session.js";
import { diffCommand } from "./diff.js";
import { modelCommand } from "./model.js";
import { loginCommand } from "./login.js";
import { authCommand } from "./auth.js";
import { settingsCommand } from "./settings.js";
import { stopCommand } from "./stop.js";
import { queueCommand } from "./queue.js";
import { skillsCommand } from "./skills.js";
import { helpCommand } from "./help.js";

export class CommandRegistry {
  private handlers: CommandHandler[] = [];

  constructor() {
    /* Register built-in default slash commands */
    this.register(sessionCommand);
    this.register(diffCommand);
    this.register(modelCommand);
    this.register(loginCommand);
    this.register(authCommand);
    this.register(settingsCommand);
    this.register(stopCommand);
    this.register(queueCommand);
    this.register(skillsCommand);
    this.register(helpCommand);
  }

  public register(handler: CommandHandler): void {
    this.handlers.push(handler);
  }

  public getAll(): CommandHandler[] {
    return [...this.handlers];
  }

  public async dispatch(input: string, ctx: CommandContext): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed) return false;

    /* 1. Exact match check */
    for (const handler of this.handlers) {
      if (handler.matches(trimmed)) {
        return handler.execute(trimmed, ctx);
      }
    }

    /* 2. Prefix matching for partial slash commands (e.g. /sess -> /session, /mod -> /model) */
    if (/^\/[a-zA-Z0-9_-]+(\s|$)/.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      const typedCmd = parts[0].toLowerCase();
      const restArgs = parts.slice(1).join(" ");

      const candidateMatches: { handler: CommandHandler; resolvedCmd: string }[] = [];

      for (const handler of this.handlers) {
        const triggers = [`/${handler.name}`, ...(handler.aliases || [])];
        for (const trigger of triggers) {
          const lowerTrigger = trigger.toLowerCase();
          if (lowerTrigger.startsWith(typedCmd) || lowerTrigger === typedCmd) {
            candidateMatches.push({ handler, resolvedCmd: trigger });
            break;
          }
        }
      }

      if (candidateMatches.length > 0) {
        const best = candidateMatches[0];
        const fullResolved = restArgs ? `${best.resolvedCmd} ${restArgs}` : best.resolvedCmd;
        return best.handler.execute(fullResolved, ctx);
      }

      /* 3. Unknown slash command interceptor: prevent sending erroneous /commands to LLM chat */
      const helpThread: Thread = {
        id: `thread_${Date.now()}`,
        index: ctx.threadsCount + 1,
        prompt: trimmed,
        response: `Unknown command \`${typedCmd}\`. Type \`/help\` to view all commands, or \`/skills\` to view agent skills.`,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      ctx.setPromptHistory((prev) => [...prev, trimmed]);
      ctx.setThreads((prev) => [...prev, helpThread]);
      return true;
    }

    return false;
  }
}

export const commandRegistry = new CommandRegistry();
