/*
 * Daemon tests: drives the real WebSocket server with a scripted agent and checks events, queueing, abort, and replay.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { AgentOptions, AgentRunResult, ChatMessage } from "../src/core/types";
import type { MorpheusEvent, SessionSnapshot } from "../src/protocol/types";

/* Session listing reads ~/.morpheus/sessions, so sandbox $HOME before loading the daemon. */
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "morpheus-daemon-"));
process.env.HOME = sandbox;

const TOKEN = "t".repeat(32);
const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

let lastOptions: AgentOptions = {};

/* Turns whose prompt starts with "block" wait until aborted, so queueing can be observed. */
async function fakeRunAgent(prompt: string, history: ChatMessage[] = [], o: AgentOptions = {}): Promise<AgentRunResult> {
  lastOptions = o;
  const messages: ChatMessage[] = [...history, { role: "user", content: prompt }];
  if (prompt.startsWith("block")) {
    o.onStepStart?.(1);
    await new Promise<void>((resolve) => o.abortSignal?.addEventListener("abort", () => resolve()));
    return { text: "", steps: 1, messages, usage: USAGE, aborted: true };
  }
  o.onStepStart?.(1);
  o.onReasoningDelta?.("planning");
  o.onToolCall?.("read_file", { filePath: "a.ts" }, "c1");
  o.onToolResult?.("read_file", { output: "line1\nline2" }, "c1");
  o.onTextDelta?.("hel");
  o.onTextDelta?.("lo");
  return { text: "hello", steps: 1, messages: [...messages, { role: "assistant", content: "hello" }], usage: USAGE };
}

class Client {
  events: MorpheusEvent[] = [];
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private waiters: Array<{ match: (e: MorpheusEvent) => boolean; resolve: (e: MorpheusEvent) => void }> = [];

