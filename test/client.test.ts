import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentOptions, AgentRunResult, ChatMessage } from "../src/core/types";
import type { MorpheusClient as Client, SessionStore } from "../src/client";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "morpheus-client-"));
process.env.HOME = sandbox;

const TOKEN = "c".repeat(32);

async function fakeRunAgent(prompt: string, history: ChatMessage[] = [], o: AgentOptions = {}): Promise<AgentRunResult> {
  const messages: ChatMessage[] = [...history, { role: "user", content: prompt }];
  o.onStepStart?.(1);
  if (prompt.startsWith("block")) {
    await new Promise<void>((resolve) => o.abortSignal?.addEventListener("abort", () => resolve()));
    return { text: "", steps: 1, messages, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, aborted: true };
  }
  o.onToolCall?.("edit_file", { filePath: "src/a.ts" }, "c1");
  o.onToolResult?.("edit_file", { output: "@@ -1,1 +1,1 @@\n-old\n+new" }, "c1");
  o.onTextDelta?.("done");
  return { text: "done", steps: 1, messages, usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } };
}

function until(store: SessionStore, pred: (s: NonNullable<ReturnType<SessionStore["getSnapshot"]>>) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const snap = store.getSnapshot();
      if (snap && pred(snap)) {
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

function waitState(client: Client, state: string): Promise<void> {
  return new Promise((resolve) => {
    if (client.state === state) return resolve();
    const off = client.onState((s) => {
      if (s === state) {
        off();
        resolve();
      }
    });
  });
}

describe("morpheus/client", () => {
  let daemon: Awaited<ReturnType<typeof import("../src/server/daemon").startDaemon>>;
  let MorpheusClient: typeof Client;
  let describeStep: typeof import("../src/client").describeStep;

  before(async () => {
    ({ MorpheusClient, describeStep } = await import("../src/client"));
    const { startDaemon } = await import("../src/server/daemon");
    daemon = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      token: TOKEN,
      cwd: sandbox,
      model: "test-model",
      hostDeps: { baseURL: "http://127.0.0.1:1/v1", isLocal: false, runAgent: fakeRunAgent, persist: async () => {}, checkAuth: async () => null },
    });
  });

  after(async () => {
    await daemon.close();
  });

  it("connects lazily on the first request and mirrors a session through its store", async () => {
    const client = new MorpheusClient({ url: daemon.url, token: TOKEN });
    const { session } = await client.request("session.create", {});
    assert.equal(client.state, "open");

    const { store, release } = client.session(session.id);
    await until(store, () => true);
    await client.request("turn.start", { sessionId: session.id, prompt: "edit it" });
    await until(store, (s) => s.status === "idle" && s.threads.length === 1);

    const snap = store.getSnapshot()!;
    assert.equal(snap.threads[0].response, "done");
    assert.equal(snap.fileEdits.length, 1);
    const model = describeStep(snap.threads[0].steps[0], snap.cwd);
    assert.equal(model.kind, "card");
    assert.ok(model.kind === "card" && model.card.verb === "edit" && model.card.added === 1);
    release();
    client.close();
  });

  it("reports a wrong token as unauthorized instead of retrying forever", async () => {
    const client = new MorpheusClient({ url: daemon.url, token: "nope", requestTimeoutMs: 2000 });
    await assert.rejects(client.request("initialize", {}), /unauthorized/);
    assert.equal(client.state, "unauthorized");
  });

  it("reconnects after a dropped link and catches up on what it missed", async () => {
    const client = new MorpheusClient({ url: daemon.url, token: TOKEN });
    const other = new MorpheusClient({ url: daemon.url, token: TOKEN });
    const { session } = await client.request("session.create", {});
    const { store } = client.session(session.id);
    await client.request("turn.start", { sessionId: session.id, prompt: "block until stopped" });
    await until(store, (s) => s.status === "running");

    (client as unknown as { ws: WebSocket }).ws.close();
    await waitState(client, "reconnecting");
    await other.request("turn.abort", { sessionId: session.id });
    await other.request("session.rename", { sessionId: session.id, title: "renamed while away" });

    await waitState(client, "open");
    await until(store, (s) => s.title === "renamed while away" && s.threads[0]?.status === "aborted");
    const { snapshot: truth } = (await other.request("session.subscribe", { sessionId: session.id })) as { snapshot: any };
    assert.deepEqual(store.getSnapshot(), truth);
    client.close();
    other.close();
  });

  it("forwards live hints like session.switched to store listeners", async () => {
    const client = new MorpheusClient({ url: daemon.url, token: TOKEN });
    const { session } = await client.request("session.create", {});
    const { store } = client.session(session.id);
    await until(store, () => true);
    const switched = new Promise<string>((resolve) =>
      store.onEvent((e) => {
        if (e.type === "session.switched") resolve(e.to);
      })
    );
    await client.request("turn.start", { sessionId: session.id, prompt: "/new" });
    assert.notEqual(await switched, session.id);
    client.close();
  });
});
