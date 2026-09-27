import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { Thinking } from "./Thinking";
import { ToolCard } from "./ToolCard";
import { MessageCard } from "./MessageCard";
import { InputBox } from "./InputBox";
import { runAgent } from "../../core/agent";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types";
import { isToolError } from "../../utils/errors";

export interface FeedItem {
  id: string;
  type: "user" | "thinking" | "tool" | "assistant";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  outputSummary?: string;
  outputPreview?: string[];
  durationMs?: number;
}

export interface AppProps {
  model: string;
  isLocal?: boolean;
  baseURL?: string;
  isVerbose?: boolean;
  initialTask?: string;
}

/* Root interactive Ink application with Vercel-inspired monochrome layout and visual hierarchy */
export function App({ model, isLocal = false, baseURL, isVerbose = false, initialTask }: AppProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<"idle" | "running" | "aborted" | "error">(
    initialTask ? "running" : "idle"
  );
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const baseContext = useRef(gatherContext(process.cwd()));
  const initialTaskFired = useRef(false);

  /* Handle global shortcut keys */
  useInput((input, key) => {
    if (key.escape && status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
      return;
    }

    if (key.tab) {
      setIsThinkingExpanded((prev) => !prev);
      return;
    }
  });

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    setPromptHistory((prev) => [...prev, taskText]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    /* Append user message card to feed */
    const userItemId = `user_${Date.now()}`;
    setFeedItems((prev) => [
      ...prev,
      { id: userItemId, type: "user", content: taskText },
    ]);

    let activeThinkingId: string | null = null;
    let activeAssistantId: string | null = null;
    let activeToolId: string | null = null;
    let thinkingStartTime = 0;

    try {
      const result = await runAgent(taskText, history, {
        abortSignal: abortController.signal,
        model,
        isLocal,
        baseURL,
        verbose: isVerbose,
        findings,
        onStepStart: (step) => {
          setStepCount(step);
        },
        onReasoningDelta: (chunk) => {
          if (!activeThinkingId) {
            activeThinkingId = `think_${Date.now()}`;
            thinkingStartTime = Date.now();
            setFeedItems((prev) => [
              ...prev,
              {
                id: activeThinkingId!,
                type: "thinking",
                content: chunk,
                isStreaming: true,
                durationMs: 0,
              },
            ]);
          } else {
            const currentId = activeThinkingId;
            setFeedItems((prev) =>
              prev.map((item) =>
                item.id === currentId
                  ? {
                      ...item,
                      content: (item.content || "") + chunk,
                      durationMs: Date.now() - thinkingStartTime,
                    }
                  : item
              )
            );
          }
        },
        onToolCall: (name, toolArgs) => {
          /* Close active thinking stream when a tool is invoked */
          if (activeThinkingId) {
            const currentThinkId = activeThinkingId;
            setFeedItems((prev) =>
              prev.map((item) =>
                item.id === currentThinkId ? { ...item, isStreaming: false } : item
              )
            );
            activeThinkingId = null;
          }

          activeToolId = `tool_${Date.now()}_${name}`;
          setFeedItems((prev) => [
            ...prev,
            {
              id: activeToolId!,
              type: "tool",
              name,
              args: toolArgs,
              isRunning: true,
            },
          ]);
        },
        onToolResult: (name, res) => {
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          const lines = res.output.trim().split("\n").filter(Boolean);
          const outputSummary = `${lines.length} lines output`;
          const currentToolId = activeToolId;

          setFeedItems((prev) =>
            prev.map((item) =>
              item.id === currentToolId
                ? {
                    ...item,
                    isRunning: false,
                    isError,
                    outputSummary,
                    outputPreview: lines.slice(0, 4),
                  }
                : item
            )
          );
          activeToolId = null;
        },
        onTextDelta: (chunk) => {
          /* Close thinking stream if still open */
          if (activeThinkingId) {
            const currentThinkId = activeThinkingId;
            setFeedItems((prev) =>
              prev.map((item) =>
                item.id === currentThinkId ? { ...item, isStreaming: false } : item
              )
            );
            activeThinkingId = null;
          }

          if (!activeAssistantId) {
            activeAssistantId = `asst_${Date.now()}`;
            setFeedItems((prev) => [
              ...prev,
              {
                id: activeAssistantId!,
                type: "assistant",
                content: chunk,
                isStreaming: true,
              },
            ]);
          } else {
            const currentAsstId = activeAssistantId;
            setFeedItems((prev) =>
              prev.map((item) =>
                item.id === currentAsstId
                  ? { ...item, content: (item.content || "") + chunk }
                  : item
              )
            );
          }
        },
      });

      /* Close active assistant stream */
      if (activeAssistantId) {
        const currentAsstId = activeAssistantId;
        setFeedItems((prev) =>
          prev.map((item) =>
            item.id === currentAsstId ? { ...item, isStreaming: false } : item
          )
        );
      }

      setHistory(result.messages);
      if (result.findings) {
        setFindings(result.findings);
      }
      setUsage(result.usage);
      setStatus(result.aborted ? "aborted" : "idle");

      if (initialTask) {
        setTimeout(() => exit(), 500);
      }
    } catch (err: unknown) {
      setStatus("error");
      setFeedItems((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          type: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
      if (initialTask) {
        setTimeout(() => exit(), 500);
      }
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

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header
        version={MORPHEUS_VERSION}
        model={model}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
      />

      <Box flexDirection="column">
        {feedItems.map((item) => {
          if (item.type === "user") {
            return <MessageCard key={item.id} role="user" content={item.content || ""} />;
          }
          if (item.type === "thinking") {
            return (
              <Thinking
                key={item.id}
                content={item.content || ""}
                isStreaming={item.isStreaming}
                isExpanded={isThinkingExpanded}
                durationMs={item.durationMs}
              />
            );
          }
          if (item.type === "tool") {
            return (
              <ToolCard
                key={item.id}
                name={item.name || "tool"}
                args={item.args || {}}
                isRunning={item.isRunning}
                isError={item.isError}
                outputSummary={item.outputSummary}
                outputPreview={item.outputPreview}
              />
            );
          }
          if (item.type === "assistant") {
            return (
              <MessageCard
                key={item.id}
                role="assistant"
                content={item.content || ""}
                isStreaming={item.isStreaming}
              />
            );
          }
          return null;
        })}
      </Box>

      <StatusBar
        status={status}
        stepCount={stepCount}
        usage={usage}
        elapsedSeconds={elapsedSeconds}
        isThinkingExpanded={isThinkingExpanded}
      />

      {!initialTask && (
        <InputBox
          onSubmit={executeTask}
          isDisabled={status === "running"}
          history={promptHistory}
        />
      )}
    </Box>
  );
}
