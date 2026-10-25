import type { ProgramContract } from "./types";
import type { SubagentTask } from "../subagents";

export function compileProgramPrompt(task: SubagentTask, program: ProgramContract): string {
  const roleInstruction = program.role === "explore"
    ? "Research the assigned question. Do not modify files. Return concise findings with file paths and line references."
    : program.role === "review"
      ? "Review only the assigned change or question. Do not modify files. Report concrete defects first, with file paths and line references."
      : `Implement only the assigned task. You may edit only these files: ${task.files?.join(", ") ?? "none"}. Do not commit changes. Report files changed and checks run.`;

  const sections: string[] = [
    `Matrix Program: ${program.icon} ${program.name} (${program.callsign}) · Role: ${program.role}.`,
    program.lore,
    `Mission Objective: ${program.description}`,
    roleInstruction,
    "Operational Directives:\n" + program.operationalRules.map((rule) => `- ${rule}`).join("\n"),
    `Task Assignment:\n${task.task}`,
  ];

  if (task.context) {
    sections.push(`Context supplied by the coordinating agent:\n${task.context}`);
  }

  sections.push(
    "Expected Output Format:\n" +
    program.outputRequirements.map((req) => `- ${req}`).join("\n") +
    "\nReturn a compact result for the coordinating agent. Do not repeat the task description."
  );

  return sections.filter(Boolean).join("\n\n");
}
