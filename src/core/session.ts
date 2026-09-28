/*
 * Session management engine: persists, lists, and restores Morpheus conversational sessions.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ChatMessage, Finding, TokenUsage } from "./types.js";
import type { Thread, FileEditRecord } from "../cli/types.js";

export const SESSIONS_DIR = path.join(os.homedir(), ".morpheus", "sessions");

export interface SessionData {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  threads: Thread[];
  history: ChatMessage[];
  findings: Finding[];
  fileEdits: FileEditRecord[];
  tokenUsage?: TokenUsage;
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  turnCount: number;
}

export function generateSessionId(): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `sess_${timestamp}_${rand}`;
}

export async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

export async function saveSession(session: SessionData): Promise<void> {
  try {
    await ensureSessionsDir();
    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    const tempPath = `${filePath}.tmp_${Date.now()}`;
    const serialized = JSON.stringify(session, null, 2);

    /* Atomic write via temp file */
    await fs.writeFile(tempPath, serialized, "utf-8");
    await fs.rename(tempPath, filePath);

    /* Update latest session reference */
    const latestPath = path.join(SESSIONS_DIR, "latest.json");
    const latestMeta = JSON.stringify(
      {
        id: session.id,
        updatedAt: session.updatedAt,
        cwd: session.cwd,
      },
      null,
      2
    );
    await fs.writeFile(latestPath, latestMeta, "utf-8");
  } catch {
    /* Gracefully ignore persistence errors */
  }
}

export async function loadSession(id: string): Promise<SessionData | null> {
  try {
    const cleanId = id.endsWith(".json") ? id.slice(0, -5) : id;
    const filePath = path.join(SESSIONS_DIR, `${cleanId}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as SessionData;
    if (parsed && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadLatestSession(cwd?: string): Promise<SessionData | null> {
  try {
    await ensureSessionsDir();

    /* Try latest.json shortcut first */
    const latestPath = path.join(SESSIONS_DIR, "latest.json");
    if (fsSync.existsSync(latestPath)) {
      try {
        const rawMeta = await fs.readFile(latestPath, "utf-8");
        const parsed = JSON.parse(rawMeta) as { id?: string; cwd?: string };
        if (parsed.id && (!cwd || parsed.cwd === cwd)) {
          const direct = await loadSession(parsed.id);
          if (direct) return direct;
        }
      } catch {
        /* Fall back to directory scan */
      }
    }

    const summaries = await listSessions(cwd, 1);
    if (summaries.length > 0) {
      return loadSession(summaries[0].id);
    }
    return null;
  } catch {
    return null;
  }
}

export async function listSessions(cwd?: string, limit = 20): Promise<SessionSummary[]> {
  try {
    await ensureSessionsDir();
    const files = await fs.readdir(SESSIONS_DIR);
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json") || file === "latest.json") continue;

      try {
        const fullPath = path.join(SESSIONS_DIR, file);
        const raw = await fs.readFile(fullPath, "utf-8");
        const data = JSON.parse(raw) as Partial<SessionData>;

        if (!data.id) continue;
        if (cwd && data.cwd && data.cwd !== cwd) continue;

        summaries.push({
          id: data.id,
          title: data.title || "Untitled Session",
          cwd: data.cwd || "",
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt || data.createdAt || 0,
          model: data.model || "",
          turnCount: Array.isArray(data.threads) ? data.threads.length : 0,
        });
      } catch {
        continue;
      }
    }

    /* Sort descending by updatedAt */
    summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    return summaries.slice(0, limit);
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const cleanId = id.endsWith(".json") ? id.slice(0, -5) : id;
    const filePath = path.join(SESSIONS_DIR, `${cleanId}.json`);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
