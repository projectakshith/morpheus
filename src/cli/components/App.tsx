import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { DiffColumn, type FileEditRecord } from "./DiffColumn";
import { InputBox } from "./InputBox";
import { runAgent } from "../../core/agent";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import { MarkdownFormatter } from "../format";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types";
import { isToolError } from "../../utils/errors";

export interface ThreadStep {
  id: string;
  type: "thinking" | "tool";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  durationMs?: number;
  outputSummary?: string;
  outputPreview?: string[];
  output?: string;
  isOutputExpanded?: boolean;
}

export interface Thread {
  id: string;
  index: number;
  prompt: string;
  response: string;
  isStreaming?: boolean;
  steps: ThreadStep[];
  isExpanded: boolean;
  status: "running" | "completed" | "aborted" | "error";
  stepCount: number;
  startTime: number;
  durationMs?: number;
}

export interface AppProps {
  model: string;
  isLocal?: boolean;
  baseURL?: string;
  isVerbose?: boolean;
  initialTask?: string;
  maxSteps?: number;
}

interface FeedLine {
  id: string;
  threadId: string;
  node: React.ReactNode;
  isStepToggle?: boolean;
  toolStepId?: string;
}

/* Helper to summarize tool steps into a compact readable string */
function summarizeStepTools(steps: ThreadStep[]): string {
  const toolCounts = new Map<string, number>();
  for (const step of steps) {
    if (step.type === "tool" && step.name) {
      toolCounts.set(step.name, (toolCounts.get(step.name) || 0) + 1);
    }
  }

  if (toolCounts.size === 0) {
    return "reasoning only";
  }

  const parts: string[] = [];
  for (const [name, count] of toolCounts.entries()) {
    parts.push(count > 1 ? `${name} x${count}` : name);
  }
  return parts.join(", ");
}

/* Helper to format tool arguments concisely for developer inspection */
function formatToolArgs(name?: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";

  if (name === "read_file" && typeof args.filePath === "string") {
    const range = args.offset ? `:${args.offset}` : "";
    return `${args.filePath}${range}`;
  }
  if ((name === "edit_file" || name === "write_file") && typeof args.filePath === "string") {
    return args.filePath;
  }
  if (name === "bash" && typeof args.command === "string") {
    return args.command;
  }
  if ((name === "grep_code" || name === "grepCode") && typeof args.pattern === "string") {
    const targetPath = typeof args.path === "string" ? ` in ${args.path}` : "";
    return `"${args.pattern}"${targetPath}`;
  }
  if ((name === "list_dir" || name === "listDir") && typeof args.dirPath === "string") {
    return args.dirPath;
  }
  if ((name === "outline_code" || name === "outlineCode") && typeof args.filePath === "string") {
    return args.filePath;
  }
  if (name === "http_request" && typeof args.url === "string") {
    const method = typeof args.method === "string" ? `${args.method.toUpperCase()} ` : "";
    return `${method}${args.url}`;
  }
  if (name === "record_finding" && typeof args.topic === "string") {
    return args.topic;
  }

  const primary =
    args.filePath ?? args.command ?? args.url ?? args.dirPath ?? args.pattern ?? args.topic;
  if (typeof primary === "string") return primary;
  try {
    const str = JSON.stringify(args);
    return str.length > 50 ? `${str.slice(0, 47)}...` : str;
  } catch {
    return "";
  }
}

/* Helper to extract structured diff records from tool execution results */
function extractDiffRecord(
  name: string,
  args: Record<string, unknown>,
  output: string
): FileEditRecord | null {
  if (name === "edit_file" && typeof args.filePath === "string") {
    const rawLines = output.split("\n");
    const diffLines = rawLines.filter(
      (l) => l.startsWith("@@") || l.startsWith("+") || l.startsWith("-") || l.startsWith(" ")
    );
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return {
      filePath: args.filePath,
      type: "edit",
      diffLines: diffLines.length > 0 ? diffLines : rawLines.slice(0, 15),
      linesAdded: added,
      linesRemoved: removed,
      timestamp: Date.now(),
    };
  }

  if (name === "write_file" && typeof args.filePath === "string") {
    const content = typeof args.content === "string" ? args.content : "";
    const lines = content.split("\n");
    return {
      filePath: args.filePath,
      type: "write",
      diffLines: lines.slice(0, 15).map((l) => `+ ${l}`),
      linesAdded: lines.length,
      linesRemoved: 0,
      timestamp: Date.now(),
    };
  }

  return null;
}

