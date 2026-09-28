/*
 * useAgentRunner: Hook managing agent execution turns, thread states, and stream callbacks.
 */

import React, { useState, useRef, type MutableRefObject } from "react";
import { runAgent } from "../../core/agent.js";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types.js";
import { isToolError } from "../../utils/errors.js";
import type { Thread, ThreadStep, FileEditRecord, AppStatus } from "../types.js";
import { extractDiffRecord } from "../utils/diffRecord.js";
import { commandRegistry } from "../commands/registry.js";

export interface AgentRunnerOptions {
  currentModel: string;
  setCurrentModel: (model: string) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  baseURL?: string;
  isLocal?: boolean;
  isVerbose?: boolean;
  maxSteps?: number;
  initialTask?: string;
  isUserScrolledRef: MutableRefObject<boolean>;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  isRightUserScrolledRef: MutableRefObject<boolean>;
  setRightScrollTop: React.Dispatch<React.SetStateAction<number>>;
  setPromptHistory: React.Dispatch<React.SetStateAction<string[]>>;
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
  isUserScrolledRef,
  setScrollOffset,
  isRightUserScrolledRef,
  setRightScrollTop,
  setPromptHistory,
}: AgentRunnerOptions) {
  const [status, setStatus] = useState<AppStatus>(initialTask ? "running" : "idle");
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeToolArgsRef = useRef<Record<string, unknown>>({});

  const abort = () => {
    if (status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
    }
  };

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

    /* Execute registered slash commands via modular CommandRegistry */
    const handled = await commandRegistry.dispatch(taskText, {
      taskText,
      baseURL: baseURL || "http://127.0.0.1:8787/v1",
      currentModel,
      setCurrentModel,
      setIsModelSelectorOpen,
      setThreads,
      setPromptHistory,
      threadsCount: threads.length,
    });

    if (handled) return;

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    isUserScrolledRef.current = false;
    setScrollOffset(0);
    isRightUserScrolledRef.current = false;
    setRightScrollTop(0);
    setPromptHistory((prev) => [...prev, taskText]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 200);

    const threadId = `thread_${Date.now()}`;
    const newThread: Thread = {
      id: threadId,
      index: threads.length + 1,
      prompt: taskText,
      response: "",
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "running",
      stepCount: 0,
      startTime,
    };

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
            index: threads.length + 1,
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
          setThreads((prev) => [...prev, unauthThread]);
          setStatus("idle");
          return;
        }
      }
    } catch {
      /* Fallback gracefully if Neo auth check times out or fails */
    }

    setThreads((prev) => [...prev, newThread]);

    let activeThinkingId: string | null = null;
    let activeToolId: string | null = null;
    let thinkingStartTime = 0;
    let activeToolStartTime = 0;

    try {
      const result = await runAgent(taskText, history, {
        abortSignal: abortController.signal,
        model: currentModel,
        isLocal,
        baseURL,
        verbose: isVerbose,
        maxSteps,
        findings,
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

      setHistory(result.messages);
      if (result.findings) {
        setFindings(result.findings);
      }
      setUsage(result.usage);
      setStatus(result.aborted ? "aborted" : "idle");
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
      } else if (errMsg.includes("Antigravity") && (errMsg.includes("missing") || errMsg.includes("credentials") || errMsg.includes("Keychain"))) {
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
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      abortControllerRef.current = null;
    }
  };

  return {
    status,
    setStatus,
    stepCount,
    elapsedSeconds,
    usage,
    threads,
    setThreads,
    fileEdits,
    findings,
    history,
    executeTask,
    abort,
  };
}
