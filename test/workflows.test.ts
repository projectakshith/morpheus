import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTaskArchetype,
  getWorkflow,
  getAllWorkflows,
  formatWorkflowPrompt,
  TASK_WORKFLOWS,
} from "../src/core/workflows/index";

test("Task Workflows: classifier maps prompts to correct archetypes", () => {
  // Research
  assert.equal(classifyTaskArchetype("Research alternative state management libraries to Zustand"), "research");
  assert.equal(classifyTaskArchetype("Evaluate redis vs memcached for session store"), "research");
  assert.equal(classifyTaskArchetype("Benchmark parsing speed of json vs protobuf"), "research");

  // Investigation
  assert.equal(classifyTaskArchetype("Investigate why the WebSocket connection drops on mobile"), "investigation");
  assert.equal(classifyTaskArchetype("Why does handleStream throw an unhandled promise rejection?"), "investigation");
  assert.equal(classifyTaskArchetype("Debug memory leak in provider streaming adapter"), "investigation");
  assert.equal(classifyTaskArchetype("Root cause analysis for intermittent test failure"), "investigation");

  // Scaffold / Architecture
  assert.equal(classifyTaskArchetype("Create a new project for agent telemetry"), "scaffold");
  assert.equal(classifyTaskArchetype("Scaffold a new CLI command for managing workers"), "scaffold");
  assert.equal(classifyTaskArchetype("Architect the database schema and blueprint for sessions"), "scaffold");

  // Refactor / Implementation
  assert.equal(classifyTaskArchetype("Refactor the WebSocket authentication handshake in daemon.ts"), "refactor");
  assert.equal(classifyTaskArchetype("Fix typo in error message"), "refactor");
  assert.equal(classifyTaskArchetype("Implement retry logic for failed HTTP requests"), "refactor");
});

test("Task Workflows: each workflow prescribes distinct Matrix programs and artifact formats", () => {
  const all = getAllWorkflows();
  assert.equal(all.length, 4);

  const research = getWorkflow("research");
  assert.equal(research.artifactFilename, "RESEARCH_REPORT.md");
  assert.deepEqual(research.defaultPrograms, ["twins", "keymaker"]);
  assert.ok(research.artifactSections.some((s) => s.includes("Comparative Decision Matrix")));

  const investigation = getWorkflow("investigation");
  assert.equal(investigation.artifactFilename, "INVESTIGATION_REPORT.md");
  assert.deepEqual(investigation.defaultPrograms, ["merovingian", "oracle"]);
  assert.ok(investigation.artifactSections.some((s) => s.includes("Root Cause Analysis")));

  const scaffold = getWorkflow("scaffold");
  assert.equal(scaffold.artifactFilename, "ARCHITECTURE_BLUEPRINT.md");
  assert.deepEqual(scaffold.defaultPrograms, ["architect", "sati"]);
  assert.ok(scaffold.artifactSections.some((s) => s.includes("Directory Layout")));

  const refactor = getWorkflow("refactor");
  assert.equal(refactor.artifactFilename, "CHANGE_RECEIPT.md");
  assert.deepEqual(refactor.defaultPrograms, ["merovingian", "sati", "smith"]);
  assert.ok(refactor.artifactSections.some((s) => s.includes("Verification Receipts")));
});

test("Task Workflows: formatWorkflowPrompt builds structured workflow context block", () => {
  const workflow = TASK_WORKFLOWS.investigation;
  const prompt = formatWorkflowPrompt(workflow);

  assert.ok(prompt.includes('<active_workflow archetype="investigation">'));
  assert.ok(prompt.includes("Forensic Codebase Investigation"));
  assert.ok(prompt.includes("- merovingian"));
  assert.ok(prompt.includes("- oracle"));
  assert.ok(prompt.includes("Target Deliverable Artifact: INVESTIGATION_REPORT.md"));
  assert.ok(prompt.includes("## 3. Root Cause Analysis & Callstack Trace"));
  assert.ok(prompt.includes("</active_workflow>"));
});
