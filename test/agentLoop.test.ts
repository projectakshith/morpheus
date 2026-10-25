import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
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
let completeGroundedMcpArguments: typeof import("../src/core/agent").completeGroundedMcpArguments;
before(async () => {
  ({ runAgent, completeGroundedMcpArguments } = await import("../src/core/agent"));
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

test("MCP search calls inherit a missing query from the user request without guessing symbols", () => {
  const tool = {
    name: "mcp_seraph_search_code",
    description: "Search code",
    parameters: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Search query" }, symbol: { type: "string" } },
      required: ["query", "symbol"],
    },
    execute: async () => "",
  };
  assert.deepEqual(
    completeGroundedMcpArguments(tool, {}, "Inspect how this repository starts subprocesses"),
    { query: "Inspect how this repository starts subprocesses" }
  );
});

function multipleToolCalls(calls: Array<{ id: string; name: string; args: object }>): Response {
  return sse([
    { choices: [{ delta: { tool_calls: calls.map((call, index) => ({
      index,
      id: call.id,
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    })) } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ]);
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

test("Agent validates required tool arguments before invoking handlers", async () => {
  scriptModel([
    toolCall("missing-path", "read_file", {}),
    text("I need a file path before I can read anything."),
  ]);

  const result = await runAgent("inspect the packaging script", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
  });

  const invalidCall = toolResults(result.messages).find((message) => message.tool_call_id === "missing-path");
  assert.ok(invalidCall);
  assert.match(String(invalidCall.content), /required argument is missing: filePath/);
  assert.doesNotMatch(String(invalidCall.content), /Received undefined/);
  assert.equal(result.text, "I need a file path before I can read anything.");
});

test("Agent skips repeated malformed calls without stopping unrelated tool work", async () => {
  const { requests } = scriptModel([
    toolCall("missing-path-1", "read_file", {}),
    toolCall("missing-path-2", "read_file", {}),
    text("I could not read because the required file path was omitted."),
  ]);

  const result = await runAgent("explore the repository with Seraph", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
  });

  const results = toolResults(result.messages);
  assert.equal(results.length, 2);
  assert.match(String(results[0].content), /required argument is missing: filePath/);
  assert.match(String(results[1].content), /required argument is missing: filePath/);
  assert.notEqual(result.stopReason, "loop_guard");
  assert.equal(result.text, "I could not read because the required file path was omitted.");
  assert.equal(requests.length, 3);
  assert.ok(requests[2].tools, "the agent can continue with other tools after an invalid call");
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

test("Agent counts the latest provider usage snapshot once per request", async () => {
  const first = [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "snapshot-tool", function: { name: "list_dir", arguments: JSON.stringify({ path: "." }) } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    { usage: { prompt_tokens: 500, completion_tokens: 4, total_tokens: 504 } },
    { usage: { prompt_tokens: 600, completion_tokens: 10, total_tokens: 610 } },
  ];
  const second = [
    { choices: [{ delta: { content: "Finished." } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
    { usage: { prompt_tokens: 300, completion_tokens: 5, total_tokens: 305 } },
  ];
  let calls = 0;
  globalThis.fetch = (async () => sse(calls++ === 0 ? first : second)) as typeof fetch;

  const result = await runAgent("inspect the workspace", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
  });

  assert.equal(result.text, "Finished.");
  assert.equal(result.usage.promptTokens, 900, "use 600 from the first response plus 300 from the second");
  assert.equal(result.usage.completionTokens, 15, "use 10 from the first response plus 5 from the second");
  assert.equal(result.usage.totalTokens, 915);
  assert.equal(result.usage.byModel?.flash.totalTokens, 915);
});

test("Agent gives focused file reads a useful first page and explicit paging guidance", async () => {
  const { requests } = scriptModel([
    toolCall("focused-read", "read_file", { filePath: "big.ts" }),
    text("I inspected the first page and can continue at the reported offset if needed."),
  ]);

  const result = await runAgent("inspect big.ts", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
  });

  const readResult = toolResults(result.messages).find((message) => message.tool_call_id === "focused-read");
  assert.ok(readResult);
  assert.match(String(readResult.content), /const v0 = 0/);
  assert.match(String(readResult.content), /const v159 = 159/);
  assert.doesNotMatch(String(readResult.content), /const v160 = 160/);
  assert.match(requests[0].messages[0].content, /read the relevant implementation and tests in focused line ranges/);
  assert.match(JSON.stringify(requests[0].tools), /Defaults to 160 lines/);
});

test("Agent runs independent read-only calls concurrently and preserves transcript order", async () => {
  fs.writeFileSync(path.join(workspace, "parallel-a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(workspace, "parallel-b.ts"), "export const b = 2;\n");
  scriptModel([
    multipleToolCalls([
      { id: "parallel-a", name: "read_file", args: { filePath: "parallel-a.ts" } },
      { id: "parallel-b", name: "read_file", args: { filePath: "parallel-b.ts" } },
    ]),
    text("Both files inspected."),
  ]);

  const originalReadFile = fsp.readFile;
  let activeReads = 0;
  let peakReads = 0;
  (fsp as any).readFile = async (...args: Parameters<typeof fsp.readFile>) => {
    const filePath = String(args[0]);
    if (filePath.endsWith("parallel-a.ts") || filePath.endsWith("parallel-b.ts")) {
      activeReads++;
      peakReads = Math.max(peakReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 25));
      try { return await originalReadFile(...args); }
      finally { activeReads--; }
    }
    return originalReadFile(...args);
  };

  try {
    const result = await runAgent("inspect both files", [], {
      cwd: workspace,
      baseURL: "https://example.test/v1",
      apiKey: "k",
    });
    const results = toolResults(result.messages);
    assert.equal(result.text, "Both files inspected.");
    assert.ok(peakReads >= 2, "independent file reads overlap");
    assert.deepEqual(results.slice(0, 2).map((message) => message.tool_call_id), ["parallel-a", "parallel-b"]);
    assert.match(String(results[0].content), /export const a = 1/);
    assert.match(String(results[1].content), /export const b = 2/);
  } finally {
    (fsp as any).readFile = originalReadFile;
  }
});

test("Agent marks provider usage unavailable instead of reporting zero as measured", async () => {
  scriptModel([text("Answered without usage metadata.")]);
  const result = await runAgent("say hello", [], { cwd: workspace, baseURL: "https://example.test/v1", apiKey: "k" });
  assert.equal(result.usage.promptTokens, 0);
  assert.equal(result.usage.reported, false);
});

test("Agent delegates isolated tasks to configured models and rolls worker usage into the parent", async () => {
  const requests: any[] = [];
  let activeWorkers = 0;
  let peakWorkers = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    requests.push(payload);
    if (payload.model === "main-model" && requests.length === 1) {
      return toolCall("delegate-1", "delegate_tasks", {
        tasks: [
          { role: "explore", task: "trace token usage", context: "inspect usage aggregation" },
          { role: "review", task: "review the stop guards", context: "inspect agent-loop guards" },
        ],
      }, { promptTokens: 10, completionTokens: 2 });
    }
    if (payload.model === "main-model") {
      return text("Combined worker findings.", { promptTokens: 10, completionTokens: 3 });
    }
    activeWorkers++;
    peakWorkers = Math.max(peakWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeWorkers--;
    const userContent = payload.messages.find((message: any) => message.role === "user")?.content ?? "";
    return text(`Finding from ${payload.model}: ${userContent}`, { promptTokens: 5, completionTokens: 1 });
  }) as typeof fetch;

  const result = await runAgent("research and review the loop", [], {
    cwd: workspace,
    model: "main-model",
    baseURL: "https://example.test/v1",
    apiKey: "k",
    subagents: {
      models: { explore: "codex/research", review: "claude/review" },
      maxTotalTokens: 100,
      maxTokensPerAgent: 20,
    },
  });

  assert.equal(result.text, "Combined worker findings.");
  assert.equal(peakWorkers, 2, "independent worker runs execute concurrently");
  assert.equal(requests[0].model, "main-model");
  assert.deepEqual(new Set(requests.slice(1, 3).map((request) => request.model)), new Set(["codex/research", "claude/review"]));
  assert.ok(requests.slice(1, 3).every((request) => {
    const names = request.tools.map((tool: any) => tool.function.name);
    return !names.includes("delegate_tasks") && !names.includes("write_file") && !names.includes("bash");
  }), "workers cannot recurse or mutate the workspace in read-only roles");
  const workerPrompts = requests.slice(1, 3).map((request) => request.messages.find((message: any) => message.role === "user").content);
  assert.ok(workerPrompts.some((content: string) => content.includes("inspect usage aggregation")));
  assert.ok(workerPrompts.some((content: string) => content.includes("inspect agent-loop guards")));
  assert.equal(result.usage.totalTokens, 37, "parent usage includes both workers");
  assert.equal(result.usage.byModel?.["main-model"].totalTokens, 25);
  assert.equal(result.usage.byModel?.["codex/research"].totalTokens, 6);
  assert.equal(result.usage.byModel?.["claude/review"].totalTokens, 6);
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

test("Agent treats failed verification output as progress and retries it after editing", async () => {
  const filePath = path.join(workspace, "verify-me.ts");
  fs.writeFileSync(filePath, "export const answer = 1;\n");
  scriptModel([
    toolCall("verify-fail", "bash", { command: "node --test missing.test.js" }),
    toolCall("apply-fix", "edit_file", {
      filePath: "verify-me.ts",
      oldString: "export const answer = 1;",
      newString: "export const answer = 2;",
    }),
    toolCall("verify-again", "bash", { command: "node --test missing.test.js" }),
    text("The targeted verification completed after the edit."),
  ]);

  const result = await runAgent("fix the verification issue", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
  });

  assert.equal(result.text, "The targeted verification completed after the edit.");
  assert.match(String(toolResults(result.messages).find((m) => m.tool_call_id === "verify-fail")?.content), /Could not find/);
  assert.match(String(toolResults(result.messages).find((m) => m.tool_call_id === "verify-again")?.content), /Could not find/);
  assert.equal(fs.readFileSync(filePath, "utf-8"), "export const answer = 2;\n");
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

test("security refusals are recorded and retried once", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" });
  const refusals: Array<{ kind: string; retrying: boolean }> = [];
  scriptModel([
    text("I'm sorry, but I can't help with that."),
    text("I'm sorry, but I can't help with that."),
  ]);

  const result = await runAgent("map example.edu", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
    security: { engagement },
    onRefusal: (refusal) => refusals.push(refusal),
  });

  assert.equal(result.stopReason, "refused");
  assert.equal(refusals.length, 2);
  assert.deepEqual(refusals.map((item) => item.retrying), [true, false]);
  assert.match(result.text, /declined this step after one scoped retry/);
});

test("Agent drains steering messages between steps and incorporates guidance", async () => {
  const steeringQueue = ["Actually, inspect big.ts instead"];
  const applied: string[] = [];
  const script = scriptModel([
    toolCall("call_1", "listDir", { path: "." }),
    text("Adjusted plan based on user steering."),
  ]);

  const result = await runAgent("explore the codebase", [], {
    cwd: workspace,
    baseURL: "https://example.test/v1",
    apiKey: "k",
    getSteeringMessages: () => steeringQueue.splice(0, steeringQueue.length),
    onSteeringApplied: (msg) => applied.push(msg),
  });

  assert.equal(result.text, "Adjusted plan based on user steering.");
  assert.deepEqual(applied, ["Actually, inspect big.ts instead"]);
  const req2Messages = script.requests[1].messages;
  const steeringMsg = req2Messages.find((m: any) =>
    typeof m.content === "string" && m.content.includes("Actually, inspect big.ts instead")
  );
  assert.ok(steeringMsg, "Second model turn must include the injected steering message");
});
