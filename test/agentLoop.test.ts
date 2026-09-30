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

function sse(chunks: object[], usage?: { promptTokens: number; completionTokens: number }): Response {
  if (usage) {
    chunks.push({
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.promptTokens + usage.completionTokens,
      },
    });
  }
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200 });
}

function toolCall(id: string, name: string, args: object, usage?: { promptTokens: number; completionTokens: number }): Response {
  return sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ], usage);
}

function text(content: string, usage?: { promptTokens: number; completionTokens: number }): Response {
  return sse([
    { choices: [{ delta: { content } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
  ], usage);
}

function scriptModel(turns: Response[]): { requests: Array<{ messages: any[]; tools?: unknown[]; prompt_cache_key?: string }> } {
  const requests: Array<{ messages: any[]; tools?: unknown[]; prompt_cache_key?: string }> = [];
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

  const result = await runAgent("inspect big.ts", [], { cwd: workspace, baseURL: "http://127.0.0.1:8787/v1", apiKey: "k" });

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
  assert.match(finalRequest.messages[finalRequest.messages.length - 1].content, /No useful new tool results/);
  assert.equal(result.stopReason, "loop_guard");
  assert.ok(requests.every((request) => request.prompt_cache_key === requests[0].prompt_cache_key));
  assert.ok(requests[0].prompt_cache_key, "provider prompt cache key is stable within the run");
});

test("Agent treats repeated output from novel commands as no progress", async () => {
  scriptModel([
    toolCall("b1", "bash", { command: "printf stable" }),
    toolCall("b2", "bash", { command: "printf '%s' stable" }),
    toolCall("b3", "bash", { command: "echo -n stable" }),
    toolCall("b4", "bash", { command: "printf \"%s\" stable" }),
    text("Stopped the unproductive loop."),
  ]);

  const result = await runAgent("inspect the project", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });
  assert.equal(result.text, "Stopped the unproductive loop.");
  assert.equal(result.stopReason, "loop_guard");
});

test("Agent marks provider usage unavailable instead of reporting zero as measured", async () => {
  scriptModel([text("Answered without usage metadata.")]);
  const result = await runAgent("say hello", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });
  assert.equal(result.usage.promptTokens, 0);
  assert.equal(result.usage.reported, false);
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

test("Agent stops exploration at its token budget and reserves a final answer", async () => {
  const { requests } = scriptModel([
    toolCall("budget_read", "read_file", { filePath: "big.ts" }, { promptTokens: 850, completionTokens: 20 }),
    text("Partial findings, summarized.", { promptTokens: 100, completionTokens: 20 }),
  ]);

  const result = await runAgent("inspect the source", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
    maxTotalTokens: 1_000,
  });

  assert.equal(result.text, "Partial findings, summarized.");
  assert.equal(requests.length, 2, "do not start another tool cycle after crossing the exploration budget");
  assert.match(requests[1].messages.at(-1).content, /token budget/);
  assert.equal(result.usage.totalTokens, 990);
  assert.equal(result.stopReason, "token_budget");
});

function textThenTool(content: string, id: string, name: string, args: object): Response {
  return sse([
    { choices: [{ delta: { content } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ]);
}

test("Agent reports text before tool calls as narration, separate from the answer", async () => {
  fs.writeFileSync(path.join(workspace, "notes.txt"), "hello\n");
  scriptModel([
    textThenTool("Checking the notes file first.", "c1", "read_file", { filePath: "notes.txt" }),
    textThenTool("Found it. Now listing the folder.", "c2", "list_dir", { path: "." }),
    text("The file says hello."),
  ]);

  const narration: string[] = [];
  const result = await runAgent("what's in notes.txt?", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
    onNarration: (t) => narration.push(t),
  });

  assert.deepEqual(narration, ["Checking the notes file first.", "Found it. Now listing the folder."]);
  assert.equal(result.text, "The file says hello.", "final answer must not include narration");
});
