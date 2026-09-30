/*
 * useAgentRunner: Hook managing agent execution turns, thread states, and stream callbacks.
 */

import React, { useState, useRef, useEffect, type MutableRefObject } from "react";
import { runAgent } from "../../core/agent.js";
import type { ChatMessage, Finding, TokenUsage, ToolResult } from "../../core/types.js";
import { isToolError } from "../../utils/errors.js";
import type { Thread, ThreadStep, FileEditRecord, AppStatus } from "../types.js";
import { extractDiffRecord } from "../utils/diffRecord.js";
import { commandRegistry } from "../commands/registry.js";
import {
  generateSessionId,
  saveSession,
  loadSession,
  loadLatestSession,
} from "../../core/session.js";
import { Operator } from "../../provider/operator.js";
import {
  PLACEHOLDER_TITLE,
  generateSessionTitle,
  isTrivialPrompt,
  promptTitle,
  type TitleSource,
} from "../../core/sessionTitle.js";

/* Model title attempts per session, so a model that can't title doesn't cost a call every turn. */
const MAX_TITLE_ATTEMPTS = 2;

/* Sessions saved before titles were tracked: keep any real title rather than
 * risk overwriting a manual rename; only placeholder-ish ones can be upgraded. */
function inferTitleSource(title: string | undefined): TitleSource {
  if (!title || title === "Resumed Session" || title === "Untitled Session" || title === PLACEHOLDER_TITLE) {
    return "placeholder";
  }
  return isTrivialPrompt(title) ? "placeholder" : "generated";
}

