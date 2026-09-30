import type { Thread, FileEditRecord } from "./types.js";
import type { TokenUsage } from "../core/types.js";
import type { SessionSummary } from "../core/session.js";

export interface SessionStats {
  turns: number;
  toolCalls: number;
  failedCalls: number;
  workMs: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  turnsByModel: Record<string, number>;
}

function isAgentTurn(t: Thread): boolean {
  return t.model !== undefined || t.steps.some((s) => s.type === "tool" || s.type === "thinking" || s.type === "note");
}

export function sessionStats(threads: Thread[], edits: FileEditRecord[]): SessionStats {
  const turns = threads.filter(isAgentTurn);
  const tools = turns.flatMap((t) => t.steps.filter((s) => s.type === "tool"));
  const turnsByModel: Record<string, number> = {};
  for (const t of turns) {
    if (t.model) turnsByModel[t.model] = (turnsByModel[t.model] ?? 0) + 1;
  }
  return {
    turns: turns.length,
    toolCalls: tools.length,
    failedCalls: tools.filter((s) => s.isError).length,
    workMs: turns.reduce((ms, t) => ms + (t.durationMs ?? 0), 0),
    filesChanged: new Set(edits.map((e) => e.filePath)).size,
    linesAdded: edits.reduce((n, e) => n + e.linesAdded, 0),
    linesRemoved: edits.reduce((n, e) => n + e.linesRemoved, 0),
    turnsByModel,
  };
}

export function formatWorkTime(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function accumulateUsage(prev: TokenUsage | undefined, turn: TokenUsage, model: string): TokenUsage {
  const byModel = { ...(prev?.byModel ?? {}) };
  const cur = byModel[model] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  byModel[model] = {
    promptTokens: cur.promptTokens + turn.promptTokens,
    completionTokens: cur.completionTokens + turn.completionTokens,
    totalTokens: cur.totalTokens + turn.totalTokens,
    ...((cur.cachedInputTokens ?? 0) + (turn.cachedInputTokens ?? 0) > 0
      ? { cachedInputTokens: (cur.cachedInputTokens ?? 0) + (turn.cachedInputTokens ?? 0) }
      : {}),
    ...((cur.cacheCreationInputTokens ?? 0) + (turn.cacheCreationInputTokens ?? 0) > 0
      ? { cacheCreationInputTokens: (cur.cacheCreationInputTokens ?? 0) + (turn.cacheCreationInputTokens ?? 0) }
      : {}),
    ...((cur.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0) > 0
      ? { reasoningTokens: (cur.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0) }
      : {}),
    ...((cur.reported === false || turn.reported === false) ? { reported: false } : {}),
  };
  return {
    promptTokens: (prev?.promptTokens ?? 0) + turn.promptTokens,
    completionTokens: (prev?.completionTokens ?? 0) + turn.completionTokens,
    totalTokens: (prev?.totalTokens ?? 0) + turn.totalTokens,
    peakContextTokens: Math.max(prev?.peakContextTokens ?? 0, turn.peakContextTokens ?? 0),
    contextLimit: turn.contextLimit ?? prev?.contextLimit,
    ...((prev?.reported === false || turn.reported === false) ? { reported: false } : {}),
    ...((prev?.cachedInputTokens ?? 0) + (turn.cachedInputTokens ?? 0) > 0
      ? { cachedInputTokens: (prev?.cachedInputTokens ?? 0) + (turn.cachedInputTokens ?? 0) }
      : {}),
    ...((prev?.cacheCreationInputTokens ?? 0) + (turn.cacheCreationInputTokens ?? 0) > 0
      ? { cacheCreationInputTokens: (prev?.cacheCreationInputTokens ?? 0) + (turn.cacheCreationInputTokens ?? 0) }
      : {}),
    ...((prev?.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0) > 0
      ? { reasoningTokens: (prev?.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0) }
      : {}),
    byModel,
  };
}

export interface UsageTotals {
  today: number;
  allTime: number;
  sessions: number;
}

export function usageTotals(
  saved: SessionSummary[],
  current: { id: string; totalTokens: number },
  now: number = Date.now()
): UsageTotals {
  const day = new Date(now).toDateString();
  const others = saved.filter((s) => s.id !== current.id);
  const today = others.filter((s) => new Date(s.updatedAt).toDateString() === day).reduce((n, s) => n + s.totalTokens, 0);
  const allTime = others.reduce((n, s) => n + s.totalTokens, 0);
  const counted = current.totalTokens > 0 ? 1 : 0;
  return {
    today: today + current.totalTokens,
    allTime: allTime + current.totalTokens,
    sessions: others.length + counted,
  };
}
