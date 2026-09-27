import fs from "node:fs/promises";
import { resolvePath, exists, detectLineEnding, normalizeLineEndings } from "../utils/filesystem.js";
import { similarity } from "../utils/levenshtein.js";
import type { ToolResult } from "../core/types.js";

export interface EditFileParams {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/**
 * Fallback fuzzy block finder when exact substring match fails.
 * Scans line windows for the highest similarity match above threshold.
 */
function findFuzzyMatch(
  sourceLines: string[],
  targetLines: string[],
  threshold = 0.65
): { startIndex: number; endIndex: number } | null {
  if (targetLines.length === 0 || sourceLines.length < targetLines.length) {
    return null;
  }

  const windowSize = targetLines.length;
  const targetBlock = targetLines.join("\n").trim();
  let bestScore = 0;
  let bestIndex = -1;

  for (let i = 0; i <= sourceLines.length - windowSize; i++) {
    const candidateBlock = sourceLines.slice(i, i + windowSize).join("\n").trim();
    const score = similarity(candidateBlock, targetBlock);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestScore >= threshold && bestIndex !== -1) {
    return {
      startIndex: bestIndex,
      endIndex: bestIndex + windowSize,
    };
  }

  return null;
}

export async function editFile(
  params: EditFileParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  const fullPath = resolvePath(params.filePath, cwd);

  if (!(await exists(fullPath))) {
    throw new Error(`File not found: ${params.filePath}`);
  }

  if (params.oldString === params.newString) {
    throw new Error("oldString and newString are identical. No edits to apply.");
  }

  const raw = await fs.readFile(fullPath, "utf-8");
  const ending = detectLineEnding(raw);
  const normalized = normalizeLineEndings(raw);
  const normalizedOld = normalizeLineEndings(params.oldString);
  const normalizedNew = normalizeLineEndings(params.newString);

  let updatedContent: string;

  // Phase 1: Exact substring match
  if (normalized.includes(normalizedOld)) {
    const occurrences = normalized.split(normalizedOld).length - 1;

    if (occurrences > 1 && !params.replaceAll) {
      throw new Error(
        `Found ${occurrences} matches for oldString in ${params.filePath}. Provide more surrounding context to ensure uniqueness, or pass replaceAll: true.`
      );
    }

    updatedContent = params.replaceAll
      ? normalized.replaceAll(normalizedOld, normalizedNew)
      : normalized.replace(normalizedOld, normalizedNew);
  } else {
    // Phase 2: Fuzzy line block matching fallback
    const sourceLines = normalized.split("\n");
    const targetLines = normalizedOld.split("\n");
    const fuzzyHit = findFuzzyMatch(sourceLines, targetLines);

    if (!fuzzyHit) {
      throw new Error(
        `oldString not found in ${params.filePath}. Ensure you have read the file recently and preserved exact indentation.`
      );
    }

    const newLines = normalizedNew.split("\n");
    sourceLines.splice(
      fuzzyHit.startIndex,
      fuzzyHit.endIndex - fuzzyHit.startIndex,
      ...newLines
    );
    updatedContent = sourceLines.join("\n");
  }

  // Restore original line endings (CRLF vs LF)
  const finalContent = ending === "\r\n"
    ? updatedContent.replaceAll("\n", "\r\n")
    : updatedContent;

  await fs.writeFile(fullPath, finalContent, "utf-8");

  return {
    output: `Successfully applied edits to ${params.filePath}.`,
  };
}
