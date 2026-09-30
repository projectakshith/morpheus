import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTools } from "../src/tools/index";
import { createSubagentRunnerOptions, resolveSubagentOptions } from "../src/core/subagents";

test("scoped implementation workers can edit only allowlisted files without fuzzy path fallback", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-subagent-") );
  await fs.writeFile(path.join(cwd, "allowed.ts"), "export const value = 1;\n");
  await fs.writeFile(path.join(cwd, "similar.ts"), "export const value = 1;\n");
  const outside = path.join(path.dirname(cwd), `${path.basename(cwd)}-outside.ts`);
  await fs.writeFile(outside, "leave me alone\n");
  await fs.symlink(outside, path.join(cwd, "linked.ts"));
  const tools = createTools(cwd, undefined, undefined, undefined, {
    access: "scopedWrite",
    allowedWritePaths: ["allowed.ts", "allowd.ts", "linked.ts"],
  });

  const denied = await tools.write_file.execute({ filePath: "similar.ts", content: "changed\n" }, cwd);
  assert.match(typeof denied === "string" ? denied : denied.output, /may not modify/);
  const missingEdit = await tools.edit_file.execute({ filePath: "allowd.ts", oldString: "x", newString: "y" }, cwd);
  assert.match(typeof missingEdit === "string" ? missingEdit : missingEdit.output, /File not found/);
  const symlinkWrite = await tools.write_file.execute({ filePath: "linked.ts", content: "changed\n" }, cwd);
  assert.match(typeof symlinkWrite === "string" ? symlinkWrite : symlinkWrite.output, /symbolic link/);
  assert.equal(await fs.readFile(outside, "utf8"), "leave me alone\n");

  const allowed = await tools.write_file.execute({ filePath: "allowed.ts", content: "export const value = 2;\n" }, cwd);
  assert.match(typeof allowed === "string" ? allowed : allowed.output, /Successfully wrote/);
  assert.equal(await fs.readFile(path.join(cwd, "allowed.ts"), "utf8"), "export const value = 2;\n");
  await fs.rm(cwd, { recursive: true, force: true });
  await fs.rm(outside, { force: true });
});

test("subagent policy clamps fan-out and rejects implementation paths outside workspace", () => {
  const policy = resolveSubagentOptions({ maxParallel: 100, maxTasksPerRun: 50, maxTotalTokens: 900_000 });
  assert.equal(policy.maxParallel, 4);
  assert.equal(policy.maxTasksPerRun, 12);
  assert.equal(policy.maxTotalTokens, 300_000);

  assert.throws(() => createSubagentRunnerOptions({
    parent: {},
    cwd: "/workspace/project",
    task: { role: "implement", task: "edit it", files: ["../outside.ts"] },
    model: "model",
    maxTotalTokens: 100,
    maxSteps: 2,
  }), /inside the workspace/);
});
