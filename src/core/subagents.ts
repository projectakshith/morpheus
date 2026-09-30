import path from "node:path";
import type { AgentOptions, AgentRunResult, SubagentOptions, SubagentRole, ToolDefinition } from "./types";

export interface SubagentTask {
  role: SubagentRole;
  task: string;
  context?: string;
  files?: string[];
}

export type SubagentRunner = (input: {
  task: SubagentTask;
  model: string;
  maxTotalTokens: number;
  maxSteps: number;
}) => Promise<AgentRunResult>;

const DEFAULT_POLICY: Required<Omit<SubagentOptions, "models">> = {
  enabled: true,
  maxParallel: 3,
  maxTasksPerRun: 6,
  maxTokensPerAgent: 20_000,
  maxTotalTokens: 60_000,
  maxStepsPerAgent: 8,
};
const MAX_RETURN_CHARS = 6000;

function compactResult(text: string): string {
  const compact = text.trim();
  if (compact.length <= MAX_RETURN_CHARS) return compact;
  return `${compact.slice(0, MAX_RETURN_CHARS).trimEnd()}\n[worker result capped; request a focused follow-up for omitted details]`;
}

export function resolveSubagentOptions(options: SubagentOptions = {}): Required<Omit<SubagentOptions, "models">> & Pick<SubagentOptions, "models"> {
  const bounded = (value: number | undefined, fallback: number, maximum: number) =>
    Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, maximum) : fallback;
  return {
    enabled: options.enabled ?? DEFAULT_POLICY.enabled,
    maxParallel: bounded(options.maxParallel, DEFAULT_POLICY.maxParallel, 4),
    maxTasksPerRun: bounded(options.maxTasksPerRun, DEFAULT_POLICY.maxTasksPerRun, 12),
    maxTokensPerAgent: bounded(options.maxTokensPerAgent, DEFAULT_POLICY.maxTokensPerAgent, 100_000),
    maxTotalTokens: bounded(options.maxTotalTokens, DEFAULT_POLICY.maxTotalTokens, 300_000),
    maxStepsPerAgent: bounded(options.maxStepsPerAgent, DEFAULT_POLICY.maxStepsPerAgent, 20),
    models: options.models,
  };
}

function parseTasks(value: unknown, maxTasks: number): SubagentTask[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxTasks) {
    throw new Error(`tasks must contain 1-${maxTasks} worker tasks`);
  }
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`tasks[${index}] must be an object`);
    const task = candidate as Record<string, unknown>;
    if (task.role !== "explore" && task.role !== "review" && task.role !== "implement") {
      throw new Error(`tasks[${index}].role must be explore, review, or implement`);
    }
    if (typeof task.task !== "string" || !task.task.trim() || task.task.length > 4000) {
      throw new Error(`tasks[${index}].task must be 1-4000 characters`);
    }
    if (task.context !== undefined && (typeof task.context !== "string" || task.context.length > 12_000)) {
      throw new Error(`tasks[${index}].context must be at most 12000 characters`);
    }
    if (task.files !== undefined && (!Array.isArray(task.files) || task.files.some((f) => typeof f !== "string"))) {
      throw new Error(`tasks[${index}].files must be an array of paths`);
    }
    const files = task.files as string[] | undefined;
    if (task.role === "implement" && (!files?.length || files.length > 20)) {
      throw new Error(`tasks[${index}] implement role requires 1-20 allowed files`);
    }
    if (task.role !== "implement" && files?.length) {
      throw new Error(`tasks[${index}].files is only valid for implement tasks`);
    }
    return {
      role: task.role,
      task: task.task.trim(),
      context: typeof task.context === "string" ? task.context : undefined,
      files,
    };
  });
}

function workerPrompt(task: SubagentTask): string {
  const roleInstruction = task.role === "explore"
    ? "Research the assigned question. Do not modify files. Return concise findings with file paths and line references."
    : task.role === "review"
      ? "Review only the assigned change or question. Do not modify files. Report concrete defects first, with file paths and line references."
      : `Implement only the assigned task. You may edit only these files: ${task.files!.join(", ")}. Do not commit changes. Report files changed and checks run.`;
  return [
    `Worker role: ${task.role}.`,
    roleInstruction,
    `Task:\n${task.task}`,
    task.context ? `Context supplied by the coordinating agent:\n${task.context}` : "",
    "Return a compact result for the coordinating agent. Do not repeat the task.",
  ].filter(Boolean).join("\n\n");
}

