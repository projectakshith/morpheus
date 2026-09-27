import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, useInput, useWindowSize } from "ink";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { ThreadCard, type Thread, type ThreadStep } from "./ThreadCard";
import { DiffColumn, type FileEditRecord } from "./DiffColumn";
import { InputBox } from "./InputBox";
import { runAgent } from "../../core/agent";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types";
import { isToolError } from "../../utils/errors";

export interface AppProps {
  model: string;
  isLocal?: boolean;
  baseURL?: string;
  isVerbose?: boolean;
  initialTask?: string;
  maxSteps?: number;
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

/* Root interactive full-screen Ink application with dedicated split inspector and Trinity thread hierarchy */
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

  /* Compute full-screen dimensions and dedicated side column partition */
  const terminalWidth = columns || process.stdout.columns || 80;
  const terminalHeight = rows || process.stdout.rows || 24;
  const isSplitLayout = terminalWidth >= 90;
  const leftWidth = isSplitLayout ? Math.floor(terminalWidth * 0.58) : terminalWidth;
  const rightWidth = isSplitLayout ? terminalWidth - leftWidth - 2 : 0;
  const headerHeight = 2;
  const footerHeight = 3;
  const workspaceHeight = Math.max(6, terminalHeight - headerHeight - footerHeight);

  /* Handle global shortcut keys */
  useInput((input, key) => {
    if (key.escape && status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
      return;
    }

    /* Toggle thread step expansion / thinking preview */
    if (key.tab) {
      if (status === "running") {
        setIsThinkingExpanded((prev) => !prev);
      } else {
        setThreads((prev) => {
          if (prev.length === 0) return prev;
          const targetIndex = prev.length - 1;
          return prev.map((t, idx) =>
            idx === targetIndex ? { ...t, isExpanded: !t.isExpanded } : t
          );
        });
      }
      return;
    }

    /* Scroll history up */
    if (key.pageUp || (key.ctrl && input === "u")) {
      setScrollOffset((prev) => prev + 1);
      return;
    }

    /* Scroll history down */
    if (key.pageDown || (key.ctrl && input === "d")) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    /* Jump to earliest thread */
    if (key.home) {
      setScrollOffset(Math.max(0, threads.length - 1));
      return;
    }

    /* Jump to latest thread / bottom */
    if (key.end) {
      setScrollOffset(0);
      return;
    }
  });

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    setScrollOffset(0);
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
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, stepCount: step } : t
            )
          );
        },
        onReasoningDelta: (chunk) => {
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
          /* Close open thinking step on tool call */
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
                      }
                    : s
                ),
              };
            })
          );
          activeToolId = null;

          /* Record file edits or writes for right column inspector */
          const editRecord = extractDiffRecord(
            name,
            (newThread.steps.find((s) => s.id === curToolId)?.args as Record<string, unknown>) || {},
            res.output
          );
          if (editRecord) {
            setFileEdits((prev) => [...prev, editRecord]);
          }
        },
        onTextDelta: (chunk) => {
          /* Close open thinking step on assistant text stream */
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

      /* Finalize thread completion */
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

  /* Compute slice of threads to display in the visible window */
  const visibleThreads = useMemo(() => {
    if (threads.length === 0) return [];
    const endIndex = Math.max(1, threads.length - scrollOffset);
    const maxVisible = Math.max(1, Math.floor(workspaceHeight / 4));
    const startIndex = Math.max(0, endIndex - maxVisible);
    return threads.slice(startIndex, endIndex);
  }, [threads, scrollOffset, workspaceHeight]);

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      {/* Full-width header spanning the top of the terminal */}
      <Header
        version={MORPHEUS_VERSION}
        model={model}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      {/* Full-height workspace: Left conversation threads, Right dedicated inspector */}
      <Box flexDirection="row" flexGrow={1} height={workspaceHeight} overflow="hidden">
        {/* Left Column: Thread workspace, Status bar, Input box */}
        <Box
          flexDirection="column"
          width={leftWidth}
          height="100%"
          paddingRight={isSplitLayout ? 1 : 0}
        >
          {/* Scrollable feed of conversation threads */}
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {visibleThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                isThinkingExpanded={isThinkingExpanded}
              />
            ))}
          </Box>

          {/* Telemetry status bar pinned directly above input */}
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

          {/* Interactive prompt input pinned to the bottom */}
          <InputBox
            onSubmit={executeTask}
            isDisabled={status === "running"}
            history={promptHistory}
          />
        </Box>

        {/* Right Dedicated Column: Full-height diff & inspector pane */}
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
