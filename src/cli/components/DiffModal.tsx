import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import path from "node:path";
import { execSync } from "node:child_process";
import { theme } from "../theme.js";
import { glyphs } from "../glyphs.js";
import { highlightCode, getLangFromPath } from "../highlight.js";
import { visibleLength } from "../utils/text.js";
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

export interface ParsedDiffLine {
  raw: string;
  type: "add" | "rem" | "ctx" | "hunk" | "header";
  oldNum?: number;
  newNum?: number;
  marker: string;
  codeText: string;
}

export function parseDiffLines(diffLines: string[]): { parsed: ParsedDiffLine[]; maxLineNum: number } {
  const parsed: ParsedDiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let maxNum = 1;

  for (const raw of diffLines) {
    const hunkMatch = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      maxNum = Math.max(maxNum, oldLine, newLine);
      parsed.push({
        raw,
        type: "hunk",
        codeText: raw,
        marker: "@@",
      });
      continue;
    }

    if (
      raw.startsWith("---") ||
      raw.startsWith("+++") ||
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("new file mode") ||
      raw.startsWith("deleted file mode") ||
      raw.startsWith("similarity index")
    ) {
      parsed.push({
        raw,
        type: "header",
        codeText: raw,
        marker: " ",
      });
      continue;
    }

    if (raw.startsWith("+")) {
      const curNew = newLine++;
      maxNum = Math.max(maxNum, curNew);
      parsed.push({
        raw,
        type: "add",
        newNum: curNew,
        marker: "+",
        codeText: raw.slice(1),
      });
      continue;
    }

    if (raw.startsWith("-")) {
      const curOld = oldLine++;
      maxNum = Math.max(maxNum, curOld);
      parsed.push({
        raw,
        type: "rem",
        oldNum: curOld,
        marker: "-",
        codeText: raw.slice(1),
      });
      continue;
    }

    const codeText = raw.startsWith(" ") ? raw.slice(1) : raw;
    const curOld = oldLine++;
    const curNew = newLine++;
    maxNum = Math.max(maxNum, curOld, curNew);
    parsed.push({
      raw,
      type: "ctx",
      oldNum: curOld,
      newNum: curNew,
      marker: " ",
      codeText,
    });
  }

  return { parsed, maxLineNum: maxNum };
}

function formatTabName(relPath: string, allPaths: string[]): string {
  const base = path.basename(relPath);
  const duplicates = allPaths.filter((p) => path.basename(p) === base);
  if (duplicates.length > 1) {
    const parent = path.basename(path.dirname(relPath));
    return parent ? `${parent}/${base}` : relPath;
  }
  return base || relPath;
}

