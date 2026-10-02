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

export function getGitInfo(cwd: string = process.cwd()): { isGit: boolean; branch?: string; gitStatus?: string } {
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

  return { isGit, branch, gitStatus };
}

export function gatherContext(cwd: string = process.cwd()): AgentContext {
  const { isGit, branch, gitStatus } = getGitInfo(cwd);

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
    ...(rulesBlock ? [rulesBlock] : []),
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
