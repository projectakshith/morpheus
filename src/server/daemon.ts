import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { runAgent } from "../core/agent";
import { listSessions, loadSession, deleteSession, saveSession, sessionTokenTotal } from "../core/session";
import { MORPHEUS_VERSION } from "../index";
import { checkProviderAuth } from "../core/providerAuth";
import { commandRegistry } from "../commands/registry";
import { computeAutocomplete } from "../autocomplete/engine";
import { loadSubagentModels, saveSubagentModels, type SubagentModelMap } from "../core/userSettings";
import { SessionHost, type SessionHostDeps } from "./sessionHost";
import {
  ErrorCodes,
  PROTOCOL_VERSION,
  type MethodName,
  type Methods,
  type MorpheusEvent,
  type SessionListItem,
} from "../protocol/types";

const HEARTBEAT_MS = 30_000;
export const UNAUTHORIZED_CLOSE = 4401;
const execFileAsync = promisify(execFile);
const NEO_PATHS = /^\/(health|v1\/models|v1\/auth\/[a-z0-9_\/-]+)(\?[^#]*)?$/;
const SUBAGENT_ROLES = ["explore", "review", "implement"] as const;

export interface DaemonOptions {
  host: string;
  port: number;
  token: string;
  cwd: string;
  model: string;
  hostDeps: Omit<SessionHostDeps, "runAgent" | "persist"> & Partial<Pick<SessionHostDeps, "runAgent" | "persist">>;
}

export interface Daemon {
  url: string;
  port: number;
  close(): Promise<void>;
}

class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function tokenMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestToken(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new RpcError(ErrorCodes.InvalidParams, `"${key}" must be a non-empty string`);
  }
  return value;
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const sessions = new Map<string, SessionHost>();
  const deps: SessionHostDeps = {
    runAgent,
    persist: saveSession,
    checkAuth: checkProviderAuth,
    ...opts.hostDeps,
    sessions: {
      create(from) {
        const host = new SessionHost(deps, { cwd: from.snapshot().cwd, model: from.snapshot().model });
        sessions.set(host.id, host);
        return host;
      },
      open: (id) => getSession(id).catch(() => null),
    },
  };

  async function getSession(id: string): Promise<SessionHost> {
    const live = sessions.get(id);
    if (live) return live;
    const data = await loadSession(id);
    if (!data) throw new RpcError(ErrorCodes.SessionNotFound, `session not found: ${id}`);
    const host = new SessionHost(deps, { cwd: opts.cwd, model: opts.model, data });
    sessions.set(host.id, host);
    return host;
  }

  type Handler<M extends MethodName> = (
    params: Methods[M]["params"] & Record<string, unknown>,
    conn: Connection
  ) => Promise<Methods[M]["result"]> | Methods[M]["result"];

  const handlers: { [M in MethodName]: Handler<M> } = {
    initialize: () => ({
      server: "morpheus",
      version: MORPHEUS_VERSION,
      protocol: PROTOCOL_VERSION,
      defaultModel: opts.model,
      cwd: opts.cwd,
    }),

    "session.list": async (params) => {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const stored = await listSessions(params.cwd, limit);
      const byId = new Map<string, SessionListItem>();
      for (const s of stored) byId.set(s.id, { ...s, live: false, status: "idle" });
      for (const host of sessions.values()) {
        const snap = host.snapshot();
        if (params.cwd && snap.cwd !== params.cwd) continue;
        byId.set(snap.id, {
          id: snap.id,
          title: snap.title,
          cwd: snap.cwd,
          model: snap.model,
          createdAt: snap.createdAt,
          updatedAt: snap.updatedAt,
          turnCount: snap.threads.length,
          totalTokens: sessionTokenTotal(snap.usage),
          live: true,
          status: snap.status,
        });
      }
      const all = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
      return { sessions: all };
    },

    "session.create": (params) => {
      const host = new SessionHost(deps, {
        cwd: typeof params.cwd === "string" && params.cwd ? params.cwd : opts.cwd,
        model: typeof params.model === "string" && params.model ? params.model : opts.model,
      });
      sessions.set(host.id, host);
      return { session: host.snapshot() };
    },

    "session.subscribe": async (params, conn) => {
      const host = await getSession(requireString(params, "sessionId"));
      conn.subscriptions.get(host.id)?.();
      const afterSeq = typeof params.afterSeq === "number" ? params.afterSeq : undefined;
      const { result, unsubscribe } = host.subscribe((event) => conn.sendEvent(event), afterSeq);
      conn.subscriptions.set(host.id, unsubscribe);
      return result;
    },

    "session.unsubscribe": (params, conn) => {
      const id = requireString(params, "sessionId");
      conn.subscriptions.get(id)?.();
      conn.subscriptions.delete(id);
      return { ok: true };
    },

    "session.rename": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      host.rename(requireString(params, "title").trim());
      return { ok: true };
    },

    "session.setModel": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      host.setModel(requireString(params, "model"));
      return { ok: true };
    },

    "session.delete": async (params) => {
      const id = requireString(params, "sessionId");
      const host = sessions.get(id);
      if (host?.isRunning) throw new RpcError(ErrorCodes.SessionBusy, "session is running; abort it first");
      host?.dispose();
      sessions.delete(id);
      return { ok: await deleteSession(id) };
    },

    "session.setMaxSteps": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      const value = params.maxSteps;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new RpcError(ErrorCodes.InvalidParams, `"maxSteps" must be a number or null`);
      }
      host.setMaxSteps(value);
      return { ok: true };
    },

    "turn.start": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      const prompt = requireString(params, "prompt").trim();
      if (await host.runCommand(prompt)) return { command: true };
      return host.startTurn(prompt);
    },

    "turn.abort": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      host.abort();
      return { ok: true };
    },

    "commands.list": () => ({
      commands: commandRegistry.getAll().map((c) => ({ name: c.name, description: c.description, aliases: c.aliases ?? [] })),
    }),

    autocomplete: async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      const snap = host.snapshot();
      const input = typeof params.input === "string" ? params.input : "";
      const history = Array.isArray(params.history) ? params.history.filter((h) => typeof h === "string") : snap.threads.map((t) => t.prompt);
      return computeAutocomplete({
        input,
        cursorPos: typeof params.cursorPos === "number" ? params.cursorPos : input.length,
        history,
        cwd: snap.cwd,
        currentModel: snap.model,
      });
    },

    "workspace.diff": async (params) => {
      const host = await getSession(requireString(params, "sessionId"));
      try {
        const { stdout } = await execFileAsync("git", ["diff", "HEAD"], { cwd: host.snapshot().cwd, maxBuffer: 32 * 1024 * 1024 });
        return { diff: stdout };
      } catch {
        return { diff: "" };
      }
    },

    "settings.get": () => ({
      subagentModels: loadSubagentModels(),
      baseURL: opts.hostDeps.baseURL,
      isLocal: opts.hostDeps.isLocal,
    }),

    "settings.set": async (params) => {
      const raw = params.subagentModels;
      if (!raw || typeof raw !== "object") throw new RpcError(ErrorCodes.InvalidParams, `"subagentModels" must be an object`);
      const models: SubagentModelMap = {};
      for (const role of SUBAGENT_ROLES) {
        const value = (raw as Record<string, unknown>)[role];
        if (typeof value === "string" && value.trim()) models[role] = value.trim();
      }
      await saveSubagentModels(models);
      return { ok: true };
    },

    "neo.request": async (params) => {
      const reqPath = requireString(params, "path");
      if (!NEO_PATHS.test(reqPath)) throw new RpcError(ErrorCodes.InvalidParams, `path not allowed: ${reqPath}`);
      const method = params.method === "POST" ? "POST" : "GET";
      const root = opts.hostDeps.baseURL.replace(/\/v1\/?$/, "");
      try {
        const res = await fetch(`${root}${reqPath}`, {
          method,
          headers: method === "POST" ? { "content-type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify(params.body ?? {}) : undefined,
          signal: AbortSignal.timeout(method === "POST" ? 120_000 : 10_000),
        });
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
        }
        return { status: res.status, body };
      } catch (err) {
        throw new RpcError(ErrorCodes.InternalError, `neo unreachable: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };

  class Connection {
    subscriptions = new Map<string, () => void>();
    alive = true;

    constructor(private ws: WebSocket) {}

    send(payload: unknown): void {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
    }

    sendEvent(event: MorpheusEvent): void {
      this.send({ jsonrpc: "2.0", method: "event", params: event });
    }

    async handle(raw: string): Promise<void> {
      let msg: { jsonrpc?: string; id?: number | string; method?: unknown; params?: unknown };
      try {
        msg = JSON.parse(raw);
      } catch {
        this.send({ jsonrpc: "2.0", id: null, error: { code: ErrorCodes.ParseError, message: "invalid JSON" } });
        return;
      }
      const id = msg.id ?? null;
      if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        this.send({ jsonrpc: "2.0", id, error: { code: ErrorCodes.InvalidRequest, message: "not a JSON-RPC 2.0 request" } });
        return;
      }
      const handler = handlers[msg.method as MethodName] as Handler<MethodName> | undefined;
      if (!handler) {
        this.send({ jsonrpc: "2.0", id, error: { code: ErrorCodes.MethodNotFound, message: `unknown method: ${msg.method}` } });
        return;
      }
      const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
      try {
        const result = await handler(params as never, this);
        if (id !== null) this.send({ jsonrpc: "2.0", id, result });
      } catch (err) {
        const code = err instanceof RpcError ? err.code : ErrorCodes.InternalError;
        const message = err instanceof Error ? err.message : String(err);
        if (id !== null) this.send({ jsonrpc: "2.0", id, error: { code, message } });
      }
    }

    dispose(): void {
      for (const unsubscribe of this.subscriptions.values()) unsubscribe();
      this.subscriptions.clear();
    }
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, server: "morpheus", version: MORPHEUS_VERSION, protocol: PROTOCOL_VERSION }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!tokenMatches(requestToken(req), opts.token)) {
      wss.handleUpgrade(req, socket, head, (ws) => ws.close(UNAUTHORIZED_CLOSE, "unauthorized"));
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const connections = new Map<WebSocket, Connection>();

  wss.on("connection", (ws: WebSocket) => {
    const conn = new Connection(ws);
    connections.set(ws, conn);
    ws.on("pong", () => (conn.alive = true));
    ws.on("message", (data) => void conn.handle(data.toString()));
    ws.on("close", () => {
      conn.dispose();
      connections.delete(ws);
    });
    ws.on("error", () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const [ws, conn] of connections) {
      if (!conn.alive) {
        ws.terminate();
        continue;
      }
      conn.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    url: `ws://${opts.host.includes(":") ? `[${opts.host}]` : opts.host}:${port}`,
    port,
    async close() {
      clearInterval(heartbeat);
      await Promise.all([...sessions.values()].map((s) => s.shutdown()));
      for (const ws of connections.keys()) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
