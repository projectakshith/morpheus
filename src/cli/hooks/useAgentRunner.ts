import React, { useState, useRef, useEffect, useCallback, useMemo, type MutableRefObject } from "react";
import { runAgent } from "../../core/agent";
import type { SubagentRole } from "../../core/types";
import type { Thread } from "../../core/thread";
import { checkProviderAuth } from "../../core/providerAuth";
import { generateSessionTitle } from "../../core/sessionTitle";
import { loadSession, loadLatestSession, saveSession } from "../../core/session";
import { Operator } from "../../provider/operator";
import { SessionHost, type SessionHostDeps } from "../../server/sessionHost";
import type { MorpheusEvent, SessionSnapshot } from "../../protocol/types";

export interface AgentRunnerOptions {
  currentModel: string;
  setCurrentModel: (model: string) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  baseURL?: string;
  isLocal?: boolean;
  isVerbose?: boolean;
  maxSteps?: number;
  subagentModels?: Partial<Record<SubagentRole, string>>;
  initialTask?: string;
  resumeSessionId?: string | boolean;
  isUserScrolledRef: MutableRefObject<boolean>;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  isRightUserScrolledRef: MutableRefObject<boolean>;
  setRightScrollTop: React.Dispatch<React.SetStateAction<number>>;
  setPromptHistory: React.Dispatch<React.SetStateAction<string[]>>;
  openModal?: (modal: "model" | "session" | "settings" | "diff" | "neo" | "usage") => void;
  closeModal?: () => void;
}

const LIVE_EVENTS = new Set<MorpheusEvent["type"]>(["step.started", "reasoning.delta", "tool.started", "tool.finished", "text.delta"]);

export function useAgentRunner({
  currentModel,
  setCurrentModel,
  setIsModelSelectorOpen,
  baseURL = "http://127.0.0.1:8787/v1",
  isLocal = false,
  isVerbose = false,
  maxSteps,
  subagentModels,
  resumeSessionId,
  isUserScrolledRef,
  setScrollOffset,
  isRightUserScrolledRef,
  setRightScrollTop,
  setPromptHistory,
  openModal,
  closeModal,
}: AgentRunnerOptions) {
  const cwd = process.cwd();
  const subagentModelsRef = useRef(subagentModels);
  subagentModelsRef.current = subagentModels;
  const hostsRef = useRef(new Map<string, SessionHost>());

  const deps = useMemo<SessionHostDeps>(() => {
    const register = (host: SessionHost) => {
      hostsRef.current.set(host.id, host);
      return host;
    };
    const d: SessionHostDeps = {
      runAgent,
      persist: saveSession,
      baseURL,
      isLocal,
      verbose: isVerbose,
      checkAuth: checkProviderAuth,
      subagentModels: () => subagentModelsRef.current ?? {},
      generateTitle: (model, prompt, response) => generateSessionTitle(new Operator({ model, baseURL, isLocal }), prompt, response),
      sessions: {
        create: (from) => register(new SessionHost(d, { cwd, model: from.snapshot().model })),
        open: async (id) => {
          const live = hostsRef.current.get(id);
          if (live) return live;
          const data = await loadSession(id);
          return data ? register(new SessionHost(d, { cwd, model: data.model || currentModel, data })) : null;
        },
      },
    };
    return d;
  }, [baseURL, isLocal, isVerbose]);

  const [host, setHost] = useState(() => {
    const first = new SessionHost(deps, { cwd, model: currentModel });
    hostsRef.current.set(first.id, first);
    return first;
  });
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => host.snapshot());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!resumeSessionId) return;
    void (async () => {
      const data = typeof resumeSessionId === "string" ? await loadSession(resumeSessionId) : await loadLatestSession(cwd);
      if (!data) return;
      const resumed = new SessionHost(deps, { cwd, model: data.model || currentModel, data });
      hostsRef.current.set(resumed.id, resumed);
      setHost(resumed);
    })();
  }, [resumeSessionId]);

  useEffect(() => {
    setSnapshot(host.snapshot());
    if (host.snapshot().model !== currentModel) setCurrentModel(host.snapshot().model);
    const { unsubscribe } = host.subscribe((event) => {
      setSnapshot(host.snapshot());
      if (event.type === "turn.started") {
        isUserScrolledRef.current = false;
        setScrollOffset(0);
        isRightUserScrolledRef.current = false;
        setRightScrollTop(0);
      } else if (LIVE_EVENTS.has(event.type) && !isUserScrolledRef.current) {
        setScrollOffset(0);
      } else if (event.type === "session.updated" && event.model) {
        setCurrentModel(event.model);
      } else if (event.type === "session.switched") {
        const next = hostsRef.current.get(event.to);
        if (next) setHost(next);
      }
    });
    return unsubscribe;
  }, [host]);

  useEffect(() => {
    if (host.snapshot().model !== currentModel) host.setModel(currentModel);
  }, [currentModel]);

  useEffect(() => {
    if ((host.snapshot().maxSteps ?? null) !== (maxSteps ?? null)) host.setMaxSteps(maxSteps ?? null);
  }, [host, maxSteps]);

  const current = useMemo(
    () => [...snapshot.threads].reverse().find((t) => t.status === "running") ?? [...snapshot.threads].reverse().find((t) => t.status !== "queued"),
    [snapshot.threads]
  );
  const running = snapshot.status === "running";

  useEffect(() => {
    if (!running || !current) return;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - current.startTime) / 1000));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, current?.id, current?.startTime]);

  const executeTask = useCallback(
    async (taskText: string) => {
      const trimmed = taskText.trim();
      if (!trimmed) return;
      setPromptHistory((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]));
      const handled = await host.runCommand(trimmed, { openModal, closeModal, setIsModelSelectorOpen, setPromptHistory: () => {} });
      if (handled) return;
      host.startTurn(trimmed);
    },
    [host, openModal, closeModal, setIsModelSelectorOpen, setPromptHistory]
  );

  const loadSessionById = useCallback(
    async (id: string) => {
      const next = await deps.sessions?.open(id);
      if (!next) return false;
      setHost(next);
      return true;
    },
    [deps]
  );

  const resetSession = useCallback(() => {
    const next = deps.sessions?.create(host);
    if (next) setHost(next);
  }, [deps, host]);

  const setThreads = useCallback((action: Thread[] | ((prev: Thread[]) => Thread[])) => host.writeThreads(action), [host]);

  return {
    status: snapshot.status,
    stepCount: current?.stepCount ?? 0,
    elapsedSeconds,
    usage: snapshot.usage,
    threads: snapshot.threads,
    setThreads,
    fileEdits: snapshot.fileEdits,
    findings: snapshot.findings,
    sessionId: snapshot.id,
    sessionTitle: snapshot.title,
    loadSessionById,
    resetSession,
    executeTask,
    abort: () => host.abort(),
    queuedCount: snapshot.queued,
    clearQueue: () => host.clearQueue(),
  };
}
