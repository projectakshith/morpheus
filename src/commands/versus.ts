import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

const STOPWORDS = new Set(
  "a an and are as at be by can code do does for from get how i if in into is it of on or the that this to was what when where which who why with find show me my we our use used using".split(" ")
);
const COLUMN = 40;
const ROWS = 5;

type RunResult = { stdout: string; ms: number; code: number };
type SeraphHit = { path: string; symbol: string | null; start_line: number; end_line: number; score: number };
type GrepHit = { path: string; line: number };

function run(command: string, args: string[], cwd: string): Promise<RunResult> {
  const start = performance.now();
  return new Promise((resolve) => {
    execFile(command, args, { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }, (error, stdout) => {
      const code = error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
        ? Number((error as { code: number }).code)
        : error ? -1 : 0;
      resolve({ stdout: String(stdout ?? ""), ms: performance.now() - start, code });
    });
  });
}

export function grepKeywords(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  return [...new Set(words.filter((word) => word.length >= 3 && !STOPWORDS.has(word)).map((word) => word.replace(/(es|s)$/, "")))];
}

function seraphPython(): string | undefined {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".morpheus", "config.json"), "utf8"));
    const command = config?.mcpServers?.seraph?.command;
    return typeof command === "string" && command ? command : undefined;
  } catch {
    return undefined;
  }
}

function pad(text: string, width: number): string {
  const chars = [...text];
  if (chars.length > width) return `${chars.slice(0, width - 1).join("")}…`;
  return text + " ".repeat(width - chars.length);
}

function ms(value: number): string {
  return value < 1000 ? `${Math.max(1, Math.round(value))}ms` : `${(value / 1000).toFixed(1)}s`;
}

export function grepRankOf(hits: GrepHit[], target: SeraphHit | undefined): number {
  if (!target) return -1;
  const index = hits.findIndex((hit) => hit.path === target.path && hit.line >= target.start_line && hit.line <= target.end_line);
  return index < 0 ? -1 : index + 1;
}

export function renderVersus(
  query: string,
  seraph: { hits: SeraphHit[]; ms: number; indexMs?: number },
  grep: { hits: GrepHit[]; ms: number; keywords: string[] }
): string {
  const files = new Set(grep.hits.map((hit) => hit.path)).size;
  const rank = grepRankOf(grep.hits, seraph.hits[0]);
  const left = [`◈ SERAPH  search ${ms(seraph.ms)}`, seraph.indexMs === undefined ? "" : `index ${ms(seraph.indexMs)}`];
  seraph.hits.slice(0, ROWS).forEach((hit, i) => {
    left.push(`${i + 1} ${hit.symbol || path.basename(hit.path)}`, `  ${hit.path}:${hit.start_line}`);
  });
  const right = [`◇ GREP  ${ms(grep.ms)}`, `${grep.hits.length} hits · ${files} files`];
  grep.hits.slice(0, ROWS * 2).forEach((hit, i) => right.push(`${i + 1} ${hit.path}:${hit.line}`));
  const lines = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => `${pad(left[i] ?? "", COLUMN)} │ ${right[i] ?? ""}`);
  const verdict = seraph.hits.length === 0
    ? "Seraph found nothing for this query."
    : rank === 1
      ? "Seraph's top result is also grep's first hit."
      : rank > 1
        ? `Seraph's #1 shows up at grep hit #${rank} of ${grep.hits.length}.`
        : `Seraph's #1 never appears in grep's ${grep.hits.length} hits.`;
  return [
    "## Seraph vs grep",
    `**Query:** ${query}`,
    `**grep pattern:** \`${grep.keywords.join("|") || "(no keywords)"}\``,
    "",
    "```",
    ...lines,
    "```",
    "",
    `◈ ${verdict}`,
  ].join("\n");
}

function addThread(ctx: CommandContext, response: string): void {
  const thread: Thread = {
    id: `thread_${Date.now()}`,
    index: ctx.threadsCount + 1,
    prompt: ctx.taskText,
    response,
    isStreaming: false,
    steps: [],
    isExpanded: false,
    status: "completed",
    stepCount: 0,
    startTime: Date.now(),
    durationMs: 0,
  };
  ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
  ctx.setThreads((prev) => [...prev, thread]);
}

export class VersusCommand implements CommandHandler {
  public readonly name = "versus";
  public readonly description = "Compare Seraph search with grep on the same question";
  public readonly aliases = ["/versus", "/vs"];

  public matches(trimmed: string): boolean {
    return /^\/(?:versus|vs)(?:\s|$)/i.test(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const query = trimmed.replace(/^\/(?:versus|vs)\s*/i, "").trim();
    if (!query) {
      addThread(ctx, "Usage: `/versus <question>`, for example `/versus where are mcp servers started`.");
      return true;
    }
    const python = seraphPython();
    if (!python) {
      addThread(ctx, "Seraph is not configured. Run `/seraph setup <path-to-seraph-checkout>` first.");
      return true;
    }
    const top = await run("git", ["rev-parse", "--show-toplevel"], process.cwd());
    const repo = top.stdout.trim();
    if (top.code !== 0 || !repo) {
      addThread(ctx, "`/versus` needs to run inside a Git repository.");
      return true;
    }

    const keywords = grepKeywords(query);
    const [seraphRun, grepRun] = await Promise.all([
      run(python, ["-m", "seraph.cli", "--repo", repo, "search", query, "--json", "--limit", String(ROWS)], repo),
      keywords.length
        ? run("git", ["grep", "-n", "-i", "-I", "-E", keywords.join("|")], repo)
        : Promise.resolve({ stdout: "", ms: 0, code: 1 }),
    ]);

    let seraphHits: SeraphHit[] = [];
    let seraphMs = seraphRun.ms;
    let indexMs: number | undefined;
    try {
      const out = JSON.parse(seraphRun.stdout);
      seraphHits = Array.isArray(out.results) ? out.results : [];
      if (typeof out.search_ms === "number") seraphMs = out.search_ms;
      if (typeof out.index?.ms === "number") indexMs = out.index.ms;
    } catch {
      addThread(ctx, `Seraph search failed. Check \`/seraph status\`.\n\n\`\`\`\n${seraphRun.stdout.slice(0, 800)}\n\`\`\``);
      return true;
    }
    const grepHits: GrepHit[] = grepRun.stdout
      .split("\n")
      .map((line) => line.match(/^(.+?):(\d+):/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => ({ path: match[1], line: Number(match[2]) }));

    addThread(ctx, renderVersus(query, { hits: seraphHits, ms: seraphMs, indexMs }, { hits: grepHits, ms: grepRun.ms, keywords }));
    return true;
  }
}

export const versusCommand = new VersusCommand();
