/*
 * SessionCommand: Slash command handler for inspecting, listing, resuming, and resetting sessions.
 */

import fs from "node:fs/promises";
import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";
import { listSessions, loadSession } from "../core/session";
import { LOGS_DIR } from "../core/logger";

function formatAge(timestamp: number): string {
  if (!timestamp) return "unknown";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class SessionCommand implements CommandHandler {
  public readonly name = "session";
  public readonly description = "Inspect, list, resume, or start conversation sessions";
  public readonly aliases = ["/session", "/sessions", "/resume", "/new", "/log", "/logs"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/log" ||
      trimmed === "/logs" ||
      trimmed.startsWith("/log ") ||
      trimmed.startsWith("/logs ") ||
      trimmed === "/session" ||
      trimmed === "/sessions" ||
      trimmed === "/new" ||
      trimmed.startsWith("/session ") ||
      trimmed.startsWith("/resume") ||
      trimmed.startsWith("/new ")
    );
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.split(/\s+/);
    const sub = parts[0] === "/session" ? parts[1]?.toLowerCase() : parts[0].slice(1).toLowerCase();

    /* /log or /logs: raw execution log viewer */
    if (trimmed === "/log" || trimmed === "/logs" || trimmed.startsWith("/log ") || trimmed.startsWith("/logs ")) {
      let logContent = "";
      const requestedId = parts[1] || ctx.sessionId;
      try {
        const logPath = requestedId
          ? `${LOGS_DIR}/session_${requestedId.replace(/[^a-zA-Z0-9_-]/g, "_")}.log`
          : `${LOGS_DIR}/latest.log`;
        const raw = await fs.readFile(logPath, "utf-8");
        const lines = raw.trim().split("\n");
        logContent = lines.slice(-80).join("\n");
      } catch {
        if (requestedId) {
          const saved = await loadSession(requestedId);
          const toolHistory = saved?.threads.flatMap((thread) => {
            const calls = thread.steps.filter((step) => step.type === "tool");
            if (calls.length === 0) return [];
            return [
              `\n[TURN ${thread.index}] ${thread.prompt}`,
              ...calls.flatMap((step) => [
                `[TOOL CALL] ${step.name ?? "tool"}${step.args ? `\nArguments:\n${JSON.stringify(step.args, null, 2)}` : ""}`,
                `[TOOL RESULT] ${step.name ?? "tool"} (${step.isError ? "FAILED" : step.isRunning ? "RUNNING" : "SUCCESS"})\nOutput:\n${step.output ?? step.outputPreview?.join("\n") ?? step.outputSummary ?? "(no saved output)"}`,
              ]),
            ];
          }).join("\n");
          logContent = toolHistory
            ? `Stored session tool history for ${saved?.title ?? requestedId} (${saved?.cwd ?? "unknown folder"}).\n${toolHistory}`
            : `No tool output is available for session ${requestedId}.`;
        } else {
          logContent = "No previous session log found at ~/.morpheus/logs/latest.log";
        }
      }

      this.createFeedbackThread(
        ctx,
        `${requestedId ? `Session log for \`${requestedId}\`` : "Latest session log"} (~/.morpheus/logs):\n\`\`\`\n${logContent}\n\`\`\``
      );
      return true;
    }

    /* /new or /session new: start fresh session */
    if (sub === "new") {
      if (ctx.resetSession) {
        ctx.resetSession();
      }
      this.createFeedbackThread(
        ctx,
        "✦ **New Session Initialized**\nStarted a fresh conversation session. Previous session saved."
      );
      return true;
    }

    /* /session rename <new title>: rename current session */
    if (sub === "rename") {
      const newTitle = parts.slice(2).join(" ").trim();
      if (!newTitle) {
        this.createFeedbackThread(ctx, "Usage: `/session rename <new title>`");
        return true;
      }
      if (ctx.setSessionTitle) {
        ctx.setSessionTitle(newTitle);
      }
      this.createFeedbackThread(
        ctx,
        `✦ **Session Renamed**\nActive session title updated to: **${newTitle}**`
      );
      return true;
    }

    /* Open interactive session modal if available */
    if (trimmed === "/sessions" || trimmed === "/session" || trimmed === "/resume" || sub === "list" || sub === "ls") {
      if (ctx.openModal) {
        ctx.openModal("session");
        return true;
      }
    }

    /* /sessions or /session list: list past sessions in text mode */
    if (trimmed === "/sessions" || sub === "list" || sub === "ls" || trimmed === "/resume") {
      const summaries = await listSessions(undefined, 10);
      if (summaries.length === 0) {
        this.createFeedbackThread(
          ctx,
          "## No Saved Sessions Found\nNo previous Morpheus sessions have been recorded yet."
        );
        return true;
      }

      const rows = summaries.map((s, idx) => {
        const activeMarker = s.id === ctx.sessionId ? " *(active)*" : "";
        const age = formatAge(s.updatedAt);
        return `${idx + 1}. \`${s.id}\`${activeMarker} · **${s.title}** (${s.turnCount} turns, ${age}) · \`${s.cwd}\``;
      });

      const message = [
        "## Recent Morpheus Sessions",
        rows.join("\n"),
        "",
        "*Type `/resume <id>` or `/session load <id>` to restore a session.*",
      ].join("\n");

      this.createFeedbackThread(ctx, message);
      return true;
    }

    /* /resume <id> or /session load <id>: load session */
    if (sub === "resume" || sub === "load") {
      const targetId = parts[0] === "/session" ? parts[2] : parts[1];
      if (!targetId) {
        if (ctx.openModal) {
          ctx.openModal("session");
          return true;
        }
        this.createFeedbackThread(
          ctx,
          "Usage: `/resume <session_id>` or `/session load <session_id>`\nType `/sessions` to list available sessions."
        );
        return true;
      }

      if (ctx.loadSessionById) {
        const ok = await ctx.loadSessionById(targetId);
        if (ok) {
          this.createFeedbackThread(
            ctx,
            `✦ **Session Restored**\nSuccessfully resumed session \`${targetId}\`. Context and turns restored.`
          );
          return true;
        }
      }

      /* Fallback if loadSessionById is not provided or fails */
      const directData = await loadSession(targetId);
      if (directData) {
        if (ctx.setSessionId) ctx.setSessionId(directData.id);
        if (ctx.setHistory) ctx.setHistory(directData.history || []);
        if (ctx.setFindings) ctx.setFindings(directData.findings || []);
        if (ctx.setFileEdits) ctx.setFileEdits(directData.fileEdits || []);
        if (directData.model) ctx.setCurrentModel(directData.model);
        ctx.setThreads(directData.threads || []);

        this.createFeedbackThread(
          ctx,
          `✦ **Session Restored**\nSuccessfully resumed session \`${targetId}\` with ${(directData.threads || []).length} turns.`
        );
        return true;
      }

      this.createFeedbackThread(
        ctx,
        `## Session Not Found\nCould not find session \`${targetId}\`. Type \`/sessions\` to list valid IDs.`
      );
      return true;
    }

    /* /session or /session info: current session details */
    const currentId = ctx.sessionId || "sess_active";
    const currentTitle = ctx.sessionTitle || "Active Session";
    const turns = ctx.threadsCount;
    const tokens = ctx.usage
      ? `${ctx.usage.totalTokens} tokens (${ctx.usage.promptTokens} in / ${ctx.usage.completionTokens} out)`
      : "0 tokens";

    const infoMsg = [
      "## Active Session Details",
      `- **Session ID:** \`${currentId}\``,
      `- **Title:** ${currentTitle}`,
      `- **Model:** \`${ctx.currentModel}\``,
      `- **Turns:** ${turns}`,
      `- **Usage:** ${tokens}`,
      `- **Working Directory:** \`${process.cwd()}\``,
      "",
      "*Commands: `/sessions` (list), `/resume <id>` (switch), `/new` (start fresh)*",
    ].join("\n");

    this.createFeedbackThread(ctx, infoMsg);
    return true;
  }

  private createFeedbackThread(ctx: CommandContext, responseText: string): void {
    const thread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: responseText,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, thread]);
  }
}

export const sessionCommand = new SessionCommand();
