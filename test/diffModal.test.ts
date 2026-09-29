import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDiffLines } from "../src/cli/components/DiffModal.js";
import { getLangFromPath, highlightCode } from "../src/cli/highlight.js";
import { stripAnsi } from "../src/cli/utils/text.js";

describe("Diff Line Parser & Inspector", () => {
  it("parses unified diff hunks and calculates accurate line numbers", () => {
    const rawDiff = [
      "@@ -10,4 +10,5 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 20;",
      "+const c = 30;",
      " const d = 4;",
    ];

    const { parsed, maxLineNum } = parseDiffLines(rawDiff);

    assert.equal(parsed.length, 6);
    assert.equal(maxLineNum, 13);

    // Hunk header
    assert.equal(parsed[0].type, "hunk");

    // Context line: old 10, new 10
    assert.equal(parsed[1].type, "ctx");
    assert.equal(parsed[1].oldNum, 10);
    assert.equal(parsed[1].newNum, 10);
    assert.equal(parsed[1].codeText, "const a = 1;");

    // Removed line: old 11
    assert.equal(parsed[2].type, "rem");
    assert.equal(parsed[2].oldNum, 11);
    assert.equal(parsed[2].newNum, undefined);
    assert.equal(parsed[2].codeText, "const b = 2;");

    // Added lines: new 11, new 12
    assert.equal(parsed[3].type, "add");
    assert.equal(parsed[3].oldNum, undefined);
    assert.equal(parsed[3].newNum, 11);
    assert.equal(parsed[3].codeText, "const b = 20;");

    assert.equal(parsed[4].type, "add");
    assert.equal(parsed[4].newNum, 12);
    assert.equal(parsed[4].codeText, "const c = 30;");

    // Context line: old 12, new 13
    assert.equal(parsed[5].type, "ctx");
    assert.equal(parsed[5].oldNum, 12);
    assert.equal(parsed[5].newNum, 13);
    assert.equal(parsed[5].codeText, "const d = 4;");
  });

  it("handles diff metadata headers cleanly", () => {
    const rawDiff = [
      "diff --git a/src/index.ts b/src/index.ts",
      "index 1234567..89abcdef 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,1 +1,1 @@",
      "+console.log('morpheus');",
    ];

    const { parsed } = parseDiffLines(rawDiff);
    assert.equal(parsed.filter((p) => p.type === "header").length, 4);
    assert.equal(parsed[4].type, "hunk");
    assert.equal(parsed[5].type, "add");
    assert.equal(parsed[5].newNum, 1);
  });

  it("detects language from file extensions reliably", () => {
    assert.equal(getLangFromPath("src/cli/DiffModal.tsx"), "typescript");
    assert.equal(getLangFromPath("scripts/run.py"), "python");
    assert.equal(getLangFromPath("core/main.rs"), "rust");
    assert.equal(getLangFromPath("pkg/api.go"), "go");
    assert.equal(getLangFromPath("bin/deploy.sh"), "bash");
    assert.equal(getLangFromPath("config.json"), "json");
    assert.equal(getLangFromPath("styles.css"), "css");
    assert.equal(getLangFromPath("unknown.xyz"), "text");
  });

  it("highlights code tokens with ANSI sequences while preserving text", () => {
    const raw = "const execute = async (query: string): Promise<boolean> => true;";
    const highlighted = highlightCode(raw, "typescript");

    assert.notEqual(highlighted, raw);
    assert.ok(highlighted.includes("\x1b["));
    assert.equal(stripAnsi(highlighted), raw);
  });
});
