/*
 * useAgentRunner: Hook managing agent execution turns, thread states, and stream callbacks.
 */

import React, { useState, useRef, useEffect, type MutableRefObject } from "react";
import { runAgent } from "../../core/agent.js";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types.js";
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
  openModal?: (modal: "model" | "session" | "settings") => void;
  closeModal?: () => void;
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
  const [status, setStatus] = useState<AppStatus>(initialTask ? "running" : "idle");
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());
  const [sessionTitle, setSessionTitle] = useState<string>("New Session");
  const [queuedCount, setQueuedCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeToolArgsRef = useRef<Record<string, unknown>>({});
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
        setSessionTitle(data.title || "Resumed Session");
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
    setSessionTitle(data.title || "Resumed Session");
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
    setSessionTitle("New Session");
    sessionCreatedAtRef.current = Date.now();
    setThreads([]);
    setHistory([]);
    setFindings([]);
    setFileEdits([]);
    setUsage(undefined);
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

    let currentTitle = sessionTitle;
    if (sessionTitle === "New Session" || !sessionTitle) {
      currentTitle = taskText.slice(0, 50).trim();
      setSessionTitle(currentTitle);
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
            response: `● **Authentication Required for ${authData.name || providerId}**\n\n${authData.error || "Provider is not authenticated."}\n\n*${fixHint}*`,
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
    let activeToolId: string | null = null;
    let thinkingStartTime = 0;
    let activeToolStartTime = 0;

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
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, stepCount: step } : t
            )
          );
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
        onToolCall: (name, toolArgs) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          activeToolArgsRef.current = toolArgs;
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                  ),
                };
              })
            );
            activeThinkingId = null;
          }

          const toolStartTime = Date.now();
          activeToolStartTime = toolStartTime;
          activeToolId = `tool_${toolStartTime}_${name}`;
          const newStep: ThreadStep = {
            id: activeToolId,
            type: "tool",
            name,
            args: toolArgs,
            isRunning: true,
            startTime: toolStartTime,
          };
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
            )
          );
        },
        onToolResult: (name, res) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          const lines = res.output.trim().split("\n").filter(Boolean);
          const outputSummary = `${lines.length} lines output`;
          const curToolId = activeToolId;
          const toolDur = activeToolStartTime ? Date.now() - activeToolStartTime : undefined;

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
          activeToolId = null;

          const editRecord = extractDiffRecord(
            name,
            activeToolArgsRef.current || {},
            res.output
          );
          if (editRecord) {
            setFileEdits((prev) => [...prev, editRecord]);
          }
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
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                  ),
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
              steps: t.steps.map((s) =>
                s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
              ),
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
                status: result.aborted ? "aborted" : "completed",
                isStreaming: false,
                response: t.response || (result.aborted ? "*Task stopped.*" : "*Model produced no output.*"),
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
      usageRef.current = result.usage;
      setUsage(result.usage);
      setStatus(result.aborted ? "aborted" : "idle");

      /* Auto-save session asynchronously after successful turn */
      setTimeout(() => {
        saveSession({
          id: sessionId,
          title: currentTitle,
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
      let errorResponse = `Error: ${errMsg}`;
      if (
        errMsg.includes("OPENROUTER_API_KEY") ||
        errMsg.includes("OpenRouter API key") ||
        errMsg.includes("OpenRouter is not configured") ||
        errMsg.includes("OpenRouter")
      ) {
        errorResponse += `\n\n*OpenRouter is not authenticated. Type \`/login openrouter <api-key>\` to configure your API key.*`;
      } else if (
        errMsg.includes("Antigravity") &&
        (errMsg.includes("credentials") ||
          errMsg.includes("Keychain") ||
          errMsg.includes("401") ||
          errMsg.includes("403") ||
          errMsg.includes("unauthenticated") ||
          errMsg.includes("OAuth error"))
      ) {
        errorResponse += `\n\n*Google Cloud Code is not authenticated. Type \`/login antigravity\` to authenticate via browser OAuth.*`;
      } else if (errMsg.includes("fetch failed") || errMsg.includes("ECONNREFUSED")) {
        errorResponse += `\n\n*Unable to connect to model proxy (${baseURL || "http://127.0.0.1:8787"}). Type \`/auth\` to check credentials or ensure Neo is running.*`;
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
          title: currentTitle,
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
