import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";
import { sessionCommand } from "./session";
import { diffCommand } from "./diff";
import { modelCommand } from "./model";
import { loginCommand } from "./login";
import { authCommand } from "./auth";
import { settingsCommand } from "./settings";
import { stopCommand } from "./stop";
import { queueCommand } from "./queue";
import { skillsCommand } from "./skills";
import { helpCommand } from "./help";
import { morpheusCommand } from "./morpheus";
import { neoCommand } from "./neo";
import { usageCommand } from "./usage";
import { cuaCommand } from "./cua";
import { seraphCommand } from "./seraph";

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
    this.register(morpheusCommand);
    this.register(neoCommand);
    this.register(usageCommand);
    this.register(cuaCommand);
    this.register(seraphCommand);
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
