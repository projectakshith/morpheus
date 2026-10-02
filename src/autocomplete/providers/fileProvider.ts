/*
 * File autocomplete provider: scans workspace files and autocompletes @mentions or paths.
 */

import fs from "node:fs";
import path from "node:path";
import type { SuggestionItem, AutocompleteContext } from "../types";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".gemini",
  ".turbo",
  ".cache",
]);

interface CacheEntry {
  timestamp: number;
  files: string[];
}

const fileCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function scanFiles(dir: string, baseDir: string, maxDepth: number, currentDepth: number = 0): string[] {
  if (currentDepth > maxDepth) return [];

  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        results.push(relPath + "/");
        results.push(...scanFiles(fullPath, baseDir, maxDepth, currentDepth + 1));
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  } catch {
    /* Gracefully return whatever was found if permissions or missing directory occurs */
  }

  return results;
}

export function getWorkspaceFiles(cwd: string): string[] {
  const now = Date.now();
  const cached = fileCache.get(cwd);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.files;
  }

  const files = scanFiles(cwd, cwd, 3);
  fileCache.set(cwd, { timestamp: now, files });
  return files;
}

export function getFileSuggestions(ctx: AutocompleteContext): SuggestionItem[] {
  const { input, cursorPos } = ctx;
  const cwd = ctx.cwd || process.cwd();
  const beforeCursor = input.slice(0, cursorPos);

  /* Find the current token being typed before cursor */
  const match = beforeCursor.match(/(@?[a-zA-Z0-9_\-\.\/]+)$/);
  if (!match) return [];

  const rawToken = match[1];
  const isAtMention = rawToken.startsWith("@");
  const isPath = rawToken.includes("/") || rawToken.startsWith("./");

  /* Only trigger file suggestions if user prefixed with @ or is typing a path structure */
  if (!isAtMention && !isPath) {
    return [];
  }

  const query = (isAtMention ? rawToken.slice(1) : rawToken).toLowerCase();
  const tokenStart = cursorPos - rawToken.length;
  const allFiles = getWorkspaceFiles(cwd);

  const matchedFiles = allFiles
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.startsWith(query) || lower.includes("/" + query) || lower.includes(query);
    })
    .slice(0, 15);

  return matchedFiles.map((file) => {
    const isDir = file.endsWith("/");
    const cleanFile = file;
    const insert = (isAtMention ? `@${cleanFile}` : cleanFile) + (isDir ? "" : " ");

    return {
      id: `file-${file}`,
      label: (isAtMention ? "@" : "") + cleanFile,
      detail: isDir ? "[directory]" : "[file]",
      insertText: insert,
      category: "file" as const,
      replaceRange: {
        start: tokenStart,
        end: cursorPos,
      },
    };
  });
}
