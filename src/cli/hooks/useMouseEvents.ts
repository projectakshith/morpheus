/*
 * useMouseEvents: Hook to handle terminal mouse reporting, click interactions, and scrolling.
 */

import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import type { FeedLine, RightLine } from "../types.js";

export interface MouseEventsOptions {
  isIntroActive: boolean;
  setIsIntroActive: Dispatch<SetStateAction<boolean>>;
  isSplitLayout: boolean;
  leftWidth: number;
  visibleLinesRef: MutableRefObject<FeedLine[]>;
  visibleRightLinesRef: MutableRefObject<RightLine[]>;
  maxScrollRef: MutableRefObject<number>;
  maxRightScrollRef: MutableRefObject<number>;
  isUserScrolledRef: MutableRefObject<boolean>;
  isRightUserScrolledRef: MutableRefObject<boolean>;
  currentRightScrollRef: MutableRefObject<number>;
  setScrollOffset: Dispatch<SetStateAction<number>>;
  setRightScrollTop: Dispatch<SetStateAction<number>>;
  setCollapsedThinkingIds?: Dispatch<SetStateAction<Set<string>>>;
  setExpandedThinkingIds?: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedThreadIds: Dispatch<SetStateAction<Set<string>>>;
  setExpandedFileEdits: Dispatch<SetStateAction<Set<string>>>;
  setExpandedToolIds: Dispatch<SetStateAction<Set<string>>>;
  onOpenFileDiff?: (filePath: string) => void;
}

export function useMouseEvents({
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
  setExpandedThinkingIds,
  setCollapsedThreadIds,
  setExpandedFileEdits,
  setExpandedToolIds,
  onOpenFileDiff,
}: MouseEventsOptions): void {
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

        if (isIntroActive) {
          if (button === 0 && !isRelease) {
            setIsIntroActive(false);
          }
          return;
        }

        if (isSplitLayout && col > leftWidth) {
          if (button === 64) {
            setRightScrollTop((prev) => Math.max(0, prev - 2));
            isRightUserScrolledRef.current = true;
          } else if (button === 65) {
            setRightScrollTop((prev) => Math.min(maxRightScrollRef.current, prev + 2));
            isRightUserScrolledRef.current = true;
          } else if (button === 0 && !isRelease) {
            const workspaceRow = row - 3;
            if (workspaceRow >= 0 && workspaceRow < visibleRightLinesRef.current.length) {
              const clickedLine = visibleRightLinesRef.current[workspaceRow];
              if (clickedLine?.threadId) {
                const tId = clickedLine.threadId;
                setRightScrollTop(currentRightScrollRef.current);
                isRightUserScrolledRef.current = true;
                setCollapsedThreadIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(tId)) {
                    next.delete(tId);
                  } else {
                    next.add(tId);
                  }
                  return next;
                });
              } else if (clickedLine?.editFilePath) {
                const fp = clickedLine.editFilePath;
                if (onOpenFileDiff) {
                  onOpenFileDiff(fp);
                } else {
                  setRightScrollTop(currentRightScrollRef.current);
                  isRightUserScrolledRef.current = true;
                  setExpandedFileEdits((prev) => {
                    const next = new Set(prev);
                    if (next.has(fp)) {
                      next.delete(fp);
                    } else {
                      next.add(fp);
                    }
                    return next;
                  });
                }
              } else if (clickedLine?.toolId) {
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
          } else if (button === 0 && !isRelease) {
            const workspaceRow = row - 3;
            if (workspaceRow >= 0 && workspaceRow < visibleLinesRef.current.length) {
              const clickedLine = visibleLinesRef.current[workspaceRow];
              if (clickedLine?.stepId) {
                const sId = clickedLine.stepId;
                const toggle = (prev: Set<string>) => {
                  const next = new Set(prev);
                  if (next.has(sId)) {
                    next.delete(sId);
                  } else {
                    next.add(sId);
                  }
                  return next;
                };
                if (setExpandedThinkingIds) {
                  setExpandedThinkingIds(toggle);
                } else if (setCollapsedThinkingIds) {
                  setCollapsedThinkingIds(toggle);
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
        process.stdout.write("\x1b]111\x07");
        process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      } catch {}
      process.stdin.off("data", onData);
    };

    process.on("exit", cleanup);
    return cleanup;
  }, [leftWidth, isSplitLayout, isIntroActive]);
}
