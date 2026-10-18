import test from "node:test";
import assert from "node:assert/strict";
import { ToolCallGuard } from "../src/core/callGuard";
import type { ChatMessage } from "../src/core/types";

const CWD = "/repo";

function toolMsg(id: string, content: string): ChatMessage {
  return { role: "tool", tool_call_id: id, name: "tool", content };
}

test("CallGuard skips a repeated read whose result is still visible", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "1: hello", false);

  const verdict = guard.check("read_file", { filePath: "a.ts" }, 2, [toolMsg("c1", "1: hello")]);
  assert.equal(verdict.skip, true);
});

test("CallGuard allows a re-read once compaction has hidden the earlier result", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "full file contents", false);

  const compacted = [toolMsg("c1", "[Structural outline | 200 lines total]")];
  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 5, compacted).skip, false);
  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 5, []).skip, false);
});

test("CallGuard treats equivalent paths and default ranges as the same read", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "./src/a.ts" }, 1, "c1", "x", false);
  const visible = [toolMsg("c1", "x")];

  assert.equal(guard.check("read_file", { filePath: "src/a.ts" }, 2, visible).skip, true);
  assert.equal(guard.check("read_file", { filePath: "/repo/src/a.ts", offset: 1, limit: 160 }, 2, visible).skip, true);
  assert.equal(guard.check("read_file", { filePath: "src/a.ts", offset: 50 }, 2, visible).skip, false);
});

test("CallGuard invalidates reads after bash, even when bash fails", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "x", false);
  guard.record("bash", { command: "sed -i '' s/a/b/ a.ts" }, 2, "c2", "exit 1", true);

  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 3, [toolMsg("c1", "x")]).skip, false);
});

test("CallGuard invalidates only the edited file's reads", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "a", false);
  guard.record("read_file", { filePath: "b.ts" }, 1, "c2", "b", false);
  guard.record("edit_file", { filePath: "./a.ts" }, 2, "c3", "ok", false);
  const visible = [toolMsg("c1", "a"), toolMsg("c2", "b")];

  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 3, visible).skip, false);
  assert.equal(guard.check("read_file", { filePath: "b.ts" }, 3, visible).skip, true);
});

test("CallGuard treats unknown tools as mutating so new tools fail safe", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "a", false);
  guard.record("some_future_tool", {}, 2, "c2", "ok", false);

  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 3, [toolMsg("c1", "a")]).skip, false);
});

test("CallGuard read-only tools do not invalidate reads", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "a", false);
  guard.record("grep_code", { pattern: "x" }, 2, "c2", "hits", false);

  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 3, [toolMsg("c1", "a")]).skip, true);
});

test("CallGuard skips an immediate bash rerun but allows it after any change", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("bash", { command: "npm test" }, 1, "c1", "3 passing", false);
  const visible = [toolMsg("c1", "3 passing")];

  assert.equal(guard.check("bash", { command: " npm test " }, 2, visible).skip, true);

  guard.record("edit_file", { filePath: "a.ts" }, 2, "c2", "ok", false);
  assert.equal(guard.check("bash", { command: "npm test" }, 3, visible).skip, false);
});

test("CallGuard allows a bash rerun after a different command ran in between", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("bash", { command: "npm test" }, 1, "c1", "fail", false);
  guard.record("bash", { command: "npm install" }, 2, "c2", "ok", false);

  assert.equal(guard.check("bash", { command: "npm test" }, 3, [toolMsg("c1", "fail")]).skip, false);
});

test("CallGuard remembers a verification across read-only git diagnostics", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("bash", { command: "node --test tests/pricing.test.js" }, 1, "c1", "4 passed, 1 failed", true);
  guard.record("bash", { command: "git status --short" }, 2, "c2", " M src/pricing.js", false);
  guard.record("bash", { command: "git log -1 --oneline" }, 3, "c3", "abc123 change", false);

  const verdict = guard.check("bash", { command: "node --test tests/pricing.test.js" }, 4, [
    toolMsg("c1", "4 passed, 1 failed"),
  ]);
  assert.equal(verdict.skip, true);
  if (verdict.skip) assert.match(verdict.notice, /already ran/);
});

test("CallGuard permits verification again after a workspace edit", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("bash", { command: "node --test tests/pricing.test.js" }, 1, "c1", "4 passed, 1 failed", true);
  guard.record("edit_file", { filePath: "src/pricing.js" }, 2, "c2", "updated", false);

  assert.equal(guard.check("bash", { command: "node --test tests/pricing.test.js" }, 3, [toolMsg("c1", "4 passed, 1 failed")]).skip, false);
});

test("CallGuard never skips a failed bash command, leaving that to the error guard", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("bash", { command: "node missing-script.js" }, 1, "c1", "Error: script not found", true);

  assert.equal(guard.check("bash", { command: "node missing-script.js" }, 2, [toolMsg("c1", "Error: script not found")]).skip, false);
});

test("CallGuard flags re-run calls as repeats until the workspace changes", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 1, "c1", "a", false);
  guard.record("grep_code", { pattern: "x" }, 1, "c2", "hits", false);

  const hiddenRead = guard.check("read_file", { filePath: "a.ts" }, 5, []);
  assert.deepEqual(hiddenRead, { skip: false, repeat: true });
  assert.deepEqual(guard.check("grep_code", { pattern: "x" }, 5, []), { skip: false, repeat: true });
  assert.deepEqual(guard.check("grep_code", { pattern: "y" }, 5, []), { skip: false, repeat: false });

  guard.record("bash", { command: "git pull" }, 5, "c3", "ok", false);
  assert.deepEqual(guard.check("grep_code", { pattern: "x" }, 6, []), { skip: false, repeat: false });
  assert.deepEqual(guard.check("read_file", { filePath: "a.ts" }, 6, []), { skip: false, repeat: false });
});

test("CallGuard skips duplicates within one parallel batch", () => {
  const guard = new ToolCallGuard(CWD);
  guard.record("read_file", { filePath: "a.ts" }, 4, "c1", "a", false);

  assert.equal(guard.check("read_file", { filePath: "a.ts" }, 4, []).skip, true);
});
