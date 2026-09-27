import fs from "node:fs/promises";
import path from "node:path";
import { resolvePathWithFallbacks, exists } from "../utils/filesystem";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface GrepParams {
  pattern: string;
  searchPath?: string;
  caseSensitive?: boolean;
  maxMatches?: number;
  includeDocs?: boolean;
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "build",
  "coverage",
  ".DS_Store",
  "target",
  "venv",
  ".venv",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "go.sum",
  ".DS_Store",
  "LICENSE",
  "LICENSE.txt",
  "LICENSE.md",
  "LICENCE",
  "CODE_OF_CONDUCT.md",
]);

const ASSET_OR_BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".mp4",
  ".mov",
  ".avi",
  ".otf",
  ".ttf",
  ".woff",
  ".woff2",
  ".eot",
  ".mp3",
  ".wav",
  ".zip",
  ".tar",
  ".gz",
  ".map",
  ".min.js",
  ".min.css",
  ".tsbuildinfo",
]);

const DOC_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
]);

async function collectFiles(
  dir: string,
  includeDocs: boolean,
  maxFiles: number = 300
): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    if (files.length >= maxFiles) return;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(path.join(current, entry.name));
        }
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entry.name)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (ASSET_OR_BINARY_EXTENSIONS.has(ext)) continue;
        if (!includeDocs && DOC_EXTENSIONS.has(ext)) continue;

        files.push(path.join(current, entry.name));
      }
    }
  }

  await walk(dir);
  return files;
}

export async function grepCode(
  params: GrepParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  if (!params.pattern) {
    throw new Error("Missing required parameter: pattern");
  }

  const rawPath = params.searchPath || ".";
  const targetPath = await resolvePathWithFallbacks(rawPath, cwd);

  if (!(await exists(targetPath))) {
    throw new Error(`Search path not found: ${rawPath}`);
  }

  const stat = await fs.stat(targetPath);
  const includeDocs = Boolean(params.includeDocs) || !stat.isDirectory();
  const filePaths = stat.isDirectory()
    ? await collectFiles(targetPath, includeDocs)
    : [targetPath];

  const flags = params.caseSensitive ? "g" : "gi";
  let regex: RegExp;
  try {
    regex = new RegExp(params.pattern, flags);
  } catch {
    regex = new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  }

  const maxMatches = Math.min(params.maxMatches ?? 20, 50);
  let totalMatches = 0;
  const resultsByFile = new Map<string, Array<{ lineNum: number; line: string }>>();

  for (const filePath of filePaths) {
    if (totalMatches >= maxMatches) break;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (totalMatches >= maxMatches) break;

        const line = lines[i];
        regex.lastIndex = 0;
        if (regex.test(line)) {
          const rel = path.relative(cwd, filePath) || path.basename(filePath);
          if (!resultsByFile.has(rel)) {
            resultsByFile.set(rel, []);
          }
          resultsByFile.get(rel)!.push({
            lineNum: i + 1,
            line: line.trimEnd().slice(0, 120),
          });
          totalMatches++;
        }
      }
    } catch {
    }
  }

  if (resultsByFile.size === 0) {
    return { output: `No matches found for "${params.pattern}" in ${rawPath}` };
  }

  const outputLines: string[] = [];
  for (const [file, matches] of resultsByFile.entries()) {
    outputLines.push(`${file}:`);
    for (const match of matches) {
      outputLines.push(`  ${match.lineNum}: ${match.line}`);
    }
  }

  if (totalMatches >= maxMatches) {
    outputLines.push(`\n[Reached limit of ${maxMatches} matches. Narrow pattern or searchPath for deeper results]`);
  }

  return { output: outputLines.join("\n") };
}

export function createGrepTool(cwd: string = process.cwd()): ToolDefinition {
  return {
    name: "grep_code",
    description:
      "Fast code search across files in a directory or file. Automatically skips node_modules, build dirs, lockfiles, and git directories. Returns line numbers and snippets with matching lines. Far more token-efficient than bash grep.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search query or regular expression to match",
        },
        searchPath: {
          type: "string",
          description:
            "Path to file or directory to search (defaults to current directory)",
        },
        caseSensitive: {
          type: "boolean",
          description: "Whether search is case-sensitive (defaults to false)",
        },
        maxMatches: {
          type: "number",
          description: "Maximum total matches to return (defaults to 20)",
        },
        includeDocs: {
          type: "boolean",
          description:
            "Whether to include markdown documentation files (.md, .txt) in search results (defaults to false)",
        },
      },
      required: ["pattern"],
    },
    execute: async (params: Record<string, any>) => {
      try {
        return await grepCode(params as unknown as GrepParams, cwd);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
