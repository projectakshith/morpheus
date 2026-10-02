import * as path from "../../../utils/posixPath";
import type { ThreadStep } from "../../types";
import { sanitizeOutputLine } from "../../utils/cells";

const QUIET_TOOLS = new Set([
  "read_file",
  "list_dir",
  "grep_code",
  "outline_code",
  "load_skill",
  "record_finding",
]);

export interface QuietItem {
  stepId: string;
  verb: string;
  target: string;
  result: string;
  running: boolean;
}

export interface DiffRow {
  kind: "add" | "del" | "ctx" | "gap";
  lineNo?: number;
  text: string;
}

export interface TextLine {
  text: string;
  error: boolean;
}

export type CardBody =
  | { type: "diff"; rows: DiffRow[]; lang: string }
  | { type: "code"; lines: string[]; lang: string }
  | { type: "text"; lines: TextLine[]; keep: "head" | "tail" }
  | { type: "none" };

export type CardVerb = "edit" | "write" | "run" | "fetch" | string;

export interface CardModel {
  stepId: string;
  verb: CardVerb;
  target: string;
  targetIsPath: boolean;
  status: string;
  running: boolean;
  failed: boolean;
  added?: number;
  removed?: number;
  filePath?: string;
  body: CardBody;
}

export type StepModel = { kind: "quiet"; item: QuietItem } | { kind: "card"; card: CardModel };

