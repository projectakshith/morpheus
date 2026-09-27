import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { DiffColumn, buildRightLines, type FileEditRecord, type RightLine } from "./DiffColumn";
import { InputBox } from "./InputBox";
import { runAgent } from "../../core/agent";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import { MarkdownFormatter } from "../format";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types";
import { isToolError } from "../../utils/errors";
import { theme } from "../theme";

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
}

function wrapLine(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [rightScrollTop, setRightScrollTop] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const baseContext = useRef(gatherContext(process.cwd()));
  const initialTaskFired = useRef(false);
  const isUserScrolledRef = useRef(false);
  const maxScrollRef = useRef(0);
  const activeToolArgsRef = useRef<Record<string, unknown>>({});
  const isRightUserScrolledRef = useRef(false);
  const maxRightScrollRef = useRef(0);
  const visibleRightLinesRef = useRef<RightLine[]>([]);
  const currentRightScrollRef = useRef(0);

  const terminalWidth = columns || process.stdout.columns || 80;
  const terminalHeight = rows || process.stdout.rows || 24;
  const isSplitLayout = terminalWidth >= 72;
  const leftWidth = isSplitLayout ? Math.floor(terminalWidth * 0.58) : terminalWidth;
  const rightWidth = isSplitLayout ? terminalWidth - leftWidth : 0;

  const headerHeight = 2;
  const statusBarHeight = 2;
  const inputBoxHeight = 1;
  const workspaceHeight = Math.max(4, terminalHeight - headerHeight - statusBarHeight - inputBoxHeight);
  const feedHeight = workspaceHeight;
  const maxLineWidth = Math.max(20, leftWidth - 4);

  useEffect(() => {
    try {
      process.stdout.write("\x1b]11;#161415\x07");
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

        if (isSplitLayout && col > leftWidth) {
          if (button === 64) {
            setRightScrollTop((prev) => {
              const base = isRightUserScrolledRef.current ? prev : maxRightScrollRef.current;
              return Math.max(0, base - 2);
            });
            isRightUserScrolledRef.current = true;
          } else if (button === 65) {
            setRightScrollTop((prev) => {
              const base = isRightUserScrolledRef.current ? prev : maxRightScrollRef.current;
              const next = Math.min(maxRightScrollRef.current, base + 2);
              if (next >= maxRightScrollRef.current) {
                isRightUserScrolledRef.current = false;
              }
              return next;
            });
          } else if (button === 0 && !isRelease) {
            const workspaceRow = row - 3;
            if (workspaceRow >= 0 && workspaceRow < visibleRightLinesRef.current.length) {
              const clickedLine = visibleRightLinesRef.current[workspaceRow];
              if (clickedLine?.toolId) {
                const clickedId = clickedLine.toolId;
                setRightScrollTop(currentRightScrollRef.current);
                isRightUserScrolledRef.current = true;
                setExpandedToolIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(clickedId)) {
                    next.delete(clickedId);
                  } else {
                    next.add(clickedId);
                  }
                  return next;
                });
              }
            }
          }
        } else {
          if (button === 64) {
            isUserScrolledRef.current = true;
            setScrollOffset((prev) => Math.min(maxScrollRef.current, prev + 2));
          } else if (button === 65) {
            setScrollOffset((prev) => {
              const next = Math.max(0, prev - 2);
              if (next === 0) {
                isUserScrolledRef.current = false;
              }
              return next;
            });
          }
        }
      }
    };

    process.stdin.on("data", onData);

    const cleanup = () => {
      try {
        process.stdout.write("\x1b]111\x07");
        process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      } catch {}
      process.stdin.off("data", onData);
    };

    process.on("exit", cleanup);
    return cleanup;
  }, [leftWidth, isSplitLayout]);

  useInput((input, key) => {
    if (key.escape && status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
      return;
    }

    if (key.pageUp || (key.ctrl && input === "u")) {
      isUserScrolledRef.current = true;
      setScrollOffset((prev) => Math.min(maxScrollRef.current, prev + 5));
      return;
    }

    if (key.pageDown || (key.ctrl && input === "d")) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 5);
        if (next === 0) {
          isUserScrolledRef.current = false;
        }
        return next;
      });
      return;
    }

    if (key.end) {
      isUserScrolledRef.current = false;
      setScrollOffset(0);
      isRightUserScrolledRef.current = false;
      setRightScrollTop(0);
      return;
    }
  });

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

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
    }, 1000);

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
            setScrollOffset(0);
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
            setScrollOffset(0);
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

  useEffect(() => {
    if (initialTask && !initialTaskFired.current) {
      initialTaskFired.current = true;
      executeTask(initialTask);
    }
  }, []);

  const allFeedLines = useMemo<FeedLine[]>(() => {
    const lines: FeedLine[] = [];

    threads.forEach((thread, tIdx) => {
      lines.push({
        id: `${thread.id}_user_hdr`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.secondary} bold>
              ▲ you
            </Text>
            {" ".repeat(Math.max(0, leftWidth - 5))}
          </Text>
        ),
      });

      const promptLines = thread.prompt.split("\n");
      promptLines.forEach((pLine) => {
        const wrapped = wrapLine(pLine, maxLineWidth);
        wrapped.forEach((wLine) => {
          const visLen = 2 + wLine.length;
          const pad = Math.max(0, leftWidth - visLen);
          lines.push({
            id: `${thread.id}_prompt_${lines.length}`,
            threadId: thread.id,
            node: (
              <Text backgroundColor={theme.bg} wrap="truncate-end">
                <Text color={theme.text} bold>  {wLine}</Text>
                {" ".repeat(pad)}
              </Text>
            ),
          });
        });
      });

      const thinkingSteps = thread.steps.filter((s) => s.type === "thinking");
      thinkingSteps.forEach((tStep) => {
        const sec = ((tStep.durationMs || 0) / 1000).toFixed(1);
        const hdrText = `▲ reasoning (${sec}s)`;
        const visLen = tStep.isRunning ? hdrText.length + 3 : hdrText.length;
        const pad = Math.max(0, leftWidth - visLen);
        lines.push({
          id: `${tStep.id}_think_hdr`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              {tStep.isRunning ? (
                <Text color={theme.accentBright}>
                  <Spinner type="dots" />{" "}
                </Text>
              ) : null}
              <Text color={tStep.isRunning ? theme.secondary : theme.muted} italic>
                {hdrText}
              </Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });

        if (tStep.content) {
          const rawThinkLines = tStep.content.trim().split("\n");
          rawThinkLines.forEach((rLine) => {
            const wrapped = wrapLine(rLine, maxLineWidth);
            wrapped.forEach((wLine) => {
              const visLen = 4 + wLine.length;
              const pad = Math.max(0, leftWidth - visLen);
              lines.push({
                id: `${tStep.id}_think_${lines.length}`,
                threadId: thread.id,
                node: (
                  <Text backgroundColor={theme.bg} wrap="truncate-end">
                    <Text color={theme.border}>  │ </Text>
                    <Text color={theme.secondary} italic>
                      {wLine}
                    </Text>
                    {" ".repeat(pad)}
                  </Text>
                ),
              });
            });
          });
        }
      });

      if (thread.response || thread.isStreaming) {
        const asstHdr = "▲ morpheus";
        const padHdr = Math.max(0, leftWidth - asstHdr.length);
        lines.push({
          id: `${thread.id}_asst_hdr`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.accent} bold>
                {asstHdr}
              </Text>
              {" ".repeat(padHdr)}
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

        formattedLines.forEach((mLine) => {
          const wrapped = wrapLine(mLine, maxLineWidth);
          wrapped.forEach((wLine) => {
            const cleanText = wLine.replace(/\x1b\[[0-9;]*m/g, "");
            const visLen = 2 + cleanText.length;
            const pad = Math.max(0, leftWidth - visLen);
            lines.push({
              id: `${thread.id}_asst_line_${lines.length}`,
              threadId: thread.id,
              node: (
                <Text backgroundColor={theme.bg} wrap="truncate-end">
                  <Text color={theme.text}>  {wLine}</Text>
                  {" ".repeat(pad)}
                </Text>
              ),
            });
          });
        });
      }

      if (tIdx < threads.length - 1) {
        const dots = "  " + "· ".repeat(Math.min(16, Math.max(4, Math.floor(leftWidth / 6))));
        const padDots = Math.max(0, leftWidth - dots.length);
        lines.push({
          id: `${thread.id}_spacer_1`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.border}>{dots}</Text>
              {" ".repeat(padDots)}
            </Text>
          ),
        });
        lines.push({
          id: `${thread.id}_spacer_2`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg}>
              {" ".repeat(leftWidth)}
            </Text>
          ),
        });
      }
    });

    return lines;
  }, [threads, leftWidth, maxLineWidth]);

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

  const rightContentWidth = Math.max(16, rightWidth - 1);

  const allRightLines = useMemo<RightLine[]>(() => {
    return buildRightLines(
      threads,
      fileEdits,
      findings,
      baseContext.current.branch,
      baseContext.current.gitStatus,
      expandedToolIds,
      rightContentWidth
    );
  }, [threads, fileEdits, findings, expandedToolIds, rightContentWidth]);

  const maxRightScroll = Math.max(0, allRightLines.length - workspaceHeight);
  maxRightScrollRef.current = maxRightScroll;

  const effectiveRightScroll = isRightUserScrolledRef.current
    ? Math.min(rightScrollTop, maxRightScroll)
    : maxRightScroll;
  currentRightScrollRef.current = effectiveRightScroll;

  const visibleRightLines = useMemo(() => {
    return allRightLines.slice(effectiveRightScroll, effectiveRightScroll + workspaceHeight);
  }, [allRightLines, effectiveRightScroll, workspaceHeight]);

  visibleRightLinesRef.current = visibleRightLines;

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      <Header
        version={MORPHEUS_VERSION}
        model={model}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      <Box flexDirection="row" width={terminalWidth} height={workspaceHeight} overflow="hidden">
        <Box
          flexDirection="column"
          width={leftWidth}
          height={workspaceHeight}
        >
          <Box flexDirection="column" height={feedHeight} overflow="hidden">
            {visibleLines.map((line) => (
              <Box key={line.id} height={1} overflow="hidden">
                {line.node}
              </Box>
            ))}
            {Array.from({ length: Math.max(0, feedHeight - visibleLines.length) }).map((_, idx) => (
              <Box key={`feed_pad_${idx}`} height={1} overflow="hidden">
                <Text backgroundColor={theme.bg}>{" ".repeat(leftWidth)}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        {isSplitLayout && (
          <DiffColumn
            width={rightWidth}
            height={workspaceHeight}
            lines={visibleRightLines}
          />
        )}
      </Box>

      <StatusBar
        status={status}
        stepCount={stepCount}
        maxSteps={maxSteps}
        usage={usage}
        elapsedSeconds={elapsedSeconds}
        width={terminalWidth}
        scrollOffset={scrollOffset}
      />

      <InputBox
        onSubmit={executeTask}
        isDisabled={status === "running"}
        history={promptHistory}
        width={terminalWidth}
      />
    </Box>
  );
}
