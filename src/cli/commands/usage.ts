import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class UsageCommand implements CommandHandler {
  public readonly name = "usage";
  public readonly description = "Open dedicated token usage, quotas, and model pricing dashboard";
  public readonly aliases = ["/usage", "/tokens", "/cost", "/quota"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/usage" ||
      trimmed.startsWith("/usage ") ||
      trimmed === "/tokens" ||
      trimmed === "/cost" ||
      trimmed === "/quota"
    );
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("usage");
      return true;
    }

    const total = ctx.usage?.totalTokens ?? 0;
    const prompt = ctx.usage?.promptTokens ?? 0;
    const completion = ctx.usage?.completionTokens ?? 0;
    const peak = ctx.usage?.peakContextTokens ?? 0;
    const limit = ctx.usage?.contextLimit ?? 128000;

    const responseText = `## ▰ Token Usage & Quotas
- **Active Model**: \`${ctx.currentModel}\`
- **Total Tokens**: \`${total.toLocaleString()}\` (prompt: \`${prompt.toLocaleString()}\` · completion: \`${completion.toLocaleString()}\`)
- **Peak Context**: \`${peak.toLocaleString()}\` / \`${limit.toLocaleString()}\` tokens
- **Estimated Cost**: \`$0.00 USD\` (All models routed through free quota / local)

*Run \`/usage\` in interactive mode to inspect per-model rate limits and pricing.*`;

    const thread: Thread = {
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
    ctx.setThreads((prev) => [...prev, thread]);
    return true;
  }
}

export const usageCommand = new UsageCommand();
