import test from "node:test";
import assert from "node:assert/strict";
import {
  getProgram,
  getAllPrograms,
  resolveProgram,
  formatProgramsManifest,
  compileProgramPrompt,
  MATRIX_PROGRAMS,
} from "../src/core/programs/index";
import { createDelegateTasksTool, resolveSubagentOptions } from "../src/core/subagents";

test("Matrix Programs: registry lists all programs with correct operational roles", () => {
  const all = getAllPrograms();
  assert.equal(all.length, 7);

  const keymaker = getProgram("keymaker");
  assert.ok(keymaker);
  assert.equal(keymaker.role, "explore");
  assert.equal(keymaker.icon, "🗝️");

  const merovingian = getProgram("merovingian");
  assert.ok(merovingian);
  assert.equal(merovingian.role, "explore");
  assert.equal(merovingian.icon, "🍷");

  const oracle = getProgram("oracle");
  assert.ok(oracle);
  assert.equal(oracle.role, "review");
  assert.equal(oracle.icon, "🔮");

  const architect = getProgram("architect");
  assert.ok(architect);
  assert.equal(architect.role, "review");
  assert.equal(architect.icon, "📐");

  const sati = getProgram("sati");
  assert.ok(sati);
  assert.equal(sati.role, "implement");
  assert.equal(sati.icon, "🌅");

  const smith = getProgram("smith");
  assert.ok(smith);
  assert.equal(smith.role, "review");
  assert.equal(smith.icon, "🕶️");

  const twins = getProgram("twins");
  assert.ok(twins);
  assert.equal(twins.role, "explore");
  assert.equal(twins.icon, "👻");
});

test("Matrix Programs: resolveProgram handles prefixes and casing", () => {
  assert.equal(resolveProgram("Keymaker")?.id, "keymaker");
  assert.equal(resolveProgram("the merovingian")?.id, "merovingian");
  assert.equal(resolveProgram("Agent Smith")?.id, "smith");
  assert.equal(resolveProgram("THE ORACLE")?.id, "oracle");
  assert.equal(resolveProgram("sati")?.id, "sati");
  assert.equal(resolveProgram("nonexistent"), undefined);
  assert.equal(resolveProgram(null), undefined);
});

test("Matrix Programs: formatProgramsManifest renders markdown block", () => {
  const manifest = formatProgramsManifest();
  assert.ok(manifest.includes("<matrix_programs>"));
  assert.ok(manifest.includes("🗝️ keymaker (explore)"));
  assert.ok(manifest.includes("🍷 merovingian (explore)"));
  assert.ok(manifest.includes("🌅 sati (implement)"));
  assert.ok(manifest.includes("</matrix_programs>"));
});

test("Matrix Programs: compileProgramPrompt builds directive-backed worker instructions", () => {
  const program = MATRIX_PROGRAMS.merovingian;
  const prompt = compileProgramPrompt(
    {
      role: "explore",
      task: "Analyze blast radius of changing the daemon protocol",
      context: "Daemon is used by Trinity on port 7878",
    },
    program
  );

  assert.ok(prompt.includes("The Merovingian"));
  assert.ok(prompt.includes("Cause and effect"));
  assert.ok(prompt.includes("Operational Directives"));
  assert.ok(prompt.includes("Trace all callers, imports, and downstream dependencies"));
  assert.ok(prompt.includes("Task Assignment:\nAnalyze blast radius of changing the daemon protocol"));
  assert.ok(prompt.includes("Context supplied by the coordinating agent:\nDaemon is used by Trinity on port 7878"));
  assert.ok(prompt.includes("Expected Output Format"));
});

test("delegate_tasks tool parses tasks with Matrix program and auto-infers role", async () => {
  const policy = resolveSubagentOptions();
  let executedPrompt = "";
  let executedModel = "";

  const tool = createDelegateTasksTool(
    policy,
    "coordinator-model",
    async ({ task, model }) => {
      executedPrompt = task.task;
      executedModel = model;
      return {
        text: "Causality map completed: 2 dependents identified.",
        steps: 2,
        messages: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
    () => 50_000
  );

  const result = await tool.execute(
    {
      tasks: [
        {
          program: "merovingian",
          task: "Check downstream callers of handleStream",
        },
      ],
    },
    process.cwd()
  );

  assert.ok(result.includes("🍷 Merovingian (explore) · coordinator-model"));
  assert.ok(result.includes("Causality map completed: 2 dependents identified."));
  assert.ok(executedPrompt.includes("Matrix Program: 🍷 The Merovingian (Merovingian)"));
  assert.ok(executedPrompt.includes("Check downstream callers of handleStream"));
  assert.equal(executedModel, "coordinator-model");
});

test("delegate_tasks routes program-specific model preferences", async () => {
  const policy = resolveSubagentOptions({
    models: {
      explore: "fast-explore-model",
      merovingian: "deep-causality-model",
    },
  });
  let modelReceived = "";

  const tool = createDelegateTasksTool(
    policy,
    "parent-model",
    async ({ model }) => {
      modelReceived = model;
      return {
        text: "Done.",
        steps: 1,
        messages: [],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      };
    },
    () => 50_000
  );

  await tool.execute(
    {
      tasks: [
        {
          program: "merovingian",
          task: "Assess breaking API changes",
        },
      ],
    },
    process.cwd()
  );

  assert.equal(modelReceived, "deep-causality-model");
});

test("delegate_tasks rejects invalid program names with helpful error", async () => {
  const policy = resolveSubagentOptions();
  const tool = createDelegateTasksTool(
    policy,
    "parent-model",
    async () => ({ text: "", steps: 0, messages: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
    () => 50_000
  );

  const result = await tool.execute(
    {
      tasks: [
        {
          program: "invalid_program",
          task: "Do something",
        },
      ],
    },
    process.cwd()
  );

  assert.ok(result.includes("Error: tasks[0].program 'invalid_program' is not a recognized Matrix program"));
});
