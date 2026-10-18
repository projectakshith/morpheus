import fs from "node:fs/promises";
import path from "node:path";
import { resolvePathWithFallbacks, exists } from "../utils/filesystem";
import { similarity } from "../utils/levenshtein";
import { truncateOutput } from "./construct";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface ReadFileParams {
  filePath: string;
  offset?: number;
  limit?: number;
}

const DEFAULT_READ_LIMIT = 160;
const MAX_READ_LIMIT = 800;

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
  cwd: string = process.cwd(),
  outputBudgetBytes = 16 * 1024
): Promise<ToolResult> {
  const maxOutputBytes = Math.max(1024, Math.min(16 * 1024, Math.floor(outputBudgetBytes)));
  const fullPath = await resolvePathWithFallbacks(params.filePath, cwd);

  if (!(await exists(fullPath))) {
    const suggestions = await suggestFiles(fullPath);
    const hint =
      suggestions.length > 0
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
    const result = await truncateOutput(listing, { toolName: "read_file", maxBytes: maxOutputBytes });
    return { output: result.content };
  }

  const raw = await fs.readFile(fullPath, "utf-8");
  const lines = raw.split("\n");

  const offset = Math.max(1, params.offset ?? 1);
  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_READ_LIMIT, MAX_READ_LIMIT));
  const startIndex = offset - 1;
  const slice = lines.slice(startIndex, startIndex + limit);

  const numbered = slice
    .map((line, idx) => `${startIndex + idx + 1}: ${line}`)
    .join("\n");

  const pagination =
    startIndex + limit < lines.length
      ? `\n\n[Lines ${offset}-${Math.min(offset + limit - 1, lines.length)} of ${lines.length} shown. Use offset=${offset + limit} to read more]`
      : "";

  const result = await truncateOutput(`${numbered}${pagination}`, { toolName: "read_file", maxBytes: maxOutputBytes });
  return { output: result.content };
}

export function createReadTool(
  cwd: string = process.cwd(),
  getOutputBudgetBytes: () => number = () => 16 * 1024
): ToolDefinition {
  return {
    name: "read_file",
    description:
      "Read a targeted file range with 1-indexed line numbers. Defaults to 160 lines (max 800); use outline_code or grep_code to locate likely files and symbols, then read_file with offset/limit for exact implementation details. Page further only when the task needs it. Use list_dir for a scoped directory tree.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative or absolute path to the file/directory",
        },
        offset: {
          type: "number",
          description: "1-indexed starting line for targeted paging (defaults to 1)",
        },
        limit: {
          type: "number",
          description: "Maximum lines to return (defaults to 160, max 800)",
        },
      },
      required: ["filePath"],
    },
    execute: async (params: Record<string, any>) => {
      try {
        return await readFile(params as unknown as ReadFileParams, cwd, getOutputBudgetBytes());
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
