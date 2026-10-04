/*
 * App: Central interactive terminal UI for Morpheus.
 * Orchestrates layout, stream rendering, slash commands, modal selectors, and agent turns.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { DiffColumn, RIGHT_FOOTER_HEIGHT } from "./DiffColumn";
import { buildActivityLines } from "./activity/buildActivityLines";
import { greetingName } from "../intro/greeting";
import { InputBox, POPUP_TOTAL_HEIGHT } from "./InputBox";
import { ModelSelector, AVAILABLE_MODELS } from "./ModelSelector";
import { SessionSelector } from "./SessionSelector";
import { SettingsSelector } from "./SettingsSelector";
import { NeoModal } from "./NeoModal";
import { UsageModal } from "./UsageModal";
import { DiffModal } from "./DiffModal";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import { theme } from "../theme";
import type { Thread, ThreadStep, AppProps, FeedLine, RightLine } from "../types";
import { MATRIX_QUOTES, buildFullScreenIntro } from "./MatrixIntro";
import { buildThreadFeedLines } from "./ThreadFeed";
import { useTerminalLayout } from "../hooks/useTerminalLayout";
import { useMouseEvents } from "../hooks/useMouseEvents";
import { useAgentRunner } from "../hooks/useAgentRunner";
import { useStreamReveal, REDUCED_MOTION } from "../hooks/useStreamReveal";
import type { SubagentRole } from "../../core/types";
import { loadSubagentModels, saveSubagentModels } from "../../core/userSettings";
import { isCloudEndpoint } from "../../runtime";
import { loadPromptHistory, savePromptHistory } from "../../core/promptHistory";

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
  const [subagentModels, setSubagentModels] = useState(() => loadSubagentModels());
  const [workerModelSaveError, setWorkerModelSaveError] = useState(false);
  const [workerModelRole, setWorkerModelRole] = useState<SubagentRole | null>(null);
  const [activeModal, setActiveModal] = useState<"none" | "model" | "session" | "settings" | "diff" | "neo" | "usage">("none");
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [promptHistory, setPromptHistory] = useState<string[]>(() => loadPromptHistory());
  const loadedHistoryLength = useRef(promptHistory.length);
  useEffect(() => {
    if (promptHistory.length === loadedHistoryLength.current) return;
    loadedHistoryLength.current = promptHistory.length;
    savePromptHistory(promptHistory);
  }, [promptHistory]);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(new Set());
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(new Set());
  const [expandedFileEdits, setExpandedFileEdits] = useState<Set<string>>(new Set());
  const [rightScrollTop, setRightScrollTop] = useState(0);
  const [isIntroActive, setIsIntroActive] = useState(!initialTask && !resumeSessionId);
  const [introProgress, setIntroProgress] = useState(0);
  const [introTick, setIntroTick] = useState(0);
  const greetName = useMemo(() => greetingName(), []);
  const [matrixQuote] = useState(() => MATRIX_QUOTES[Math.floor(Math.random() * MATRIX_QUOTES.length)]);
  const persistSubagentModels = (models: typeof subagentModels) => {
    void saveSubagentModels(models).then(
      () => setWorkerModelSaveError(false),
      () => setWorkerModelSaveError(true),
    );
  };

  const isModelSelectorOpen = activeModal === "model";
  const setIsModelSelectorOpen = (open: boolean) => setActiveModal(open ? "model" : "none");
  const openModal = (m: "model" | "session" | "settings" | "diff" | "neo" | "usage") => setActiveModal(m);
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

  const [stepBudget, setStepBudget] = useState<number | undefined>(maxSteps);

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
    sessionTitle,
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
    maxSteps: stepBudget,
    subagentModels,
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

  const onCloud = !isLocal && isCloudEndpoint(baseURL);
  useEffect(() => {
    if (!onCloud) return;
    const notice: Thread = {
      id: "thread_cloud_notice",
      index: 0,
      prompt: "morpheus cloud",
      response: [
        "Running on **Morpheus Cloud**: a shared demo model with a hard spending cap, served through OpenRouter.",
        "",
        "- Your prompts and the code the agent reads are sent through the Morpheus Cloud proxy to OpenRouter.",
        "- `/model` switches between the cloud models.",
        "- Set `OPENROUTER_API_KEY` or `MORPHEUS_BASE_URL` to use your own provider, or run `morpheus --local` for Ollama.",
        "- If the cap is used up, requests fail until it is topped up.",
      ].join("\n"),
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };
    setThreads((prev) => (prev.some((t) => t.id === notice.id) ? prev : [notice, ...prev]));
  }, [onCloud, setThreads]);

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
    activeModal,
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

  const revealThread = useMemo(
    () => [...threads].reverse().find((t) => t.status === "running") ?? threads[threads.length - 1],
    [threads]
  );
  const reveal = useStreamReveal(
    revealThread?.response ?? "",
    Boolean(revealThread?.isStreaming),
    !REDUCED_MOTION,
    revealThread?.id
  );

  const allFeedLines = useMemo<FeedLine[]>(() => {
    return buildThreadFeedLines({
      threads,
      leftWidth,
      feedHeight,
      maxLineWidth,
      expandedThinkingIds,
      matrixQuote,
      elapsedSeconds,
      streamReveal: revealThread
        ? { threadId: revealThread.id, text: reveal.text, glow: reveal.glow }
        : undefined,
    });
  }, [threads, leftWidth, maxLineWidth, feedHeight, expandedThinkingIds, matrixQuote, elapsedSeconds, revealThread, reveal.text, reveal.glow]);

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

  const rightColumnScrollableHeight = Math.max(1, effectiveWorkspaceHeight - RIGHT_FOOTER_HEIGHT);

  const allRightLines = useMemo<RightLine[]>(() => {
    return buildActivityLines({
      threads,
      edits: fileEdits,
      width: rightContentWidth - 1,
      toggledIds: expandedToolIds,
      openedTurnIds: collapsedThreadIds,
    });
  }, [threads, fileEdits, expandedToolIds, collapsedThreadIds, rightContentWidth, elapsedSeconds]);

  const maxRightScroll = Math.max(0, allRightLines.length - rightColumnScrollableHeight);
  maxRightScrollRef.current = maxRightScroll;

  const effectiveRightScroll = isRightUserScrolledRef.current
    ? Math.min(rightScrollTop, maxRightScroll)
    : maxRightScroll;
  currentRightScrollRef.current = effectiveRightScroll;

  const visibleRightLines = useMemo(
    () => allRightLines.slice(effectiveRightScroll, effectiveRightScroll + rightColumnScrollableHeight),
    [allRightLines, effectiveRightScroll, rightColumnScrollableHeight]
  );

  visibleRightLinesRef.current = visibleRightLines;

  const fullIntroLines = useMemo(() => {
    if (!isIntroActive) return [];
    return buildFullScreenIntro(terminalWidth, terminalHeight, introProgress, introTick, matrixQuote, REDUCED_MOTION ? undefined : greetName);
  }, [isIntroActive, terminalWidth, terminalHeight, introProgress, introTick, matrixQuote, greetName]);

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
        cloud={onCloud}
      />

      <Box flexDirection="row" width={terminalWidth} height={effectiveWorkspaceHeight} overflow="hidden">
        {activeModal === "model" ? (
          <ModelSelector
            currentModel={workerModelRole ? subagentModels[workerModelRole] ?? currentModel : currentModel}
            selectionContext={workerModelRole ? `${workerModelRole} worker` : undefined}
            onInherit={workerModelRole ? () => {
              const next = { ...subagentModels };
              delete next[workerModelRole];
              setSubagentModels(next);
              persistSubagentModels(next);
              setWorkerModelRole(null);
              setActiveModal("settings");
            } : undefined}
            usage={usage}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
            baseURL={baseURL}
            onSelect={(selectedId) => {
              if (workerModelRole) {
                const next = { ...subagentModels, [workerModelRole]: selectedId };
                setSubagentModels(next);
                persistSubagentModels(next);
                setWorkerModelRole(null);
                setActiveModal("settings");
                return;
              }
              setCurrentModel(selectedId);
              closeModal();
              const switchThread: Thread = {
                id: `thread_${Date.now()}`,
                index: threads.length + 1,
                prompt: `/model ${selectedId}`,
                response: `switched active model to: \`${selectedId}\`\nall future turns will route through neo using this model.`,
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
            onClose={workerModelRole ? () => {
              setWorkerModelRole(null);
              setActiveModal("settings");
            } : closeModal}
          />
        ) : activeModal === "session" ? (
          <SessionSelector
            currentSessionId={sessionId}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
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
        ) : activeModal === "settings" ? (
          <SettingsSelector
            currentModel={currentModel}
            baseURL={baseURL}
            usage={usage}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
            maxSteps={stepBudget}
            onUpdateMaxSteps={setStepBudget}
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            onOpenModelSelector={() => openModal("model")}
            onOpenWorkerModelSelector={(role) => {
              setWorkerModelRole(role);
              openModal("model");
            }}
            subagentModels={subagentModels}
            workerModelSaveError={workerModelSaveError}
            onOpenSessionSelector={() => openModal("session")}
            onOpenNeoModal={() => openModal("neo")}
            onOpenUsageModal={() => openModal("usage")}
            onResetSession={() => {
              resetSession();
              closeModal();
            }}
            onClose={closeModal}
          />
        ) : activeModal === "neo" ? (
          <NeoModal
            baseURL={baseURL}
            currentModel={currentModel}
            usage={usage}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
            onOpenModelSelector={() => openModal("model")}
            onOpenSettings={() => openModal("settings")}
            onClose={closeModal}
          />
        ) : activeModal === "usage" ? (
          <UsageModal
            currentModel={currentModel}
            usage={usage}
            baseURL={baseURL}
            sessionId={sessionId}
            width={terminalWidth}
            height={effectiveWorkspaceHeight}
            onOpenModelSelector={() => openModal("model")}
            onClose={closeModal}
            threads={threads}
            fileEdits={fileEdits}
          />
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
                  maxSteps: stepBudget,
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
          maxSteps={stepBudget}
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
