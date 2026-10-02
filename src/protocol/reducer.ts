/*
 * Folds daemon events into a SessionSnapshot. Pure and deterministic (time comes from event.ts),
 * so the daemon and every client arrive at the same state from the same event stream.
 */

import type { Thread, ThreadStep } from "../core/thread";
import type { MorpheusEvent, SessionSnapshot } from "./types";

function updateThread(state: SessionSnapshot, threadId: string, fn: (t: Thread) => Thread): Thread[] {
  return state.threads.map((t) => (t.id === threadId ? fn(t) : t));
}

function updateStep(thread: Thread, stepId: string, fn: (s: ThreadStep) => ThreadStep): Thread {
  return { ...thread, steps: thread.steps.map((s) => (s.id === stepId ? fn(s) : s)) };
}

export function applyEvent(state: SessionSnapshot, event: MorpheusEvent): SessionSnapshot {
  const next: SessionSnapshot = { ...state, seq: event.seq, updatedAt: event.ts };

  switch (event.type) {
    case "session.updated":
      if (event.title !== undefined) next.title = event.title;
      if (event.model !== undefined) next.model = event.model;
      if (event.maxSteps !== undefined) next.maxSteps = event.maxSteps ?? undefined;
      return next;

    case "session.switched":
    case "ui.request":
      return next;

    case "workspace":
      next.workspace = event.workspace;
      return next;

    case "findings":
      next.findings = event.findings;
      return next;

    case "thread.upserted": {
      const exists = state.threads.some((t) => t.id === event.thread.id);
      next.threads = exists
        ? updateThread(state, event.thread.id, () => event.thread)
        : [...state.threads, event.thread];
      return next;
    }

    case "thread.removed":
      next.threads = state.threads.filter((t) => t.id !== event.threadId);
      return next;

    case "status":
      next.status = event.status;
      next.queued = event.queued;
      return next;

    case "turn.queued":
      next.threads = [
        ...state.threads,
        {
          id: event.threadId,
          index: event.index,
          prompt: event.prompt,
          response: "",
          isStreaming: false,
          steps: [],
          isExpanded: false,
          status: "queued",
          stepCount: 0,
          startTime: event.ts,
        },
      ];
      return next;

    case "turn.started": {
      const started: Thread = {
        id: event.threadId,
        index: event.index,
        prompt: event.prompt,
        response: "",
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "running",
        model: event.model,
        stepCount: 0,
        startTime: event.ts,
      };
      const exists = state.threads.some((t) => t.id === event.threadId);
      next.threads = exists
        ? updateThread(state, event.threadId, () => started)
        : [...state.threads, started];
      return next;
    }

    case "step.started":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        stepCount: event.step,
        isStreaming: false,
      }));
      return next;

    case "thinking.started":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        steps: [
          ...t.steps,
          { id: event.stepId, type: "thinking", content: "", isRunning: true, startTime: event.ts, durationMs: 0 },
        ],
      }));
      return next;

    case "reasoning.delta":
      next.threads = updateThread(state, event.threadId, (t) =>
        updateStep(t, event.stepId, (s) => ({
          ...s,
          content: (s.content ?? "") + event.delta,
          durationMs: event.ts - (s.startTime ?? event.ts),
        }))
      );
      return next;

    case "thinking.ended":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        steps: t.steps
          .map((s) =>
            s.id === event.stepId
              ? { ...s, isRunning: false, durationMs: event.ts - (s.startTime ?? event.ts) }
              : s
          )
          .filter((s) => s.id !== event.stepId || Boolean(s.content?.trim())),
      }));
      return next;

    case "text.delta":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        response: t.response + event.delta,
        isStreaming: true,
      }));
      return next;

    case "narration": {
      const note = event.text.trim();
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        response: "",
        isStreaming: false,
        steps: note
          ? [...t.steps, { id: event.stepId, type: "note", content: note, startTime: event.ts }]
          : t.steps,
      }));
      return next;
    }

    case "tool.started":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        isStreaming: false,
        steps: [
          ...t.steps,
          { id: event.stepId, type: "tool", name: event.name, args: event.args, isRunning: true, startTime: event.ts },
        ],
      }));
      return next;

    case "tool.finished": {
      const lines = event.output.trim().split("\n").filter(Boolean);
      next.threads = updateThread(state, event.threadId, (t) =>
        updateStep(t, event.stepId, (s) => ({
          ...s,
          isRunning: false,
          isError: event.isError,
          durationMs: event.ts - (s.startTime ?? event.ts),
          outputSummary: `${lines.length} lines output`,
          outputPreview: lines.slice(0, 4),
          output: event.output,
        }))
      );
      return next;
    }

    case "file.edited":
      next.fileEdits = [...state.fileEdits, event.record];
      return next;

    case "usage":
      next.usage = event.usage;
      return next;

    case "turn.finished":
      next.threads = updateThread(state, event.threadId, (t) => ({
        ...t,
        status: event.outcome,
        isStreaming: false,
        response: event.response,
        durationMs: event.ts - t.startTime,
      }));
      return next;
  }
}
