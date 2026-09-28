import fs from "node:fs";
import path from "node:path";

export interface RepoMapOptions {
  maxFiles?: number;
  maxDepth?: number;
}

interface SymbolExtraction {
  classes: string[];
  functions: string[];
  types: string[];
}

function extractSymbols(code: string): string[] {
  const results: string[] = [];

  const classRegex = /export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/g;
  for (const match of code.matchAll(classRegex)) {
    const className = match[1];
    const startIndex = match.index;
    const bodyStart = code.indexOf("{", startIndex);

    if (bodyStart !== -1) {
      const classBody = code.slice(bodyStart, bodyStart + 1500);
      const methodRegex = /^\s{2,4}(?:async\s+)?([a-zA-Z0-9_]+)\s*\([^)]*\)/gm;
      const methods: string[] = [];

      for (const m of classBody.matchAll(methodRegex)) {
        const name = m[1];
        if (!["constructor", "if", "for", "switch", "while"].includes(name)) {
          methods.push(name);
        }
      }

      if (methods.length > 0) {
        results.push(`class ${className} (${methods.slice(0, 4).join(", ")})`);
      } else {
        results.push(`class ${className}`);
      }
    } else {
      results.push(`class ${className}`);
    }
  }

  const funcRegex = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  for (const match of code.matchAll(funcRegex)) {
    const fnName = match[1];
    const rawArgs = match[2]
      .replace(/\s+/g, " ")
      .split(",")
      .map((a) => a.trim().split(/[:=]/)[0].trim())
      .filter(Boolean);
    results.push(`${fnName}(${rawArgs.slice(0, 3).join(", ")})`);
  }

  const constFnRegex = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|:)/g;
  for (const match of code.matchAll(constFnRegex)) {
    const fnName = match[1];
    const rawArgs = match[2]
      .replace(/\s+/g, " ")
      .split(",")
      .map((a) => a.trim().split(/[:=]/)[0].trim())
      .filter(Boolean);
    results.push(`${fnName}(${rawArgs.slice(0, 3).join(", ")})`);
  }

  const typeRegex = /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g;
  const types: string[] = [];
  for (const match of code.matchAll(typeRegex)) {
    types.push(match[1]);
  }
  if (types.length > 0) {
    results.push(`types: ${types.slice(0, 5).join(", ")}`);
  }

  return results;
}

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "dump",
  ".git",
  "coverage",
  ".next",
  "build",
  "test",
  "tests",
]);

const SUPPORTED_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
]);

function scanDirectory(
  baseDir: string,
  startDir: string,
  maxDepth: number
): string[] {
  const lines: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: startDir, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { dir, depth } = item;
    if (depth >= maxDepth) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          subdirs.push(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SUPPORTED_EXTS.has(ext)) continue;
        if (entry.name.includes(".test.") || entry.name.includes(".spec.")) continue;

        try {
          const code = fs.readFileSync(fullPath, "utf-8");
          const symbols = extractSymbols(code);
          if (symbols.length > 0) {
            const relPath = path.relative(baseDir, fullPath);
            lines.push(`${relPath}: ${symbols.join(", ")}`);
          }
        } catch {
          continue;
        }
      }
    }

    for (const subdir of subdirs) {
      queue.push({ dir: subdir, depth: depth + 1 });
    }
  }

  return lines;
}

export function generateRepoMap(
  cwd: string,
  options: RepoMapOptions = {}
): string {
  const maxFiles = options.maxFiles ?? 45;
  const maxDepth = options.maxDepth ?? 3;

  const candidateDirs = ["src", "lib", "app", "bin"];
  const lines: string[] = [];

  for (const sub of candidateDirs) {
    const full = path.join(cwd, sub);
    if (fs.existsSync(full)) {
      lines.push(...scanDirectory(cwd, full, maxDepth));
    }
  }

  if (lines.length === 0) {
    lines.push(...scanDirectory(cwd, cwd, maxDepth));
  }

  const selected = lines.slice(0, maxFiles);
  if (selected.length === 0) {
    return "";
  }

  return selected.join("\n");
}
