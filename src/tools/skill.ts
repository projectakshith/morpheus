import type { ToolDefinition, Skill } from "../core/types";

export function createSkillTool(
  skills: Skill[],
  onActivateSkill?: (skill: Skill) => void
): ToolDefinition {
  return {
    name: "load_skill",
    description:
      "Load the detailed instructions and playbook for a specific skill from the available skills manifest.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "The name of the skill to load (e.g. 'docker', 'presentations', 'debugging', 'terminal-tui', 'ci-cd').",
        },
      },
      required: ["name"],
    },
    execute: async (args) => {
      const name = String(args.name || "").trim().toLowerCase();
      const skill = skills.find((s) => s.name.toLowerCase() === name);

      if (!skill) {
        const available = skills.map((s) => s.name).join(", ");
        return `Error: Skill "${name}" not found. Available skills: ${available}`;
      }

      onActivateSkill?.(skill);
      return `Loaded skill "${skill.name}" (${skill.category}):\n\n${skill.content}`;
    },
  };
}
