import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateRepoMap } from "../src/core/repomap";

describe("generateRepoMap (Skeleton Repo Map)", () => {
  it("extracts symbols from the current repository structure", () => {
    const map = generateRepoMap(process.cwd());
    assert.ok(typeof map === "string");
    assert.ok(map.length > 0, "Repo map should not be empty");
    assert.ok(map.includes("src/cli/format.ts: class MarkdownFormatter"));
    assert.ok(map.includes("src/core/agent.ts:") && map.includes("runAgent"));
    assert.ok(map.includes("src/core/compaction.ts:") && map.includes("compactHistory"));
    assert.ok(map.includes("src/tools/index.ts: createTools"));
  });

  it("respects maxFiles limit", () => {
    const map = generateRepoMap(process.cwd(), { maxFiles: 3 });
    const lines = map.split("\n").filter(Boolean);
    assert.ok(lines.length <= 3, "Should not exceed maxFiles lines");
  });

  it("produces compact token-efficient output", () => {
    const map = generateRepoMap(process.cwd());
    const lines = map.split("\n").filter(Boolean);
    assert.ok(lines.length <= 30, "Repo map should remain under 30 lines");
    assert.ok(map.length <= 3200, "Repo map should stay under ~3.2k chars");
    for (const line of lines) {
      assert.ok(line.includes(":"), "Each entry should map file to symbols");
    }
  });
});

describe("generateRepoMap size budget", () => {
  it("never exceeds maxChars and trims long entries before dropping files", () => {
    const full = generateRepoMap(process.cwd(), { maxChars: 100_000 }).split("\n");
    const tight = generateRepoMap(process.cwd(), { maxChars: 2000 });
    assert.ok(tight.length <= 2000);
    const tightLines = tight.split("\n");
    assert.equal(tightLines.length, full.length, "every file stays listed when bare paths fit");
    tightLines.forEach((line, i) => {
      assert.ok(line === full[i] || (line.endsWith("…") && full[i].startsWith(line.slice(0, -1))), line);
    });

    const tiny = generateRepoMap(process.cwd(), { maxChars: 300 });
    assert.ok(tiny.length <= 300 && tiny.length > 0, "drops files only when paths alone don't fit");
  });
});
