/*
 * App: Central interactive terminal UI for Morpheus.
 * Orchestrates layout, stream rendering, slash commands, modal selectors, and agent turns.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./Header.js";
import { StatusBar } from "./StatusBar.js";
import { DiffColumn, buildRightLines } from "./DiffColumn.js";
import { InputBox } from "./InputBox.js";
import { ModelSelector } from "./ModelSelector.js";
import { SessionSelector } from "./SessionSelector.js";
import { SettingsSelector } from "./SettingsSelector.js";
import { gatherContext } from "../../core/context.js";
import { MORPHEUS_VERSION } from "../../index.js";
import { theme } from "../theme.js";
import type { Thread, ThreadStep, AppProps, FeedLine, RightLine } from "../types.js";
import { MATRIX_QUOTES, buildFullScreenIntro } from "./MatrixIntro.js";
import { buildThreadFeedLines } from "./ThreadFeed.js";
import { useTerminalLayout } from "../hooks/useTerminalLayout.js";
import { useMouseEvents } from "../hooks/useMouseEvents.js";
import { useAgentRunner } from "../hooks/useAgentRunner.js";

export type { Thread, ThreadStep, AppProps, FeedLine };

export function App({
  model,
  isLocal = false,
  baseURL,
  isVerbose = false,
  initialTask,
  maxSteps,
  resumeSessionId,
}: AppProps) {
  const [currentModel, setCurrentModel] = useState(model);
  const [activeModal, setActiveModal] = useState<"none" | "model" | "session" | "settings">("none");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [collapsedThinkingIds, setCollapsedThinkingIds] = useState<Set<string>>(new Set());
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(new Set());
  const [expandedFileEdits, setExpandedFileEdits] = useState<Set<string>>(new Set());
  const [rightScrollTop, setRightScrollTop] = useState(0);
  const [isIntroActive, setIsIntroActive] = useState(!initialTask && !resumeSessionId);
  const [introProgress, setIntroProgress] = useState(0);
  const [introTick, setIntroTick] = useState(0);
  const [matrixQuote] = useState(() => MATRIX_QUOTES[Math.floor(Math.random() * MATRIX_QUOTES.length)]);

  const isModelSelectorOpen = activeModal === "model";
  const setIsModelSelectorOpen = (open: boolean) => setActiveModal(open ? "model" : "none");
  const openModal = (m: "model" | "session" | "settings") => setActiveModal(m);
  const closeModal = () => setActiveModal("none");

  const baseContext = useRef(gatherContext(process.cwd()));
  const initialTaskFired = useRef(false);
  const isUserScrolledRef = useRef(false);
  const maxScrollRef = useRef(0);
  const visibleLinesRef = useRef<FeedLine[]>([]);
  const isRightUserScrolledRef = useRef(false);
  const maxRightScrollRef = useRef(0);
  const visibleRightLinesRef = useRef<RightLine[]>([]);
  const currentRightScrollRef = useRef(0);

  const {
    terminalWidth,
    terminalHeight,
    isSplitLayout,
    leftWidth,
    rightWidth,
    workspaceHeight,
    feedHeight,
    maxLineWidth,
  } = useTerminalLayout();

  const {
    status,
    stepCount,
    elapsedSeconds,
    usage,
    threads,
    setThreads,
    fileEdits,
    findings,
    sessionId,
    loadSessionById,
    resetSession,
    executeTask,
    abort,
  } = useAgentRunner({
    currentModel,
    setCurrentModel,
    setIsModelSelectorOpen,
    baseURL,
    isLocal,
    isVerbose,
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
  });

  useEffect(() => {
    if (!isIntroActive) return;
    const startTime = Date.now();
    const duration = 3200;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawP = Math.min(1, elapsed / duration);
      setIntroProgress(rawP);
      setIntroTick((prev) => prev + 1);
      if (rawP >= 1) {
        clearInterval(interval);
        setTimeout(() => {
          setIsIntroActive(false);
        }, 100);
      }
    }, 33);
    return () => clearInterval(interval);
  }, [isIntroActive]);

  useMouseEvents({
    isIntroActive,
    setIsIntroActive,
    isSplitLayout,
    leftWidth,
    visibleLinesRef,
    visibleRightLinesRef,
    maxScrollRef,
    maxRightScrollRef,
    isUserScrolledRef,
    isRightUserScrolledRef,
    currentRightScrollRef,
    setScrollOffset,
    setRightScrollTop,
    setCollapsedThinkingIds,
    setCollapsedThreadIds,
    setExpandedFileEdits,
    setExpandedToolIds,
  });

  useInput((input, key) => {
    if (isIntroActive) {
      setIsIntroActive(false);
      return;
    }
    if (activeModal !== "none") {
      return;
    }
    if (key.escape && status === "running") {
      abort();
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

  useEffect(() => {
    if (initialTask && !initialTaskFired.current) {
      initialTaskFired.current = true;
      executeTask(initialTask);
    }
  }, []);

  const allFeedLines = useMemo<FeedLine[]>(() => {
    return buildThreadFeedLines({
      threads,
      leftWidth,
      feedHeight,
      maxLineWidth,
      collapsedThinkingIds,
      matrixQuote,
    });
  }, [threads, leftWidth, maxLineWidth, feedHeight, collapsedThinkingIds, matrixQuote]);

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

  visibleLinesRef.current = visibleLines;

  const rightContentWidth = Math.max(16, rightWidth - 1);

  const allRightLines = useMemo<RightLine[]>(() => {
    return buildRightLines(
      threads,
      fileEdits,
      findings,
      baseContext.current.branch,
      baseContext.current.gitStatus,
      expandedToolIds,
      collapsedThreadIds,
      expandedFileEdits,
      rightContentWidth
    );
  }, [threads, fileEdits, findings, expandedToolIds, collapsedThreadIds, expandedFileEdits, rightContentWidth]);

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

  const fullIntroLines = useMemo(() => {
    if (!isIntroActive) return [];
    return buildFullScreenIntro(terminalWidth, terminalHeight, introProgress, introTick, matrixQuote);
  }, [isIntroActive, terminalWidth, terminalHeight, introProgress, introTick, matrixQuote]);

  if (isIntroActive) {
    return (
      <Box
        flexDirection="column"
        width={terminalWidth}
        height={terminalHeight}
        overflow="hidden"
      >
        {fullIntroLines.map((line) => (
          <Box key={line.id} height={1} overflow="hidden">
            {line.node}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      <Header
        version={MORPHEUS_VERSION}
        model={currentModel}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      <Box flexDirection="row" width={terminalWidth} height={workspaceHeight} overflow="hidden">
        {activeModal === "model" ? (
          <Box
            width={terminalWidth}
            height={workspaceHeight}
            alignItems="center"
            justifyContent="center"
          >
            <ModelSelector
              currentModel={currentModel}
              width={Math.min(terminalWidth, 80)}
              onSelect={(selectedId) => {
                setCurrentModel(selectedId);
                closeModal();
                const switchThread: Thread = {
                  id: `thread_${Date.now()}`,
                  index: threads.length + 1,
                  prompt: `/model ${selectedId}`,
                  response: `Switched active model to: \`${selectedId}\`\nAll future turns will route through Neo using this model.`,
                  isStreaming: false,
                  steps: [],
                  isExpanded: false,
                  status: "completed",
                  stepCount: 0,
                  startTime: Date.now(),
                  durationMs: 0,
                };
                setThreads((prev) => [...prev, switchThread]);
              }}
              onClose={closeModal}
            />
          </Box>
        ) : activeModal === "session" ? (
          <Box
            width={terminalWidth}
            height={workspaceHeight}
            alignItems="center"
            justifyContent="center"
          >
            <SessionSelector
              currentSessionId={sessionId}
              width={Math.min(terminalWidth, 80)}
              onSelectSession={async (targetId) => {
                closeModal();
                await loadSessionById(targetId);
              }}
              onNewSession={() => {
                closeModal();
                resetSession();
              }}
              onClose={closeModal}
            />
          </Box>
        ) : activeModal === "settings" ? (
          <Box
            width={terminalWidth}
            height={workspaceHeight}
            alignItems="center"
            justifyContent="center"
          >
            <SettingsSelector
              currentModel={currentModel}
              baseURL={baseURL}
              width={Math.min(terminalWidth, 80)}
              maxSteps={maxSteps}
              sessionId={sessionId}
              onOpenModelSelector={() => openModal("model")}
              onOpenSessionSelector={() => openModal("session")}
              onResetSession={() => {
                resetSession();
                closeModal();
              }}
              onClose={closeModal}
            />
          </Box>
        ) : (
          <>
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
          </>
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
        isDisabled={status === "running" || activeModal !== "none"}
        disabledMessage={
          activeModal === "model"
            ? "selecting model... (use [↑/↓] to navigate, [enter] to select, [esc] to cancel)"
            : activeModal === "session"
            ? "browsing sessions... (use [↑/↓] to navigate, [enter] to resume, [esc] to cancel)"
            : activeModal === "settings"
            ? "settings dashboard... (use [↑/↓] to navigate, [enter] to toggle, [esc] to cancel)"
            : undefined
        }
        history={promptHistory}
        width={terminalWidth}
      />
    </Box>
  );
}