export function DiffModal({
  fileEdits,
  selectedFilePath,
  width: customWidth,
  height: customHeight,
  onClose,
}: DiffModalProps) {
  const cwd = process.cwd();
  const width = Math.max(50, customWidth ?? (process.stdout.columns || 80));
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
          const fileChunks = rawGitDiff.split(/^diff --git /m).filter(Boolean);
          if (fileChunks.length > 0) {
            fileChunks.forEach((chunk) => {
              const chunkLines = ("diff --git " + chunk).split("\n");
              const firstLine = chunkLines[0];
              const match = firstLine.match(/diff --git a\/(.+?)\s+b\/(.+)/);
              const fileP = match ? match[2] : "git_diff";
              const added = (chunk.match(/^\+[^+]/gm) || []).length;
              const removed = (chunk.match(/^-[^-]/gm) || []).length;
              map.set(fileP, {
                filePath: fileP,
                relPath: fileP,
                linesAdded: added,
                linesRemoved: removed,
                diffLines: chunkLines,
              });
            });
          } else {
            map.set("git_diff", {
              filePath: "git diff HEAD",
              relPath: "git diff HEAD",
              linesAdded: (rawGitDiff.match(/^\+[^+]/gm) || []).length,
              linesRemoved: (rawGitDiff.match(/^-[^-]/gm) || []).length,
              diffLines: rawGitDiff.split("\n"),
            });
          }
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
  const [focusedPane, setFocusedPane] = useState<"code" | "files">("code");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [fileScrollOffset, setFileScrollOffset] = useState(0);

  const activeFile = consolidatedFiles[activeFileIndex];
  const diffLines = activeFile ? activeFile.diffLines : [];

  const { parsed: parsedLines, maxLineNum } = useMemo(
    () => parseDiffLines(diffLines),
    [diffLines]
  );

  // Layout geometry: Full screen split pane
  // Overhead: Top bar (1) + Top divider (1) + Bottom divider (1) + Bottom status (1) = 4 lines
  const bodyHeight = Math.max(4, height - 4);
  const rightWidth = Math.max(26, Math.min(38, Math.floor(width * 0.28)));
  const leftWidth = Math.max(30, width - rightWidth - 1);

  // Left code pane vertical allocation
  // Subheader (1) + Gutter header (1) = 2 lines
  const codeViewHeight = Math.max(2, bodyHeight - 2);
  const maxScroll = Math.max(0, parsedLines.length - codeViewHeight);

  // Right files pane vertical allocation
  const showFileDetails = bodyHeight >= 14;
  const fileDetailsHeight = showFileDetails ? 6 : 0;
  // Header (1) + Divider (1) + Details card = 2 + fileDetailsHeight
  const filesListHeight = Math.max(2, bodyHeight - 2 - fileDetailsHeight);
  const maxFileScroll = Math.max(0, consolidatedFiles.length - filesListHeight);

  // Keep file scroll offset in sync with active index
  useEffect(() => {
    if (activeFileIndex < fileScrollOffset) {
      setFileScrollOffset(activeFileIndex);
    } else if (activeFileIndex >= fileScrollOffset + filesListHeight) {
      setFileScrollOffset(Math.max(0, activeFileIndex - filesListHeight + 1));
    }
  }, [activeFileIndex, filesListHeight]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (key.tab) {
      setFocusedPane((prev) => (prev === "code" ? "files" : "code"));
      return;
    }

    // Direct jump with 1-9
    if (/^[1-9]$/.test(input)) {
      const targetIdx = parseInt(input, 10) - 1;
      if (targetIdx < consolidatedFiles.length) {
        setActiveFileIndex(targetIdx);
        setScrollOffset(0);
        return;
      }
    }

    if (focusedPane === "code") {
      if (key.upArrow || input === "k") {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
        return;
      }

      if (key.pageUp || input === "u") {
        setScrollOffset((prev) => Math.max(0, prev - Math.max(5, Math.floor(codeViewHeight / 2))));
        return;
      }

      if (key.pageDown || input === "d") {
        setScrollOffset((prev) => Math.min(maxScroll, prev + Math.max(5, Math.floor(codeViewHeight / 2))));
        return;
      }

      if (input === "g") {
        setScrollOffset(0);
        return;
      }

      if (input === "G") {
        setScrollOffset(maxScroll);
        return;
      }

      if (key.leftArrow || input === "h") {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : consolidatedFiles.length - 1));
          setScrollOffset(0);
        }
        return;
      }

      if (key.rightArrow || input === "l") {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => (prev < consolidatedFiles.length - 1 ? prev + 1 : 0));
          setScrollOffset(0);
        }
        return;
      }

      if (key.return) {
        onClose();
        return;
      }
    } else {
      // Files pane navigation
      if (key.upArrow || input === "k") {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : consolidatedFiles.length - 1));
          setScrollOffset(0);
        }
        return;
      }

      if (key.downArrow || input === "j") {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => (prev < consolidatedFiles.length - 1 ? prev + 1 : 0));
          setScrollOffset(0);
        }
        return;
      }

      if (key.pageUp) {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => Math.max(0, prev - 5));
          setScrollOffset(0);
        }
        return;
      }

      if (key.pageDown) {
        if (consolidatedFiles.length > 0) {
          setActiveFileIndex((prev) => Math.min(consolidatedFiles.length - 1, prev + 5));
          setScrollOffset(0);
        }
        return;
      }

      if (input === "g") {
        setActiveFileIndex(0);
        setScrollOffset(0);
        return;
      }

      if (input === "G") {
        setActiveFileIndex(Math.max(0, consolidatedFiles.length - 1));
        setScrollOffset(0);
        return;
      }

      if (key.return || input === " " || key.leftArrow || input === "h") {
        setFocusedPane("code");
        return;
      }
    }
  });

  const visibleDiffLines = parsedLines.slice(scrollOffset, scrollOffset + codeViewHeight);
  const visibleFiles = consolidatedFiles.slice(fileScrollOffset, fileScrollOffset + filesListHeight);
  const lang = activeFile ? getLangFromPath(activeFile.filePath) : "";
  const allPaths = useMemo(() => consolidatedFiles.map((f) => f.relPath), [consolidatedFiles]);

  const numWidth = Math.max(3, String(maxLineNum).length);
  const isDualColumn = leftWidth >= 55;
  const gutterWidth = isDualColumn ? 2 * numWidth + 10 : numWidth + 7;
  const availableCodeWidth = Math.max(10, leftWidth - gutterWidth);

  const totalAdded = useMemo(
    () => consolidatedFiles.reduce((acc, f) => acc + f.linesAdded, 0),
    [consolidatedFiles]
  );
  const totalRemoved = useMemo(
    () => consolidatedFiles.reduce((acc, f) => acc + f.linesRemoved, 0),
    [consolidatedFiles]
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      backgroundColor={theme.bg}
    >
      {/* Top Header Bar */}
      <Box height={1} width={width} justifyContent="space-between" overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={theme.accentBright} bold>
            {glyphs.prompt} MORPHEUS CODE & DIFF INSPECTOR
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text
            backgroundColor={focusedPane === "code" ? theme.accent : theme.bgColumn}
            color={focusedPane === "code" ? theme.bg : theme.secondary}
            bold
          >
            {" "}CODE{" "}
          </Text>
          <Text color={theme.muted}> / </Text>
          <Text
            backgroundColor={focusedPane === "files" ? theme.accent : theme.bgColumn}
            color={focusedPane === "files" ? theme.bg : theme.secondary}
            bold
          >
            {" "}FILES{" "}
          </Text>
        </Text>
        <Text color={theme.muted} wrap="truncate-end">
          [Tab] toggle pane · [↑/↓] {focusedPane === "code" ? "scroll code" : "select file"} · [←/→] switch file · [1-9] jump · [esc] close
        </Text>
      </Box>

      {/* Top Divider */}
      <Box height={1} width={width} overflow="hidden">
        <Text color={theme.border}>{"─".repeat(width)}</Text>
      </Box>

      {/* Middle Body: Split Pane (Left: Code, Divider: │, Right: Files) */}
      <Box flexDirection="row" width={width} height={bodyHeight} overflow="hidden">
        {/* Left Column: Code & Diff Pane */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          {consolidatedFiles.length === 0 ? (
            <Box height={bodyHeight} alignItems="center" justifyContent="center">
              <Text color={theme.muted} italic>
                No file modifications recorded in this session.
              </Text>
            </Box>
          ) : (
            <>
              {/* Code Pane Subheader */}
              <Box height={1} width={leftWidth} justifyContent="space-between" overflow="hidden">
                <Text wrap="truncate-end">
                  <Text color={theme.accent}>◈ </Text>
                  <Text color={theme.text} bold>
                    {activeFile?.relPath}
                  </Text>
                  <Text color={theme.muted}> [{lang ? lang.toUpperCase() : "TEXT"}] </Text>
                  <Text color={theme.diffAdd} bold>
                    +{activeFile?.linesAdded}{" "}
                  </Text>
                  <Text color={theme.diffRemove} bold>
                    -{activeFile?.linesRemoved}
                  </Text>
                </Text>
                <Text color={theme.muted} wrap="truncate-end">
                  lines {scrollOffset + 1}–{Math.min(parsedLines.length, scrollOffset + codeViewHeight)} of {parsedLines.length}
                  {maxScroll > 0 ? ` (${Math.round((scrollOffset / maxScroll) * 100)}%)` : ""}
                </Text>
              </Box>

              {/* Code Gutter Header */}
              <Box height={1} width={leftWidth} overflow="hidden">
                <Text backgroundColor={theme.bgColumn} wrap="truncate-end">
                  {isDualColumn ? (
                    <>
                      <Text color={theme.muted}>{" ".repeat(Math.max(0, numWidth - 3))}OLD</Text>
                      <Text color={theme.border}> │ </Text>
                      <Text color={theme.muted}>{" ".repeat(Math.max(0, numWidth - 3))}NEW</Text>
                      <Text color={theme.border}> │ </Text>
                      <Text color={theme.muted}>±</Text>
                      <Text color={theme.border}> │ </Text>
                    </>
                  ) : (
                    <>
                      <Text color={theme.muted}>{" ".repeat(Math.max(0, numWidth - 4))}LINE</Text>
                      <Text color={theme.border}> │ </Text>
                      <Text color={theme.muted}>±</Text>
                      <Text color={theme.border}> │ </Text>
                    </>
                  )}
                  <Text color={theme.muted} bold>CODE</Text>
                  <Text color={theme.border}>{" ─".repeat(Math.max(2, Math.floor((availableCodeWidth - 6) / 2)))}</Text>
                </Text>
              </Box>

              {/* Code Diff Lines */}
              <Box flexDirection="column" height={codeViewHeight} overflow="hidden">
                {visibleDiffLines.map((pLine, idx) => {
                  const sanitizedCode = pLine.codeText.replace(/\t/g, "  ");

                  if (pLine.type === "hunk") {
                    const oldGutter = " ".repeat(Math.max(0, numWidth - 2)) + "@@";
                    const newGutter = "@@" + " ".repeat(Math.max(0, numWidth - 2));
                    const padHunk = Math.max(0, availableCodeWidth - visibleLength(sanitizedCode));
                    return (
                      <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                        <Text backgroundColor={theme.bgColumn} wrap="truncate-end">
                          {isDualColumn ? (
                            <>
                              <Text color={theme.accent}>{oldGutter}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.accent}>{newGutter}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.accent}>~</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          ) : (
                            <>
                              <Text color={theme.accent}>{" ".repeat(Math.max(0, numWidth - 2))}@@</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.accent}>~</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          )}
                          <Text color={theme.accentBright} bold italic>
                            {sanitizedCode}
                            {" ".repeat(padHunk)}
                          </Text>
                        </Text>
                      </Box>
                    );
                  }

                  if (pLine.type === "header") {
                    const padHdr = Math.max(0, leftWidth - visibleLength(pLine.raw));
                    return (
                      <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                        <Text color={theme.warning} wrap="truncate-end">
                          {pLine.raw}
                          {" ".repeat(padHdr)}
                        </Text>
                      </Box>
                    );
                  }

                  if (pLine.type === "add") {
                    const oldStr = " ".repeat(numWidth);
                    const newStr = String(pLine.newNum ?? "").padStart(numWidth, " ");
                    const highlighted = highlightCode(sanitizedCode, lang);
                    const padCode = Math.max(0, availableCodeWidth - visibleLength(sanitizedCode));
                    return (
                      <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                        <Text backgroundColor={theme.bgDiffAdd} wrap="truncate-end">
                          {isDualColumn ? (
                            <>
                              <Text color={theme.muted}>{oldStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.diffAdd} bold>{newStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.diffAdd} bold>+</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          ) : (
                            <>
                              <Text color={theme.diffAdd} bold>{newStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.diffAdd} bold>+</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          )}
                          {highlighted}
                          {" ".repeat(padCode)}
                        </Text>
                      </Box>
                    );
                  }

                  if (pLine.type === "rem") {
                    const oldStr = String(pLine.oldNum ?? "").padStart(numWidth, " ");
                    const newStr = " ".repeat(numWidth);
                    const highlighted = highlightCode(sanitizedCode, lang);
                    const padCode = Math.max(0, availableCodeWidth - visibleLength(sanitizedCode));
                    return (
                      <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                        <Text backgroundColor={theme.bgDiffRemove} wrap="truncate-end">
                          {isDualColumn ? (
                            <>
                              <Text color={theme.diffRemove} bold>{oldStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.muted}>{newStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.diffRemove} bold>-</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          ) : (
                            <>
                              <Text color={theme.diffRemove} bold>{oldStr}</Text>
                              <Text color={theme.border}> │ </Text>
                              <Text color={theme.diffRemove} bold>-</Text>
                              <Text color={theme.border}> │ </Text>
                            </>
                          )}
                          {highlighted}
                          {" ".repeat(padCode)}
                        </Text>
                      </Box>
                    );
                  }

                  // Context line
                  const oldStr = String(pLine.oldNum ?? "").padStart(numWidth, " ");
                  const newStr = String(pLine.newNum ?? "").padStart(numWidth, " ");
                  const highlighted = highlightCode(sanitizedCode, lang);
                  const padCode = Math.max(0, availableCodeWidth - visibleLength(sanitizedCode));
                  return (
                    <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                      <Text wrap="truncate-end">
                        {isDualColumn ? (
                          <>
                            <Text color={theme.muted}>{oldStr}</Text>
                            <Text color={theme.border}> │ </Text>
                            <Text color={theme.muted}>{newStr}</Text>
                            <Text color={theme.border}> │ </Text>
                            <Text color={theme.muted}> </Text>
                            <Text color={theme.border}> │ </Text>
                          </>
                        ) : (
                          <>
                            <Text color={theme.muted}>{newStr || oldStr}</Text>
                            <Text color={theme.border}> │ </Text>
                            <Text color={theme.muted}> </Text>
                            <Text color={theme.border}> │ </Text>
                          </>
                        )}
                        {highlighted}
                        {" ".repeat(padCode)}
                      </Text>
                    </Box>
                  );
                })}
                {Array.from({ length: Math.max(0, codeViewHeight - visibleDiffLines.length) }).map((_, idx) => (
                  <Box key={`pad_code_${idx}`} height={1}>
                    <Text color={theme.muted}> </Text>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Center Vertical Divider */}
        <Box width={1} height={bodyHeight} flexDirection="column" overflow="hidden">
          {Array.from({ length: bodyHeight }).map((_, i) => (
            <Box key={`div_${i}`} height={1}>
              <Text color={theme.border}>│</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Changed Files Navigator */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden">
          {/* Files Header */}
          <Box height={1} width={rightWidth} justifyContent="space-between" overflow="hidden">
            <Text wrap="truncate-end">
              <Text color={focusedPane === "files" ? theme.accentBright : theme.secondary} bold>
                [ ▰ CHANGED FILES ]
              </Text>
            </Text>
            <Text wrap="truncate-end">
              <Text color={theme.muted}>[ </Text>
              <Text color={theme.accentBright} bold>
                {consolidatedFiles.length > 0 ? `${activeFileIndex + 1}/${consolidatedFiles.length}` : "0"}
              </Text>
              <Text color={theme.muted}> ]</Text>
            </Text>
          </Box>

          {/* Files Divider */}
          <Box height={1} width={rightWidth} overflow="hidden">
            <Text color={theme.border}>{"─".repeat(rightWidth)}</Text>
          </Box>

          {/* Files List */}
          <Box flexDirection="column" height={filesListHeight} overflow="hidden">
            {consolidatedFiles.length === 0 ? (
              <Box height={1}>
                <Text color={theme.muted} italic>
                  No files
                </Text>
              </Box>
            ) : (
              visibleFiles.map((file, idx) => {
                const actualIndex = fileScrollOffset + idx;
                const isSelected = actualIndex === activeFileIndex;
                const isFilesFocus = focusedPane === "files";
                const tabName = formatTabName(file.relPath, allPaths);
                const addStr = `+${file.linesAdded}`;
                const remStr = `-${file.linesRemoved}`;
                const statsStr = `${addStr} ${remStr}`;
                const prefix = isSelected ? "▶ " : "  ";
                const numStr = `${actualIndex + 1}. `;
                const availName = Math.max(4, rightWidth - prefix.length - numStr.length - statsStr.length - 2);
                const displayName =
                  tabName.length > availName
                    ? `${tabName.slice(0, Math.max(0, availName - 1))}…`
                    : tabName;
                const pad = Math.max(
                  0,
                  rightWidth - prefix.length - numStr.length - displayName.length - statsStr.length
                );

                if (isSelected) {
                  return (
                    <Box key={file.filePath} height={1} overflow="hidden">
                      <Text
                        backgroundColor={isFilesFocus ? theme.accent : theme.bgColumn}
                        wrap="truncate-end"
                      >
                        <Text color={isFilesFocus ? theme.bg : theme.accentBright} bold>
                          {prefix}
                        </Text>
                        <Text color={isFilesFocus ? theme.bg : theme.accent} bold>
                          {numStr}
                        </Text>
                        <Text color={isFilesFocus ? theme.bg : theme.text} bold>
                          {displayName}
                        </Text>
                        {" ".repeat(pad)}
                        <Text color={isFilesFocus ? theme.bg : theme.diffAdd} bold>
                          {addStr}{" "}
                        </Text>
                        <Text color={isFilesFocus ? theme.bg : theme.diffRemove} bold>
                          {remStr}
                        </Text>
                      </Text>
                    </Box>
                  );
                }

                return (
                  <Box key={file.filePath} height={1} overflow="hidden">
                    <Text backgroundColor={theme.bg} wrap="truncate-end">
                      <Text color={theme.muted}>
                        {prefix}{numStr}
                      </Text>
                      <Text color={theme.secondary}>{displayName}</Text>
                      {" ".repeat(pad)}
                      <Text color={theme.diffAdd}>{addStr} </Text>
                      <Text color={theme.diffRemove}>{remStr}</Text>
                    </Text>
                  </Box>
                );
              })
            )}
            {Array.from({ length: Math.max(0, filesListHeight - visibleFiles.length) }).map((_, idx) => (
              <Box key={`pad_file_${idx}`} height={1}>
                <Text color={theme.muted}> </Text>
              </Box>
            ))}
          </Box>

          {/* Optional File Details Card (shown on taller terminals) */}
          {showFileDetails && (
            <Box flexDirection="column" width={rightWidth} height={fileDetailsHeight} overflow="hidden">
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text color={theme.border}>{"─".repeat(rightWidth)}</Text>
              </Box>
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text color={theme.accent} bold wrap="truncate-end">
                  ◈ {activeFile ? (activeFile.relPath.length > rightWidth - 4 ? `…${activeFile.relPath.slice(-(rightWidth - 5))}` : activeFile.relPath) : "No file"}
                </Text>
              </Box>
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text wrap="truncate-end">
                  <Text color={theme.muted}>Type: </Text>
                  <Text color={theme.secondary} bold>{lang ? lang.toUpperCase() : "TEXT"}</Text>
                  <Text color={theme.muted}> · </Text>
                  <Text color={theme.diffAdd} bold>+{activeFile?.linesAdded ?? 0} </Text>
                  <Text color={theme.diffRemove} bold>-{activeFile?.linesRemoved ?? 0}</Text>
                </Text>
              </Box>
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text color={theme.muted} wrap="truncate-end">
                  Diff: {parsedLines.length} lines · {parsedLines.filter(p => p.type === "hunk").length} hunks
                </Text>
              </Box>
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text color={theme.muted} wrap="truncate-end">
                  Total: <Text color={theme.diffAdd} bold>+{totalAdded}</Text> <Text color={theme.diffRemove} bold>-{totalRemoved}</Text> in {consolidatedFiles.length} {consolidatedFiles.length === 1 ? "file" : "files"}
                </Text>
              </Box>
              <Box height={1} width={rightWidth} overflow="hidden">
                <Text color={theme.border}>{"─".repeat(rightWidth)}</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom Divider */}
      <Box height={1} width={width} overflow="hidden">
        <Text color={theme.border}>{"─".repeat(width)}</Text>
      </Box>

      {/* Bottom Status Bar */}
      <Box height={1} width={width} justifyContent="space-between" overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={theme.muted}>Focus: </Text>
          <Text color={theme.accent} bold>[{focusedPane.toUpperCase()}] </Text>
          <Text color={theme.muted}>· Press </Text>
          <Text color={theme.accent}>[Esc]</Text>
          <Text color={theme.muted}> or </Text>
          <Text color={theme.accent}>[q]</Text>
          <Text color={theme.muted}> to return to chat</Text>
        </Text>
        <Text wrap="truncate-end">
          <Text color={theme.diffAdd} bold>+{totalAdded} </Text>
          <Text color={theme.diffRemove} bold>-{totalRemoved} </Text>
          <Text color={theme.muted}>· {consolidatedFiles.length} {consolidatedFiles.length === 1 ? "file" : "files"} changed</Text>
        </Text>
      </Box>
    </Box>
  );
}
