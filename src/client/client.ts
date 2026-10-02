/*
 * MorpheusClient: typed JSON-RPC client for the Morpheus daemon. Works in browsers and Node 22+
 * (global WebSocket), reconnects with backoff, and resumes session streams from their last seq.
 */

import type { MethodName, Methods, MorpheusEvent } from "../protocol/types.js";
import { SessionStore, type SubscribeResponse } from "./store.js";

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "unauthorized" | "closed";

export interface ClientOptions {
  /* ws:// or wss:// address of the daemon, e.g. ws://100.64.0.2:7878 */
  url: string;
  token: string;
  clientName?: string;
  /* Max wait for a request while (re)connecting before it fails. */
  requestTimeoutMs?: number;
  WebSocketImpl?: typeof WebSocket;
}

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "RpcError";
  }
}

const UNAUTHORIZED_CLOSE = 4401;
const MAX_BACKOFF_MS = 10_000;

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

export class MorpheusClient {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = "idle";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private eventListeners = new Set<(event: MorpheusEvent) => void>();
  private stores = new Map<string, { store: SessionStore; refs: number }>();
  private openWaiters: Array<{ ok: () => void; fail: (err: Error) => void }> = [];
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private opts: ClientOptions) {}

  get state(): ConnectionState {
    return this._state;
  }

  onState(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /* Every event for every subscribed session. */
  onEvent(listener: (event: MorpheusEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  connect(): void {
    this.stopped = false;
    if (this.ws && (this._state === "open" || this._state === "connecting")) return;
    this.open();
  }

  /* Skip the backoff wait, e.g. when a phone app returns to the foreground. */
  reconnectNow(): void {
    if (this.stopped || this._state === "open" || this._state === "connecting") return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.open();
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.failPending(new Error("client closed"));
    this.failWaiters(new Error("client closed"));
    this.setState("closed");
  }

  request<M extends MethodName>(method: M, params: Methods[M]["params"]): Promise<Methods[M]["result"]> {
    return this.whenOpen().then(
      () =>
        new Promise((resolve, reject) => {
          const ws = this.ws;
          if (!ws) return reject(new Error("connection lost"));
          const id = this.nextId++;
          this.pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
        })
    );
  }

  /*
   * A live store for one session. Stores are ref-counted: call release() when a view no longer needs it.
   * The store re-syncs automatically after reconnects and sequence gaps.
   */
  session(sessionId: string): { store: SessionStore; release: () => void } {
    let entry = this.stores.get(sessionId);
    if (!entry) {
      const store: SessionStore = new SessionStore(sessionId, (afterSeq) => this.sync(store, afterSeq));
      entry = { store, refs: 0 };
      this.stores.set(sessionId, entry);
      if (this._state === "open") this.sync(store);
      else this.connect();
    }
    entry.refs++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const current = this.stores.get(sessionId);
      if (!current || --current.refs > 0) return;
      this.stores.delete(sessionId);
      if (this._state === "open") void this.request("session.unsubscribe", { sessionId }).catch(() => {});
    };
    return { store: entry.store, release };
  }

  private sync(store: SessionStore, afterSeq = store.seq): void {
    store.beginSync();
    this.request("session.subscribe", { sessionId: store.sessionId, afterSeq })
      .then((res) => store.applySubscribeResponse(res as SubscribeResponse))
      .catch(() => {
        /* Retried on the next reconnect. */
      });
  }

  private whenOpen(): Promise<void> {
    if (this._state === "open") return Promise.resolve();
    if (this._state === "unauthorized") return Promise.reject(new RpcError(UNAUTHORIZED_CLOSE, "unauthorized"));
    if (this._state === "idle" || this._state === "closed") this.connect();
    const timeoutMs = this.opts.requestTimeoutMs ?? 15_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.openWaiters = this.openWaiters.filter((w) => w !== waiter);
        reject(new Error(`not connected to morpheus (${this._state})`));
      }, timeoutMs);
      const waiter = {
        ok: () => {
          clearTimeout(timer);
          resolve();
        },
        fail: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.openWaiters.push(waiter);
    });
  }

  private open(): void {
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    const url = new URL(this.opts.url);
    url.searchParams.set("token", this.opts.token);
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");

    const ws = new Impl(url.toString());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      /* An auth rejection also "opens" first; wait for initialize before declaring the link healthy. */
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: () => {
          this.attempt = 0;
          this.setState("open");
          const waiters = this.openWaiters;
          this.openWaiters = [];
          for (const w of waiters) w.ok();
          for (const { store } of this.stores.values()) this.sync(store);
        },
        reject: () => {},
      });
      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { client: { name: this.opts.clientName ?? "morpheus-client" } } })
      );
    };

    ws.onmessage = (msg) => {
      let data: any;
      try {
        data = JSON.parse(typeof msg.data === "string" ? msg.data : String(msg.data));
      } catch {
        return;
      }
      if (data.method === "event") {
        const event = data.params as MorpheusEvent;
        this.stores.get(event.sessionId)?.store.receive(event);
        for (const listener of this.eventListeners) listener(event);
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.error) p.reject(new RpcError(data.error.code, data.error.message));
      else p.resolve(data.result);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending(new Error("connection lost"));
      if (ev.code === UNAUTHORIZED_CLOSE) {
        this.stopped = true;
        this.setState("unauthorized");
        this.failWaiters(new RpcError(UNAUTHORIZED_CLOSE, "unauthorized"));
        return;
      }
      if (this.stopped) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      /* onclose follows and handles retry. */
    };
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt) * (0.75 + Math.random() * 0.5);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private failPending(err: Error): void {
    const pending = this.pending;
    this.pending = new Map();
    for (const p of pending.values()) p.reject(err);
  }

  private failWaiters(err: Error): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const w of waiters) w.fail(err);
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
