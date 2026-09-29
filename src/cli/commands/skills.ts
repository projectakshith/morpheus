import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";
import { loadSkills } from "../../core/skills.js";

export class SkillsCommand implements CommandHandler {
  public readonly name = "skills";
  public readonly description = "List all available skills and categories";
  public readonly aliases = ["/skills", "/skill"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed.toLowerCase());
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    const skills = loadSkills(process.cwd());

    // Group by category
    const byCategory: Record<string, typeof skills> = {};
    for (const skill of skills) {
      if (!byCategory[skill.category]) {
        byCategory[skill.category] = [];
      }
      byCategory[skill.category].push(skill);
    }

    const categoryOrder = ["dev", "design", "documents", "devops", "research", "automation"];
    const allCategories = Array.from(new Set([...categoryOrder, ...Object.keys(byCategory)]));

    const lines: string[] = ["### Available Agent Skills\n"];

    for (const cat of allCategories) {
      const items = byCategory[cat];
      if (!items || items.length === 0) continue;

      lines.push(`**${cat.toUpperCase()}**`);
      for (const item of items) {
        lines.push(`• \`${item.name}\` - ${item.description}`);
      }
      lines.push("");
    }

    lines.push("*Skills are loaded dynamically when relevant tasks are detected.*");

    const skillsThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: lines.join("\n"),
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, skillsThread]);
    return true;
  }
}

export const skillsCommand = new SkillsCommand();
