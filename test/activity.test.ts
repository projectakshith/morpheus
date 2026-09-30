import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityLines } from "../src/cli/components/activity/buildActivityLines";
import { describeStep, parseUnifiedDiff } from "../src/cli/components/activity/describeStep";
import { cellWidth, sanitizeOutputLine, truncateCells, wrapCells, charWidth } from "../src/cli/utils/cells";
import type { Thread, ThreadStep, FileEditRecord, RightLine } from "../src/cli/types";

const CWD = "/repo";
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : "";
}
const plain = (lines: RightLine[]) => lines.map((l) => stripAnsi(textOf(l.node)));

let seq = 0;
function tool(name: string, args: Record<string, unknown>, output = "", extra: Partial<ThreadStep> = {}): ThreadStep {
  return { id: `s${++seq}`, type: "tool", name, args, output, durationMs: 40, ...extra };
}

const EDIT_OUTPUT = [
  "Successfully applied edits to src/auth.ts.",
  "",
  "@@ -3,4 +3,5 @@",
  " export function checkToken(token: string): boolean {",
  "-  if (!token) return false;",
  "-  return verify(token, process.env.SECRET);",
  "+  const secret = process.env.SECRET;",
  "+  if (!token || !secret) return false;",
  "+  return verify(token, secret);",
  " }",
].join("\n");

function turn(id: string, index: number, prompt: string, steps: ThreadStep[]): Thread {
  return { id, index, prompt, response: "", steps, status: "completed", stepCount: steps.length, startTime: 0 };
}

function richSteps(): ThreadStep[] {
  return [
    tool("list_dir", { dirPath: "src" }, "src/\n├── auth.ts\n└── crypto.ts"),
    tool("grep_code", { pattern: "checkToken" }, "src/auth.ts:\n  3: export function checkToken\nsrc/router.ts:\n  1: import { checkToken }"),
    tool("read_file", { filePath: "/repo/src/auth.ts" }, "1: a\n2: b"),
    tool("read_file", { filePath: "src/crypto.ts" }, "1: c"),
    tool("edit_file", { filePath: "/repo/src/auth.ts" }, EDIT_OUTPUT),
    tool(
      "bash",
      { command: "cd /repo && npm test -- --reporter=dot --some-really-long-flag-name=value" },
      "\x1b[32m✓\x1b[0m auth\tpasses\nprogress 10%\rprogress 100%\n日本語のテスト出力\ntests: 14 passed"
    ),
    tool("bash", { command: "cat nope.ts" }, "Command exited with code 1\n[stderr]\ncat: nope.ts: No such file or directory", { isError: true }),
    tool("write_file", { filePath: "src/auth.test.ts", content: "import x from './auth';\n\tconsole.log('ok');\n" }),
  ];
}

/* ---------- cells ---------- */

test("cells: width counts wide glyphs as two and ignores ANSI", () => {
  assert.equal(cellWidth("abc"), 3);
  assert.equal(cellWidth("日本"), 4);
  assert.equal(cellWidth("\x1b[31mred\x1b[39m"), 3);
  assert.equal(charWidth("🙂".codePointAt(0)!), 2);
});

test("cells: truncation keeps ANSI, closes styles, and never exceeds width", () => {
  const out = truncateCells("\x1b[32mhello world\x1b[39m", 6);
  assert.equal(stripAnsi(out), "hello…");
  assert.ok(out.startsWith("\x1b[32m"));
  assert.equal(cellWidth(truncateCells("日本語テキスト", 5)), 5);
});

test("cells: wrapping prefers spaces and hard-breaks long tokens", () => {
  assert.deepEqual(wrapCells("cat: nope.ts: No such file or directory", 20), ["cat: nope.ts: No", "such file or", "directory"]);
  assert.deepEqual(wrapCells("/a/very/long/path/without/spaces", 10), ["/a/very/lo", "ng/path/wi", "thout/spac", "es"]);
});