export function createDelegateTasksTool(
  policy: ReturnType<typeof resolveSubagentOptions>,
  parentModel: string,
  runWorker: SubagentRunner,
  getParentBudget: () => number,
): ToolDefinition {
  let startedTasks = 0;
  let spentTokens = 0;
  let implementationStarted = false;

  return {
    name: "delegate_tasks",
    description: "Run up to three independent, bounded worker tasks in parallel. Each worker gets only its task and supplied context. Roles: explore/review are read-only; implement may edit only its required files list and cannot run shell commands or commit. Results and token usage return to you. Use when tasks are genuinely independent.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: `Independent tasks (1-${Math.min(3, policy.maxTasksPerRun)}); total run limit ${policy.maxTasksPerRun}.`,
          items: {
            type: "object",
            properties: {
              role: { type: "string", description: "Worker role", enum: ["explore", "review", "implement"] },
              task: { type: "string", description: "One self-contained assignment" },
              context: { type: "string", description: "Relevant facts/files/results the coordinator wants this worker to receive" },
              files: {
                type: "array",
                description: "Required for implement; exact workspace-relative files the worker may edit",
                items: { type: "string" },
              },
            },
            required: ["role", "task"],
          },
        },
      },
      required: ["tasks"],
    },
    execute: async (args, _toolCwd, signal) => {
      let tasks: SubagentTask[];
      try {
        tasks = parseTasks(args.tasks, Math.min(3, policy.maxTasksPerRun));
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (startedTasks + tasks.length > policy.maxTasksPerRun) {
        return `Error: worker task limit reached (${policy.maxTasksPerRun} for this run).`;
      }
      if (tasks.filter((task) => task.role === "implement").length > 1 || (implementationStarted && tasks.some((task) => task.role === "implement"))) {
        return "Error: only one implement worker is allowed per parent run to prevent overlapping edits.";
      }
      if (tasks.length > 1 && tasks.some((task) => task.role === "implement")) {
        return "Error: run an implement worker alone so it cannot race with other workers reading the shared workspace.";
      }
      if (signal?.aborted) return "Worker tasks cancelled before start.";

      const availableTokens = Math.max(0, Math.min(policy.maxTotalTokens - spentTokens, getParentBudget()));
      if (availableTokens < tasks.length) return "Error: delegated token budget is exhausted.";
      startedTasks += tasks.length;
      if (tasks.some((task) => task.role === "implement")) implementationStarted = true;
      const perWorkerBudget = Math.max(1, Math.min(policy.maxTokensPerAgent, Math.floor(availableTokens / tasks.length)));
      const outputs = new Array<string>(tasks.length);
      let nextIndex = 0;
      const workerCount = Math.min(policy.maxParallel, tasks.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= tasks.length) return;
          if (signal?.aborted) {
            outputs[index] = "cancelled";
            continue;
          }
          const task = tasks[index];
          const model = policy.models?.[task.role] || parentModel;
          try {
            const result = await runWorker({
              task: { ...task, task: workerPrompt(task) },
              model,
              maxTotalTokens: perWorkerBudget,
              maxSteps: policy.maxStepsPerAgent,
            });
            spentTokens += result.usage.reported === false ? perWorkerBudget : result.usage.totalTokens;
            const details = [
              `### ${task.role} worker · ${model}`,
              result.error ? `error: ${result.error}` : compactResult(result.text) || "(no result)",
              `usage: ${result.usage.totalTokens} tokens${result.usage.reported === false ? " (provider count unavailable)" : ""}`,
              result.stopReason && result.stopReason !== "completed" ? `stopped: ${result.stopReason}` : "",
            ].filter(Boolean);
            outputs[index] = details.join("\n");
          } catch (error) {
            outputs[index] = `### ${task.role} worker · ${model}\nerror: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      }));
      return outputs.map((output, index) => `## Worker ${index + 1}\n${output}`).join("\n\n");
    },
  };
}

export function createSubagentRunnerOptions(input: {
  parent: AgentOptions;
  cwd: string;
  task: SubagentTask;
  model: string;
  maxTotalTokens: number;
  maxSteps: number;
}): { prompt: string; options: AgentOptions } {
  const allowedWritePaths = input.task.role === "implement"
    ? input.task.files!.map((file) => {
      const absolute = path.resolve(input.cwd, file);
      const relative = path.relative(input.cwd, absolute);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`implement file must be inside the workspace: ${file}`);
      }
      return relative;
    })
    : [];
  return {
    prompt: input.task.task,
    options: {
      cwd: input.cwd,
      model: input.model,
      apiKey: input.parent.apiKey,
      baseURL: input.parent.baseURL,
      isLocal: input.parent.isLocal,
      maxTotalTokens: input.maxTotalTokens,
      maxSteps: input.maxSteps,
      abortSignal: input.parent.abortSignal,
      disableSubagents: true,
      toolAccess: input.task.role === "implement" ? "scopedWrite" : "readOnly",
      allowedWritePaths,
    },
  };
}
