/*
 * App: Central interactive terminal UI for Morpheus.
 * Orchestrates layout, stream rendering, slash commands, modal selectors, and agent turns.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./Header.js";
import { StatusBar } from "./StatusBar.js";
import { DiffColumn, buildRightLines } from "./DiffColumn.js";
import { InputBox, POPUP_TOTAL_HEIGHT } from "./InputBox.js";
import { ModelSelector, AVAILABLE_MODELS } from "./ModelSelector.js";
import { SessionSelector } from "./SessionSelector.js";
import { SettingsSelector } from "./SettingsSelector.js";
import { DiffModal } from "./DiffModal.js";
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
  const [activeModal, setActiveModal] = useState<"none" | "model" | "session" | "settings" | "diff">("none");
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(new Set());
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(new Set());
  const [expandedFileEdits, setExpandedFileEdits] = useState<Set<string>>(new Set());
  const [rightScrollTop, setRightScrollTop] = useState(0);
  const [isIntroActive, setIsIntroActive] = useState(!initialTask && !resumeSessionId);
  const [introProgress, setIntroProgress] = useState(0);
  const [introTick, setIntroTick] = useState(0);
  const [matrixQuote] = useState(() => MATRIX_QUOTES[Math.floor(Math.random() * MATRIX_QUOTES.length)]);

  const isModelSelectorOpen = activeModal === "model";
  const setIsModelSelectorOpen = (open: boolean) => setActiveModal(open ? "model" : "none");
  const openModal = (m: "model" | "session" | "settings" | "diff") => setActiveModal(m);
  const closeModal = () => {
    setActiveModal("none");
    setSelectedDiffFile(null);
  };
  const openDiffModal = (filePath?: string) => {
    if (filePath) setSelectedDiffFile(filePath);
    setActiveModal("diff");
  };

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
    queuedCount,
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

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupHeight = isPopupOpen ? POPUP_TOTAL_HEIGHT : 0;
  const effectiveWorkspaceHeight = Math.max(4, workspaceHeight - popupHeight);
  const effectiveFeedHeight = effectiveWorkspaceHeight;

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
    setExpandedThinkingIds,
    setCollapsedThreadIds,
    setExpandedFileEdits,
    setExpandedToolIds,
    onOpenFileDiff: openDiffModal,
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

  const handleTab = () => {
    for (let i = threads.length - 1; i >= 0; i--) {
      const t = threads[i];
      const thinkSteps = t.steps.filter((s) => s.type === "thinking");
      if (thinkSteps.length > 0) {
        const lastStep = thinkSteps[thinkSteps.length - 1];
        setExpandedThinkingIds((prev) => {
          const next = new Set(prev);
          if (next.has(lastStep.id)) {
            next.delete(lastStep.id);
          } else {
            next.add(lastStep.id);
          }
          return next;
        });
        return;
      }
    }
  };

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
      expandedThinkingIds,
      matrixQuote,
      elapsedSeconds,
    });
  }, [threads, leftWidth, maxLineWidth, feedHeight, expandedThinkingIds, matrixQuote, elapsedSeconds]);

  const maxScroll = Math.max(0, allFeedLines.length - effectiveFeedHeight);
  maxScrollRef.current = maxScroll;

  const visibleLines = useMemo(() => {
    const total = allFeedLines.length;
    if (total <= effectiveFeedHeight) {
      return allFeedLines;
    }
    const clampedOffset = Math.min(scrollOffset, maxScroll);
    const startIndex = Math.max(0, total - effectiveFeedHeight - clampedOffset);
    return allFeedLines.slice(startIndex, startIndex + effectiveFeedHeight);
  }, [allFeedLines, scrollOffset, effectiveFeedHeight, maxScroll]);

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

  const PINNED_RIGHT_HEADER_COUNT = 2;

  const pinnedRightHeaders = useMemo(() => {
    return allRightLines.slice(0, PINNED_RIGHT_HEADER_COUNT);
  }, [allRightLines]);

  const scrollableRightLines = useMemo(() => {
    return allRightLines.slice(PINNED_RIGHT_HEADER_COUNT);
  }, [allRightLines]);

  const rightColumnScrollableHeight = Math.max(1, effectiveWorkspaceHeight - 3 - PINNED_RIGHT_HEADER_COUNT);
  const maxRightScroll = Math.max(0, scrollableRightLines.length - rightColumnScrollableHeight);
  maxRightScrollRef.current = maxRightScroll;

  const effectiveRightScroll = Math.min(rightScrollTop, maxRightScroll);
  currentRightScrollRef.current = effectiveRightScroll;

  const visibleRightLines = useMemo(() => {
    const visibleScrollable = scrollableRightLines.slice(
      effectiveRightScroll,
      effectiveRightScroll + rightColumnScrollableHeight
    );
    return [...pinnedRightHeaders, ...visibleScrollable];
  }, [pinnedRightHeaders, scrollableRightLines, effectiveRightScroll, rightColumnScrollableHeight]);

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

      <Box flexDirection="row" width={terminalWidth} height={effectiveWorkspaceHeight} overflow="hidden">
        {activeModal === "model" ? (
          <Box
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
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
            height={effectiveWorkspaceHeight}
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
            height={effectiveWorkspaceHeight}
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
        ) : activeModal === "diff" ? (
          <DiffModal
            fileEdits={fileEdits}
            selectedFilePath={selectedDiffFile}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
            onClose={closeModal}
          />
        ) : (
          <>
            <Box
              flexDirection="column"
              width={leftWidth}
              height={effectiveWorkspaceHeight}
            >
              <Box flexDirection="column" height={effectiveFeedHeight} overflow="hidden">
                {visibleLines.map((line) => (
                  <Box key={line.id} height={1} overflow="hidden">
                    {line.node}
                  </Box>
                ))}
                {Array.from({ length: Math.max(0, effectiveFeedHeight - visibleLines.length) }).map((_, idx) => (
                  <Box key={`feed_pad_${idx}`} height={1} overflow="hidden">
                    <Text backgroundColor={theme.bg}>{" ".repeat(leftWidth)}</Text>
                  </Box>
                ))}
              </Box>
            </Box>

            {isSplitLayout && (
              <DiffColumn
                width={rightWidth}
                height={effectiveWorkspaceHeight}
                lines={visibleRightLines}
                statusInfo={{
                  status,
                  stepCount,
                  maxSteps,
                  usage,
                  elapsedSeconds,
                  queueCount: queuedCount,
                }}
              />
            )}
          </>
        )}
      </Box>

      {!isSplitLayout && (
        <StatusBar
          status={status}
          stepCount={stepCount}
          maxSteps={maxSteps}
          usage={usage}
          elapsedSeconds={elapsedSeconds}
          width={terminalWidth}
          scrollOffset={scrollOffset}
          queueCount={queuedCount}
        />
      )}

      <InputBox
        onSubmit={executeTask}
        isDisabled={activeModal !== "none"}
        disabledMessage={
          activeModal === "model"
            ? "selecting model... (use [↑/↓] to navigate, [enter] to select, [esc] to cancel)"
            : activeModal === "session"
            ? "browsing sessions... (use [↑/↓] to navigate, [enter] to resume, [esc] to cancel)"
            : activeModal === "settings"
            ? "settings dashboard... (use [↑/↓] to navigate, [enter] to toggle, [esc] to cancel)"
            : activeModal === "diff"
            ? "code & diff inspector... (use [Tab] to toggle pane, [↑/↓] to scroll/select, [←/→] switch files, [esc] to close)"
            : undefined
        }
        placeholder={
          status === "running"
            ? queuedCount > 0
              ? ` [${queuedCount} queued] type prompt to queue or run /command...`
              : " agent working · type prompt to queue or run /command..."
            : undefined
        }
        history={promptHistory}
        width={terminalWidth}
        availableModels={AVAILABLE_MODELS.map((m) => m.id)}
        cwd={process.cwd()}
        onPopupOpenChange={setIsPopupOpen}
        onTab={handleTab}
      />
    </Box>
  );
}