/* Root interactive full-screen application with mouse click-to-expand, scrolling, and static bottom bar */
export function App({
  model,
  isLocal = false,
  baseURL,
  isVerbose = false,
  initialTask,
  maxSteps,
}: AppProps) {
  const { columns, rows } = useWindowSize();

  const [status, setStatus] = useState<"idle" | "running" | "aborted" | "error">(
    initialTask ? "running" : "idle"
  );
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const baseContext = useRef(gatherContext(process.cwd()));
  const initialTaskFired = useRef(false);
  const isUserScrolledRef = useRef(false);

  /* Momentum smooth scrolling refs */
  const targetScrollRef = useRef(0);
  const currentScrollRef = useRef(0);
  const animTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxScrollRef = useRef(0);
  const activeToolArgsRef = useRef<Record<string, unknown>>({});

  /* Snap viewport instantly to bottom and stop momentum animation */
  const snapToBottom = () => {
    if (animTimerRef.current !== null) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    targetScrollRef.current = 0;
    currentScrollRef.current = 0;
    isUserScrolledRef.current = false;
    setScrollOffset(0);
  };

  /* Lenis-style momentum smooth scrolling loop (damped lerp interpolation) */
  const triggerSmoothScroll = (delta: number) => {
    isUserScrolledRef.current = true;
    const newTarget = Math.max(0, Math.min(maxScrollRef.current, targetScrollRef.current + delta));
    targetScrollRef.current = newTarget;

    if (animTimerRef.current !== null) return;

    animTimerRef.current = setInterval(() => {
      const target = targetScrollRef.current;
      const current = currentScrollRef.current;
      const diff = target - current;

      if (Math.abs(diff) < 0.15) {
        currentScrollRef.current = target;
        const finalInt = Math.round(target);
        setScrollOffset(finalInt);
        if (finalInt === 0) {
          isUserScrolledRef.current = false;
        }
        if (animTimerRef.current !== null) {
          clearInterval(animTimerRef.current);
          animTimerRef.current = null;
        }
      } else {
        /* Smooth lerp interpolation step (factor 0.35) */
        const next = current + diff * 0.35;
        currentScrollRef.current = next;
        const nextInt = Math.round(next);
        setScrollOffset((prev) => (prev !== nextInt ? nextInt : prev));
      }
    }, 16);
  };

  /* Compute full-screen dimensions and dedicated side column partition */
  const terminalWidth = columns || process.stdout.columns || 80;
  const terminalHeight = rows || process.stdout.rows || 24;
  const isSplitLayout = terminalWidth >= 90;
  const leftWidth = isSplitLayout ? Math.floor(terminalWidth * 0.58) : terminalWidth;
  const rightWidth = isSplitLayout ? terminalWidth - leftWidth - 2 : 0;

  const headerHeight = 2;
  const statusBarHeight = 2;
  const inputBoxHeight = 1;
  const feedHeight = Math.max(4, terminalHeight - headerHeight - statusBarHeight - inputBoxHeight);

  /* Enable SGR mouse reporting for clicking on threads/tools and wheel scrolling */
  useEffect(() => {
    try {
      process.stdout.write("\x1b[?1000h\x1b[?1006h");
    } catch {}

    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const mouseMatches = str.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g);

      for (const match of mouseMatches) {
        const button = parseInt(match[1], 10);
        const col = parseInt(match[2], 10);
        const row = parseInt(match[3], 10);
        const isRelease = match[4] === "m";

        if (button === 64) {
          /* Mouse wheel up: smooth scroll towards top */
          triggerSmoothScroll(3);
        } else if (button === 65) {
          /* Mouse wheel down: smooth scroll towards bottom */
          triggerSmoothScroll(-3);
        } else if (button === 0 && !isRelease) {
          /* Left click: toggle clicked element */
          if (col <= leftWidth) {
            const clickedLineIndex = row - 3;
            if (clickedLineIndex >= 0 && clickedLineIndex < visibleLinesRef.current.length) {
              const target = visibleLinesRef.current[clickedLineIndex];
              if (target) {
                if (target.isStepToggle && target.threadId) {
                  /* Toggle step expansion of thread */
                  setThreads((prev) =>
                    prev.map((t) =>
                      t.id === target.threadId ? { ...t, isExpanded: !t.isExpanded } : t
                    )
                  );
                } else if (target.toolStepId && target.threadId) {
                  /* Toggle full tool output expansion */
                  setThreads((prev) =>
                    prev.map((t) => {
                      if (t.id !== target.threadId) return t;
                      return {
                        ...t,
                        steps: t.steps.map((s) =>
                          s.id === target.toolStepId
                            ? { ...s, isOutputExpanded: !s.isOutputExpanded }
                            : s
                        ),
                      };
                    })
                  );
                }
              }
            }
          }
        }
      }
    };

    process.stdin.on("data", onData);

    const cleanup = () => {
      try {
        process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      } catch {}
      process.stdin.off("data", onData);
      if (animTimerRef.current !== null) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
    };

    process.on("exit", cleanup);
    return cleanup;
  }, [leftWidth]);

  /* Handle keyboard shortcuts */
  useInput((input, key) => {
    if (key.escape && status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
      return;
    }

    /* Toggle thread step expansion via Tab */
    if (key.tab) {
      if (status === "running") {
        setIsThinkingExpanded((prev) => !prev);
      } else {
        setThreads((prev) => {
          if (prev.length === 0) return prev;
          const anyExpanded = prev.some((t) => t.isExpanded);
          if (anyExpanded) {
            return prev.map((t) => ({ ...t, isExpanded: false }));
          }
          const targetIndex = prev.length - 1;
          return prev.map((t, idx) =>
            idx === targetIndex ? { ...t, isExpanded: true } : t
          );
        });
      }
      return;
    }

    /* Scroll history up with momentum */
    if (key.pageUp || (key.ctrl && input === "u")) {
      triggerSmoothScroll(6);
      return;
    }

    /* Scroll history down with momentum */
    if (key.pageDown || (key.ctrl && input === "d")) {
      triggerSmoothScroll(-6);
      return;
    }

    /* Jump to bottom */
    if (key.end) {
      snapToBottom();
      return;
    }
  });

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    snapToBottom();
    setPromptHistory((prev) => [...prev, taskText]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    /* Initialize new conversation thread */
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
    setThreads((prev) => [...prev, newThread]);

    let activeThinkingId: string | null = null;
    let activeToolId: string | null = null;
    let thinkingStartTime = 0;

    try {
      const result = await runAgent(taskText, history, {
        abortSignal: abortController.signal,
        model,
        isLocal,
        baseURL,
        verbose: isVerbose,
        maxSteps,
        findings,
        onStepStart: (step) => {
          setStepCount(step);
          if (!isUserScrolledRef.current) {
            snapToBottom();
          }
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, stepCount: step } : t
            )
          );
        },
        onReasoningDelta: (chunk) => {
          if (!isUserScrolledRef.current) {
            snapToBottom();
          }
          if (!activeThinkingId) {
            activeThinkingId = `think_${Date.now()}`;
            thinkingStartTime = Date.now();
            const newStep: ThreadStep = {
              id: activeThinkingId,
              type: "thinking",
              content: chunk,
              isRunning: true,
              durationMs: 0,
            };
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
              )
            );
          } else {
            const curThinkId = activeThinkingId;
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
                          durationMs: Date.now() - thinkingStartTime,
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
            snapToBottom();
          }
          activeToolArgsRef.current = toolArgs;
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false } : s
                  ),
                };
              })
            );
            activeThinkingId = null;
          }

          activeToolId = `tool_${Date.now()}_${name}`;
          const newStep: ThreadStep = {
            id: activeToolId,
            type: "tool",
            name,
            args: toolArgs,
            isRunning: true,
          };
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
            )
          );
        },
        onToolResult: (name, res) => {
          if (!isUserScrolledRef.current) {
            snapToBottom();
          }
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          const lines = res.output.trim().split("\n").filter(Boolean);
          const outputSummary = `${lines.length} lines output`;
          const curToolId = activeToolId;

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
                        outputSummary,
                        outputPreview: lines.slice(0, 8),
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
            snapToBottom();
          }
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false } : s
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

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: result.aborted ? "aborted" : "completed",
                isStreaming: false,
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
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: "error",
                isStreaming: false,
                response: `Error: ${err instanceof Error ? err.message : String(err)}`,
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

  /* Auto-trigger initial task if provided via CLI argument */
  useEffect(() => {
    if (initialTask && !initialTaskFired.current) {
      initialTaskFired.current = true;
      executeTask(initialTask);
    }
  }, []);

  /* Flatten all conversation threads into structured single-line feed items */
  const allFeedLines = useMemo<FeedLine[]>(() => {
    const lines: FeedLine[] = [];

    threads.forEach((thread, tIdx) => {
      /* 1. User message */
      lines.push({
        id: `${thread.id}_user_hdr`,
        threadId: thread.id,
        node: (
          <Text color="white" bold>
            ▲ you
          </Text>
        ),
      });

      const promptLines = thread.prompt.split("\n");
      promptLines.forEach((pLine, idx) => {
        lines.push({
          id: `${thread.id}_prompt_${idx}`,
          threadId: thread.id,
          node: <Text color="white">  {pLine}</Text>,
        });
      });

      /* 2. Steps pill / execution box below the message */
      if (thread.status === "running") {
        thread.steps.forEach((step) => {
          if (step.type === "thinking") {
            const sec = ((step.durationMs || 0) / 1000).toFixed(1);
            lines.push({
              id: `${step.id}_think_live`,
              threadId: thread.id,
              node: (
                <Text color="yellow">
                  │ <Spinner type="dots" /> thinking ({sec}s)...
                </Text>
              ),
            });
          } else if (step.type === "tool") {
            const argStr = formatToolArgs(step.name, step.args);
            lines.push({
              id: `${step.id}_tool_live`,
              threadId: thread.id,
              node: step.isRunning ? (
                <Text color="yellow">
                  │ <Spinner type="dots" /> <Text color="white" bold>{step.name}</Text>
                  {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                </Text>
              ) : step.isError ? (
                <Text color="red">
                  │ ✖ <Text color="white" bold>{step.name}</Text>
                  {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                  {step.outputSummary ? <Text color="red"> · {step.outputSummary}</Text> : null}
                </Text>
              ) : (
                <Text color="green">
                  │ ✔ <Text color="white" bold>{step.name}</Text>
                  {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                  {step.outputSummary ? <Text color="gray"> · {step.outputSummary}</Text> : null}
                </Text>
              ),
            });
          }
        });
      } else {
        const sec = thread.durationMs ? (thread.durationMs / 1000).toFixed(1) : "0.0";
        const toolsSummary = summarizeStepTools(thread.steps);

        if (thread.steps.length > 0 && !thread.isExpanded) {
          lines.push({
            id: `${thread.id}_steps_collapsed`,
            threadId: thread.id,
            isStepToggle: true,
            node: (
              <Text color="gray">
                {"  "}<Text color="cyan">▾ {thread.stepCount} {thread.stepCount === 1 ? "step" : "steps"}</Text> ({toolsSummary}) · {sec}s ·{" "}
                <Text color="cyan">[click to expand]</Text>
              </Text>
            ),
          });
        } else if (thread.steps.length > 0 && thread.isExpanded) {
          lines.push({
            id: `${thread.id}_steps_exp_hdr`,
            threadId: thread.id,
            isStepToggle: true,
            node: (
              <Text color="gray">
                {"  "}┌ <Text color="cyan" bold>{thread.stepCount} {thread.stepCount === 1 ? "step" : "steps"}</Text> ({toolsSummary}) · {sec}s ·{" "}
                <Text color="cyan">[click to collapse]</Text>
              </Text>
            ),
          });

          thread.steps.forEach((step) => {
            if (step.type === "thinking") {
              const sSec = ((step.durationMs || 0) / 1000).toFixed(1);
              lines.push({
                id: `${step.id}_think_done`,
                threadId: thread.id,
                toolStepId: step.id,
                node: (
                  <Text color="gray">
                    {"  "}│ ● thinking ({sSec}s)
                    {step.content && !step.isOutputExpanded ? (
                      <Text color="gray"> · <Text color="cyan">[click to view thoughts]</Text></Text>
                    ) : null}
                  </Text>
                ),
              });
              if (step.content && step.isOutputExpanded) {
                const thinkLines = step.content.trim().split("\n");
                const maxLineLen = Math.max(20, leftWidth - 10);
                thinkLines.slice(0, 25).forEach((tLine, thIdx) => {
                  const trimmed = tLine.length > maxLineLen ? `${tLine.slice(0, maxLineLen - 1)}…` : tLine;
                  lines.push({
                    id: `${step.id}_think_line_${thIdx}`,
                    threadId: thread.id,
                    toolStepId: step.id,
                    node: (
                      <Text color="gray">
                        {"  "}│   <Text color="gray" italic>{trimmed}</Text>
                      </Text>
                    ),
                  });
                });
              }
            } else if (step.type === "tool") {
              const argStr = formatToolArgs(step.name, step.args);
              lines.push({
                id: `${step.id}_tool_done`,
                threadId: thread.id,
                toolStepId: step.id,
                node: step.isError ? (
                  <Text color="red">
                    {"  "}│ ✖ <Text color="white" bold>{step.name}</Text>
                    {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                    {step.outputSummary ? <Text color="red"> · {step.outputSummary}</Text> : null}
                  </Text>
                ) : (
                  <Text color="green">
                    {"  "}│ ✔ <Text color="white" bold>{step.name}</Text>
                    {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                    {step.outputSummary ? <Text color="gray"> · {step.outputSummary}</Text> : null}
                  </Text>
                ),
              });

              /* Render what the agent saw: tool output lines */
              const rawOutput = step.output ?? (step.outputPreview ? step.outputPreview.join("\n") : "");
              const outputLines = rawOutput ? rawOutput.replace(/\r\n/g, "\n").split("\n") : [];
              const maxLines = step.isOutputExpanded ? 60 : 8;
              const displaySlice = outputLines.slice(0, maxLines);
              const remaining = outputLines.length - displaySlice.length;
              const maxLineLen = Math.max(20, leftWidth - 10);

              if (outputLines.length === 0) {
                lines.push({
                  id: `${step.id}_out_empty`,
                  threadId: thread.id,
                  toolStepId: step.id,
                  node: (
                    <Text color="gray">
                      {"  "}│   <Text color="gray" italic>(no output returned)</Text>
                    </Text>
                  ),
                });
              } else {
                displaySlice.forEach((rawLine, oIdx) => {
                  const trimmed =
                    rawLine.length > maxLineLen ? `${rawLine.slice(0, maxLineLen - 1)}…` : rawLine;
                  let color: "gray" | "green" | "red" | "cyan" | "white" = "gray";
                  if (step.isError) {
                    color = "red";
                  } else if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) {
                    color = "green";
                  } else if (trimmed.startsWith("-") && !trimmed.startsWith("---")) {
                    color = "red";
                  } else if (trimmed.startsWith("@@")) {
                    color = "cyan";
                  } else if (
                    trimmed.includes("✔") ||
                    trimmed.includes("PASS") ||
                    trimmed.includes("passed")
                  ) {
                    color = "green";
                  } else if (
                    trimmed.includes("✖") ||
                    trimmed.includes("FAIL") ||
                    trimmed.includes("failed") ||
                    trimmed.includes("Error:")
                  ) {
                    color = "red";
                  }

                  lines.push({
                    id: `${step.id}_out_${oIdx}`,
                    threadId: thread.id,
                    toolStepId: step.id,
                    node: (
                      <Text color="gray">
                        {"  "}│   <Text color={color}>{trimmed}</Text>
                      </Text>
                    ),
                  });
                });

                if (remaining > 0) {
                  lines.push({
                    id: `${step.id}_out_more`,
                    threadId: thread.id,
                    toolStepId: step.id,
                    node: (
                      <Text color="gray">
                        {"  "}│   <Text color="cyan">↳ ... +{remaining} lines [click to expand full output]</Text>
                      </Text>
                    ),
                  });
                } else if (outputLines.length > 8 && step.isOutputExpanded) {
                  lines.push({
                    id: `${step.id}_out_collapse`,
                    threadId: thread.id,
                    toolStepId: step.id,
                    node: (
                      <Text color="gray">
                        {"  "}│   <Text color="cyan">↳ [click to collapse output]</Text>
                      </Text>
                    ),
                  });
                }
              }
            }
          });

          lines.push({
            id: `${thread.id}_steps_exp_ftr`,
            threadId: thread.id,
            isStepToggle: true,
            node: <Text color="gray">  └ [click to collapse]</Text>,
          });
        }
      }

      /* 3. Assistant answer */
      if (thread.response || thread.isStreaming) {
        lines.push({
          id: `${thread.id}_asst_hdr`,
          threadId: thread.id,
          node: (
            <Text color="greenBright" bold>
              ▲ morpheus
            </Text>
          ),
        });

        const formatter = new MarkdownFormatter();
        const rawLines = thread.response.split("\n");
        const formattedLines: string[] = [];
        for (const raw of rawLines) {
          formattedLines.push(...formatter.processLine(raw));
        }
        formattedLines.push(...formatter.flush());

        formattedLines.forEach((mLine, mIdx) => {
          lines.push({
            id: `${thread.id}_asst_line_${mIdx}`,
            threadId: thread.id,
            node: <Text>  {mLine}</Text>,
          });
        });
      }

      /* Divider between turns */
      if (tIdx < threads.length - 1) {
        lines.push({
          id: `${thread.id}_spacer_1`,
          threadId: thread.id,
          node: <Text color="gray">  {"· ".repeat(Math.min(16, Math.max(4, Math.floor(leftWidth / 6))))}</Text>,
        });
        lines.push({
          id: `${thread.id}_spacer_2`,
          threadId: thread.id,
          node: <Text> </Text>,
        });
      }
    });

    return lines;
  }, [threads, leftWidth]);

  /* Calculate exact visible lines window respecting clamped scrollOffset */
  const maxScroll = Math.max(0, allFeedLines.length - feedHeight);
  maxScrollRef.current = maxScroll;

  const visibleLines = useMemo(() => {
    const total = allFeedLines.length;
    if (total <= feedHeight) {
      return allFeedLines;
    }
    const clampedOffset = Math.min(scrollOffset, maxScroll);
    const startIndex = Math.max(0, total - feedHeight - clampedOffset);
    return allFeedLines.slice(startIndex, startIndex + feedHeight);
  }, [allFeedLines, scrollOffset, feedHeight, maxScroll]);

  const visibleLinesRef = useRef(visibleLines);
  visibleLinesRef.current = visibleLines;

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      {/* Full-width header spanning top */}
      <Header
        version={MORPHEUS_VERSION}
        model={model}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      {/* Main split viewport: Left conversation & static footer, Right dedicated column */}
      <Box flexDirection="row" flexGrow={1} height={terminalHeight - headerHeight} overflow="hidden">
        {/* Left Column: Fixed height feed box with permanently pinned footer */}
        <Box
          flexDirection="column"
          width={leftWidth}
          height="100%"
          paddingRight={isSplitLayout ? 1 : 0}
        >
          {/* Scrollable feed box strictly clamped to feedHeight */}
          <Box flexDirection="column" height={feedHeight} overflow="hidden">
            {visibleLines.map((line) => (
              <Box key={line.id} height={1} overflow="hidden">
                {line.node}
              </Box>
            ))}
          </Box>

          {/* Permanently static telemetry status bar */}
          <StatusBar
            status={status}
            stepCount={stepCount}
            maxSteps={maxSteps}
            usage={usage}
            elapsedSeconds={elapsedSeconds}
            isThinkingExpanded={isThinkingExpanded}
            width={leftWidth}
            scrollOffset={scrollOffset}
          />

          {/* Permanently static prompt input */}
          <InputBox
            onSubmit={executeTask}
            isDisabled={status === "running"}
            history={promptHistory}
          />
        </Box>

        {/* Right Dedicated Column: Spans full vertical height */}
        {isSplitLayout && (
          <DiffColumn
            width={rightWidth}
            height="100%"
            edits={fileEdits}
            findings={findings}
            branch={baseContext.current.branch}
            gitStatus={baseContext.current.gitStatus}
          />
        )}
      </Box>
    </Box>
  );
}
