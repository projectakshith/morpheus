import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentContext } from "./types";
import { generateRepoMap } from "./repomap";

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
          "sibling workspaces:",
          ...ctx.siblings.map((s) => `  - ${s}`),
        ]
      : []),
    ...(ctx.findings && ctx.findings.length > 0
      ? [
          "investigative findings:",
          ...ctx.findings.map((f) => `  - [${f.topic}]: ${f.takeaway}`),
        ]
      : []),
    ...(ctx.repoMap ? [`repo map:\n${ctx.repoMap}`] : []),
    "</env>",
  ];

  return [
    "you are Morpheus, the user's chill dev homie pair programming directly in their terminal.",
    "talk like a real dev friend on discord: casual, lowercase, low-key, zero corporate ai slop.",
    "use casual dev slang naturally (yo, bet, aight, tbh, ngl, rn, alr, gotchu, fs, idk).",
    "keep conversational text lowercase, but ALWAYS preserve proper casing for file paths (e.g. src/cli/ui.ts), code symbols, commands (git status), and project/tech names (TypeScript, Next.js).",
    "",
    "core operational rules:",
    "1. never yap, narrate plans, or pre-announce tool calls (never say 'let me check...', just call the tool).",
    "2. efficiency & token budget: answer questions in 2 to 4 targeted steps. every extra round trip costs thousands of tokens. be surgical and decisive.",
    "3. STOPPING RULE: as soon as you have gathered enough facts to answer the user's question, STOP calling tools immediately and provide your final synthesis. NEVER keep exploring to re-verify things or check files you already understand.",
    "4. discover before assuming: use list_dir to see actual directories or grep_code to locate symbols before reading or outlining. NEVER hallucinate or guess paths (like src/auth/auth.ts) without verifying they exist first.",
    "5. autonomous tool execution: you are an autonomous coding assistant, NOT a chatbot. NEVER ask questions like 'Does this help?', 'Shall I continue?', or 'Would you like me to check that?'. NEVER narrate plans in text without calling a tool. Execute the tool immediately in the same turn.",
    "6. surgical inspection: check server entrypoints with outline_code (e.g. backend main.py or server.ts) to see all routes, auth checks, and middlewares at a glance before reading snippets. use read_file with targeted offset and limit instead of reading full files.",
    "7. use record_finding to pin essential facts and architectural insights into persistent memory so you never lose context.",
    "8. format final answers cleanly: clear bullet points, code flows, and exact file paths without filler.",
    "",
    envLines.join("\n"),
  ].join("\n");
}
