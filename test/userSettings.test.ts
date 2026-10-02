import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSubagentModels, saveSubagentModels } from "../src/core/userSettings";

test("worker model preferences persist and leave other user settings intact", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-settings-"));
  const filePath = path.join(dir, "config.json");
  await fs.writeFile(filePath, JSON.stringify({ theme: "morpheus", unrelated: true }));

  await saveSubagentModels({ explore: "codex/fast", review: "claude/review" }, filePath);

  assert.deepEqual(loadSubagentModels(filePath), {
    explore: "codex/fast",
    review: "claude/review",
  });
  const saved = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(saved.theme, "morpheus");
  assert.equal(saved.unrelated, true);
  await fs.rm(dir, { recursive: true, force: true });
});

test("missing or malformed user settings fall back to inherited worker models", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-settings-"));
  const filePath = path.join(dir, "config.json");
  assert.deepEqual(loadSubagentModels(filePath), {});
  await fs.writeFile(filePath, "not json");
  assert.deepEqual(loadSubagentModels(filePath), {});
  await fs.rm(dir, { recursive: true, force: true });
});
