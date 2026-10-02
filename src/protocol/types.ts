/*
 * Wire protocol between the Morpheus daemon and its clients (TUI, Trinity, scripts).
 * JSON-RPC 2.0 over WebSocket; see docs/daemon-protocol.md.
 */

import type { Finding, TokenUsage } from "../core/types";
import type { Thread, FileEditRecord } from "../core/thread";
import type { AutocompleteResult } from "../cli/autocomplete/types";

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
  /* Step limit per turn; undefined means the agent default. */
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
  /* Sequence number of the last event folded into this snapshot. */
  seq: number;
}

export type EventBody =
  | { type: "session.updated"; title?: string; model?: string; maxSteps?: number | null }
  /* The session was replaced by another (/new, /resume): clients should subscribe to `to`. */
  | { type: "session.switched"; to: string }
  /* A command asked for an interactive picker (e.g. bare /model). Live-only hint; the reducer ignores it. */
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
  /* Whole-thread writes from slash commands, whose output is not streamed. */
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
  /* Without afterSeq, or when afterSeq has fallen out of the replay buffer, the full snapshot is returned. */
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
  /* Slash commands run immediately (even mid-turn) and report through thread.upserted events. */
  "turn.start": {
    params: { sessionId: string; prompt: string };
    result: { threadId: string; queued: boolean } | { command: true };
  };
  /* Stops the running turn and cancels everything queued behind it. */
  "turn.abort": {
    params: { sessionId: string };
    result: { ok: true };
  };
  "commands.list": {
    params: Record<string, never>;
    result: { commands: { name: string; description: string; aliases: string[] }[] };
  };
  /* Same engine as the TUI input box: commands, @files, prompt history, intents. */
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
  /* Relays to the Neo proxy so remote clients can read models, auth status and log in. */
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
