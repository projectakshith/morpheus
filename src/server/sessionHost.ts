/*
 * SessionHost: one live Morpheus session inside the daemon. Runs turns, queues prompts,
 * and publishes every change as a sequenced event that clients can replay after reconnecting.
 */

import type { runAgent as RunAgent } from "../core/agent.js";
import type { ChatMessage, SubagentRole, ToolResult } from "../core/types.js";
import type { Thread } from "../core/thread.js";
import type { SessionData } from "../core/session.js";
import { generateSessionId } from "../core/session.js";
import { PLACEHOLDER_TITLE, isTrivialPrompt, promptTitle, type TitleSource } from "../core/sessionTitle.js";
import { getGitInfo } from "../core/context.js";
import { isToolError } from "../utils/errors.js";
import { formatAgentError } from "../utils/agentErrors.js";
import { extractDiffRecord } from "../cli/utils/diffRecord.js";
import { accumulateUsage } from "../cli/stats.js";
import { commandRegistry } from "../cli/commands/registry.js";
import type { CommandContext } from "../cli/commands/types.js";
import { applyEvent } from "../protocol/reducer.js";
import type { EventBody, MorpheusEvent, SessionSnapshot } from "../protocol/types.js";

const REPLAY_BUFFER_SIZE = 20_000;

export interface SessionHostDeps {
  runAgent: typeof RunAgent;
  persist: (data: SessionData) => Promise<void>;
  baseURL: string;
  isLocal: boolean;
  maxSteps?: number;
  verbose?: boolean;
  subagentModels?: () => Partial<Record<SubagentRole, string>>;
  generateTitle?: (model: string, prompt: string, response: string) => Promise<string | null>;
  checkAuth?: (model: string, baseURL: string) => Promise<string | null>;
  /* Lets /new and /resume hand clients over to another session. */
  sessions?: {
    create(from: SessionHost): SessionHost;
    open(id: string): Promise<SessionHost | null>;
  };
}

