import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import path from "node:path";
import { execSync } from "node:child_process";
import { theme } from "../theme";
import { HintLine } from "./ui/kit";
import { highlightCode, getLangFromPath } from "../highlight";
import { visibleLength } from "../utils/text";
import type { FileEditRecord } from "../types";

export interface DiffModalProps {
  fileEdits: FileEditRecord[];
  selectedFilePath?: string | null;
  width?: number;
  height?: number;
  onClose: () => void;
}

export interface ConsolidatedFileDiff {
  filePath: string;
  relPath: string;
  linesAdded: number;
  linesRemoved: number;
  diffLines: string[];
}

export interface ParsedDiffLine {
  raw: string;
  type: "add" | "rem" | "ctx" | "hunk" | "header" | "change";
  oldNum?: number;
  newNum?: number;
  marker: string;
  codeText: string;
}

export function groupEditsByFile(fileEdits: FileEditRecord[], cwd: string): ConsolidatedFileDiff[] {
  const files: ConsolidatedFileDiff[] = [];
  const byFile = new Map<string, FileEditRecord[]>();
  for (const edit of fileEdits) {
    const key = path.resolve(cwd, edit.filePath);
    byFile.set(key, [...(byFile.get(key) ?? []), edit]);
  }

  for (const [absPath, edits] of byFile) {
    const relPath = path.relative(cwd, absPath);
    const newestFirst = [...edits].sort((a, b) => b.timestamp - a.timestamp);
    const diffLines = newestFirst.flatMap((edit, i) => {
      const stats = edit.type === "write" ? `${edit.linesAdded} lines` : `+${edit.linesAdded} −${edit.linesRemoved}`;
      const label = `${edit.type === "write" ? "wrote file" : "edit"} · ${stats}${i === 0 ? " · latest" : ""}`;
      const body = edit.type === "write" ? [`@@ -0,0 +1,${edit.linesAdded} @@`, ...edit.diffLines] : edit.diffLines;
      return edits.length > 1 ? [`${CHANGE_MARKER}${label}`, ...body] : body;
    });
    files.push({
      filePath: absPath,
      relPath: relPath.startsWith("..") ? absPath : relPath,
      linesAdded: edits.reduce((n, e) => n + e.linesAdded, 0),
      linesRemoved: edits.reduce((n, e) => n + e.linesRemoved, 0),
      diffLines,
    });
  }

  return files;
}

export const CHANGE_MARKER = "\u0000change:";