export function relativePath(filePath: string, cwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath.replace(/^\.\//, "");
  const rel = path.relative(cwd, filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function cleanCommand(command: string, cwd: string): string {
  let cmd = command.trim();
  for (const prefix of [`cd ${cwd} && `, `cd "${cwd}" && `, `cd '${cwd}' && `]) {
    if (cmd.startsWith(prefix)) cmd = cmd.slice(prefix.length);
  }
  const firstLine = cmd.split("\n")[0];
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  return cmd.includes("\n") ? `${collapsed} …` : collapsed;
}

function outputLines(output: string | undefined): string[] {
  if (!output) return [];
  const lines = output.split("\n").map(sanitizeOutputLine);
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  return lines;
}

function errorLines(output: string | undefined): TextLine[] {
  return outputLines(output).map((l) => ({ text: l.replace(/^Error:\s*/, ""), error: true }));
}

function plainLines(output: string | undefined, error: boolean): TextLine[] {
  return outputLines(output).map((text) => ({ text, error }));
}

function bashLines(output: string): TextLine[] {
  const lines: TextLine[] = [];
  let inStderr = false;
  for (const text of outputLines(output)) {
    const marker = text.trim();
    if (marker === "[stderr]") inStderr = true;
    else if (marker === "[stdout]") inStderr = false;
    else if (!/^Command exited with code \d+/.test(text)) lines.push({ text, error: inStderr });
  }
  return lines;
}

function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return "";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  return `${mins}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function parseUnifiedDiff(diffText: string): { rows: DiffRow[]; added: number; removed: number } {
  const all: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let added = 0;
  let removed = 0;
  let inHunk = false;

  for (const raw of diffText.split("\n")) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      if (all.length > 0) all.push({ kind: "gap", text: "" });
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("\\")) continue;
    const text = sanitizeOutputLine(raw.slice(1));
    if (raw.startsWith("+")) {
      all.push({ kind: "add", lineNo: newNo++, text });
      added++;
    } else if (raw.startsWith("-")) {
      all.push({ kind: "del", lineNo: oldNo++, text });
      removed++;
    } else if (raw.startsWith(" ") || raw === "") {
      if (raw === "" && all.length === 0) continue;
      all.push({ kind: "ctx", lineNo: newNo, text });
      oldNo++;
      newNo++;
    }
  }

  const keep = all.map((row, i) => {
    if (row.kind === "add" || row.kind === "del" || row.kind === "gap") return true;
    const near = (j: number) => all[j] && (all[j].kind === "add" || all[j].kind === "del");
    return near(i - 1) || near(i + 1);
  });
  const rows: DiffRow[] = [];
  all.forEach((row, i) => {
    if (keep[i]) {
      if (row.kind === "gap" && rows[rows.length - 1]?.kind === "gap") return;
      rows.push(row);
    } else if (rows.length > 0 && rows[rows.length - 1].kind !== "gap") {
      rows.push({ kind: "gap", text: "" });
    }
  });
  while (rows[rows.length - 1]?.kind === "gap") rows.pop();
  while (rows[0]?.kind === "gap") rows.shift();
  return { rows, added, removed };
}

function langFor(filePath: string): string {
  return path.extname(filePath).slice(1);
}

function quietItem(step: ThreadStep, cwd: string): QuietItem {
  const args = step.args ?? {};
  const running = Boolean(step.isRunning);
  const out = step.output ?? "";
  switch (step.name) {
    case "read_file": {
      const file = path.basename(str(args.filePath)) || "file";
      const offset = Number(args.offset);
      const lines = (out.match(/^\d+: /gm) ?? []).length;
      return {
        stepId: step.id,
        verb: "read",
        target: offset > 1 ? `${file}:${offset}` : file,
        result: running ? "" : plural(lines, "line"),
        running,
      };
    }
    case "list_dir": {
      const dir = relativePath(str(args.dirPath) || ".", cwd);
      const entries = (out.match(/[├└]──/g) ?? []).length;
      return { stepId: step.id, verb: "list", target: dir.endsWith("/") ? dir : `${dir}/`, result: running ? "" : plural(entries, "entry", "entries"), running };
    }
    case "grep_code": {
      const where = str(args.path) ? ` in ${relativePath(str(args.path), cwd)}` : "";
      const hits = (out.match(/^\s+\d+:/gm) ?? []).length;
      const files = out.split("\n").filter((l) => /^\S.*:$/.test(l)).length;
      const result = running ? "" : hits === 0 ? "no hits" : `${plural(hits, "hit")} · ${plural(files, "file")}`;
      return { stepId: step.id, verb: "search", target: `"${str(args.pattern)}"${where}`, result, running };
    }
    case "outline_code": {
      const symbols = out.match(/(\d+) symbols?\)/);
      return {
        stepId: step.id,
        verb: "outline",
        target: path.basename(str(args.filePath)),
        result: symbols ? plural(Number(symbols[1]), "symbol") : "",
        running,
      };
    }
    case "load_skill":
      return { stepId: step.id, verb: "skill", target: str(args.name) || str(args.skill) || "skill", result: "", running };
    case "record_finding":
      return { stepId: step.id, verb: "noted", target: str(args.topic) || "finding", result: "", running };
    default:
      return { stepId: step.id, verb: step.name ?? "tool", target: "", result: "", running };
  }
}

function quietVerbForCard(name: string | undefined): string {
  switch (name) {
    case "read_file":
      return "read";
    case "list_dir":
      return "list";
    case "grep_code":
      return "search";
    case "outline_code":
      return "outline";
    default:
      return name ?? "tool";
  }
}

export function describeStep(step: ThreadStep, cwd: string, now: number = Date.now()): StepModel {
  const args = step.args ?? {};
  const running = Boolean(step.isRunning);
  const failed = Boolean(step.isError);
  const elapsed = running && step.startTime ? now - step.startTime : step.durationMs ?? 0;
  const runningStatus = `running${formatDuration(elapsed) ? ` ${formatDuration(elapsed)}` : ""}`;

  if (QUIET_TOOLS.has(step.name ?? "") && !failed) {
    return { kind: "quiet", item: quietItem(step, cwd) };
  }

  const base = { stepId: step.id, running, failed };

  if (QUIET_TOOLS.has(step.name ?? "")) {
    const item = quietItem(step, cwd);
    return {
      kind: "card",
      card: {
        ...base,
        verb: quietVerbForCard(step.name),
        target: item.target,
        targetIsPath: step.name !== "grep_code",
        status: "failed",
        body: { type: "text", lines: errorLines(step.output), keep: "head" },
      },
    };
  }

  switch (step.name) {
    case "edit_file": {
      const filePath = relativePath(str(args.filePath), cwd);
      if (running) {
        return { kind: "card", card: { ...base, verb: "edit", target: filePath, targetIsPath: true, status: runningStatus, body: { type: "none" } } };
      }
      if (failed) {
        return {
          kind: "card",
          card: { ...base, verb: "edit", target: filePath, targetIsPath: true, status: "failed", body: { type: "text", lines: errorLines(step.output), keep: "head" } },
        };
      }
      const { rows, added, removed } = parseUnifiedDiff(step.output ?? "");
      return {
        kind: "card",
        card: { ...base, verb: "edit", target: filePath, targetIsPath: true, status: "", added, removed, filePath: str(args.filePath), body: { type: "diff", rows, lang: langFor(filePath) } },
      };
    }

    case "write_file": {
      const filePath = relativePath(str(args.filePath), cwd);
      const content = str(args.content).replace(/\n$/, "");
      const lines = content ? content.split("\n").map(sanitizeOutputLine) : [];
      if (running || failed) {
        return {
          kind: "card",
          card: {
            ...base,
            verb: "write",
            target: filePath,
            targetIsPath: true,
            status: running ? runningStatus : "failed",
            body: failed ? { type: "text", lines: errorLines(step.output), keep: "head" } : { type: "none" },
          },
        };
      }
      return {
        kind: "card",
        card: { ...base, verb: "write", target: filePath, targetIsPath: true, status: plural(lines.length, "line"), added: lines.length, filePath: str(args.filePath), body: { type: "code", lines, lang: langFor(filePath) } },
      };
    }

    case "bash": {
      const command = cleanCommand(str(args.command), cwd);
      if (running) {
        return { kind: "card", card: { ...base, verb: "run", target: command, targetIsPath: false, status: runningStatus, body: { type: "none" } } };
      }
      const raw = step.output ?? "";
      const exitMatch = raw.match(/^Command exited with code (\d+)/m);
      const exitCode = exitMatch ? Number(exitMatch[1]) : failed ? undefined : 0;
      const lines = bashLines(raw);
      const duration = formatDuration(step.durationMs ?? 0);
      const exitLabel = exitCode === undefined ? "failed" : `exit ${exitCode}`;
      return {
        kind: "card",
        card: {
          ...base,
          failed: failed || (exitCode !== undefined && exitCode !== 0),
          verb: "run",
          target: command,
          targetIsPath: false,
          status: duration ? `${exitLabel} · ${duration}` : exitLabel,
          body: { type: "text", lines, keep: "tail" },
        },
      };
    }

    case "http_request": {
      const method = str(args.method).toUpperCase() || "GET";
      const status = httpStatus(step.output);
      return {
        kind: "card",
        card: {
          ...base,
          verb: "fetch",
          target: `${method} ${str(args.url)}`,
          targetIsPath: false,
          status: running ? runningStatus : failed ? "failed" : status,
          body: running ? { type: "none" } : { type: "text", lines: plainLines(step.output, failed), keep: "head" },
        },
      };
    }

    case "uplink_search": {
      return {
        kind: "card",
        card: {
          ...base,
          verb: "search",
          target: str(args.query),
          targetIsPath: false,
          status: running ? runningStatus : failed ? "failed" : "ok",
          body: running ? { type: "none" } : { type: "text", lines: plainLines(step.output, failed), keep: "head" },
        },
      };
    }

    case "uplink_browse": {
      const action = str(args.action) || "browse";
      const target = str(args.url) || (args.ref ? `[${args.ref}]` : "");
      return {
        kind: "card",
        card: {
          ...base,
          verb: action,
          target,
          targetIsPath: false,
          status: running ? runningStatus : failed ? "failed" : "ok",
          body: running ? { type: "none" } : { type: "text", lines: plainLines(step.output, failed), keep: "head" },
        },
      };
    }

    default: {
      const primary = str(args.filePath) || str(args.command) || str(args.url) || str(args.path);
      return {
        kind: "card",
        card: {
          ...base,
          verb: step.name ?? "tool",
          target: primary ? relativePath(primary, cwd) : "",
          targetIsPath: Boolean(str(args.filePath) || str(args.path)),
          status: running ? runningStatus : failed ? "failed" : "",
          body: running ? { type: "none" } : { type: "text", lines: plainLines(step.output, failed), keep: "head" },
        },
      };
    }
  }
}

function httpStatus(output: string | undefined): string {
  const match = output?.match(/\b(?:HTTP\/[\d.]+\s+|status:?\s*)(\d{3})\b/i);
  return match ? match[1] : "";
}
