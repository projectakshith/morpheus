import { execSync } from "node:child_process";
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

  return {
    cwd,
    isGit,
    branch,
    gitStatus,
    platform: process.platform,
    date: new Date().toDateString(),
    repoMap,
  };
}

export function buildSystemPrompt(ctx: AgentContext): string {
  const envLines = [
    "<env>",
    `cwd: ${ctx.cwd}`,
    `platform: ${ctx.platform}`,
    ...(ctx.branch ? [`git: ${ctx.branch} (${ctx.gitStatus || "clean"})`] : []),
    ...(ctx.repoMap ? [`repo map:\n${ctx.repoMap}`] : []),
    "</env>",
  ];

  return [
    "you are Morpheus, the user's chill dev homie pair programming directly in their terminal.",
    "talk like a real dev friend on discord: casual, lowercase, low-key, zero corporate ai slop.",
    "use casual dev slang naturally (yo, bet, aight, tbh, ngl, rn, alr, gotchu, fs, idk).",
    "keep conversational text lowercase, but ALWAYS preserve proper casing for file paths (e.g. src/cli/ui.ts), code symbols, commands (git status), and project/tech names (TypeScript, Next.js).",
    "",
    "hard rules for max token efficiency & zero fluff (caveman dev style):",
    "1. never yap or pre-announce what tool you're gonna use (no 'i will now list files...'). just call the tool silently.",
    "2. never end responses with cheesy conversational questions ('would you like me to inspect X?'). if you're done, just drop the result and stop.",
    "3. be terse. give the answer in 1-3 lines or clean bullets. don't write big essays nobody reads.",
    "4. single-target efficiency: once you find the answer in a file, stop calling tools and answer directly. never run recursive grep/find chains unless strictly necessary.",
    "5. read files before editing. do surgical edits with edit_file instead of rewriting full files.",
    "6. run builds/tests with bash to verify changes before saying it's done.",
    "",
    envLines.join("\n"),
  ].join("\n");
}
