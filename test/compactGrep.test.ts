import test from "node:test";
import assert from "node:assert/strict";
import { compactAbsolutePathListing } from "../src/tools/bash";

test("compactAbsolutePathListing: groups repeated grep file matches and sorts line numbers numerically", () => {
  const input = [
    "/repo/src/components/List.tsx:542: case 'seraph':",
    "/repo/src/components/List.tsx:543:   body = seraphBodyRows();",
    "/repo/src/components/List.tsx:544:   limit = 24;",
    "/repo/src/components/List.tsx:9: const LIMITS = 24;",
    "/repo/src/core/agent.ts:291:   if (name.startsWith('mcp_')) {",
    "/repo/src/core/agent.ts:348: const hasSeraph = true;",
    "/repo/src/core/agent.ts:351: // navigate code via grep/read tools",
  ].join("\n");

  const result = compactAbsolutePathListing(input);

  // Checks header
  assert.match(result, /7 matches across 2 files under \/repo\/src:/);

  // Filenames should appear once as headers, not repeated for each hit
  const listMatches = result.match(/List\.tsx/g);
  assert.equal(listMatches?.length, 1, "List.tsx filename must only appear once");
  const agentMatches = result.match(/agent\.ts/g);
  assert.equal(agentMatches?.length, 1, "agent.ts filename must only appear once");

  // Line numbers should be sorted numerically (9 before 542)
  const line9Index = result.indexOf(":9:");
  const line542Index = result.indexOf(":542:");
  assert.ok(line9Index !== -1 && line542Index !== -1);
  assert.ok(line9Index < line542Index, "line 9 should be listed before line 542");

  // Slash inside match content ("grep/read tools") should not create a directory
  assert.equal(result.includes("read tools/"), false);
  assert.match(result, /grep\/read tools/);
});

test("compactAbsolutePathListing: formats single-match files inline and relative paths correctly", () => {
  const input = [
    "src/core/agent.ts:291: if (name.startsWith('mcp_')) {",
    "src/core/agent.ts:348: const hasSeraph = true;",
    "src/core/types.ts:15: export interface Options {}",
    "src/utils/math.ts:4: export const add = (a, b) => a + b;",
    "src/utils/math.ts:8: export const sub = (a, b) => a - b;",
  ].join("\n");

  const result = compactAbsolutePathListing(input);

  assert.match(result, /5 matches across 3 files under src:/);
  // Multi-match files have line children
  assert.match(result, /agent\.ts\n[│\s]+├── :291:/);
  // Single-match file formatted inline to save tokens
  assert.match(result, /types\.ts:15: export interface Options {}/);
});

test("compactAbsolutePathListing: leaves non-grep and short output untouched", () => {
  const shortOutput = "file.ts:1: let x = 1;\nfile.ts:2: let y = 2;";
  assert.equal(compactAbsolutePathListing(shortOutput), shortOutput);

  const regularOutput = [
    "Compiling morpheus...",
    "Found 0 errors.",
    "Watching for changes.",
    "Build succeeded.",
    "Ready for connections.",
    "Listening on port 8080.",
  ].join("\n");
  assert.equal(compactAbsolutePathListing(regularOutput), regularOutput);
});
