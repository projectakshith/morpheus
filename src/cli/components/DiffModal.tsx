import React, { useState, useMemo } from "react";
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
  const [scrollOffset, setScrollOffset] = useState(0);

  const activeFile = consolidatedFiles[activeFileIndex];
  const diffLines = activeFile ? activeFile.diffLines : [];

  const { parsed: parsedLines, maxLineNum } = useMemo(
    () => parseDiffLines(diffLines),
    [diffLines]
  );

  const viewHeight = Math.max(4, height - 9);
  const maxScroll = Math.max(0, parsedLines.length - viewHeight);

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

    if (input === "g") {
      setScrollOffset(0);
      return;
    }

    if (input === "G") {
      setScrollOffset(maxScroll);
      return;
    }

    if (key.return) {
      onClose();
      return;
    }
  });

  const visibleDiffLines = parsedLines.slice(scrollOffset, scrollOffset + viewHeight);
  const lang = activeFile ? getLangFromPath(activeFile.filePath) : "";

  const allPaths = useMemo(() => consolidatedFiles.map((f) => f.relPath), [consolidatedFiles]);

  const innerContentWidth = Math.max(30, width - 4);
  const numWidth = Math.max(3, String(maxLineNum).length);
  const isDualColumn = innerContentWidth >= 65;
  const gutterWidth = isDualColumn ? 2 * numWidth + 8 : numWidth + 5;
  const availableCodeWidth = Math.max(10, innerContentWidth - gutterWidth);

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
          [←/→/tab] file · [↑/↓/j/k] scroll · [esc/q] close
        </Text>
      </Box>

      <Box height={1} width="100%">
        <Text color={theme.border}>{"─".repeat(innerContentWidth)}</Text>
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
                const tabName = formatTabName(file.relPath, allPaths);
                if (isActive) {
                  return (
                    <Text
                      key={file.filePath}
                      backgroundColor={theme.accent}
                      color={theme.bg}
                      bold
                    >
                      {` ${idx + 1}. ${tabName} (+${file.linesAdded} -${file.linesRemoved}) `}
                    </Text>
                  );
                }
                return (
                  <Text key={file.filePath} backgroundColor={theme.bg}>
                    <Text color={theme.muted}> {idx + 1}. </Text>
                    <Text color={theme.secondary}>{tabName} </Text>
                    <Text color={theme.diffAdd}>+{file.linesAdded}</Text>
                    <Text color={theme.muted}>/</Text>
                    <Text color={theme.diffRemove}>-{file.linesRemoved} </Text>
                  </Text>
                );
              })}
            </Text>
          </Box>

          <Box height={1} width="100%" justifyContent="space-between" marginTop={0}>
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
            <Text color={theme.muted}>
              lines {scrollOffset + 1}–{Math.min(parsedLines.length, scrollOffset + viewHeight)} of {parsedLines.length}
              {maxScroll > 0 ? ` (${Math.round((scrollOffset / maxScroll) * 100)}%)` : ""}
            </Text>
          </Box>

          <Box height={1} width="100%" overflow="hidden">
            <Text backgroundColor={theme.bg} wrap="truncate-end">
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

          <Box flexDirection="column" height={viewHeight} overflow="hidden">
            {visibleDiffLines.map((pLine, idx) => {
              if (pLine.type === "hunk") {
                const oldGutter = " ".repeat(Math.max(0, numWidth - 2)) + "@@";
                const newGutter = "@@" + " ".repeat(Math.max(0, numWidth - 2));
                const padHunk = Math.max(0, availableCodeWidth - visibleLength(pLine.codeText));
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
                        {pLine.codeText}
                        {" ".repeat(padHunk)}
                      </Text>
                    </Text>
                  </Box>
                );
              }

              if (pLine.type === "header") {
                const padHdr = Math.max(0, innerContentWidth - visibleLength(pLine.raw));
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
                const highlighted = highlightCode(pLine.codeText, lang);
                const padCode = Math.max(0, availableCodeWidth - visibleLength(pLine.codeText));
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
                const highlighted = highlightCode(pLine.codeText, lang);
                const padCode = Math.max(0, availableCodeWidth - visibleLength(pLine.codeText));
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
              const highlighted = highlightCode(pLine.codeText, lang);
              const padCode = Math.max(0, availableCodeWidth - visibleLength(pLine.codeText));
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
            {Array.from({ length: Math.max(0, viewHeight - visibleDiffLines.length) }).map((_, idx) => (
              <Box key={`pad_${idx}`} height={1}>
                <Text color={theme.muted}> </Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      <Box height={1} width="100%">
        <Text color={theme.border}>{"─".repeat(innerContentWidth)}</Text>
      </Box>

      <Box height={1} width="100%" justifyContent="space-between" marginTop={0}>
        <Text color={theme.muted}>
          Press <Text color={theme.accent}>[Esc]</Text> or <Text color={theme.accent}>[q]</Text> to return to chat
        </Text>
        <Text color={theme.secondary}>
          <Text color={theme.diffAdd} bold>+{totalAdded} </Text>
          <Text color={theme.diffRemove} bold>-{totalRemoved} </Text>
          <Text color={theme.muted}>· {consolidatedFiles.length} {consolidatedFiles.length === 1 ? "file" : "files"} changed</Text>
        </Text>
      </Box>
    </Box>
  );
}
