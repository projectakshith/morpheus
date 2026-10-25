import { spawn } from "node:child_process";
import path from "node:path";
import { truncateOutput } from "./construct";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface BashParams {
  command: string;
  timeoutMs?: number;
}

export interface LineMatch {
  lineNum: number;
  content: string;
}

interface PathNode {
  children: Map<string, PathNode>;
  matches?: LineMatch[];
}

interface ParsedGrepItem {
  filePath: string;
  lineNum: number;
  content: string;
}

function parseGrepLine(line: string): ParsedGrepItem | null {
  if (!line) return null;
  let searchLine = line;
  let drivePrefix = "";
  if (/^[a-zA-Z]:[\\/]/.test(line)) {
    drivePrefix = line.slice(0, 2);
    searchLine = line.slice(2);
  }
  const match = searchLine.match(/^([^:\r\n]+):(\d+)(?::\d+)?:?(.*)$/);
  if (!match) return null;
  const rawPath = drivePrefix + match[1].trim();
  const lineNum = parseInt(match[2], 10);
  const content = match[3] ?? "";

  if (rawPath.length === 0 || rawPath.startsWith(" ") || rawPath.endsWith(" ")) return null;
  if (!rawPath.includes("/") && !rawPath.includes("\\") && !/\.[a-zA-Z0-9_-]+$/.test(rawPath)) {
    return null;
  }
  return { filePath: rawPath, lineNum, content };
}

