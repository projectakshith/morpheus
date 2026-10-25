import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { saveWorkflowArtifact, saveCompactionCheckpoint } from "../src/core/artifacts/saver";

test("Artifacts: saves workflow markdown file to global and workspace locations", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-art-test-"));
  try {
    const content = "# Sample Research Report\n\nMethodology and findings.";
    const result = await saveWorkflowArtifact(tmpDir, "RESEARCH_REPORT.md", content, "research");

    assert.equal(result.filename, "RESEARCH_REPORT.md");
    assert.ok(result.workspacePath);
    assert.ok(result.globalPath);

    const wsContent = await fs.readFile(result.workspacePath!, "utf8");
    assert.equal(wsContent, content);

    const globContent = await fs.readFile(result.globalPath, "utf8");
    assert.equal(globContent, content);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("Artifacts: saves compaction checkpoint markdown file", async () => {
  const checkpointSummary = "Earlier user requests:\n- Fix socket auth\n\nEarlier outcomes:\n- Located daemon.ts";
  const savedPath = await saveCompactionCheckpoint("sess_test_123", checkpointSummary);

  assert.ok(savedPath.endsWith(".md"));
  const content = await fs.readFile(savedPath, "utf8");
  assert.ok(content.includes("# Morpheus Context Compaction Checkpoint"));
  assert.ok(content.includes("Session ID: sess_test_123"));
  assert.ok(content.includes("Fix socket auth"));
});
