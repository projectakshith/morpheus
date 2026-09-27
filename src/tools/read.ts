import fs from "node:fs/promises";
import path from "node:path";
import { resolvePath, exists } from "../utils/filesystem";
import { similarity } from "../utils/levenshtein";
import { truncateOutput } from "./construct";
import type { ToolResult } from "../core/types";

export interface ReadFileParams {
  filePath: string;
  offset?: number;
  limit?: number;
}

/**
 * Suggests closest matching files if target does not exist.
 */
async function suggestFiles(targetPath: string): Promise<string[]> {
  try {
    const dir = path.dirname(targetPath);
    const targetName = path.basename(targetPath).toLowerCase();
    const entries = await fs.readdir(dir);

    return entries
      .map((entry) => ({
        entry,
        score: similarity(targetName, entry.toLowerCase()),
      }))
      .filter((item) => item.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => path.join(dir, item.entry));
  } catch {
    return [];
  }
}

export async function readFile(
  params: ReadFileParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  const fullPath = resolvePath(params.filePath, cwd);

  if (!(await exists(fullPath))) {
    const suggestions = await suggestFiles(fullPath);
    const hint = suggestions.length > 0
      ? `\nDid you mean one of these?\n${suggestions.map((s) => `  - ${s}`).join("\n")}`
      : "";
    throw new Error(`File not found: ${params.filePath}${hint}`);
  }

  const stat = await fs.stat(fullPath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const listing = entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join("\n");
    const result = await truncateOutput(listing);
    return { output: result.content };
  }

  const raw = await fs.readFile(fullPath, "utf-8");
  const lines = raw.split("\n");

  const offset = Math.max(1, params.offset ?? 1);
  const limit = Math.max(1, params.limit ?? 2000);
  const startIndex = offset - 1;
  const slice = lines.slice(startIndex, startIndex + limit);

  const numbered = slice
    .map((line, idx) => `${startIndex + idx + 1}: ${line}`)
    .join("\n");

  const result = await truncateOutput(numbered);
  return { output: result.content };
}
