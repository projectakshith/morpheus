import type { CommandHandler, CommandContext } from "./types.js";
import { sessionCommand } from "./session.js";
import { diffCommand } from "./diff.js";
import { modelCommand } from "./model.js";
import { loginCommand } from "./login.js";
import { authCommand } from "./auth.js";
import { helpCommand } from "./help.js";
import { settingsCommand } from "./settings.js";
import { stopCommand } from "./stop.js";
import { queueCommand } from "./queue.js";
import { skillsCommand } from "./skills.js";

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
    for (const handler of this.handlers) {
      if (handler.matches(trimmed)) {
        return handler.execute(trimmed, ctx);
      }
    }
    return false;
  }
}

export const commandRegistry = new CommandRegistry();
