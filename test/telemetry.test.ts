import test from "node:test";
import assert from "node:assert/strict";
import { programTelemetry } from "../src/core/programs/telemetry";

test("Program Telemetry: tracks lifecycle, status, duration and aggregated metrics", () => {
  programTelemetry.clear();

  const record = programTelemetry.recordStart({
    runId: "run_test_1",
    programId: "merovingian",
    role: "explore",
    model: "claude-sonnet-5",
    task: "Map causality dependencies in auth pipeline",
  });

  assert.equal(record.status, "running");
  assert.equal(record.callsign, "Merovingian");
  assert.equal(record.icon, "⬡");
  assert.equal(programTelemetry.getActiveRuns().length, 1);

  const finished = programTelemetry.recordFinish("run_test_1", {
    tokensUsed: 420,
    status: "completed",
    outputPreview: "Found 3 caller chains.",
  });

  assert.ok(finished);
  assert.equal(finished.status, "completed");
  assert.equal(finished.tokensUsed, 420);
  assert.equal(finished.outputPreview, "Found 3 caller chains.");
  assert.equal(programTelemetry.getActiveRuns().length, 0);

  const stats = programTelemetry.getStats();
  assert.ok(stats.merovingian);
  assert.equal(stats.merovingian.totalRuns, 1);
  assert.equal(stats.merovingian.totalTokens, 420);
});

test("Program Telemetry: marks errors as failed runs", () => {
  programTelemetry.clear();

  programTelemetry.recordStart({
    runId: "run_test_2",
    programId: "sati",
    role: "implement",
    model: "claude-sonnet-5",
    task: "Patch file in workspace",
  });

  const finished = programTelemetry.recordFinish("run_test_2", {
    tokensUsed: 50,
    error: "Disk permission denied",
  });

  assert.ok(finished);
  assert.equal(finished.status, "failed");
  assert.equal(finished.error, "Disk permission denied");
});
