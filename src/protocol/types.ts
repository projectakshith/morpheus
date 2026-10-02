import type { Finding, TokenUsage } from "../core/types";
import type { Thread, FileEditRecord } from "../core/thread";
import type { AutocompleteResult } from "../autocomplete/types";

export const PROTOCOL_VERSION = 1;

export type SessionStatus = "idle" | "running" | "error" | "aborted";
export type TurnOutcome = "completed" | "aborted" | "error";

export interface WorkspaceInfo {
  isGit: boolean;
  branch?: string;
  gitStatus?: string;
}

export interface SessionSnapshot {
  id: string;
  title: string;
  cwd: string;
  model: string;
  maxSteps?: number;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  queued: number;
  threads: Thread[];
  fileEdits: FileEditRecord[];
  findings: Finding[];
  usage?: TokenUsage;
  workspace: WorkspaceInfo;
  seq: number;
}

export type EventBody =
  | { type: "session.updated"; title?: string; model?: string; maxSteps?: number | null }
  | { type: "session.switched"; to: string }
  | { type: "ui.request"; modal: "model" }
  | { type: "workspace"; workspace: WorkspaceInfo }
  | { type: "status"; status: SessionStatus; queued: number }
  | { type: "turn.queued"; threadId: string; index: number; prompt: string }
  | { type: "turn.started"; threadId: string; index: number; prompt: string; model: string }
  | { type: "step.started"; threadId: string; step: number }
  | { type: "thinking.started"; threadId: string; stepId: string }
  | { type: "reasoning.delta"; threadId: string; stepId: string; delta: string }
  | { type: "thinking.ended"; threadId: string; stepId: string }
  | { type: "text.delta"; threadId: string; delta: string }
  | { type: "narration"; threadId: string; stepId: string; text: string }
  | { type: "tool.started"; threadId: string; stepId: string; name: string; args: Record<string, unknown> }
  | { type: "tool.finished"; threadId: string; stepId: string; output: string; isError: boolean }
  | { type: "file.edited"; record: FileEditRecord }
  | { type: "findings"; findings: Finding[] }
  | { type: "thread.upserted"; thread: Thread }
  | { type: "thread.removed"; threadId: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "turn.finished"; threadId: string; outcome: TurnOutcome; response: string };

export type MorpheusEvent = EventBody & { seq: number; sessionId: string; ts: number };

export type EventType = EventBody["type"];

export interface SessionListItem {
  id: string;
  title: string;
  cwd: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
  totalTokens: number;
  live: boolean;
  status: SessionStatus;
}

export interface Methods {
  initialize: {
    params: { client?: { name: string; version?: string } };
    result: { server: "morpheus"; version: string; protocol: number; defaultModel: string; cwd: string };
  };
  "session.list": {
    params: { cwd?: string; limit?: number };
    result: { sessions: SessionListItem[] };
  };
  "session.create": {
    params: { cwd?: string; model?: string };
    result: { session: SessionSnapshot };
  };
  "session.subscribe": {
    params: { sessionId: string; afterSeq?: number };
    result: { snapshot: SessionSnapshot } | { events: MorpheusEvent[] };
  };
  "session.unsubscribe": {
    params: { sessionId: string };
    result: { ok: true };
  };
  "session.rename": {
    params: { sessionId: string; title: string };
    result: { ok: true };
  };
  "session.setModel": {
    params: { sessionId: string; model: string };
    result: { ok: true };
  };
  "session.delete": {
    params: { sessionId: string };
    result: { ok: boolean };
  };
  "session.setMaxSteps": {
    params: { sessionId: string; maxSteps: number | null };
    result: { ok: true };
  };
  "turn.start": {
    params: { sessionId: string; prompt: string };
    result: { threadId: string; queued: boolean } | { command: true };
  };
  "turn.abort": {
    params: { sessionId: string };
    result: { ok: true };
  };
  "commands.list": {
    params: Record<string, never>;
    result: { commands: { name: string; description: string; aliases: string[] }[] };
  };
  autocomplete: {
    params: { sessionId: string; input: string; cursorPos?: number; history?: string[] };
    result: AutocompleteResult;
  };
  "workspace.diff": {
    params: { sessionId: string };
    result: { diff: string };
  };
  "settings.get": {
    params: Record<string, never>;
    result: { subagentModels: Partial<Record<"explore" | "review" | "implement", string>>; baseURL: string; isLocal: boolean };
  };
  "settings.set": {
    params: { subagentModels: Partial<Record<"explore" | "review" | "implement", string>> };
    result: { ok: true };
  };
  "neo.request": {
    params: { path: string; method?: "GET" | "POST"; body?: unknown };
    result: { status: number; body: unknown };
  };
}

export type MethodName = keyof Methods;

export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  SessionNotFound: -32001,
  SessionBusy: -32002,
} as const;

export interface RpcRequest<M extends MethodName = MethodName> {
  jsonrpc: "2.0";
  id: number | string;
  method: M;
  params: Methods[M]["params"];
}

export type RpcResponse =
  | { jsonrpc: "2.0"; id: number | string | null; result: unknown }
  | { jsonrpc: "2.0"; id: number | string | null; error: { code: number; message: string } };

export interface RpcEventNotification {
  jsonrpc: "2.0";
  method: "event";
  params: MorpheusEvent;
}