test("cells: output sanitizing resolves progress redraws, tabs and color codes", () => {
  assert.equal(sanitizeOutputLine("progress 10%\rprogress 100%"), "progress 100%");
  assert.equal(sanitizeOutputLine("\x1b[32m✓\x1b[0m a\tb"), "✓ a  b");
});

/* ---------- describeStep ---------- */

test("describeStep: reads, lists and searches are quiet with readable results", () => {
  const [list, grep, read] = richSteps();
  const l = describeStep(list, CWD);
  const g = describeStep(grep, CWD);
  const r = describeStep(read, CWD);
  assert.ok(l.kind === "quiet" && l.item.result === "2 entries");
  assert.ok(g.kind === "quiet" && g.item.result === "2 hits · 2 files");
  assert.ok(r.kind === "quiet" && r.item.target === "auth.ts" && r.item.result === "2 lines");
});

test("describeStep: a failed read becomes an error card", () => {
  const m = describeStep(tool("read_file", { filePath: "x.ts" }, "Error: File not found: x.ts", { isError: true }), CWD);
  assert.ok(m.kind === "card");
  assert.equal(m.card.status, "failed");
  assert.ok(m.card.body.type === "text" && m.card.body.lines[0].text === "File not found: x.ts");
});

test("describeStep: bash exit codes and stderr are parsed", () => {
  const steps = richSteps();
  const ok = describeStep(steps[5], CWD);
  const bad = describeStep(steps[6], CWD);
  assert.ok(ok.kind === "card" && ok.card.status === "exit 0" && !ok.card.failed);
  assert.equal(ok.card.target.startsWith("npm test"), true, "cd prefix is stripped");
  assert.ok(bad.kind === "card" && bad.card.status === "exit 1" && bad.card.failed);
  assert.ok(bad.card.body.type === "text");
  assert.deepEqual(bad.card.body.lines, [{ text: "cat: nope.ts: No such file or directory", error: true }]);
});

test("parseUnifiedDiff: real line numbers, trimmed context, gaps between hunks", () => {
  const { rows, added, removed } = parseUnifiedDiff(EDIT_OUTPUT);
  assert.equal(added, 3);
  assert.equal(removed, 2);
  assert.deepEqual(
    rows.map((r) => `${r.kind}:${r.lineNo ?? ""}`),
    ["ctx:3", "del:4", "del:5", "add:4", "add:5", "add:6", "ctx:7"]
  );

  const twoHunks = parseUnifiedDiff(
    ["@@ -1,5 +1,5 @@", " a", " b", "-c", "+C", " d", " e", "@@ -40,2 +40,2 @@", "-x", "+X"].join("\n")
  );
  assert.deepEqual(
    twoHunks.rows.map((r) => r.kind),
    ["ctx", "del", "add", "ctx", "gap", "del", "add"]
  );
});

/* ---------- layout ---------- */

test("activity: every row is exactly the panel width, at every width", () => {
  for (const width of [24, 37, 45, 62, 90]) {
    const lines = buildActivityLines({
      threads: [turn("t1", 1, "fix the auth check 日本", richSteps())],
      edits: [{ filePath: "/repo/src/auth.ts", type: "edit", diffLines: [], linesAdded: 3, linesRemoved: 2, timestamp: 0 }],
      width,
      viewportHeight: 200,
      cwd: CWD,
    });
    for (const line of lines) {
      assert.equal(cellWidth(textOf(line.node)), width, `width ${width}: ${JSON.stringify(stripAnsi(textOf(line.node)))}`);
    }
  }
});

