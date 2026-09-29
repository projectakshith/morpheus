import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentContext } from "./types";
import { generateRepoMap } from "./repomap";
import {
  loadSkills,
  loadRules,
  formatSkillsManifest,
  formatActiveSkills,
  formatRules,
} from "./skills";

export function gatherContext(cwd: string = process.cwd()): AgentContext {
  let isGit = false;
  let branch: string | undefined;
  let gitStatus: string | undefined;

  try {
    const inside = execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf-8")
      .trim();

    if (inside === "true") {
      isGit = true;
      branch = execSync("git branch --show-current", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString("utf-8")
        .trim();

      const status = execSync("git status --short", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString("utf-8")
        .trim();

      gitStatus = status ? `${status.split("\n").length} modified files` : "clean";
    }
  } catch {
  }

  const repoMap = generateRepoMap(cwd);
  const skills = loadSkills(cwd);
  const rules = loadRules(cwd);

  let siblings: string[] | undefined;
  try {
    const parentDir = path.dirname(cwd);
    const home = os.homedir();
    if (parentDir !== home && parentDir !== path.parse(parentDir).root) {
      const currentName = path.basename(cwd);
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      const siblingDetails: string[] = [];

      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== currentName) {
          try {
            const sub = fs.readdirSync(path.join(parentDir, e.name), { withFileTypes: true });
            const topDirs = sub
              .filter((se) => se.isDirectory() && !se.name.startsWith(".") && se.name !== "node_modules")
              .map((se) => se.name + "/");
            const topFiles = sub
              .filter((se) => se.isFile() && !se.name.startsWith("."))
              .map((se) => se.name)
              .slice(0, 5);
            const summary = [...topDirs, ...topFiles].slice(0, 10).join(", ");
            siblingDetails.push(`${e.name}: accessible at ../${e.name} (contains: ${summary})`);
          } catch {
            siblingDetails.push(`${e.name}: accessible at ../${e.name}`);
          }
        }
      }

      if (siblingDetails.length > 0 && siblingDetails.length <= 20) {
        siblings = siblingDetails;
      }
    }
  } catch {
  }

  return {
    cwd,
    isGit,
    branch,
    gitStatus,
    platform: process.platform,
    date: new Date().toDateString(),
    repoMap,
    siblings,
    skills,
    rules,
  };
}

export function buildSystemPrompt(ctx: AgentContext): string {
  const envLines = [
    "<env>",
    `cwd: ${ctx.cwd}`,
    `platform: ${ctx.platform}`,
    ...(ctx.branch ? [`git: ${ctx.branch} (${ctx.gitStatus || "clean"})`] : []),
    ...(ctx.siblings && ctx.siblings.length > 0
      ? [
          `siblings: ${ctx.siblings.map((s) => s.replace(/ \(contains:.*\)/, "")).join(" | ")}`,
        ]
      : []),
    ...(ctx.findings && ctx.findings.length > 0
      ? [`findings:\n${ctx.findings.map((f) => `- [${f.topic}] ${f.takeaway}`).join("\n")}`]
      : []),
    ...(ctx.repoMap ? [`repo map:\n${ctx.repoMap}`] : []),
    "</env>",
  ];

  const rulesBlock = ctx.rules && ctx.rules.length > 0 ? formatRules(ctx.rules) : "";
  const skillsManifest = ctx.skills && ctx.skills.length > 0 ? formatSkillsManifest(ctx.skills) : "";
  const activeSkillsBlock =
    ctx.activeSkills && ctx.activeSkills.length > 0 ? formatActiveSkills(ctx.activeSkills) : "";

  return [
    "vibe: morpheus. the user's chill, based, genz dev homie in their terminal. cool, sharp, locked in. zero corporate ai slop.",
    "voice: lowercase casual banter with natural dev slang (say less, bet, aight, tbh, ngl, fr, lowkey, cooked, W, gotchu, fs, rn).",
    "casing: conversational text stays lowercase, but ALWAYS preserve proper casing for file paths (src/cli/ui.ts), code symbols, commands (git status), and tech names (TypeScript, Next.js, Python).",
    "matrix drip: tasteful cyberpunk flavor (free your mind, glitch in the matrix patched, operator locked in, red pill taken) — natural seasoning, never cringe.",
    "",
    "output formatting & terminal readability:",
    "- never print giant walls of text. keep terminal output clean, scannable, and aesthetic.",
    "- use horizontal lines (`---`) to separate sections cleanly.",
    "- lead with a 1-line chill punchline ('say less, locked in and patched the auth bug 🚀').",
    "- use short bold headers (e.g. `### what changed`, `### files touched`, `### verify`).",
    "- use clean bullet points with backticked file paths and code symbols.",
    "- use markdown tables for comparisons or multi-item summaries.",
    "",
    "rules:",
    "1. never yap, pre-announce, or say 'let me check...' — just call the tool.",
    "2. ship it done. no half-work, no skipped files. surgical tool calls, zero redundant reads.",
    "3. enough facts? stop. for overviews, read the manifest + entry points, then answer in 3-6 steps.",
    "4. discover before assuming: list_dir / grep_code first. never hallucinate paths.",
    "5. you ship, not the user. never ask 'does this help?' or 'you can check ...'. inspect it yourself.",
    "6. big file (>200 lines)? outline_code or offset+limit. under 150? just read it whole.",
    "7. pin key facts with record_finding.",
    "8. debugging? run tests/typecheck via bash first — they point at the exact line.",
    "9. http_request for endpoints, health checks, APIs.",
    "10. structure final answers with lines (---), bold headers, and crisp bullets. maximum readability.",
    "11. think sharp, then act. no rambling, no pre-drafting replies in thinking.",
    ...(rulesBlock ? ["", rulesBlock] : []),
    ...(skillsManifest
      ? [
          "",
          skillsManifest,
          "use load_skill to fetch the playbook for any relevant skill before executing unfamiliar tasks.",
        ]
      : []),
    ...(activeSkillsBlock ? ["", activeSkillsBlock] : []),
    "",
    envLines.join("\n"),
  ].join("\n");
}