  private constructor(private ws: WebSocket) {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === "event") {
        this.events.push(msg.params);
        this.waiters = this.waiters.filter((w) => (w.match(msg.params) ? (w.resolve(msg.params), false) : true));
        return;
      }
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p?.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
      else p?.resolve(msg.result);
    });
  }

  static connect(url: string, token = TOKEN): Promise<Client> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${url}?token=${token}`);
      ws.once("open", () => resolve(new Client(ws)));
      ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once("error", reject);
    });
  }

  call(method: string, params: object = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  waitFor(match: (e: MorpheusEvent) => boolean): Promise<MorpheusEvent> {
    const seen = this.events.find(match);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve) => this.waiters.push({ match, resolve }));
  }

  close(): void {
    this.ws.close();
  }
}

const finished = (threadId: string) => (e: MorpheusEvent) => e.type === "turn.finished" && e.threadId === threadId;

describe("Morpheus daemon", () => {
  let daemon: Awaited<ReturnType<typeof import("../src/server/daemon").startDaemon>>;
  let applyEvent: typeof import("../src/protocol/reducer").applyEvent;
  const persisted: string[] = [];

  before(async () => {
    const { startDaemon } = await import("../src/server/daemon");
    ({ applyEvent } = await import("../src/protocol/reducer"));
    daemon = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      token: TOKEN,
      cwd: sandbox,
      model: "test-model",
      hostDeps: {
        baseURL: "http://127.0.0.1:1/v1",
        isLocal: false,
        runAgent: fakeRunAgent,
        persist: async (data) => {
          persisted.push(data.id);
        },
      },
    });
  });

  after(async () => {
    await daemon.close();
  });

  it("rejects connections without the token", async () => {
    await assert.rejects(Client.connect(daemon.url, "wrong"), /HTTP 401/);
  });

  it("answers initialize and reports unknown methods", async () => {
    const c = await Client.connect(daemon.url);
    const info = await c.call("initialize", { client: { name: "test" } });
    assert.equal(info.server, "morpheus");
    assert.equal(info.defaultModel, "test-model");
    await assert.rejects(c.call("nope"), (e: any) => e.code === -32601);
    await assert.rejects(c.call("turn.start", { sessionId: "missing", prompt: "x" }), (e: any) => e.code === -32001);
    c.close();
  });

  it("streams a full turn and folds it into the same state on client and server", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    const { snapshot } = await c.call("session.subscribe", { sessionId: session.id });
    const { threadId, queued } = await c.call("turn.start", { sessionId: session.id, prompt: "explain the auth flow" });
    assert.equal(queued, false);
    await c.waitFor((e) => e.type === "status" && e.status === "idle");

    const types = c.events.map((e) => e.type);
    for (const t of ["turn.started", "thinking.started", "reasoning.delta", "thinking.ended", "tool.started", "tool.finished", "text.delta", "usage", "turn.finished"]) {
      assert.ok(types.includes(t as MorpheusEvent["type"]), `missing ${t}`);
    }
    const seqs = c.events.map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));

    const local = c.events.reduce(applyEvent, snapshot as SessionSnapshot);
    const thread = local.threads.find((t) => t.id === threadId)!;
    assert.equal(thread.status, "completed");
    assert.equal(thread.response, "hello");
    assert.deepEqual(thread.steps.map((s) => s.type), ["thinking", "tool"]);
    assert.equal(thread.steps[1].outputSummary, "2 lines output");
    assert.equal(local.usage?.totalTokens, 15);
    assert.equal(local.title, "explain the auth flow");

    const fresh = await Client.connect(daemon.url);
    const { snapshot: server } = await fresh.call("session.subscribe", { sessionId: session.id });
    assert.deepEqual(local, server);
    assert.ok(persisted.includes(session.id));
    c.close();
    fresh.close();
  });

  it("queues prompts behind a running turn and abort cancels both", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    await c.call("session.subscribe", { sessionId: session.id });
    const first = await c.call("turn.start", { sessionId: session.id, prompt: "block forever" });
    const second = await c.call("turn.start", { sessionId: session.id, prompt: "then this" });
    assert.equal(second.queued, true);
    await c.waitFor((e) => e.type === "status" && e.queued === 1);

    await c.call("turn.abort", { sessionId: session.id });
    const a = await c.waitFor(finished(first.threadId));
    const b = await c.waitFor(finished(second.threadId));
    assert.equal(a.type === "turn.finished" && a.outcome, "aborted");
    assert.equal(b.type === "turn.finished" && b.response, "*Cancelled from queue.*");
    c.close();
  });

  it("replays only missed events when a client reconnects with afterSeq", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    const { snapshot } = await c.call("session.subscribe", { sessionId: session.id });
    const { threadId } = await c.call("turn.start", { sessionId: session.id, prompt: "first" });
    await c.waitFor(finished(threadId));
    const seenUpTo = c.events[2].seq;
    c.close();

    const back = await Client.connect(daemon.url);
    const replay = await back.call("session.subscribe", { sessionId: session.id, afterSeq: seenUpTo });
    assert.ok("events" in replay);
    assert.equal(replay.events[0].seq, seenUpTo + 1);
    const rebuilt = [...c.events.slice(0, 3), ...replay.events].reduce(applyEvent, snapshot as SessionSnapshot);
    const { snapshot: server } = await back.call("session.subscribe", { sessionId: session.id });
    assert.deepEqual(rebuilt.threads, server.threads);

    const stale = await back.call("session.subscribe", { sessionId: session.id, afterSeq: 1_000_000 });
    assert.ok("snapshot" in stale);
    back.close();
  });

  it("never re-saves a session after it is deleted", async () => {
    let releaseTitle!: (t: string) => void;
    const { SessionHost } = await import("../src/server/sessionHost");
    const saved: string[] = [];
    const host = new SessionHost(
      {
        runAgent: fakeRunAgent,
        persist: async (d) => void saved.push(d.id),
        baseURL: "",
        isLocal: false,
        generateTitle: () => new Promise((r) => (releaseTitle = r)),
      },
      { cwd: sandbox, model: "m" }
    );
    host.startTurn("summarize the router module");
    while (!releaseTitle) await new Promise((r) => setTimeout(r, 5));
    host.dispose();
    saved.length = 0;
    releaseTitle("Router summary");
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(saved, []);
  });

  it("runs slash commands on the daemon and streams their output as threads", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    await c.call("session.subscribe", { sessionId: session.id });

    assert.deepEqual(await c.call("turn.start", { sessionId: session.id, prompt: "/help" }), { command: true });
    const help = await c.waitFor((e) => e.type === "thread.upserted" && e.thread.prompt === "/help");
    assert.ok(help.type === "thread.upserted" && help.thread.response.length > 0);

    await c.call("turn.start", { sessionId: session.id, prompt: "/definitely-not-a-command" });
    const unknown = await c.waitFor((e) => e.type === "thread.upserted" && e.thread.prompt.startsWith("/definitely"));
    assert.ok(unknown.type === "thread.upserted" && unknown.thread.response.includes("Unknown command"));

    await c.call("turn.start", { sessionId: session.id, prompt: "/model claude/opus" });
    await c.waitFor((e) => e.type === "session.updated" && e.model === "claude/opus");

    await c.call("turn.start", { sessionId: session.id, prompt: "/model" });
    await c.waitFor((e) => e.type === "ui.request" && e.modal === "model");

    const { snapshot } = await c.call("session.subscribe", { sessionId: session.id });
    assert.equal(snapshot.model, "claude/opus");
    assert.ok(snapshot.threads.some((t: any) => t.prompt === "/help"));
    c.close();
  });

  it("/new hands every subscriber over to a fresh session", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", { model: "m1" });
    await c.call("session.subscribe", { sessionId: session.id });
    await c.call("turn.start", { sessionId: session.id, prompt: "/new" });
    const switched = await c.waitFor((e) => e.type === "session.switched");
    assert.ok(switched.type === "session.switched" && switched.to !== session.id);

    const { snapshot } = await c.call("session.subscribe", { sessionId: switched.to });
    assert.equal(snapshot.model, "m1");
    assert.ok(snapshot.threads.some((t: any) => t.response.includes("New Session")));
    c.close();
  });

  it("applies per-session maxSteps and exposes findings and workspace in the snapshot", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    assert.deepEqual(session.findings, []);
    assert.equal(session.workspace.isGit, false);
    await c.call("session.subscribe", { sessionId: session.id });
    await c.call("session.setMaxSteps", { sessionId: session.id, maxSteps: 7 });
    const { threadId } = await c.call("turn.start", { sessionId: session.id, prompt: "go" });
    await c.waitFor(finished(threadId));
    assert.equal(lastOptions.maxSteps, 7);
    await assert.rejects(c.call("session.setMaxSteps", { sessionId: session.id, maxSteps: "x" }), (e: any) => e.code === -32602);
    c.close();
  });

  it("serves commands, autocomplete, diff, settings and a guarded neo relay", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});

    const { commands } = await c.call("commands.list");
    assert.ok(commands.some((cmd: any) => cmd.aliases.includes("/help")));

    const ac = await c.call("autocomplete", { sessionId: session.id, input: "/hel" });
    assert.ok(ac.suggestions.some((s: any) => s.insertText.startsWith("/help")));

    assert.deepEqual(await c.call("workspace.diff", { sessionId: session.id }), { diff: "" });

    await c.call("settings.set", { subagentModels: { review: "claude/sonnet", bogus: "x" } });
    const settings = await c.call("settings.get");
    assert.deepEqual(settings.subagentModels, { review: "claude/sonnet" });

    await assert.rejects(c.call("neo.request", { path: "/v1/chat/completions", method: "POST" }), (e: any) => e.code === -32602);
    await assert.rejects(c.call("neo.request", { path: "/../etc" }), (e: any) => e.code === -32602);
    await assert.rejects(c.call("neo.request", { path: "/v1/models" }), /neo unreachable/);
    c.close();
  });

  it("fails a turn fast with the auth hint when the provider is logged out", async () => {
    const { SessionHost } = await import("../src/server/sessionHost");
    const host = new SessionHost(
      {
        runAgent: fakeRunAgent,
        persist: async () => {},
        baseURL: "",
        isLocal: false,
        checkAuth: async () => "## Authentication Required for openrouter",
      },
      { cwd: sandbox, model: "m" }
    );
    const { threadId } = host.startTurn("hi");
    while (host.isRunning) await new Promise((r) => setTimeout(r, 5));
    const thread = host.snapshot().threads.find((t) => t.id === threadId)!;
    assert.equal(thread.status, "error");
    assert.match(thread.response, /Authentication Required/);
    assert.equal(host.snapshot().status, "idle");
  });

  it("lists live sessions and renames them", async () => {
    const c = await Client.connect(daemon.url);
    const { session } = await c.call("session.create", {});
    await c.call("session.rename", { sessionId: session.id, title: "Trinity wiring" });
    const { sessions } = await c.call("session.list", {});
    const item = sessions.find((s: any) => s.id === session.id);
    assert.equal(item.title, "Trinity wiring");
    assert.equal(item.live, true);
    c.close();
  });
});
