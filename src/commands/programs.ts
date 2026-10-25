import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";
import { getAllPrograms } from "../core/programs";

export class ProgramsCommand implements CommandHandler {
  public readonly name = "programs";
  public readonly description = "Inspect and deploy Matrix worker programs (Merovingian, Oracle, Sati, etc.)";
  public readonly aliases = ["/programs", "/crew", "/operatives"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/programs" ||
      trimmed.startsWith("/programs ") ||
      trimmed === "/crew" ||
      trimmed === "/operatives"
    );
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("programs");
      return true;
    }

    const programs = getAllPrograms();
    const manifest = [
      "## ◈ Matrix Operative Programs",
      "",
      ...programs.map(
        (p) => `- **${p.icon} ${p.callsign}** (\`${p.role}\`): ${p.description}`
      ),
      "",
      "*Open interactive mode with `/programs` to view live status and model routing.*",
    ].join("\n");

    const thread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: manifest,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setThreads((prev) => [...prev, thread]);
    return true;
  }
}

export const programsCommand = new ProgramsCommand();