export type SubscribeResult = { snapshot: SessionSnapshot } | { events: MorpheusEvent[] };

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class SessionHost {
  private state: SessionSnapshot;
  private history: ChatMessage[];
  private titleSource: TitleSource;
  private log: MorpheusEvent[] = [];
  private listeners = new Set<(event: MorpheusEvent) => void>();
  private queue: { threadId: string; prompt: string }[] = [];
  private abortController: AbortController | null = null;
  private running = false;
  private titleAttempted = false;
  private disposed = false;

  constructor(
    private deps: SessionHostDeps,
    init: { cwd: string; model: string; data?: SessionData }
  ) {
    const data = init.data;
    const now = Date.now();
    this.state = {
      id: data?.id ?? generateSessionId(),
      title: data?.title || PLACEHOLDER_TITLE,
      cwd: data?.cwd || init.cwd,
      model: data?.model || init.model,
      createdAt: data?.createdAt ?? now,
      updatedAt: data?.updatedAt ?? now,
      status: "idle",
      queued: 0,
      /* A turn that was mid-flight when the previous process died can never finish. */
      threads: (data?.threads ?? []).map((t) =>
        t.status === "running" || t.status === "queued" ? { ...t, status: "aborted", isStreaming: false } : t
      ),
      fileEdits: data?.fileEdits ?? [],
      findings: data?.findings ?? [],
      usage: data?.tokenUsage,
      workspace: getGitInfo(data?.cwd || init.cwd),
      seq: 0,
    };
    this.history = data?.history ?? [];
    this.titleSource = data?.titleSource ?? (data?.title && data.title !== PLACEHOLDER_TITLE ? "generated" : "placeholder");
  }

  get id(): string {
    return this.state.id;
  }

  get isRunning(): boolean {
    return this.running;
  }

  snapshot(): SessionSnapshot {
    return this.state;
  }

  subscribe(listener: (event: MorpheusEvent) => void, afterSeq?: number): { result: SubscribeResult; unsubscribe: () => void } {
    this.listeners.add(listener);
    const unsubscribe = () => this.listeners.delete(listener);
    const oldest = this.log[0]?.seq ?? this.state.seq + 1;
    if (afterSeq !== undefined && afterSeq <= this.state.seq && afterSeq >= oldest - 1) {
      return { result: { events: this.log.filter((e) => e.seq > afterSeq) }, unsubscribe };
    }
    return { result: { snapshot: this.state }, unsubscribe };
  }

  startTurn(prompt: string): { threadId: string; queued: boolean } {
    const threadId = uid("thread");
    if (this.running) {
      this.queue.push({ threadId, prompt });
      this.emit({ type: "turn.queued", threadId, index: this.state.threads.length + 1, prompt });
      this.emit({ type: "status", status: "running", queued: this.queue.length });
      return { threadId, queued: true };
    }
    void this.runTurn(threadId, prompt);
    return { threadId, queued: false };
  }

  clearQueue(): void {
    const cleared = this.queue;
    this.queue = [];
    for (const item of cleared) {
      this.emit({ type: "turn.finished", threadId: item.threadId, outcome: "aborted", response: "*Cancelled from queue.*" });
    }
    if (cleared.length > 0) this.emit({ type: "status", status: this.state.status, queued: 0 });
  }

  abort(): void {
    this.clearQueue();
    if (this.running) {
      this.abortController?.abort();
      this.emit({ type: "status", status: "aborted", queued: 0 });
    }
  }

  rename(title: string): void {
    this.titleSource = "manual";
    this.emit({ type: "session.updated", title });
    void this.persist();
  }

  setModel(model: string): void {
    this.emit({ type: "session.updated", model });
    void this.persist();
  }

  setMaxSteps(maxSteps: number | null): void {
    this.emit({ type: "session.updated", maxSteps: maxSteps && maxSteps > 0 ? Math.floor(maxSteps) : null });
  }

  refreshWorkspace(): void {
    const next = getGitInfo(this.state.cwd);
    const cur = this.state.workspace;
    if (next.isGit !== cur.isGit || next.branch !== cur.branch || next.gitStatus !== cur.gitStatus) {
      this.emit({ type: "workspace", workspace: next });
    }
  }

  /*
   * Runs input through the TUI's slash-command registry. Commands write whole threads via setThreads;
   * those writes are diffed into thread.upserted / thread.removed events. Returns false for plain prompts.
   */
  async runCommand(text: string): Promise<boolean> {
    let target: SessionHost = this;
    const switchTo = (next: SessionHost) => {
      if (next === target) return;
      target.emit({ type: "session.switched", to: next.id });
      target = next;
    };
    const ctx: CommandContext = {
      taskText: text,
      baseURL: this.deps.baseURL,
      currentModel: this.state.model,
      setCurrentModel: (model) => target.setModel(model),
      setIsModelSelectorOpen: (open) => {
        if (open) target.emit({ type: "ui.request", modal: "model" });
      },
      setThreads: (action) => target.applyThreads(action),
      setPromptHistory: () => {},
      threadsCount: this.state.threads.length,
      sessionId: this.id,
      sessionTitle: this.state.title,
      setSessionTitle: (title) => target.rename(title),
      usage: this.state.usage,
      loadSessionById: async (id) => {
        const next = await this.deps.sessions?.open(id);
        if (!next) return false;
        switchTo(next);
        return true;
      },
      resetSession: () => {
        const next = this.deps.sessions?.create(target);
        if (next) switchTo(next);
      },
      abort: () => target.abort(),
      getQueue: () => target.queue.map((q) => q.prompt),
      clearQueue: () => target.clearQueue(),
      isAgentRunning: this.running,
    };
    const handled = await commandRegistry.dispatch(text, ctx);
    if (handled) {
      target.refreshWorkspace();
      void target.persist();
    }
    return handled;
  }

  private applyThreads(action: Thread[] | ((prev: Thread[]) => Thread[])): void {
    const prev = this.state.threads;
    const next = typeof action === "function" ? action(prev) : action;
    const nextIds = new Set(next.map((t) => t.id));
    for (const t of prev) {
      if (!nextIds.has(t.id)) this.emit({ type: "thread.removed", threadId: t.id });
    }
    const prevById = new Map(prev.map((t) => [t.id, t]));
    for (const t of next) {
      if (prevById.get(t.id) !== t) this.emit({ type: "thread.upserted", thread: t });
    }
  }

  /* Aborts work and waits for the in-flight turn to settle so its final state is persisted. */
  async shutdown(): Promise<void> {
    this.abort();
    while (this.running) await new Promise((r) => setTimeout(r, 20));
    await this.persist();
  }

  /* Called when the session is deleted: late work (title generation, a finishing turn) must not re-save it. */
  dispose(): void {
    this.disposed = true;
    this.abort();
    this.listeners.clear();
  }

  private emit(body: EventBody): void {
    const event = { ...body, seq: this.state.seq + 1, sessionId: this.state.id, ts: Date.now() } as MorpheusEvent;
    this.state = applyEvent(this.state, event);
    this.log.push(event);
    if (this.log.length > REPLAY_BUFFER_SIZE) this.log.splice(0, this.log.length - REPLAY_BUFFER_SIZE);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* One broken client must not stall the run. */
      }
    }
  }

  private persist(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const s = this.state;
    return this.deps
      .persist({
        id: s.id,
        title: s.title,
        titleSource: this.titleSource,
        cwd: s.cwd,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        model: s.model,
        threads: s.threads,
        history: this.history,
        findings: s.findings,
        fileEdits: s.fileEdits,
        tokenUsage: s.usage,
      })
      .catch(() => {});
  }

  private async runTurn(threadId: string, prompt: string): Promise<void> {
    this.running = true;
    const model = this.state.model;
    const abortController = new AbortController();
    this.abortController = abortController;

    if (this.titleSource === "placeholder") {
      const instant = promptTitle(prompt);
      if (instant) {
        this.titleSource = "prompt";
        this.emit({ type: "session.updated", title: instant });
      }
    }

    this.emit({ type: "turn.started", threadId, index: this.indexFor(threadId), prompt, model });
    this.emit({ type: "status", status: "running", queued: this.queue.length });

    const authProblem = await this.deps.checkAuth?.(model, this.deps.baseURL);
    if (authProblem) {
      this.emit({ type: "turn.finished", threadId, outcome: "error", response: authProblem });
      this.abortController = null;
      this.running = false;
      await this.persist();
      this.drainQueue("idle");
      return;
    }

    let thinkingId: string | null = null;
    const endThinking = () => {
      if (!thinkingId) return;
      this.emit({ type: "thinking.ended", threadId, stepId: thinkingId });
      thinkingId = null;
    };
    const startThinking = () => {
      thinkingId = uid("think");
      this.emit({ type: "thinking.started", threadId, stepId: thinkingId });
      return thinkingId;
    };
    const activeTools = new Map<string, { stepId: string; args: Record<string, unknown> }>();

    let outcome: "completed" | "aborted" | "error" = "completed";
    try {
      const result = await this.deps.runAgent(prompt, this.history, {
        cwd: this.state.cwd,
        model,
        baseURL: this.deps.baseURL,
        isLocal: this.deps.isLocal,
        verbose: this.deps.verbose,
        maxSteps: this.state.maxSteps ?? this.deps.maxSteps,
        abortSignal: abortController.signal,
        subagents: { models: this.deps.subagentModels?.() },
        persistentMcp: true,
        findings: this.state.findings,
        onStepStart: (step) => {
          this.emit({ type: "step.started", threadId, step });
          if (!thinkingId) startThinking();
        },
        onReasoningDelta: (delta) => {
          const stepId = thinkingId ?? startThinking();
          this.emit({ type: "reasoning.delta", threadId, stepId, delta });
        },
        onTextDelta: (delta) => {
          endThinking();
          this.emit({ type: "text.delta", threadId, delta });
        },
        onNarration: (text) => {
          this.emit({ type: "narration", threadId, stepId: uid("note"), text });
        },
        onToolCall: (name, args, callId) => {
          endThinking();
          const stepId = uid("tool");
          activeTools.set(callId || name, { stepId, args });
          this.emit({ type: "tool.started", threadId, stepId, name, args });
        },
        onToolResult: (name: string, res: ToolResult, callId?: string) => {
          const key = callId || name;
          const tool = activeTools.get(key);
          activeTools.delete(key);
          if (!tool) return;
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          this.emit({ type: "tool.finished", threadId, stepId: tool.stepId, output: res.output, isError });
          const record = isError ? null : extractDiffRecord(name, tool.args, res.output);
          if (record) this.emit({ type: "file.edited", record });
        },
      });

      endThinking();
      this.history = result.messages;
      if (result.findings && result.findings !== this.state.findings) {
        this.emit({ type: "findings", findings: result.findings });
      }
      if (result.usage) {
        this.emit({ type: "usage", usage: accumulateUsage(this.state.usage, result.usage, model) });
      }

      const partial = this.threadResponse(threadId);
      outcome = result.error ? "error" : result.aborted ? "aborted" : "completed";
      const response = result.error
        ? `${partial ? `${partial}\n\n` : ""}${formatAgentError(result.error, this.deps.baseURL)}`
        : result.aborted
          ? partial || "*Task stopped.*"
          : result.text || partial || "*Model produced no output.*";
      this.emit({ type: "turn.finished", threadId, outcome, response });

      if (outcome === "completed") this.maybeGenerateTitle(model, prompt, result.text);
    } catch (err) {
      endThinking();
      outcome = "error";
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ type: "turn.finished", threadId, outcome, response: formatAgentError(msg, this.deps.baseURL) });
    } finally {
      this.abortController = null;
      this.running = false;
    }

    this.refreshWorkspace();
    await this.persist();
    this.drainQueue(outcome === "completed" ? "idle" : outcome);
  }

  private drainQueue(finalStatus: "idle" | "aborted" | "error"): void {
    const next = this.queue.shift();
    if (next) {
      void this.runTurn(next.threadId, next.prompt);
    } else {
      this.emit({ type: "status", status: finalStatus, queued: 0 });
    }
  }

  private indexFor(threadId: string): number {
    const existing = this.state.threads.find((t) => t.id === threadId);
    return existing?.index ?? this.state.threads.length + 1;
  }

  private threadResponse(threadId: string): string {
    return this.state.threads.find((t) => t.id === threadId)?.response ?? "";
  }

  private maybeGenerateTitle(model: string, prompt: string, response: string): void {
    const generate = this.deps.generateTitle;
    if (!generate || this.titleAttempted || this.titleSource === "generated" || this.titleSource === "manual") return;
    if (isTrivialPrompt(prompt) || !response.trim()) return;
    this.titleAttempted = true;
    generate(model, prompt, response).then((title) => {
      if (!title || this.titleSource === "manual") return;
      this.titleSource = "generated";
      this.emit({ type: "session.updated", title });
      void this.persist();
    });
  }
}
