import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityLines } from "../src/cli/components/activity/buildActivityLines";
import { describeStep, parseUnifiedDiff } from "../src/display/describeStep";
import { cellWidth, sanitizeOutputLine, truncateCells, wrapCells, charWidth } from "../src/display/cells";
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

test("activity: every row is exactly the panel width, at every width", () => {
  for (const width of [24, 37, 45, 62, 90]) {
    const lines = buildActivityLines({
      threads: [turn("t1", 1, "fix the auth check 日本", richSteps())],
      edits: [{ filePath: "/repo/src/auth.ts", type: "edit", diffLines: [], linesAdded: 3, linesRemoved: 2, timestamp: 0 }],
      width,
      cwd: CWD,
    });
    for (const line of lines) {
      assert.equal(cellWidth(textOf(line.node)), width, `width ${width}: ${JSON.stringify(stripAnsi(textOf(line.node)))}`);
    }
  }
});

test("activity: quiet calls merge into one line and cards show real content", () => {
  const steps = richSteps();
  const all = new Set(steps.slice(4, 7).map((s) => s.id));
  const text = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", steps)], edits: [], width: 62, toggledIds: all, cwd: CWD }));
  assert.match(text[0], /^  list src\/ · search "checkToken" 2 hits\s*$/);
  assert.match(text[1], /^  read auth\.ts, crypto\.ts\s*$/);
  assert.ok(text.some((l) => /╭ edit\s+src\/auth\.ts .*\+3 −2 ╮/.test(l)));
  assert.ok(text.some((l) => /│ 4 −   if \(!token\) return false;/.test(l)));
  assert.ok(text.some((l) => /exit 1 ╮/.test(l)));
  assert.ok(text.some((l) => l.includes("tests: 14 passed")));
});

test("activity: when idle, only the newest card is open", () => {
  const lines = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", richSteps())], edits: [], width: 62, cwd: CWD }));
  const headers = lines.filter((l) => /^\s*(╭|▸|✕|◌)/.test(l)).map((l) => l.trim().slice(0, 7).trimEnd());
  assert.deepEqual(headers, ["▸ edit", "▸ run", "✕ run", "╭ write"]);
});

test("activity: while running, the running card is open and the rest are folded", () => {
  const steps = richSteps().slice(0, 6);
  steps[5] = { ...steps[5], isRunning: true, output: "", startTime: Date.now() - 3000 };
  const lines = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", steps)], edits: [], width: 62, cwd: CWD }));
  assert.ok(lines.some((l) => /^\s*▸ edit/.test(l)), "finished edit is folded");
  assert.ok(lines.some((l) => /^\s*╭ run\s+npm test.*running 3\.0s ╮/.test(l)), "running command is open with a live timer");

  const readRunning = richSteps().slice(0, 5);
  readRunning.push(tool("read_file", { filePath: "src/router.ts" }, "", { isRunning: true }));
  const quiet = plain(buildActivityLines({ threads: [turn("t1", 1, "fix", readRunning)], edits: [], width: 62, cwd: CWD }));
  assert.ok(quiet.some((l) => /^\s*▸ edit/.test(l)), "a running read folds every card");
  assert.ok(quiet.some((l) => l.includes("read router.ts …")), "the quiet line shows the read in progress");
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

  const folded = buildActivityLines({ threads: [old, now], edits: [], width: 62, cwd: CWD });
  const first = folded[0];
  assert.equal(first.threadId, "t1");
  assert.match(stripAnsi(textOf(first.node)), /▸ turn 1 · explore the repo · 2 calls · 1 failed/);
  assert.ok(!plain(folded).some((l) => l.includes("run   ls")), "earlier cards hidden while folded");

  const opened = plain(buildActivityLines({ threads: [old, now], edits: [], width: 62, openedTurnIds: new Set(["t1"]), cwd: CWD }));
  assert.match(opened[0], /▾ turn 1/);
  assert.ok(opened.some((l) => /✕ run\s+ls/.test(l)), "opened turn shows its calls, folded");
});

test("activity: changes footer summarizes edits and opens the diff", () => {
  const edits: FileEditRecord[] = [
    { filePath: "/repo/src/auth.ts", type: "edit", diffLines: [], linesAdded: 3, linesRemoved: 2, timestamp: 0 },
    { filePath: "/repo/src/auth.test.ts", type: "write", diffLines: [], linesAdded: 5, linesRemoved: 0, timestamp: 1 },
  ];
  const lines = buildActivityLines({ threads: [turn("t1", 1, "fix", richSteps())], edits, width: 62, cwd: CWD });
  const footer = lines[lines.length - 1];
  assert.match(stripAnsi(textOf(footer.node)), /◇ 2 files changed\s+\+8 −2\s+review ›/);
  assert.equal(footer.editFilePath, "/repo/src/auth.test.ts");
});

