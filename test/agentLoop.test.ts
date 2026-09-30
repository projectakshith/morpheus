import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChatMessage } from "../src/core/types";

/* The session logger writes under $HOME, so point it at a temp dir before loading the agent. */
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "morpheus-loop-"));
process.env.HOME = sandbox;
const workspace = path.join(sandbox, "workspace");
fs.mkdirSync(workspace);
fs.writeFileSync(path.join(workspace, "big.ts"), Array.from({ length: 200 }, (_, i) => `const v${i} = ${i};`).join("\n"));

let runAgent: typeof import("../src/core/agent").runAgent;
before(async () => {
  ({ runAgent } = await import("../src/core/agent"));
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200 });
}

function toolCall(id: string, name: string, args: object): Response {
  return sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ]);
}

function text(content: string): Response {
  return sse([
    { choices: [{ delta: { content } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
  ]);
}

/* Replays scripted model turns and records every request body the agent sends. */
function scriptModel(turns: Response[]): { requests: Array<{ messages: any[]; tools?: unknown[] }> } {
  const requests: Array<{ messages: any[]; tools?: unknown[] }> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const next = turns[requests.length - 1];
    assert.ok(next, `unexpected model request #${requests.length}`);
    return next;
  }) as typeof fetch;
  return { requests };
}

const toolResults = (messages: ChatMessage[]) => messages.filter((m) => m.role === "tool");

test("Agent stops a redundant-call loop and still returns a final answer", async () => {
  const read = { filePath: "big.ts" };
  const { requests } = scriptModel([
    toolCall("c1", "read_file", read),
    toolCall("c2", "read_file", read),
    toolCall("c3", "read_file", read),
    toolCall("c4", "read_file", read),
    text("Summary after stop."),
  ]);

  const result = await runAgent("inspect big.ts", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });

  assert.equal(result.error, undefined);
  assert.equal(result.text, "Summary after stop.");
  const results = toolResults(result.messages);
  assert.equal(results.length, 4);
  assert.match(String(results[0].content), /const v0 = 0/);
  assert.match(String(results[1].content), /already read/);
  assert.match(String(results[2].content), /already read/);
  /* By step 4 compaction has hidden step 1's read, so it re-runs, but it is still a repeat. */
  assert.match(String(results[3].content), /const v150 = 150/);

  const finalRequest = requests[requests.length - 1];
  assert.equal(requests.length, 5);
  assert.equal(finalRequest.tools, undefined, "final synthesis must not offer tools");
  assert.match(finalRequest.messages[finalRequest.messages.length - 1].content, /only repeated tool calls/);
});

test("Agent re-reads a file once compaction has hidden the earlier contents", async () => {
  scriptModel([
    toolCall("c1", "read_file", { filePath: "big.ts" }),
    toolCall("c2", "list_dir", { path: "." }),
    toolCall("c3", "grep_code", { pattern: "v1" }),
    toolCall("c4", "read_file", { filePath: "big.ts" }),
    text("Done."),
  ]);

  const result = await runAgent("inspect big.ts", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });

  assert.equal(result.text, "Done.");
  const reread = toolResults(result.messages).find((m) => m.tool_call_id === "c4");
  assert.ok(reread);
  assert.match(String(reread.content), /const v150 = 150/, "second read must return real contents, not a notice");
});

test("Agent reruns a command after bash changed the workspace", async () => {
  fs.writeFileSync(path.join(workspace, "counter.txt"), "a\n");
  scriptModel([
    toolCall("c1", "bash", { command: "cat counter.txt" }),
    toolCall("c2", "bash", { command: "echo b >> counter.txt" }),
    toolCall("c3", "bash", { command: "cat counter.txt" }),
    text("Done."),
  ]);

  const result = await runAgent("append a line", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });

  const rerun = toolResults(result.messages).find((m) => m.tool_call_id === "c3");
  assert.ok(rerun);
  assert.doesNotMatch(String(rerun.content), /already run|just run/);
  assert.match(String(rerun.content), /a\s+b/);
});
