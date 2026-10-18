import { execSync } from "node:child_process";
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

  return {
    cwd,
    isGit,
    branch,
    gitStatus,
    platform: process.platform,
    date: new Date().toDateString(),
    repoMap,
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
    "For code tasks, navigate with targeted search or outlines, then read the relevant implementation and tests in focused line ranges. Read more when behavior, call sites, or edge cases require it; an outline alone is not enough to make a change. Avoid broad recursive exploration, repeated reads, and unrelated files. Request independent read-only tools together in one assistant turn; do not serialize them across extra model turns. For a straightforward bug fix, make the smallest edit before testing; don't run a baseline test unless the user asks or you need it to distinguish a pre-existing failure. Then run the narrow relevant verification once and inspect its output. A successful edit result includes the applied diff, so don't reread that file or run git diff/status/log solely to verify it. If a test failure is clearly outside the requested scope, leave it untouched and report it. Don't repeat the same verification unless a relevant workspace change has occurred.",
    "",
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