test("activity: empty state when nothing has run", () => {
  const text = plain(buildActivityLines({ threads: [], edits: [], width: 40, cwd: CWD }));
  assert.ok(text.some((l) => l.includes("no tool calls yet")));
});

test("seraph search renders ranked hits with code preview and timing", () => {
  const output = JSON.stringify({
    query: "start mcp servers",
    resolved_commit: "abcdef1234567",
    index: { commit: "abcdef1234567", base_commit: null, parsed_files: 2, reused_chunks: 8, total_chunks: 10, ms: 120 },
    search_ms: 4.2,
    results: [
      { score: 8, path: "src/mcp.ts", symbol: "connect", start_line: 10, end_line: 20, commit: "abcdef1234567", text: "async connect() {\n  return client;\n}", retrieval_scores: { lexical: 8, semantic: 0.9 } },
      { score: 4, path: "src/cli.ts", symbol: "runServe", start_line: 3, end_line: 9, commit: "abcdef1234567", text: "function runServe() {}", retrieval_scores: { lexical: 4, semantic: 0.5 } },
    ],
  }, null, 2);
  const step = tool("mcp_seraph_search_code", { query: "start mcp servers" }, output);
  const model = describeStep(step, CWD);
  assert.ok(model.kind === "card" && model.card.verb === "seraph");
  assert.equal(model.card.status, "2 hits · 4ms");
  const text = plain(buildActivityLines({ threads: [turn("t", 1, "find", [step])], edits: [], width: 72, cwd: CWD })).join("\n");
  assert.match(text, /◈ 1 connect/);
  assert.match(text, /◇ 2 runServe/);
  assert.match(text, /src\/mcp\.ts:10-20/);
  assert.match(text, /async connect\(\)/);
  assert.match(text, /reuse .* 80%/);
});

test("seraph history collapses identical versions into one hit", () => {
  const output = JSON.stringify({
    results: [
      { score: 1, path: "a.py", symbol: "f", start_line: 1, end_line: 2, commit: "c2", text: "def f(): pass", versions: ["c2", "c1"] },
    ],
  });
  const step = tool("mcp_seraph_search_history", { query: "f" }, output);
  const text = plain(buildActivityLines({ threads: [turn("t", 1, "find", [step])], edits: [], width: 72, cwd: CWD })).join("\n");
  assert.match(text, /all versions/);
  assert.match(text, /@c2 \+1 version same code/);
});

test("running seraph call shows the scan lane", () => {
  const step = tool("mcp_seraph_search_code", { query: "x" }, "", { isRunning: true, startTime: 0 });
  const text = plain(buildActivityLines({ threads: [turn("t", 1, "find", [step])], edits: [], width: 72, cwd: CWD, now: 500 })).join("\n");
  assert.match(text, /◌ seraph scanning index/);
});

test("seraph dependency and compare results render as their own cards", () => {
  const deps = JSON.stringify({
    query: "build",
    direction: "out",
    results: [{ symbol: "src/a.ts::build", chains: [{ symbols: ["src/a.ts::build", "src/b.ts::connect"], score: 1, edges: [{ src: "src/a.ts::build", dst: "src/b.ts::connect", kind: "calls" }] }] }],
  });
  const compare = JSON.stringify({
    from: "aaaaaaa1", to: "bbbbbbb2",
    summary: { added: 2, modified: 1, renamed: 1, moved: 0, deleted: 0 },
    symbols: [{ change_type: "renamed", symbol: "src/a.ts::start", path: "src/a.ts", start_line: 4, end_line: 9 }],
    dependencies: { added: [{ src: "x", dst: "y", kind: "calls" }], removed: [] },
    commits: [{ commit: "bbbbbbb2", subject: "rename run to start" }],
  });
  const steps = [
    tool("mcp_seraph_find_dependencies", { symbol: "build", direction: "out" }, deps),
    tool("mcp_seraph_compare_versions", { from_version: "v1", to_version: "v2" }, compare),
  ];
  const d = describeStep(steps[0], CWD);
  const c = describeStep(steps[1], CWD);
  assert.ok(d.kind === "card" && d.card.status === "1 path");
  assert.ok(c.kind === "card" && c.card.status === "4 symbols changed");
  const text = plain(buildActivityLines({ threads: [turn("t", 1, "x", steps)], edits: [], width: 72, cwd: CWD, toggledIds: new Set([steps[0].id]) })).join("\n");
  assert.match(text, /└ calls connect/);
  assert.match(text, /↷1 renamed/);
  assert.match(text, /rename run to start/);
});