export function compactAbsolutePathListing(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 5) return text;

  // Check if all lines match grep output format
  const parsedGrep = lines.map(parseGrepLine);
  const isAllGrep = parsedGrep.every((item): item is ParsedGrepItem => item !== null);

  if (isAllGrep) {
    const matchesByFile = new Map<string, LineMatch[]>();
    for (const item of parsedGrep) {
      const normPath = path.normalize(item.filePath);
      if (!matchesByFile.has(normPath)) {
        matchesByFile.set(normPath, []);
      }
      matchesByFile.get(normPath)!.push({
        lineNum: item.lineNum,
        content: item.content,
      });
    }

    const uniqueFiles = [...matchesByFile.keys()];
    const allAbsolute = uniqueFiles.every((p) => path.isAbsolute(p));

    let root = "";
    if (allAbsolute) {
      const parentParts = uniqueFiles.map((entry) => path.dirname(entry).split(path.sep).filter(Boolean));
      const commonParts: string[] = [];
      const maxCommonLength = Math.min(...parentParts.map((parts) => parts.length));
      for (let index = 0; index < maxCommonLength; index++) {
        const part = parentParts[0][index];
        if (parentParts.every((parts) => parts[index] === part)) commonParts.push(part);
        else break;
      }
      root = path.join(path.parse(uniqueFiles[0]).root, ...commonParts);
    } else {
      const parentParts = uniqueFiles.map((entry) => {
        const dir = path.dirname(entry);
        return dir === "." ? [] : dir.split(path.sep).filter(Boolean);
      });
      const commonParts: string[] = [];
      const minLength = Math.min(...parentParts.map((parts) => parts.length));
      for (let index = 0; index < minLength; index++) {
        const part = parentParts[0][index];
        if (parentParts.every((parts) => parts[index] === part)) commonParts.push(part);
        else break;
      }
      root = commonParts.length > 0 ? path.join(...commonParts) : ".";
    }

    const tree: PathNode = { children: new Map() };
    for (const [entry, matches] of matchesByFile.entries()) {
      const relative = allAbsolute ? path.relative(root, entry) : (root === "." ? entry : path.relative(root, entry));
      if (!relative || relative.startsWith("..") || (allAbsolute && path.isAbsolute(relative))) return text;

      // Deduplicate identical matches within the file and sort numerically by line number
      const seen = new Set<string>();
      const deduped: LineMatch[] = [];
      for (const m of matches) {
        const key = `${m.lineNum}:${m.content}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(m);
        }
      }
      deduped.sort((a, b) => a.lineNum - b.lineNum);

      const parts = relative.split(path.sep).filter(Boolean);
      let node = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        let child = node.children.get(part);
        if (!child) {
          child = { children: new Map() };
          node.children.set(part, child);
        }
        if (i === parts.length - 1) {
          child.matches = deduped;
        }
        node = child;
      }
    }

    const rendered: string[] = [];
    const visit = (node: PathNode, prefix: string) => {
      const entries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
      entries.forEach(([name, child], index) => {
        const last = index === entries.length - 1;
        const directory = child.children.size > 0;
        if (directory) {
          rendered.push(`${prefix}${last ? "└── " : "├── "}${name}/`);
          visit(child, `${prefix}${last ? "    " : "│   "}`);
        } else if (child.matches && child.matches.length > 0) {
          if (child.matches.length === 1) {
            const m = child.matches[0];
            const content = m.content.length > 240 ? `${m.content.slice(0, 240)}…` : m.content;
            rendered.push(`${prefix}${last ? "└── " : "├── "}${name}:${m.lineNum}: ${content.trim()}`);
          } else {
            rendered.push(`${prefix}${last ? "└── " : "├── "}${name}`);
            const matchPrefix = `${prefix}${last ? "    " : "│   "}`;
            child.matches.forEach((m, mIdx) => {
              const isLastMatch = mIdx === child.matches!.length - 1;
              const content = m.content.length > 240 ? `${m.content.slice(0, 240)}…` : m.content;
              rendered.push(`${matchPrefix}${isLastMatch ? "└── " : "├── "}:${m.lineNum}: ${content.trim()}`);
            });
          }
        } else {
          rendered.push(`${prefix}${last ? "└── " : "├── "}${name}`);
        }
      });
    };
    visit(tree, "");

    const totalMatches = parsedGrep.length;
    const fileCount = uniqueFiles.length;
    return `${totalMatches} match${totalMatches === 1 ? "" : "es"} across ${fileCount} file${fileCount === 1 ? "" : "s"} under ${root}:\n${rendered.join("\n")}`;
  }

  // Pure path listing (find output)
  if (lines.length < 8 || !lines.every((line) => path.isAbsolute(line))) return text;

  const uniquePaths = [...new Set(lines.map((line) => path.normalize(line)))];
  const parentParts = uniquePaths.map((entry) => path.dirname(entry).split(path.sep).filter(Boolean));
  const commonParts: string[] = [];
  const maxCommonLength = Math.min(...parentParts.map((parts) => parts.length));
  for (let index = 0; index < maxCommonLength; index++) {
    const part = parentParts[0][index];
    if (parentParts.every((parts) => parts[index] === part)) commonParts.push(part);
    else break;
  }

  const root = path.join(path.parse(uniquePaths[0]).root, ...commonParts);
  const tree: PathNode = { children: new Map() };
  for (const entry of uniquePaths) {
    const relative = path.relative(root, entry);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return text;
    let node = tree;
    for (const part of relative.split(path.sep)) {
      let child = node.children.get(part);
      if (!child) {
        child = { children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  const rendered: string[] = [];
  const visit = (node: PathNode, prefix: string) => {
    const entries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([name, child], index) => {
      const last = index === entries.length - 1;
      const directory = child.children.size > 0;
      rendered.push(`${prefix}${last ? "└── " : "├── "}${name}${directory ? "/" : ""}`);
      if (directory) visit(child, `${prefix}${last ? "    " : "│   "}`);
    });
  };
  visit(tree, "");

  const duplicateNote = uniquePaths.length === lines.length ? "" : ` (${lines.length} matches, ${uniquePaths.length} unique)`;
  return `${uniquePaths.length} paths${duplicateNote} under ${root}:\n${rendered.join("\n")}`;
}

export async function executeBash(
  params: BashParams,
  cwd: string = process.cwd(),
  signal?: AbortSignal
): Promise<ToolResult> {
  const timeoutMs = params.timeoutMs ?? 60_000;
  if (signal?.aborted) {
    return { output: "[Command cancelled before execution.]", metadata: { cancelled: true } };
  }

  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", params.command], {
      detached: process.platform !== "win32",
      cwd,
      env: {
        ...process.env,
        PAGER: "cat",
        TERM: "xterm-256color",
      },
    });

    const HEAD_LIMIT = 32 * 1024;
    const TAIL_LIMIT = 96 * 1024;
    const streams = {
      stdout: { head: "", tail: "", bytes: 0 },
      stderr: { head: "", tail: "", bytes: 0 },
    };
    let settled = false;
    let stopReason: "timeout" | "cancelled" | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const capture = (name: "stdout" | "stderr", chunk: Buffer) => {
      const stream = streams[name];
      stream.bytes += chunk.length;
      const text = chunk.toString("utf-8");
      const headRoom = Math.max(0, HEAD_LIMIT - stream.head.length);
      stream.head += text.slice(0, headRoom);
      const overflow = text.slice(headRoom);
      if (overflow) stream.tail = (stream.tail + overflow).slice(-TAIL_LIMIT);
    };

    const signalProcess = (signalName: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && proc.pid) process.kill(-proc.pid, signalName);
        else proc.kill(signalName);
      } catch {
        try {
          proc.kill(signalName);
        } catch {
          // The process has already exited.
        }
      }
    };

    const stop = (reason: "timeout" | "cancelled") => {
      if (stopReason) return;
      stopReason = reason;
      signalProcess("SIGTERM");
      killTimer = setTimeout(() => signalProcess("SIGKILL"), 1_000);
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => stop("cancelled");

    const timer = setTimeout(() => {
      stop("timeout");
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    proc.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));

    proc.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    proc.on("error", (err) => {
      finish({ output: `Error: ${formatError(err)}`, metadata: { isError: true } });
    });

    const formatStream = (name: "stdout" | "stderr") => {
      const stream = streams[name];
      const retained = Buffer.byteLength(stream.head + stream.tail, "utf-8");
      const omitted = Math.max(0, stream.bytes - retained);
      return `${stream.head}${omitted > 0 ? `\n... [${omitted} bytes omitted from ${name}] ...\n` : ""}${stream.tail}`.trim();
    };

    proc.on("close", async (code) => {
      if (stopReason === "cancelled") {
        finish({ output: "[Command cancelled by user.]", metadata: { cancelled: true } });
        return;
      }
      if (stopReason === "timeout") {
        const partialOutput = [
          formatStream("stdout"),
          ...(formatStream("stderr") ? [`[stderr]\n${formatStream("stderr")}`] : []),
        ]
          .filter(Boolean)
          .join("\n\n");
        let diagnostic = partialOutput;
        let outputPath: string | undefined;
        try {
          if (partialOutput) {
            const captured = await truncateOutput(partialOutput, { toolName: "bash" });
            diagnostic = captured.content;
            outputPath = captured.outputPath;
          }
        } catch {
          diagnostic = partialOutput.slice(0, 32 * 1024);
        }
        finish({
          output: [
            `Error: Command timed out after ${timeoutMs / 1000}s: ${params.command}`,
            diagnostic,
          ]
            .filter(Boolean)
            .join("\n\n"),
          metadata: { isError: true, timedOut: true, outputPath },
        });
        return;
      }

      const combined = [
        formatStream("stdout"),
        ...(formatStream("stderr") ? [`[stderr]\n${formatStream("stderr")}`] : []),
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = compactAbsolutePathListing(combined || "(command completed with no output)");
      const captureTruncated = Object.values(streams).some((stream) =>
        stream.bytes > Buffer.byteLength(stream.head + stream.tail, "utf-8")
      );
      let processed: Awaited<ReturnType<typeof truncateOutput>>;
      try {
        processed = await truncateOutput(raw, { toolName: "bash" });
      } catch (err: unknown) {
        const preview = raw.slice(0, 50 * 1024);
        finish({
          output: `${preview}\n... [capture could not be saved: ${formatError(err)}]`,
          metadata: { isError: code !== 0, exitCode: code, captureTruncated: true },
        });
        return;
      }

      if (code !== 0) {
        finish({
          output: `Command exited with code ${code}\n${processed.content}`,
          metadata: { isError: true, exitCode: code, truncated: processed.truncated, captureTruncated },
        });
        return;
      }

      finish({
        output: processed.content,
        metadata: { exitCode: 0, truncated: processed.truncated, captureTruncated },
      });
    });
  });
}

export function createBashTool(cwd: string = process.cwd()): ToolDefinition {
  return {
    name: "bash",
    description:
      "Execute a terminal command in the host environment. Use this for git, builds, package managers, and tests. For directory discovery, prefer list_dir's bounded tree output; avoid unscoped searches from ~. If a shell search is needed, scope it to likely folders and limit depth/results.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command line string to run",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds (defaults to 60000)",
        },
      },
      required: ["command"],
    },
    execute: async (params: Record<string, any>, _toolCwd, signal) => {
      try {
        return await executeBash(params as unknown as BashParams, cwd, signal);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
