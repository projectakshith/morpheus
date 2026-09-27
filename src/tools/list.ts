import fs from "node:fs/promises";
import path from "node:path";
import { resolvePathWithFallbacks, exists } from "../utils/filesystem";
import type { ToolResult } from "../core/types";

export interface ListDirParams {
  dirPath?: string;
  depth?: number;
  includeAssets?: boolean;
}

const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "build",
  "coverage",
  ".DS_Store",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "go.sum",
]);

const ASSET_EXTENSIONS = new Set([
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
]);

const ASSET_DIRS = new Set([
  "fonts",
  "icons",
  "screenshots",
  "mc_bg",
]);

async function buildTree(
  currentPath: string,
  prefix: string,
  currentDepth: number,
  maxDepth: number,
  includeAssets = false
): Promise<string[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const sorted = entries
    .filter((e) => {
      if (IGNORED_NAMES.has(e.name) || e.name.startsWith(".")) return false;
      if (!includeAssets) {
        if (e.isDirectory() && ASSET_DIRS.has(e.name)) return false;
        if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (ASSET_EXTENSIONS.has(ext)) return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = prefix + (isLast ? "    " : "│   ");

    if (entry.isDirectory()) {
      lines.push(`${prefix}${branch}${entry.name}/`);
      if (currentDepth < maxDepth) {
        const sub = await buildTree(
          path.join(currentPath, entry.name),
          childPrefix,
          currentDepth + 1,
          maxDepth,
          includeAssets
        );
        lines.push(...sub);
      }
    } else {
      lines.push(`${prefix}${branch}${entry.name}`);
    }
  }

  return lines;
}

export async function listDir(
  params: ListDirParams = {},
  cwd: string = process.cwd()
): Promise<ToolResult> {
  const resolvedDir = await resolvePathWithFallbacks(params.dirPath || ".", cwd);

  if (!(await exists(resolvedDir))) {
    throw new Error(`Directory not found: ${params.dirPath || "."}`);
  }

  const stat = await fs.stat(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${params.dirPath || "."}`);
  }

  const maxDepth = Math.max(1, Math.min(params.depth ?? 2, 4));
  const baseName = path.basename(resolvedDir) || resolvedDir;
  const lines = await buildTree(resolvedDir, "", 1, maxDepth, Boolean(params.includeAssets));

  const output = [`${baseName}/`, ...lines].join("\n");
  return { output };
}
