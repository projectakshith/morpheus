import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPromptHistory, savePromptHistory, trimHistory } from "../src/core/promptHistory";

test("prompt history survives a restart and drops blanks and repeats", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "morpheus-history-"));
  const file = path.join(dir, "history.json");
  try {
    assert.deepEqual(loadPromptHistory(file), []);
    savePromptHistory(["/vs where", "/vs where", "  ", "fix the bug"], file);
    assert.deepEqual(loadPromptHistory(file), ["/vs where", "fix the bug"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("prompt history keeps the newest 500 entries", () => {
  const entries = Array.from({ length: 520 }, (_, i) => `prompt ${i}`);
  const kept = trimHistory(entries);
  assert.equal(kept.length, 500);
  assert.equal(kept[0], "prompt 20");
});