export function parseDiffLines(diffLines: string[]): { parsed: ParsedDiffLine[]; maxLineNum: number } {
  const parsed: ParsedDiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let maxNum = 1;

  for (const raw of diffLines) {
    if (raw.startsWith(CHANGE_MARKER)) {
      oldLine = 1;
      newLine = 1;
      parsed.push({ raw, type: "change", codeText: raw.slice(CHANGE_MARKER.length), marker: " " });
      continue;
    }

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

    for (const file of groupEditsByFile(fileEdits, cwd)) map.set(file.filePath, file);

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
    const target = path.resolve(cwd, selectedFilePath);
    const foundIdx = consolidatedFiles.findIndex((f) => f.filePath === target);
    return foundIdx !== -1 ? foundIdx : 0;
  }, [selectedFilePath, consolidatedFiles]);

  const [activeFileIndex, setActiveFileIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [fileScrollOffset, setFileScrollOffset] = useState(0);

  const activeFile = consolidatedFiles[activeFileIndex];
  const diffLines = activeFile ? activeFile.diffLines : [];

  const { parsed: parsedLines, maxLineNum } = useMemo(
    () => parseDiffLines(diffLines),
    [diffLines]
  );

  // Layout sizing:
  // Overhead: Top bar (1) + Top border (1) + Bottom border (1) + Bottom bar (1) = 4 lines
  const bodyHeight = Math.max(4, height - 4);
  const rightWidth = Math.max(26, Math.min(36, Math.floor(width * 0.26)));
  const leftWidth = Math.max(30, width - rightWidth - 1);

  // Code view height is full body height (maximum code area)
  const codeViewHeight = bodyHeight;
  const maxScroll = Math.max(0, parsedLines.length - codeViewHeight);

  // Files list height: bodyHeight - 2 (header + separator)
  const filesListHeight = Math.max(2, bodyHeight - 2);

  // Auto-scroll file list so active file is visible
  useEffect(() => {
    if (activeFileIndex < fileScrollOffset) {
      setFileScrollOffset(activeFileIndex);
    } else if (activeFileIndex >= fileScrollOffset + filesListHeight) {
      setFileScrollOffset(Math.max(0, activeFileIndex - filesListHeight + 1));
    }
  }, [activeFileIndex, fileScrollOffset, filesListHeight]);

  // Terminal mouse / trackpad scroll handler
  useEffect(() => {
    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const mouseMatches = str.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g);

      for (const match of mouseMatches) {
        const button = parseInt(match[1], 10);
        const col = parseInt(match[2], 10);
        const row = parseInt(match[3], 10);
        const isRelease = match[4] === "m";

        if (button === 64) {
          // Scroll Up
          if (col > leftWidth) {
            setActiveFileIndex((prev) => {
              const next = Math.max(0, prev - 1);
              if (next !== prev) setScrollOffset(0);
              return next;
            });
          } else {
            setScrollOffset((prev) => Math.max(0, prev - 3));
          }
        } else if (button === 65) {
          // Scroll Down
          if (col > leftWidth) {
            setActiveFileIndex((prev) => {
              const next = Math.min(consolidatedFiles.length - 1, prev + 1);
              if (next !== prev) setScrollOffset(0);
              return next;
            });
          } else {
            setScrollOffset((prev) => Math.min(maxScroll, prev + 3));
          }
        } else if (button === 0 && !isRelease && col > leftWidth) {
          // Click on a file in right pane (files start around row 4)
          const targetIndex = row - 4 + fileScrollOffset;
          if (targetIndex >= 0 && targetIndex < consolidatedFiles.length) {
            setActiveFileIndex(targetIndex);
            setScrollOffset(0);
          }
        }
      }
    };

    process.stdin.on("data", onData);
    return () => {
      process.stdin.off("data", onData);
    };
  }, [leftWidth, consolidatedFiles.length, maxScroll, fileScrollOffset]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    // File switching: Left/Right arrows, h/l, p/n, [/], Tab
    if (key.leftArrow || input === "h" || input === "p" || input === "[") {
      if (consolidatedFiles.length > 0) {
        setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : consolidatedFiles.length - 1));
        setScrollOffset(0);
      }
      return;
    }

    if (key.rightArrow || input === "l" || input === "n" || input === "]" || key.tab) {
      if (consolidatedFiles.length > 0) {
        setActiveFileIndex((prev) => (prev < consolidatedFiles.length - 1 ? prev + 1 : 0));
        setScrollOffset(0);
      }
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

    // Code scrolling: Up/Down, k/j, w/s
    if (key.upArrow || input === "k" || input === "w") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === "j" || input === "s") {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      return;
    }

    // Page scrolling: PageUp/PageDown, Ctrl+U/Ctrl+D, Space, b/f
    if (key.pageUp || (key.ctrl && input === "u") || input === "b") {
      setScrollOffset((prev) => Math.max(0, prev - Math.max(4, Math.floor(codeViewHeight / 2))));
      return;
    }

    if (key.pageDown || (key.ctrl && input === "d") || input === " " || input === "f") {
      setScrollOffset((prev) => Math.min(maxScroll, prev + Math.max(4, Math.floor(codeViewHeight / 2))));
      return;
    }

    if (input === "g" || key.home) {
      setScrollOffset(0);
      return;
    }

    if (input === "G" || key.end) {
      setScrollOffset(maxScroll);
      return;
    }

    if (key.return) {
      onClose();
      return;
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
      {/* Minimal Top Header: File info on left, line range and close on right */}
      <Box height={1} width={width} justifyContent="space-between" overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={theme.accent} bold>◈ </Text>
          <Text color={theme.text} bold>
            {activeFile?.relPath || "No modified files"}
          </Text>
          {lang ? <Text color={theme.muted}>{` · ${lang.toLowerCase()}`}</Text> : null}
          {activeFile ? (
            <Text>
              {"  "}
              <Text color={theme.diffAdd} bold>+{activeFile.linesAdded} </Text>
              <Text color={theme.diffRemove} bold>−{activeFile.linesRemoved}</Text>
            </Text>
          ) : null}
        </Text>
        <Text color={theme.muted} wrap="truncate-end">
          lines {scrollOffset + 1}–{Math.min(parsedLines.length, scrollOffset + codeViewHeight)} of {parsedLines.length}
          {maxScroll > 0 ? ` (${Math.round((scrollOffset / maxScroll) * 100)}%)` : ""}
          {"   "}<Text color={theme.secondary}>esc</Text> close
        </Text>
      </Box>

      {/* Top Divider */}
      <Box height={1} width={width} overflow="hidden">
        <Text color={theme.border}>{"─".repeat(width)}</Text>
      </Box>

      {/* Split Body: Left = Code Diff, Center = Divider, Right = Files */}
      <Box flexDirection="row" width={width} height={bodyHeight} overflow="hidden">
        {/* Left: Code Pane */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          {consolidatedFiles.length === 0 ? (
            <Box height={bodyHeight} alignItems="center" justifyContent="center">
              <Text color={theme.muted} italic>
                No file modifications recorded in this session.
              </Text>
            </Box>
          ) : (
            visibleDiffLines.map((pLine, idx) => {
              const sanitizedCode = pLine.codeText.replace(/\t/g, "  ");

              if (pLine.type === "hunk") {
                const hunk = sanitizedCode.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@\s*(.*)$/);
                const label = hunk ? `line ${hunk[1]}${hunk[2] ? ` · ${hunk[2]}` : ""}` : sanitizedCode;
                const gutter = isDualColumn
                  ? `${" ".repeat(numWidth)}   ${" ".repeat(numWidth)}   ⋯   `
                  : `${" ".repeat(numWidth)}   ⋯   `;
                return (
                  <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                    <Text backgroundColor={theme.bgColumn} wrap="truncate-end">
                      <Text color={theme.muted}>{gutter}</Text>
                      <Text color={theme.muted} italic>
                        {label}
                        {" ".repeat(Math.max(0, availableCodeWidth - visibleLength(label)))}
                      </Text>
                    </Text>
                  </Box>
                );
              }

              if (pLine.type === "change") {
                const label = `── ${pLine.codeText} `;
                return (
                  <Box key={`diff_l_${scrollOffset + idx}`} height={1} overflow="hidden">
                    <Text wrap="truncate-end">
                      <Text color={theme.accentBright} bold>
                        {label}
                      </Text>
                      <Text color={theme.border}>{"─".repeat(Math.max(0, leftWidth - visibleLength(label)))}</Text>
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
            })
          )}
          {Array.from({ length: Math.max(0, codeViewHeight - visibleDiffLines.length) }).map((_, idx) => (
            <Box key={`pad_code_${idx}`} height={1}>
              <Text color={theme.muted}> </Text>
            </Box>
          ))}
        </Box>

        {/* Center Divider */}
        <Box width={1} height={bodyHeight} flexDirection="column" overflow="hidden">
          {Array.from({ length: bodyHeight }).map((_, i) => (
            <Box key={`div_${i}`} height={1}>
              <Text color={theme.border}>│</Text>
            </Box>
          ))}
        </Box>

        {/* Right: Clean File List */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden">
          {/* Header */}
          <Box height={1} width={rightWidth} justifyContent="space-between" overflow="hidden">
            <Text color={theme.secondary} bold wrap="truncate-end">
              CHANGED FILES
            </Text>
            <Text color={theme.accentBright} bold wrap="truncate-end">
              {consolidatedFiles.length}
            </Text>
          </Box>

          {/* Sub-divider */}
          <Box height={1} width={rightWidth} overflow="hidden">
            <Text color={theme.border}>{"─".repeat(rightWidth)}</Text>
          </Box>

          {/* File Items */}
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
                      <Text backgroundColor={theme.bgColumn} wrap="truncate-end">
                        <Text color={theme.accentBright} bold>
                          {prefix}
                        </Text>
                        <Text color={theme.accent} bold>
                          {numStr}
                        </Text>
                        <Text color={theme.text} bold>
                          {displayName}
                        </Text>
                        {" ".repeat(pad)}
                        <Text color={theme.diffAdd} bold>
                          {addStr}{" "}
                        </Text>
                        <Text color={theme.diffRemove} bold>
                          {remStr}
                        </Text>
                      </Text>
                    </Box>
                  );
                }

                return (
                  <Box key={file.filePath} height={1} overflow="hidden">
                    <Text wrap="truncate-end">
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
        </Box>
      </Box>

      {/* Bottom Divider */}
      <Box height={1} width={width} overflow="hidden">
        <Text color={theme.border}>{"─".repeat(width)}</Text>
      </Box>

      {/* Minimal Bottom Bar */}
      <Box height={1} width={width} justifyContent="space-between" overflow="hidden">
        <HintLine
          hints={[
            { keys: "↑↓", label: "scroll" },
            { keys: "←→", label: "file" },
            { keys: "1-9", label: "jump" },
            { keys: "tab", label: "pane" },
            { keys: "esc", label: "close" },
          ]}
        />
        <Text wrap="truncate-end">
          <Text color={theme.diffAdd} bold>+{totalAdded} </Text>
          <Text color={theme.diffRemove} bold>−{totalRemoved} </Text>
          <Text color={theme.muted}>across {consolidatedFiles.length} {consolidatedFiles.length === 1 ? "file" : "files"}</Text>
        </Text>
      </Box>
    </Box>
  );
}
