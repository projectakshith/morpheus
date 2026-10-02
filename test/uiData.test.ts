import test from "node:test";
import assert from "node:assert/strict";
import { accumulateUsage, sessionStats, usageTotals } from "../src/core/stats";
import { sessionTokenTotal } from "../src/core/session";
import { dayLabel } from "../src/cli/components/SessionSelector";
import { providerOf } from "../src/cli/providers";
import { groupEditsByFile, parseDiffLines } from "../src/cli/components/DiffModal";
import { buildActivityLines } from "../src/cli/components/activity/buildActivityLines";
import type { FileEditRecord, Thread } from "../src/cli/types";

test("accumulateUsage adds turns up instead of replacing the session totals", () => {
  const first = accumulateUsage(undefined, { promptTokens: 100, completionTokens: 10, totalTokens: 110, peakContextTokens: 90, contextLimit: 1000 }, "claude/a");
  const second = accumulateUsage(first, { promptTokens: 50, completionTokens: 5, totalTokens: 55, peakContextTokens: 40, contextLimit: 1000 }, "flash");
  assert.equal(second.totalTokens, 165);
  assert.equal(second.promptTokens, 150);
  assert.equal(second.peakContextTokens, 90, "peak is the max across turns");
  assert.deepEqual(second.byModel, {
    "claude/a": { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
    flash: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
  });
  const perModel = Object.values(second.byModel!).reduce((n, m) => n + m.totalTokens, 0);
  assert.equal(perModel, second.totalTokens, "per-model totals match the session total");
});

test("accumulateUsage preserves cache and missing-provider usage details", () => {
  const usage = accumulateUsage(undefined, {
    promptTokens: 140,
    completionTokens: 20,
    totalTokens: 160,
    cachedInputTokens: 30,
    cacheCreationInputTokens: 10,
  }, "claude/model");
  const next = accumulateUsage(usage, {
    promptTokens: 50,
    completionTokens: 0,
    totalTokens: 50,
    reported: false,
  }, "codex/model");
  assert.equal(next.cachedInputTokens, 30);
  assert.equal(next.cacheCreationInputTokens, 10);
  assert.equal(next.reported, false);
  assert.equal(next.byModel?.["claude/model"].cachedInputTokens, 30);
  assert.equal(next.byModel?.["codex/model"].reported, false);
});

test("sessionStats counts agent turns, calls, time and changes", () => {
  const threads: Thread[] = [
    { id: "a", index: 1, prompt: "fix", response: "", isExpanded: false, status: "completed", stepCount: 2, startTime: 0, durationMs: 4000, model: "flash",
      steps: [{ id: "s1", type: "tool", name: "bash" }, { id: "s2", type: "tool", name: "bash", isError: true }] },
    { id: "b", index: 2, prompt: "/help", response: "commands", isExpanded: false, status: "completed", stepCount: 0, startTime: 0, steps: [] },
  ];
  const edits: FileEditRecord[] = [
    { filePath: "a.ts", type: "write", diffLines: [], linesAdded: 4, linesRemoved: 0, timestamp: 1 },
    { filePath: "a.ts", type: "edit", diffLines: [], linesAdded: 1, linesRemoved: 1, timestamp: 2 },
  ];
  const stats = sessionStats(threads, edits);
  assert.equal(stats.turns, 1, "slash-command threads are not agent turns");
  assert.equal(stats.toolCalls, 2);
  assert.equal(stats.failedCalls, 1);
  assert.equal(stats.workMs, 4000);
  assert.equal(stats.filesChanged, 1);
  assert.deepEqual(stats.turnsByModel, { flash: 1 });
});

test("providerOf groups by prefix, catalog first, unprefixed ids via antigravity", () => {
  assert.equal(providerOf("claude/claude-opus-5-5"), "claude");
  assert.equal(providerOf("codex/gpt-6-luna"), "codex");
  assert.equal(providerOf("local/qwen3:14b"), "local");
  assert.equal(providerOf("cloud/deepseek/deepseek-r1:free"), "cloud");
  assert.equal(providerOf("flash"), "antigravity");
  assert.equal(providerOf("weird", [{ id: "weird", category: "local" }]), "local");
});

test("diff viewer lists each change to a file separately, newest first", () => {
  const edits: FileEditRecord[] = [
    { filePath: "src/a.ts", type: "write", diffLines: ["+one", "+two", "+three"], linesAdded: 3, linesRemoved: 0, timestamp: 1 },
    { filePath: "/repo/src/a.ts", type: "edit", diffLines: ["@@ -2,1 +2,1 @@", "-two", "+TWO"], linesAdded: 1, linesRemoved: 1, timestamp: 2 },
  ];
  const [file] = groupEditsByFile(edits, "/repo");
  assert.equal(file.relPath, "src/a.ts", "relative and absolute paths are the same file");

  const { parsed } = parseDiffLines(file.diffLines);
  const changes = parsed.filter((l) => l.type === "change").map((l) => l.codeText);
  assert.deepEqual(changes, ["edit · +1 −1 · latest", "wrote file · 3 lines"]);

  const writeRows = parsed.slice(parsed.findIndex((l) => l.codeText.startsWith("wrote file")));
  assert.deepEqual(writeRows.filter((l) => l.type === "add").map((l) => l.newNum), [1, 2, 3], "line numbers restart per change");
});

test("a single change has no change header", () => {
  const [file] = groupEditsByFile([{ filePath: "b.ts", type: "edit", diffLines: ["@@ -1 +1 @@", "-a", "+b"], linesAdded: 1, linesRemoved: 1, timestamp: 1 }], "/repo");
  assert.ok(!parseDiffLines(file.diffLines).parsed.some((l) => l.type === "change"));
});

test("an open edit card folds from its header and opens the full diff from its body", () => {
  const thread: Thread = {
    id: "t", index: 1, prompt: "fix", response: "", isExpanded: false, status: "completed", stepCount: 1, startTime: 0,
    steps: [{ id: "e1", type: "tool", name: "edit_file", args: { filePath: "src/a.ts" }, output: "ok\n\n@@ -1,1 +1,1 @@\n-a\n+b" }],
  };
  const lines = buildActivityLines({ threads: [thread], edits: [], width: 50, cwd: "/repo" });
  const header = lines.find((l) => l.id.endsWith("_top"));
  const body = lines.filter((l) => /_b\d+$/.test(l.id));
  assert.equal(header?.toolId, "e1");
  assert.equal(header?.editFilePath, undefined);
  assert.ok(body.length > 0 && body.every((l) => l.editFilePath === "src/a.ts"));
});

test("dayLabel groups by calendar day, not by 24h windows", () => {
  const now = new Date(2026, 8, 30, 9, 0).getTime();
  assert.equal(dayLabel(new Date(2026, 8, 30, 0, 5).getTime(), now), "today");
  assert.equal(dayLabel(new Date(2026, 8, 29, 23, 55).getTime(), now), "yesterday");
  assert.equal(dayLabel(new Date(2026, 8, 26, 12, 0).getTime(), now), "saturday");
  assert.equal(dayLabel(new Date(2026, 8, 20, 12, 0).getTime(), now), "sep 20");
  assert.equal(dayLabel(new Date(2025, 11, 31, 12, 0).getTime(), now), "dec 31, 2025");
});

test("sessionTokenTotal trusts cumulative per-model numbers over an old last-turn total", () => {
  assert.equal(sessionTokenTotal(undefined), 0);
  assert.equal(sessionTokenTotal({ promptTokens: 0, completionTokens: 0, totalTokens: 500 }), 500);
  assert.equal(
    sessionTokenTotal({ promptTokens: 0, completionTokens: 0, totalTokens: 500, byModel: { a: { promptTokens: 0, completionTokens: 0, totalTokens: 3000 }, b: { promptTokens: 0, completionTokens: 0, totalTokens: 1000 } } }),
    4000
  );
});

test("usageTotals counts the open session live, once", () => {
  const now = new Date(2026, 8, 30, 12, 0).getTime();
  const saved = [
    { id: "open", title: "", cwd: "", createdAt: 0, updatedAt: now, model: "", turnCount: 1, totalTokens: 10 },
    { id: "a", title: "", cwd: "", createdAt: 0, updatedAt: now - 3_600_000, model: "", turnCount: 1, totalTokens: 100 },
    { id: "b", title: "", cwd: "", createdAt: 0, updatedAt: now - 3 * 86_400_000, model: "", turnCount: 1, totalTokens: 1000 },
  ];
  assert.deepEqual(usageTotals(saved, { id: "open", totalTokens: 50 }, now), { today: 150, allTime: 1150, sessions: 3 });
});
