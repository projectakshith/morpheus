import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import path from "node:path";
import { execSync } from "node:child_process";
import { theme } from "../theme.js";
import { glyphs } from "../glyphs.js";
import type { FileEditRecord } from "../types.js";

export interface DiffModalProps {
  fileEdits: FileEditRecord[];
  selectedFilePath?: string | null;
  width?: number;
  height?: number;
  onClose: () => void;
}

interface ConsolidatedFileDiff {
  filePath: string;
  relPath: string;
  linesAdded: number;
  linesRemoved: number;
  diffLines: string[];
}

export function DiffModal({
  fileEdits,
  selectedFilePath,
  width: customWidth,
  height: customHeight,
  onClose,
}: DiffModalProps) {
  const cwd = process.cwd();
  const width = Math.max(40, customWidth ?? (process.stdout.columns || 80));
  const height = Math.max(10, customHeight ?? (process.stdout.rows || 24));

  const consolidatedFiles = useMemo<ConsolidatedFileDiff[]>(() => {
    const map = new Map<string, ConsolidatedFileDiff>();

    fileEdits.forEach((edit) => {
      const existing = map.get(edit.filePath);
      const relPath = path.isAbsolute(edit.filePath)
        ? path.relative(cwd, edit.filePath)
        : edit.filePath;

      if (!existing) {
        map.set(edit.filePath, {
          filePath: edit.filePath,
          relPath: relPath.startsWith("..") ? edit.filePath : relPath,
          linesAdded: edit.linesAdded,
          linesRemoved: edit.linesRemoved,
          diffLines: edit.diffLines && edit.diffLines.length > 0 ? [...edit.diffLines] : [],
        });
      } else {
        existing.linesAdded += edit.linesAdded;
        existing.linesRemoved += edit.linesRemoved;
        if (edit.diffLines && edit.diffLines.length > 0) {
          existing.diffLines = [...existing.diffLines, ...edit.diffLines];
        }
      }
    });

    if (map.size === 0) {
      try {
        const rawGitDiff = execSync("git diff HEAD", {
          cwd,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();

        if (rawGitDiff) {
          map.set("git_diff", {
            filePath: "git diff HEAD",
            relPath: "git diff HEAD",
            linesAdded: (rawGitDiff.match(/^\+[^+]/gm) || []).length,
            linesRemoved: (rawGitDiff.match(/^-[^-]/gm) || []).length,
            diffLines: rawGitDiff.split("\n"),
          });
        }
      } catch {
      }
    }

    return Array.from(map.values());
  }, [fileEdits, cwd]);

  const initialIndex = useMemo(() => {
    if (!selectedFilePath || consolidatedFiles.length === 0) return 0;
    const foundIdx = consolidatedFiles.findIndex((f) => f.filePath === selectedFilePath);
    return foundIdx !== -1 ? foundIdx : 0;
  }, [selectedFilePath, consolidatedFiles]);

  const [activeFileIndex, setActiveFileIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);

  const activeFile = consolidatedFiles[activeFileIndex];
  const diffLines = activeFile ? activeFile.diffLines : [];

  const viewHeight = Math.max(4, height - 7);
  const maxScroll = Math.max(0, diffLines.length - viewHeight);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (key.leftArrow || input === "h") {
      if (consolidatedFiles.length > 0) {
        setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : consolidatedFiles.length - 1));
        setScrollOffset(0);
      }
      return;
    }

    if (key.rightArrow || input === "l" || key.tab) {
      if (consolidatedFiles.length > 0) {
        setActiveFileIndex((prev) => (prev < consolidatedFiles.length - 1 ? prev + 1 : 0));
        setScrollOffset(0);
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      return;
    }

    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - 8));
      return;
    }

    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 8));
      return;
    }

    if (key.return) {
      onClose();
      return;
    }
  });

  const visibleDiffLines = diffLines.slice(scrollOffset, scrollOffset + viewHeight);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      backgroundColor={theme.bgColumn}
    >
      <Box height={1} width="100%" justifyContent="space-between">
        <Text color={theme.accentBright} bold>
          {glyphs.prompt} CHANGED FILES & CODE INSPECTOR
        </Text>
        <Text color={theme.muted}>
          [←/→] file · [↑/↓] scroll · [esc] close
        </Text>
      </Box>

      <Box height={1} width="100%">
        <Text color={theme.border}>{"─".repeat(Math.max(10, width - 4))}</Text>
      </Box>

      {consolidatedFiles.length === 0 ? (
        <Box height={viewHeight} alignItems="center" justifyContent="center">
          <Text color={theme.muted} italic>
            No file modifications recorded in this session.
          </Text>
        </Box>
      ) : (
        <>
          <Box height={1} width="100%" overflow="hidden">
            <Text wrap="truncate-end">
              {consolidatedFiles.map((file, idx) => {
                const isActive = idx === activeFileIndex;
                const tabLabel = ` ${idx + 1}. ${file.relPath} (+${file.linesAdded} -${file.linesRemoved}) `;
                return (
                  <Text
                    key={file.filePath}
                    backgroundColor={isActive ? theme.accent : theme.bg}
                    color={isActive ? theme.bg : theme.secondary}
                    bold={isActive}
                  >
                    {tabLabel}
                  </Text>
                );
              })}
            </Text>
          </Box>

          <Box height={1} width="100%" justifyContent="space-between" marginTop={0}>
            <Text color={theme.text} bold>
              {activeFile?.relPath}
            </Text>
            <Text color={theme.muted}>
              lines {scrollOffset + 1}-{Math.min(diffLines.length, scrollOffset + viewHeight)} of {diffLines.length}
            </Text>
          </Box>

          <Box flexDirection="column" height={viewHeight} overflow="hidden">
            {visibleDiffLines.map((line, idx) => {
              const isAdd = line.startsWith("+") && !line.startsWith("+++");
              const isRem = line.startsWith("-") && !line.startsWith("---");
              const isHunk = line.startsWith("@@");
              const isHeader = line.startsWith("---") || line.startsWith("+++");

              const col = isAdd
                ? theme.secondary
                : isRem
                ? theme.error
                : isHunk
                ? theme.accent
                : isHeader
                ? theme.warning
                : theme.text;

              const bgCol = isAdd ? theme.bgDiffAdd : isRem ? theme.bgDiffRemove : undefined;
              const contentPad = bgCol ? Math.max(0, width - 4 - line.length) : 0;

              return (
                <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                  <Text color={col} backgroundColor={bgCol} wrap="truncate-end">
                    {line}
                    {bgCol && contentPad > 0 ? " ".repeat(contentPad) : ""}
                  </Text>
                </Box>
              );
            })}
            {Array.from({ length: Math.max(0, viewHeight - visibleDiffLines.length) }).map((_, idx) => (
              <Box key={`pad_${idx}`} height={1}>
                <Text color={theme.muted}> </Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      <Box height={1} width="100%" justifyContent="space-between" marginTop={0}>
        <Text color={theme.muted}>
          Press <Text color={theme.accent}>[Esc]</Text> or <Text color={theme.accent}>[q]</Text> to return to chat
        </Text>
        <Text color={theme.secondary}>
          {consolidatedFiles.length} {consolidatedFiles.length === 1 ? "file" : "files"} changed
        </Text>
      </Box>
    </Box>
  );
}
