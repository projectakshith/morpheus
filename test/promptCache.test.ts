import test from "node:test";
import assert from "node:assert/strict";
import { formatToolsForPayload } from "../src/provider/operator";
import {
  buildCanonicalSystemPrompt,
  buildSystemPrompt,
  computePromptCacheFingerprint,
} from "../src/core/context";
import type { AgentContext, ToolDefinition } from "../src/core/types";

test("Prompt Cache: formatToolsForPayload deterministically sorts tools by name", () => {
  const toolA: ToolDefinition = {
    name: "write_file",
    description: "Write content to a file",
    parameters: { type: "object", properties: { path: { type: "string" } } },
    execute: async () => "",
  };
  const toolB: ToolDefinition = {
    name: "bash",
    description: "Execute bash command",
    parameters: { type: "object", properties: { command: { type: "string" } } },
    execute: async () => "",
  };
  const toolC: ToolDefinition = {
    name: "read_file",
    description: "Read file lines",
    parameters: { type: "object", properties: { path: { type: "string" } } },
    execute: async () => "",
  };

  // Map 1: insertion order A, B, C
  const map1 = { write_file: toolA, bash: toolB, read_file: toolC };
  // Map 2: insertion order C, A, B
  const map2 = { read_file: toolC, write_file: toolA, bash: toolB };

  const res1 = formatToolsForPayload(map1);
  const res2 = formatToolsForPayload(map2);

  assert.ok(res1 && res2);
  assert.deepEqual(res1, res2);
  assert.equal((res1[0] as any).function.name, "bash");
  assert.equal((res1[1] as any).function.name, "read_file");
  assert.equal((res1[2] as any).function.name, "write_file");
});

test("Prompt Cache: buildCanonicalSystemPrompt prefix remains byte-stable across volatile turn updates", () => {
  const baseCtx: AgentContext = {
    cwd: "/workspace/project",
    isGit: true,
    branch: "main",
    gitStatus: "clean",
    platform: "darwin",
    date: "2026-01-01",
    rules: ["Always write clean TypeScript."],
  };

  const turn1 = buildCanonicalSystemPrompt(baseCtx);

  // Turn 2: findings added, git status changed to dirty
  const turn2Ctx: AgentContext = {
    ...baseCtx,
    gitStatus: "3 modified files",
    findings: [{ topic: "Auth", takeaway: "Tokens lack expiration check." }],
  };
  const turn2 = buildCanonicalSystemPrompt(turn2Ctx);

  assert.equal(turn1, turn2, "Canonical system prompt prefix must not drift across turns");

  const fullPrompt1 = buildSystemPrompt(baseCtx);
  const fullPrompt2 = buildSystemPrompt(turn2Ctx);

  // Both full prompts must start with the exact same canonical prefix
  assert.ok(fullPrompt1.startsWith(turn1));
  assert.ok(fullPrompt2.startsWith(turn1));
  assert.ok(fullPrompt2.includes("<epilogue>"));
  assert.ok(fullPrompt2.includes("Tokens lack expiration check."));
});

test("Prompt Cache: computePromptCacheFingerprint produces stable sha256 checksum", () => {
  const system = "System instructions";
  const tools = {
    alpha: { name: "alpha", description: "a", parameters: {}, execute: async () => "" },
  };

  const fp1 = computePromptCacheFingerprint(system, tools);
  const fp2 = computePromptCacheFingerprint(system, tools);
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 64);
});
