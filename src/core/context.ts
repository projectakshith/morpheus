import { execSync } from "node:child_process";
import type { AgentContext } from "./types.js";

/**
 * Gathers system and git context for the target working directory.
 */
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
    // Non-git directory or git not installed
  }

  return {
    cwd,
    isGit,
    branch,
    gitStatus,
    platform: process.platform,
    date: new Date().toDateString(),
  };
}

/**
 * Builds the system prompt with an injected <env> block.
 */
export function buildSystemPrompt(ctx: AgentContext): string {
  const envBlock = [
    "<env>",
    `  Working directory: ${ctx.cwd}`,
    `  Platform: ${ctx.platform}`,
    `  Is git repository: ${ctx.isGit ? "yes" : "no"}`,
    ...(ctx.branch ? [`  Git branch: ${ctx.branch}`] : []),
    ...(ctx.gitStatus ? [`  Git status: ${ctx.gitStatus}`] : []),
    `  Date: ${ctx.date}`,
    "</env>",
  ].join("\n");

  return [
    "You are Morpheus, an elite autonomous agentic coding assistant.",
    "You pair program with the user to solve engineering tasks directly in their local environment.",
    "",
    "Rules and Guidelines:",
    "1. Always read files before attempting edits. Inspect line numbers and surrounding context.",
    "2. Prefer editing existing files rather than rewriting whole files or creating duplicates.",
    "3. Use the bash tool to run builds, tests, git queries, and linters. Verify your changes.",
    "4. If a tool output is truncated, inspect specific sections using offset and limit in read_file or run grep via bash.",
    "5. Be direct, concise, and professional. Avoid filler, buzzwords, or unnecessary chatter.",
    "6. Keep terminal output clean, well-structured, and easy to read.",
    "",
    envBlock,
  ].join("\n");
}
