import fs from "node:fs";
import path from "node:path";

export interface RepoMapOptions {
  maxFiles?: number;
  maxDepth?: number;
  maxChars?: number;
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

function shortenEntry(line: string, max: number): string {
  if (line.length <= max) return line;
  const head = line.slice(0, Math.max(0, max - 1));
  const lastComma = head.lastIndexOf(", ");
  const pathEnd = line.indexOf(": ") + 2;
  const cut = lastComma > pathEnd ? head.slice(0, lastComma) : head;
  return `${cut}…`;
}

function fitToBudget(lines: string[], maxChars: number): string[] {
  const total = (ls: string[]) => ls.reduce((n, l) => n + l.length, 0) + Math.max(0, ls.length - 1);
  if (total(lines) <= maxChars) return lines;

  const withoutArgs = (line: string) => line.replace(/(\w)\(([^()]*)\)/g, "$1()");
  const byLength = lines.map((l, i) => i).sort((a, b) => lines[b].length - lines[a].length);
  const slim = [...lines];
  for (const i of byLength) {
    if (total(slim) <= maxChars) return slim;
    slim[i] = withoutArgs(slim[i]);
  }
  if (total(slim) <= maxChars) return slim;
  lines = slim;

  const minEntry = (line: string) => Math.min(line.length, line.indexOf(": ") + 3);
  let kept = [...lines];
  while (kept.length > 0 && kept.reduce((n, l) => n + minEntry(l), 0) + kept.length - 1 > maxChars) {
    kept.pop();
  }

  let lo = 1;
  let hi = Math.max(...kept.map((l) => l.length));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (total(kept.map((l) => shortenEntry(l, Math.max(mid, minEntry(l))))) <= maxChars) lo = mid;
    else hi = mid - 1;
  }
  return kept.map((l) => shortenEntry(l, Math.max(lo, minEntry(l))));
}

function pickCentralFiles(cwd: string, lines: string[], maxFiles: number): string[] {
  if (lines.length <= maxFiles) return lines;
  const filePath = (line: string) => line.slice(0, line.indexOf(":"));
  const size = (line: string) => {
    try {
      return fs.statSync(path.join(cwd, filePath(line))).size;
    } catch {
      return 0;
    }
  };
  const rank = (line: string) => {
    const p = filePath(line);
    return (/\/index\.[a-z]+$/.test(p) ? 0 : 100) + p.split("/").length;
  };
  const kept = new Set([...lines].sort((a, b) => rank(a) - rank(b) || size(b) - size(a)).slice(0, maxFiles));
  return lines.filter((line) => kept.has(line));
}

export function generateRepoMap(
  cwd: string,
  options: RepoMapOptions = {}
): string {
  const maxFiles = options.maxFiles ?? 30;
  const maxDepth = options.maxDepth ?? 3;
  const maxChars = options.maxChars ?? 3200;

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

  return fitToBudget(pickCentralFiles(cwd, lines, maxFiles), maxChars).join("\n");
}
