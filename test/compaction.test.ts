import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CoreMessage, ToolContent } from "ai";
import { compactHistory } from "../src/core/compaction";

describe("compactHistory (Micro-Compaction Engine)", () => {
  it("preserves short conversation histories without modification", () => {
    const history: CoreMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hey what's up" },
    ];
    const result = compactHistory(history);
    assert.deepEqual(result, history);
  });

  it("protects recent turns in full fidelity based on sliding window", () => {
    const history: CoreMessage[] = [
      { role: "user", content: "Turn 1" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "bash",
            result: "A".repeat(800),
          },
        ],
      },
      { role: "assistant", content: "Turn 1 done" },
      { role: "user", content: "Turn 2" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "2",
            toolName: "bash",
            result: "B".repeat(800),
          },
        ],
      },
      { role: "assistant", content: "Turn 2 done" },
    ];

    const result = compactHistory(history, { recentTurnsToProtect: 2 });
    const turn1Result = (result[1].content as ToolContent)[0];
    assert.equal(turn1Result.type, "tool-result");
    if (turn1Result.type === "tool-result") {
      assert.equal(turn1Result.result, "A".repeat(800));
    }
  });

  it("tombstones successful tool outputs older than sliding window", () => {
    const history: CoreMessage[] = [
      { role: "user", content: "Turn 1" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "bash",
            result: "line\n".repeat(50),
          },
        ],
      },
      { role: "assistant", content: "Turn 1 done" },
      { role: "user", content: "Turn 2" },
      { role: "assistant", content: "Turn 2 done" },
      { role: "user", content: "Turn 3" },
      { role: "assistant", content: "Turn 3 done" },
    ];

    const result = compactHistory(history, { recentTurnsToProtect: 2 });
    const turn1Result = (result[1].content as ToolContent)[0];
    assert.equal(turn1Result.type, "tool-result");
    if (turn1Result.type === "tool-result") {
      assert.ok(
        typeof turn1Result.result === "string" &&
          turn1Result.result.includes("[Operator: bash | 51 lines, done]"),
        "Historical successful output should be replaced with tombstone"
      );
    }
  });

  it("preserves small tool outputs to avoid entity loss", () => {
    const history: CoreMessage[] = [
      { role: "user", content: "Turn 1: check branch" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "bash",
            result: "* main\n  feature/auth",
          },
        ],
      },
      { role: "assistant", content: "On main." },
      { role: "user", content: "Turn 2" },
      { role: "assistant", content: "Turn 2 done" },
      { role: "user", content: "Turn 3" },
      { role: "assistant", content: "Turn 3 done" },
    ];

    const result = compactHistory(history, { recentTurnsToProtect: 2 });
    const turn1Result = (result[1].content as ToolContent)[0];
    assert.equal(turn1Result.type, "tool-result");
    if (turn1Result.type === "tool-result") {
      assert.equal(
        turn1Result.result,
        "* main\n  feature/auth",
        "Short tool outputs under threshold should never be tombstoned"
      );
    }
  });

  it("preserves error headers and stack traces for failed tool outputs", () => {
    const errorBody =
      "Error: Cannot find module 'express'\n" +
      "    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)\n" +
      "    at Function.Module._load (node:internal/modules/cjs/loader:1051:27)\n" +
      "    at TracingChannel.traceSync (node:diagnostics_channel:315:14)\n" +
      "Extra log line 1\n".repeat(30);

    const history: CoreMessage[] = [
      { role: "user", content: "Turn 1: start server" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "bash",
            result: errorBody,
            isError: true,
          },
        ],
      },
      { role: "assistant", content: "Server failed." },
      { role: "user", content: "Turn 2" },
      { role: "assistant", content: "Turn 2 done" },
      { role: "user", content: "Turn 3" },
      { role: "assistant", content: "Turn 3 done" },
    ];

    const result = compactHistory(history, {
      recentTurnsToProtect: 2,
      errorLinesToPreserve: 4,
    });
    const turn1Result = (result[1].content as ToolContent)[0];
    assert.equal(turn1Result.type, "tool-result");
    if (turn1Result.type === "tool-result") {
      const text = turn1Result.result as string;
      assert.ok(
        text.includes("Error: Cannot find module 'express'"),
        "Error message must be preserved"
      );
      assert.ok(
        text.includes("Module._resolveFilename"),
        "Top stack trace line must be preserved"
      );
      assert.ok(
        text.includes("pruned for token efficiency"),
        "Must prune remaining excess lines"
      );
    }
  });

  it("compacts older tool steps within a single user turn", () => {
    const history = [
      { role: "user", content: "Inspect codebase" },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "bash", arguments: '{"command":"ls"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "bash",
        content: "file_entry\n".repeat(60),
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_2",
            type: "function" as const,
            function: { name: "read_file", arguments: '{"filePath":"a.ts"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_2",
        name: "read_file",
        content: "code_line\n".repeat(60),
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_3",
            type: "function" as const,
            function: { name: "read_file", arguments: '{"filePath":"b.ts"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_3",
        name: "read_file",
        content: "fresh_line\n".repeat(60),
      },
    ];

    const result = compactHistory(history as any, { recentStepsToProtect: 2 });
    assert.ok(
      typeof result[2].content === "string" &&
        result[2].content.includes("intermediate output lines omitted"),
      "Step 1 bash tool output must be compacted with semantic head/tail preservation"
    );
    assert.ok(
      typeof result[4].content === "string" &&
        result[4].content.includes("code_line"),
      "Step 2 tool output within window must be preserved"
    );
    assert.ok(
      typeof result[6].content === "string" &&
        result[6].content.includes("fresh_line"),
      "Step 3 tool output within window must be preserved"
    );
  });
});
