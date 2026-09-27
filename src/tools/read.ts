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
    const result = await truncateOutput(listing);
    return { output: result.content };
  }

  const raw = await fs.readFile(fullPath, "utf-8");
  const lines = raw.split("\n");

  const offset = Math.max(1, params.offset ?? 1);
  const limit = Math.max(1, Math.min(params.limit ?? 1000, 2000));
  const startIndex = offset - 1;
  const slice = lines.slice(startIndex, startIndex + limit);

  const numbered = slice
    .map((line, idx) => `${startIndex + idx + 1}: ${line}`)
    .join("\n");

  const pagination =
    startIndex + limit < lines.length
      ? `\n\n[Lines ${offset}-${Math.min(offset + limit - 1, lines.length)} of ${lines.length} shown. Use offset=${offset + limit} to read more]`
      : "";

  const result = await truncateOutput(`${numbered}${pagination}`);
  return { output: result.content };
}

export function createReadTool(cwd: string = process.cwd()): ToolDefinition {
  return {
    name: "read_file",
    description:
      "Read contents of a file or directory from the filesystem with 1-indexed line numbers.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative or absolute path to the file/directory",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (defaults to 1)",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to return (defaults to 1000, max 2000)",
        },
      },
      required: ["filePath"],
    },
    execute: async (params: Record<string, any>) => {
      try {
        return await readFile(params as unknown as ReadFileParams, cwd);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
