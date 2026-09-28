import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class ModelCommand implements CommandHandler {
  public readonly name = "model";
  public readonly description = "Switch active model or open interactive model selector";
  public readonly aliases = ["/model", "/models"];

  public matches(trimmed: string): boolean {
    return trimmed === "/model" || trimmed === "/models" || trimmed.startsWith("/model ");
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && parts[1]) {
      const targetModel = parts[1];
      ctx.setCurrentModel(targetModel);
      const switchThread: Thread = {
        id: `thread_${Date.now()}`,
        index: ctx.threadsCount + 1,
        prompt: ctx.taskText,
        response: `Switched active model to: \`${targetModel}\`\nAll future turns will route through Neo using this model.`,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
      ctx.setThreads((prev) => [...prev, switchThread]);
      return true;
    }

    /* Open interactive UI model selector */
    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setIsModelSelectorOpen(true);
    return true;
  }
}

export const modelCommand = new ModelCommand();
