import test from "node:test";
import assert from "node:assert/strict";
import { grepKeywords, grepRankOf, renderVersus } from "../src/commands/versus";

test("grepKeywords drops stopwords and plural endings", () => {
  assert.deepEqual(grepKeywords("Where are the MCP servers started?"), ["mcp", "server", "started"]);
});

test("grepRankOf finds the first grep hit inside the seraph range", () => {
  const hits = [{ path: "a.ts", line: 3 }, { path: "b.ts", line: 40 }, { path: "b.ts", line: 12 }];
  const target = { path: "b.ts", symbol: "f", start_line: 10, end_line: 20, score: 1 };
  assert.equal(grepRankOf(hits, target), 3);
  assert.equal(grepRankOf(hits, { ...target, path: "c.ts" }), -1);
});

test("renderVersus shows both columns and the verdict", () => {
  const text = renderVersus(
    "start servers",
    { hits: [{ path: "b.ts", symbol: "connect", start_line: 10, end_line: 20, score: 1 }], ms: 3, indexMs: 120 },
    { hits: [{ path: "a.ts", line: 1 }, { path: "b.ts", line: 15 }], ms: 40, keywords: ["start", "server"] }
  );
  assert.match(text, /◈ SERAPH {2}search 3ms/);
  assert.match(text, /1 connect\s+│ 1 a\.ts:1/);
  assert.match(text, /shows up at grep hit #2 of 2/);
});
