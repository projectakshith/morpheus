import test from "node:test";
import assert from "node:assert/strict";
import { Operator } from "../src/provider/operator";
import { compactHistory } from "../src/core/compaction";
import type { ChatMessage } from "../src/core/types";

test("Operator native client initialization", () => {
  const operator = new Operator({
    model: "test-model",
    apiKey: "test-key",
    baseURL: "https://example.com/v1",
  });

  assert.equal(operator.getModel(), "test-model");
  assert.equal(operator.getBaseURL(), "https://example.com/v1");
  assert.equal(operator.getNumCtx(), 128000);
  assert.equal(operator.getContextSafetyLimit(), 119808);
});

test("Operator context safety limits for local and custom models", () => {
  const localOperator = new Operator({
    isLocal: true,
  });
  assert.equal(localOperator.getNumCtx(), 32768);
  assert.equal(localOperator.getContextSafetyLimit(), 27853);

  const customOperator = new Operator({
    numCtx: 16384,
  });
  assert.equal(customOperator.getNumCtx(), 16384);
  assert.equal(customOperator.getContextSafetyLimit(), 16384 - Math.floor(16384 * 0.15));
});

test("Intra-step compaction prevents token snowball", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "explore repo" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "bash", arguments: '{"command":"ls -la"}' },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call_1",
      name: "bash",
      content: "line\n".repeat(40),
    },
    { role: "assistant", content: "checked dir" },
    { role: "user", content: "continue" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_2",
          type: "function",
          function: { name: "bash", arguments: '{"command":"cat package.json"}' },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call_2",
      name: "bash",
      content: "line\n".repeat(40),
    },
    { role: "assistant", content: "checked package" },
    { role: "user", content: "step 3" },
  ];

  const compacted = compactHistory(messages, { recentTurnsToProtect: 2 });
  const tool1 = compacted.find((m) => m.tool_call_id === "call_1");
  assert.ok(tool1);
  assert.ok(
    typeof tool1.content === "string" && tool1.content.includes("[Operator: bash | 41 lines, done]"),
    "Early exploratory tool output must be tombstoned"
  );

  const tool2 = compacted.find((m) => m.tool_call_id === "call_2");
  assert.ok(tool2);
  assert.equal(
    tool2.content,
    "line\n".repeat(40),
    "Recent tool output within protection window must be preserved in full fidelity"
  );
});
