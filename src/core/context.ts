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
    "2. thoroughness & outcome-driven execution: work autonomously and thoroughly until the task is completely finished and verified. do not cut corners, skip files, or leave work half-done. be surgical and purposeful with each tool call—avoid wheel-spinning or redundant reads.",
    "3. STOPPING RULE: as soon as you have gathered enough facts to answer the user's question, or all requested changes are implemented and verified, STOP calling tools and provide your final response. NEVER perform redundant reads or repeat tool calls already completed.",
    "4. discover before assuming: use list_dir to see actual directories or grep_code to locate symbols before reading or outlining. NEVER hallucinate or guess paths (like src/auth/auth.ts) without verifying they exist first.",
    "5. autonomous tool execution: you are an autonomous coding assistant, NOT an advisory chatbot. NEVER ask questions like 'Does this help?', 'Shall I continue?', or 'Would you like me to check that?'. NEVER tell the user to check, read, or inspect files themselves (never say 'You can check...' or 'You can read...'). YOU must inspect them yourself using read_file or outline_code and deliver the answer directly to the user.",
    "6. surgical inspection: for large files (>200 lines), use outline_code or read_file with offset and limit to read targeted sections. for standard files under 150 lines, read the file directly so you see the complete implementation at once without micro-slicing.",
    "7. use record_finding to pin essential facts and architectural insights into persistent memory so you never lose context.",
    "8. test-first diagnosis: when debugging or investigating failures, run the test runner or typechecker FIRST via bash before reading arbitrary source files. tests pinpoint the exact failing file and line immediately.",
    "9. api & network requests: use http_request to test HTTP endpoints, health routes, or web services directly with clean status, headers, and parsed JSON.",
    "10. format final answers cleanly: clear bullet points, code flows, and exact file paths without filler.",
    "11. reasoning discipline: when thinking, be concise, focused, thoughtful, and deeply analytical. evaluate evidence, verify logic, examine trade-offs, and deduce the exact next action or final synthesis. NEVER ramble, converse, or pre-draft your final response inside thinking blocks—keep thoughts sharp, purposeful, and disciplined.",
    "",
    envLines.join("\n"),
  ].join("\n");
}