export interface AgentRunnerOptions {
  currentModel: string;
  setCurrentModel: (model: string) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  baseURL?: string;
  isLocal?: boolean;
  isVerbose?: boolean;
  maxSteps?: number;
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

function formatAgentError(errMsg: string, baseURL?: string): string {
  const lowErr = errMsg.toLowerCase();
  let response = `error: ${lowErr}`;
  if (lowErr.includes("claude") && /401|403|token|oauth|keychain/.test(lowErr)) {
    response += `\n\nclaude pro is not authenticated. run \`claude auth login\` in terminal or type \`/login claude <token>\`.`;
  } else if (lowErr.includes("codex") && /401|403|token|auth\.json/.test(lowErr)) {
    response += `\n\ncodex session is not authenticated. run \`codex login\` in terminal or type \`/login codex <token>\`.`;
  } else if (
    lowErr.includes("openrouter") &&
    /api key|unauthorized|401|not configured/.test(lowErr)
  ) {
    response += `\n\nopenrouter is not configured. type \`/login openrouter <api-key>\`.`;
  } else if (
    lowErr.includes("antigravity") &&
    /credentials|keychain|401|403|unauthenticated/.test(lowErr)
  ) {
    response += `\n\ngoogle cloud code is not authenticated. type \`/login antigravity\`.`;
  } else if (/fetch failed|econnrefused/.test(lowErr)) {
    response += `\n\nunable to connect to neo proxy (${baseURL || "http://127.0.0.1:8787"}). ensure neo daemon is running.`;
  }
  return response;
}

export function useAgentRunner({
  currentModel,
  setCurrentModel,
  setIsModelSelectorOpen,
  baseURL,
  isLocal = false,
  isVerbose = false,
  maxSteps,
  initialTask,
  resumeSessionId,
  isUserScrolledRef,
  setScrollOffset,
  isRightUserScrolledRef,
  setRightScrollTop,
  setPromptHistory,
  openModal,
  closeModal,
}: AgentRunnerOptions) {
  /* Starts idle even with an initial task: executeTask queues anything submitted
   * while status is "running", so a pre-set "running" would queue the initial
   * task behind a run that never started. executeAgentTurn sets "running" itself. */
  const [status, setStatus] = useState<AppStatus>("idle");
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());
  const [sessionTitle, setSessionTitle] = useState<string>(PLACEHOLDER_TITLE);
  const [queuedCount, setQueuedCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCreatedAtRef = useRef<number>(Date.now());
  const promptQueueRef = useRef<{ id: string; prompt: string }[]>([]);
  const isExecutingRef = useRef(false);
  const executeAgentTurnRef = useRef<(taskText: string, existingThreadId?: string) => Promise<void>>(async () => {});

  /* Keep state refs to avoid closure staleness during async persistence */
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const historyRef = useRef(history);
  historyRef.current = history;
  const findingsRef = useRef(findings);
  findingsRef.current = findings;
  const fileEditsRef = useRef(fileEdits);
  fileEditsRef.current = fileEdits;
  const usageRef = useRef(usage);
  usageRef.current = usage;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /* The title lives in a ref too, so async saves never write a stale closure copy. */
  const titleRef = useRef<{ title: string; source: TitleSource }>({
    title: PLACEHOLDER_TITLE,
    source: "placeholder",
  });
  const titleAttemptsRef = useRef<{ sessionId: string; count: number; inFlight: boolean }>({
    sessionId: "",
    count: 0,
    inFlight: false,
  });

  const applyTitle = (title: string, source: TitleSource) => {
    titleRef.current = { title, source };
    setSessionTitle(title);
  };

  /* Resume session if requested on boot */
  useEffect(() => {
    if (!resumeSessionId) return;

    const initResume = async () => {
      let data = null;
      if (typeof resumeSessionId === "string") {
        data = await loadSession(resumeSessionId);
      } else {
        data = await loadLatestSession(process.cwd());
      }

      if (data) {
        setSessionId(data.id);
        applyTitle(data.title || PLACEHOLDER_TITLE, data.titleSource ?? inferTitleSource(data.title));
        sessionCreatedAtRef.current = data.createdAt || Date.now();
        if (data.model) setCurrentModel(data.model);
        if (data.threads) setThreads(data.threads);
        if (data.history) setHistory(data.history);
        if (data.findings) setFindings(data.findings);
        if (data.fileEdits) setFileEdits(data.fileEdits);
        if (data.tokenUsage) setUsage(data.tokenUsage);
      }
    };

    initResume();
  }, [resumeSessionId]);

  const loadSessionById = async (id: string): Promise<boolean> => {
    const data = await loadSession(id);
    if (!data) return false;

    setSessionId(data.id);
    applyTitle(data.title || PLACEHOLDER_TITLE, data.titleSource ?? inferTitleSource(data.title));
    sessionCreatedAtRef.current = data.createdAt || Date.now();
    if (data.model) setCurrentModel(data.model);
    setThreads(data.threads || []);
    setHistory(data.history || []);
    setFindings(data.findings || []);
    setFileEdits(data.fileEdits || []);
    if (data.tokenUsage) setUsage(data.tokenUsage);
    return true;
  };

  const resetSession = () => {
    const newId = generateSessionId();
    setSessionId(newId);
    applyTitle(PLACEHOLDER_TITLE, "placeholder");
    sessionCreatedAtRef.current = Date.now();
    setThreads([]);
    setHistory([]);
    setFindings([]);
    setFileEdits([]);
    setUsage(undefined);
  };

  /* Saves from refs, for writes that happen outside a turn (renames, late titles). */
  const persistSession = (id: string = sessionIdRef.current) => {
    saveSession({
      id,
      title: titleRef.current.title,
      titleSource: titleRef.current.source,
      cwd: process.cwd(),
      createdAt: sessionCreatedAtRef.current,
      updatedAt: Date.now(),
      model: currentModel,
      threads: threadsRef.current,
      history: historyRef.current,
      findings: findingsRef.current,
      fileEdits: fileEditsRef.current,
      tokenUsage: usageRef.current,
    }).catch(() => {});
  };

  /* A user rename is final: generated titles never replace it. */
  const renameSession = (title: string) => {
    applyTitle(title, "manual");
    persistSession();
  };

  /* Upgrades the title once per session, in the background, after a turn that
   * says what the session is about. Failure just keeps the current title. */
  const maybeGenerateTitle = (prompt: string, response: string) => {
    const { source } = titleRef.current;
    if (source === "generated" || source === "manual" || isTrivialPrompt(prompt) || !response.trim()) return;

    const targetSession = sessionIdRef.current;
    const attempts = titleAttemptsRef.current;
    if (attempts.sessionId !== targetSession) {
      titleAttemptsRef.current = { sessionId: targetSession, count: 0, inFlight: false };
    }
    const current = titleAttemptsRef.current;
    if (current.inFlight || current.count >= MAX_TITLE_ATTEMPTS) return;
    current.count++;
    current.inFlight = true;

    const operator = new Operator({ model: currentModel, baseURL, isLocal });
    generateSessionTitle(operator, prompt, response).then((title) => {
      if (titleAttemptsRef.current.sessionId === targetSession) titleAttemptsRef.current.inFlight = false;
      /* The user may have switched sessions or renamed this one while we waited. */
      if (!title || sessionIdRef.current !== targetSession) return;
      const latest = titleRef.current.source;
      if (latest === "generated" || latest === "manual") return;
      applyTitle(title, "generated");
      persistSession(targetSession);
    });
  };

  const drainNextQueuedTask = () => {
    if (promptQueueRef.current.length > 0) {
      const next = promptQueueRef.current.shift()!;
      setQueuedCount(promptQueueRef.current.length);
      executeAgentTurnRef.current(next.prompt, next.id).catch(console.error);
    } else {
      setStatus((prev) => (prev === "aborted" ? "aborted" : "idle"));
    }
  };

  const abort = () => {
    if (status === "running" || isExecutingRef.current) {
      abortControllerRef.current?.abort();
      const cleared = promptQueueRef.current;
      promptQueueRef.current = [];
      setQueuedCount(0);
      if (cleared.length > 0) {
        setThreads((prev) =>
          prev.map((t) =>
            cleared.some((c) => c.id === t.id)
              ? { ...t, status: "aborted", response: "*Cancelled from queue.*" }
              : t
          )
        );
      }
      setStatus("aborted");
    }
  };

  const clearQueue = () => {
    const cleared = promptQueueRef.current;
    promptQueueRef.current = [];
    setQueuedCount(0);
    if (cleared.length > 0) {
      setThreads((prev) =>
        prev.map((t) =>
          cleared.some((c) => c.id === t.id)
            ? { ...t, status: "aborted", response: "*Cancelled from queue.*" }
            : t
        )
      );
    }
  };

  const executeTask = async (taskText: string) => {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    /* Execute registered slash commands via modular CommandRegistry immediately (even while running!) */
    const handled = await commandRegistry.dispatch(trimmed, {
      taskText: trimmed,
      baseURL: baseURL || "http://127.0.0.1:8787/v1",
      currentModel,
      setCurrentModel,
      setIsModelSelectorOpen,
      setThreads,
      setPromptHistory,
      threadsCount: threadsRef.current.length,
      sessionId,
      setSessionId,
      sessionTitle,
      setSessionTitle: renameSession,
      setHistory,
      setFindings,
      setFileEdits,
      usage: usageRef.current,
      loadSessionById,
      resetSession,
      openModal,
      closeModal,
      abort,
      getQueue: () => promptQueueRef.current.map((q) => q.prompt),
      clearQueue,
      isAgentRunning: isExecutingRef.current || status === "running",
    });

    if (handled) return;

    /* If agent is already active: queue the task instead of dropping it */
    if (isExecutingRef.current || status === "running") {
      const queueThreadId = `thread_queued_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const queueThread: Thread = {
        id: queueThreadId,
        index: threadsRef.current.length + 1,
        prompt: trimmed,
        response: "",
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "queued",
        stepCount: 0,
        startTime: Date.now(),
      };

      setPromptHistory((prev) => [...prev, trimmed]);
      setThreads((prev) => [...prev, queueThread]);
      promptQueueRef.current.push({ id: queueThreadId, prompt: trimmed });
      setQueuedCount(promptQueueRef.current.length);
      return;
    }

    await executeAgentTurn(trimmed);
  };

  const executeAgentTurn = async (taskText: string, existingThreadId?: string) => {
    isExecutingRef.current = true;

    /* Instant title from the first descriptive prompt; a model title may replace it after the turn. */
    if (titleRef.current.source === "placeholder") {
      const instant = promptTitle(taskText);
      if (instant) applyTitle(instant, "prompt");
    }

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    isUserScrolledRef.current = false;
    setScrollOffset(0);
    isRightUserScrolledRef.current = false;
    setRightScrollTop(0);
    if (!existingThreadId) {
      setPromptHistory((prev) => [...prev, taskText]);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 200);

    const threadId = existingThreadId || `thread_${Date.now()}`;
    if (existingThreadId) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === existingThreadId
            ? {
                ...t,
                status: "running",
                response: "",
                isStreaming: false,
                steps: [],
                stepCount: 0,
                startTime,
              }
            : t
        )
      );
    } else {
      const newThread: Thread = {
        id: threadId,
        index: threadsRef.current.length + 1,
        prompt: taskText,
        response: "",
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "running",
        stepCount: 0,
        startTime,
      };
      setThreads((prev) => [...prev, newThread]);
    }

    /* Pre-flight check: verify required provider is authenticated */
    try {
      const neoBase = baseURL || "http://127.0.0.1:8787/v1";
      let providerId = "antigravity";
      if (
        currentModel.startsWith("cloud/") ||
        currentModel.startsWith("openrouter/") ||
        currentModel.includes("space-bunny") ||
        currentModel.includes("deepseek")
      ) {
        providerId = "openrouter";
      } else if (
        currentModel.startsWith("local/") ||
        currentModel.includes("llama") ||
        currentModel.includes("qwen")
      ) {
        providerId = "local";
      }

      const statusUrl = neoBase.endsWith("/v1")
        ? `${neoBase}/auth/status?provider=${providerId}`
        : `${neoBase}/v1/auth/status?provider=${providerId}`;

      const checkRes = await fetch(statusUrl, { signal: AbortSignal.timeout(800) });
      if (checkRes.ok) {
        const authData = (await checkRes.json()) as { authenticated?: boolean; error?: string; name?: string };
        if (authData.authenticated === false) {
          let fixHint = "";
          if (providerId === "openrouter") {
            fixHint = "Run `/login openrouter <api-key>` to configure your OpenRouter key.";
          } else if (providerId === "antigravity") {
            fixHint = "Run `/login antigravity` to authenticate via Google OAuth.";
          } else if (providerId === "local") {
            fixHint = "Ensure Ollama is running (`ollama serve`) or run `/login local`.";
          }

          const unauthThread: Thread = {
            id: threadId,
            index: threadsRef.current.length + (existingThreadId ? 0 : 1),
            prompt: taskText,
            response: `## Authentication Required for ${authData.name || providerId}\n\n${authData.error || "Provider is not authenticated."}\n\n*${fixHint}*`,
            isStreaming: false,
            steps: [],
            isExpanded: false,
            status: "error",
            stepCount: 0,
            startTime,
            durationMs: 0,
          };
          if (existingThreadId) {
            setThreads((prev) => prev.map((t) => (t.id === threadId ? unauthThread : t)));
          } else {
            setThreads((prev) => [...prev, unauthThread]);
          }
          setStatus("idle");
          isExecutingRef.current = false;
          drainNextQueuedTask();
          return;
        }
      }
    } catch {
      /* Fallback gracefully if Neo auth check times out or fails */
    }

    let activeThinkingId: string | null = null;
    let thinkingStartTime = 0;
    const activeTools = new Map<string, { uiId: string; started: number; args: Record<string, unknown> }>();

    try {
      const result = await runAgent(taskText, historyRef.current, {
        abortSignal: abortController.signal,
        model: currentModel,
        isLocal,
        baseURL,
        verbose: isVerbose,
        maxSteps,
        findings: findingsRef.current,
        onStepStart: (step) => {
          setStepCount(step);
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (!activeThinkingId) {
            activeThinkingId = `think_${Date.now()}`;
            thinkingStartTime = Date.now();
            const newStep: ThreadStep = {
              id: activeThinkingId,
              type: "thinking",
              content: "",
              isRunning: true,
              startTime: thinkingStartTime,
              durationMs: 0,
            };
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      stepCount: step,
                      isStreaming: false,
                      steps: [...t.steps, newStep],
                    }
                  : t
              )
            );
          } else {
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId ? { ...t, stepCount: step, isStreaming: false } : t
              )
            );
          }
        },
        onReasoningDelta: (chunk) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (!activeThinkingId) {
            activeThinkingId = `think_${Date.now()}`;
            thinkingStartTime = Date.now();
            const newStep: ThreadStep = {
              id: activeThinkingId,
              type: "thinking",
              content: chunk,
              isRunning: true,
              startTime: thinkingStartTime,
              durationMs: 0,
            };
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
              )
            );
          } else {
            const curThinkId = activeThinkingId;
            const curDur = Date.now() - thinkingStartTime;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId
                      ? {
                          ...s,
                          content: (s.content || "") + chunk,
                          durationMs: curDur,
                        }
                      : s
                  ),
                };
              })
            );
          }
        },
        onToolCall: (name: string, toolArgs: Record<string, unknown>, callId?: string) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps
                    .map((s) =>
                      s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                    )
                    .filter((s) => s.id !== curThinkId || Boolean(s.content?.trim())),
                };
              })
            );
            activeThinkingId = null;
          }

          const toolStartTime = Date.now();
          const uiId = `tool_${toolStartTime}_${callId || name}`;
          activeTools.set(callId || name, { uiId, started: toolStartTime, args: toolArgs });
          const newStep: ThreadStep = {
            id: uiId,
            type: "tool",
            name,
            args: toolArgs,
            isRunning: true,
            startTime: toolStartTime,
          };
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, isStreaming: false, steps: [...t.steps, newStep] } : t
            )
          );
        },
        onToolResult: (name: string, res: ToolResult, callId?: string) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          const lines = res.output.trim().split("\n").filter(Boolean);
          const outputSummary = `${lines.length} lines output`;
          const currentTool = activeTools.get(callId || name);
          const curToolId = currentTool?.uiId;
          const toolDur = currentTool ? Date.now() - currentTool.started : undefined;

          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              return {
                ...t,
                steps: t.steps.map((s) =>
                  s.id === curToolId
                    ? {
                        ...s,
                        isRunning: false,
                        isError,
                        durationMs: toolDur,
                        outputSummary,
                        outputPreview: lines.slice(0, 4),
                        output: res.output,
                      }
                    : s
                ),
              };
            })
          );
          activeTools.delete(callId || name);

          /* A failed edit changed nothing, so it must not count as a changed file. */
          const editRecord = isError ? null : extractDiffRecord(
            name,
            currentTool?.args || {},
            res.output
          );
          if (editRecord) {
            setFileEdits((prev) => [...prev, editRecord]);
          }
        },
        onNarration: (text) => {
          const note = text.trim();
          const noteStep: ThreadStep = {
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: "note",
            content: note,
            startTime: Date.now(),
          };
          /* Interim text leaves the answer block and becomes its own timeline entry,
           * so the final answer streams into a clean response. */
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    response: "",
                    isStreaming: false,
                    steps: note ? [...t.steps, noteStep] : t.steps,
                  }
                : t
            )
          );
        },
        onTextDelta: (chunk) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps
                    .map((s) =>
                      s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                    )
                    .filter((s) => s.id !== curThinkId || Boolean(s.content?.trim())),
                };
              })
            );
            activeThinkingId = null;
          }

          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    response: (t.response || "") + chunk,
                    isStreaming: true,
                  }
                : t
            )
          );
        },
      });

      if (activeThinkingId) {
        const curThinkId = activeThinkingId;
        const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            return {
              ...t,
              steps: t.steps
                .map((s) =>
                  s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                )
                .filter((s) => s.id !== curThinkId || Boolean(s.content?.trim())),
            };
          })
        );
        activeThinkingId = null;
      }

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: result.error ? "error" : result.aborted ? "aborted" : "completed",
                isStreaming: false,
                response: result.error
                  ? `${t.response ? `${t.response}\n\n` : ""}${formatAgentError(result.error, baseURL)}`
                  : result.aborted
                    ? t.response || "*Task stopped.*"
                    : result.text || t.response || "*Model produced no output.*",
                durationMs: Date.now() - t.startTime,
              }
            : t
        )
      );

      historyRef.current = result.messages;
      setHistory(result.messages);
      if (result.findings) {
        findingsRef.current = result.findings;
        setFindings(result.findings);
      }
      if (result.usage) {
        const turnUsage = result.usage;
        setUsage((prev) => {
          const byModel = { ...(prev?.byModel || {}) };
          const cur = byModel[currentModel] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          byModel[currentModel] = {
            promptTokens: cur.promptTokens + turnUsage.promptTokens,
            completionTokens: cur.completionTokens + turnUsage.completionTokens,
            totalTokens: cur.totalTokens + turnUsage.totalTokens,
          };
          const next = {
            ...turnUsage,
            byModel,
          };
          usageRef.current = next;
          return next;
        });
      } else {
        usageRef.current = result.usage;
        setUsage(result.usage);
      }
      setStatus(result.error ? "error" : result.aborted ? "aborted" : "idle");
      if (!result.error && !result.aborted) {
        maybeGenerateTitle(taskText, result.text);
      }

      /* Auto-save session asynchronously after successful turn */
      setTimeout(() => {
        saveSession({
          id: sessionId,
          title: titleRef.current.title,
          titleSource: titleRef.current.source,
          cwd: process.cwd(),
          createdAt: sessionCreatedAtRef.current,
          updatedAt: Date.now(),
          model: currentModel,
          threads: threadsRef.current,
          history: result.messages,
          findings: result.findings || findingsRef.current,
          fileEdits: fileEditsRef.current,
          tokenUsage: result.usage || usageRef.current,
        }).catch(() => {});
      }, 50);
    } catch (err: unknown) {
      setStatus("error");
      const errMsg = err instanceof Error ? err.message : String(err);
      const lowErr = errMsg.toLowerCase();
      let errorResponse = `error: ${errMsg.toLowerCase()}`;
      if (
        lowErr.includes("claude") &&
        (lowErr.includes("401") ||
          lowErr.includes("403") ||
          lowErr.includes("token") ||
          lowErr.includes("oauth") ||
          lowErr.includes("keychain"))
      ) {
        errorResponse += `\n\nclaude pro is not authenticated. run \`claude auth login\` in terminal or type \`/login claude <token>\`.`;
      } else if (
        lowErr.includes("codex") &&
        (lowErr.includes("401") ||
          lowErr.includes("403") ||
          lowErr.includes("token") ||
          lowErr.includes("auth.json"))
      ) {
        errorResponse += `\n\ncodex session is not authenticated. run \`codex login\` in terminal or type \`/login codex <token>\`.`;
      } else if (
        lowErr.includes("openrouter") &&
        (lowErr.includes("api key") ||
          lowErr.includes("unauthorized") ||
          lowErr.includes("401") ||
          lowErr.includes("not configured"))
      ) {
        errorResponse += `\n\nopenrouter is not configured. type \`/login openrouter <api-key>\`.`;
      } else if (
        lowErr.includes("antigravity") &&
        (lowErr.includes("credentials") ||
          lowErr.includes("keychain") ||
          lowErr.includes("401") ||
          lowErr.includes("403") ||
          lowErr.includes("unauthenticated"))
      ) {
        errorResponse += `\n\ngoogle cloud code is not authenticated. type \`/login antigravity\`.`;
      } else if (lowErr.includes("fetch failed") || lowErr.includes("econnrefused")) {
        errorResponse += `\n\nunable to connect to neo proxy (${baseURL || "http://127.0.0.1:8787"}). ensure neo daemon is running.`;
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: "error",
                isStreaming: false,
                response: errorResponse,
                durationMs: Date.now() - t.startTime,
              }
            : t
        )
      );

      /* Auto-save session state even upon error */
      setTimeout(() => {
        saveSession({
          id: sessionId,
          title: titleRef.current.title,
          titleSource: titleRef.current.source,
          cwd: process.cwd(),
          createdAt: sessionCreatedAtRef.current,
          updatedAt: Date.now(),
          model: currentModel,
          threads: threadsRef.current,
          history: historyRef.current,
          findings: findingsRef.current,
          fileEdits: fileEditsRef.current,
          tokenUsage: usageRef.current,
        }).catch(() => {});
      }, 50);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      abortControllerRef.current = null;
      isExecutingRef.current = false;
      drainNextQueuedTask();
    }
  };

  executeAgentTurnRef.current = executeAgentTurn;

  return {
    status,
    setStatus,
    stepCount,
    elapsedSeconds,
    usage,
    threads,
    setThreads,
    fileEdits,
    setFileEdits,
    findings,
    setFindings,
    history,
    setHistory,
    sessionId,
    setSessionId,
    sessionTitle,
    loadSessionById,
    resetSession,
    executeTask,
    abort,
    queuedCount,
    clearQueue,
  };
}