test("activity: quiet calls merge into one line and cards show real content", () => {
  const text = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", richSteps())], edits: [], width: 62, viewportHeight: 200, cwd: CWD }));
  /* The quiet line packs whole items and wraps onto a second row when needed. */
  assert.match(text[0], /^  list src\/ · search "checkToken" 2 hits\s*$/);
  assert.match(text[1], /^  read auth\.ts, crypto\.ts\s*$/);
  assert.ok(text.some((l) => /╭ edit\s+src\/auth\.ts .*\+3 −2 ╮/.test(l)));
  assert.ok(text.some((l) => /│ 4 −   if \(!token\) return false;/.test(l)));
  assert.ok(text.some((l) => /exit 1 ╮/.test(l)));
  assert.ok(text.some((l) => l.includes("tests: 14 passed")));
});

test("activity: newest cards stay open and older ones fold when space runs out", () => {
  const lines = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", richSteps())], edits: [], width: 62, viewportHeight: 14, cwd: CWD }));
  const editLine = lines.find((l) => l.includes("edit"));
  const writeHeader = lines.find((l) => l.includes("write"));
  assert.ok(editLine?.trimStart().startsWith("▸ edit"), "oldest card folds to one line");
  assert.ok(writeHeader?.trimStart().startsWith("╭ write"), "newest card stays open");
});

test("activity: clicking flips a card's default state", () => {
  const steps = richSteps();
  const editId = steps[4].id;
  const writeId = steps[7].id;
  const lines = plain(
    buildActivityLines({
      threads: [turn("t1", 1, "fix", steps)],
      edits: [],
      width: 62,
      viewportHeight: 14,
      toggledIds: new Set([editId, writeId]),
      cwd: CWD,
    })
  );
  assert.ok(lines.find((l) => l.includes("edit"))?.trimStart().startsWith("╭ edit"));
  assert.ok(lines.find((l) => l.includes("write"))?.trimStart().startsWith("▸ write"));
});

test("activity: earlier turns fold to a summary line until opened", () => {
  const old = turn("t1", 1, "explore the repo", [tool("list_dir", { dirPath: "." }, "a"), tool("bash", { command: "ls" }, "x", { isError: true })]);
  const now = turn("t2", 2, "fix the auth check", richSteps());

  const folded = buildActivityLines({ threads: [old, now], edits: [], width: 62, viewportHeight: 200, cwd: CWD });
  const first = folded[0];
  assert.equal(first.threadId, "t1");
  assert.match(stripAnsi(textOf(first.node)), /▸ turn 1 · explore the repo · 2 calls · 1 failed/);
  assert.ok(!plain(folded).some((l) => l.includes("run   ls")), "earlier cards hidden while folded");

  const opened = plain(buildActivityLines({ threads: [old, now], edits: [], width: 62, viewportHeight: 200, openedTurnIds: new Set(["t1"]), cwd: CWD }));
  assert.match(opened[0], /▾ turn 1/);
  assert.ok(opened.some((l) => /✕ run\s+ls/.test(l)), "opened turn shows its calls, folded");
});

test("activity: changes footer summarizes edits and opens the diff", () => {
  const edits: FileEditRecord[] = [
    { filePath: "/repo/src/auth.ts", type: "edit", diffLines: [], linesAdded: 3, linesRemoved: 2, timestamp: 0 },
    { filePath: "/repo/src/auth.test.ts", type: "write", diffLines: [], linesAdded: 5, linesRemoved: 0, timestamp: 1 },
  ];
  const lines = buildActivityLines({ threads: [turn("t1", 1, "fix", richSteps())], edits, width: 62, viewportHeight: 200, cwd: CWD });
  const footer = lines[lines.length - 1];
  assert.match(stripAnsi(textOf(footer.node)), /◇ 2 files changed\s+\+8 −2\s+review ›/);
  assert.equal(footer.editFilePath, "/repo/src/auth.test.ts");
});

test("activity: empty state when nothing has run", () => {
  const text = plain(buildActivityLines({ threads: [], edits: [], width: 40, viewportHeight: 20, cwd: CWD }));
  assert.ok(text.some((l) => l.includes("no tool calls yet")));
});
