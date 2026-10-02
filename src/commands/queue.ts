import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

export class QueueCommand implements CommandHandler {
  public readonly name = "queue";
  public readonly description = "Inspect or clear queued background prompts";
  public readonly aliases = ["/queue", "/clear-queue"];

  public matches(trimmed: string): boolean {
    return this.aliases.some((alias) => trimmed === alias || trimmed.startsWith(`${alias} `));
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const isClear = trimmed.startsWith("/clear-queue");
    let responseText = "";

    if (isClear) {
      if (ctx.clearQueue) {
        ctx.clearQueue();
      }
      responseText = "*Cleared all queued tasks.*";
    } else {
      const queue = ctx.getQueue ? ctx.getQueue() : [];
      if (queue.length === 0) {
        responseText = ctx.isAgentRunning
          ? "Agent is currently working. No additional prompts are queued.\n*Type any prompt to queue it behind the active task.*"
          : "Queue is empty. Agent is ready for tasks.";
      } else {
        const items = queue.map((q, idx) => `  ${idx + 1}. \`${q.replace(/`/g, "")}\``).join("\n");
        responseText = `## Queued Prompts (${queue.length})\n${items}\n\n*Type \`/clear-queue\` to remove pending items or \`/stop\` to abort everything.*`;
      }
    }

    const queueThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: responseText,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, queueThread]);
    return true;
  }
}

export const queueCommand = new QueueCommand();
