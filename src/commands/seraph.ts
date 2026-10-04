import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

type SeraphServer = { command?: string; args?: string[]; env?: Record<string, string>; disabled?: boolean; [key: string]: unknown };
type MorpheusConfig = { mcpServers?: Record<string, SeraphServer>; [key: string]: unknown };

const SERVER_ARGS = ["-m", "seraph.server"];

function configPath(): string {
  return path.join(os.homedir(), ".morpheus", "config.json");
}

function readConfig(): MorpheusConfig {
  try {
    const value = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as MorpheusConfig;
    throw new Error("config.json must contain a JSON object");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeConfig(config: MorpheusConfig): Promise<void> {
  const filePath = configPath();
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tempPath, filePath);
}

function venvPython(dir: string): string | undefined {
  const candidates = process.platform === "win32"
    ? [path.join(dir, ".venv", "Scripts", "python.exe"), path.join(dir, "python.exe")]
    : [path.join(dir, ".venv", "bin", "python"), path.join(dir, "python")];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findPython(hint?: string): string | undefined {
  const home = hint ?? process.env.SERAPH_HOME;
  if (home) return venvPython(path.resolve(home.replace(/^~(?=$|\/|\\)/, os.homedir())));
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["seraph"], { encoding: "utf8" });
  const binary = which.status === 0 ? which.stdout.split(/\r?\n/)[0]?.trim() : "";
  if (binary) return venvPython(path.dirname(fs.realpathSync(binary)));
  return undefined;
}

function checkPython(python: string): string | undefined {
  const probe = spawnSync(python, ["-c", "import seraph.server"], { encoding: "utf8", timeout: 30000 });
  if (probe.status === 0) return undefined;
  return (probe.stderr || probe.error?.message || "import failed").trim().split("\n").pop();
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

export class SeraphCommand implements CommandHandler {
  public readonly name = "seraph";
  public readonly description = "Set up and check Seraph code search";
  public readonly aliases = ["/seraph"];

  public matches(trimmed: string): boolean {
    return /^\/seraph(?:\s|$)/i.test(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const [, rawAction, hint] = trimmed.trim().split(/\s+/);
    const action = rawAction?.toLowerCase() ?? "status";

    if (action === "setup") {
      const python = findPython(hint);
      if (!python) {
        addThread(ctx, "Could not find Seraph. Run `/seraph setup <path-to-seraph-checkout>` or set `SERAPH_HOME`; the checkout needs a `.venv` with `seraph[mcp]` installed.");
        return true;
      }
      const problem = checkPython(python);
      if (problem) {
        addThread(ctx, `Found \`${python}\` but it cannot load the Seraph MCP server: ${problem}\n\nInstall it with \`uv sync --extra mcp\` in the Seraph checkout.`);
        return true;
      }
      try {
        const config = readConfig();
        const mcpServers = config.mcpServers ?? {};
        mcpServers.seraph = { ...(mcpServers.seraph ?? {}), command: python, args: SERVER_ARGS, disabled: false };
        await writeConfig({ ...config, mcpServers });
        addThread(ctx, `Seraph MCP is configured in \`~/.morpheus/config.json\` using \`${python}\`. It searches the Git repository Morpheus is running in; the next task connects automatically.`);
      } catch (error) {
        addThread(ctx, `Could not configure Seraph MCP: ${error instanceof Error ? error.message : String(error)}`);
      }
      return true;
    }

    if (action === "enable" || action === "disable") {
      try {
        const config = readConfig();
        const server = config.mcpServers?.seraph;
        if (!server) {
          addThread(ctx, "Seraph is not configured yet. Run `/seraph setup` first.");
          return true;
        }
        await writeConfig({ ...config, mcpServers: { ...config.mcpServers, seraph: { ...server, disabled: action === "disable" } } });
        addThread(ctx, `Seraph MCP ${action}d. This takes effect on the next agent run.`);
      } catch (error) {
        addThread(ctx, `Could not update Seraph MCP: ${error instanceof Error ? error.message : String(error)}`);
      }
      return true;
    }

    if (action !== "status" && action !== "help") {
      addThread(ctx, "Usage: `/seraph setup [path]`, `/seraph status`, `/seraph enable`, or `/seraph disable`.");
      return true;
    }

    let server: SeraphServer | undefined;
    try {
      server = readConfig().mcpServers?.seraph;
    } catch (error) {
      addThread(ctx, `Could not read Morpheus config: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
    const configStatus = !server ? "not configured" : server.disabled ? "configured, disabled" : "configured, enabled";
    const python = server?.command;
    const problem = python ? checkPython(python) : undefined;
    const runtimeStatus = !python ? "unknown" : problem ? `not ready (${problem})` : `ready (\`${python}\`)`;
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
    const repo = top.status === 0 ? top.stdout.trim() : "";
    const indexed = repo && fs.existsSync(path.join(repo, ".seraph", "index.sqlite")) ? "indexed" : "not indexed yet (first search indexes it)";
    const response = [
      "## Seraph",
      `- **Morpheus config:** ${configStatus}`,
      `- **Runtime:** ${runtimeStatus}`,
      `- **Repository:** ${repo ? `\`${repo}\`, ${indexed}` : "not inside a Git repository"}`,
      "",
      "Run /seraph setup to add the MCP server. Tools appear as `mcp_seraph_search_code`, `mcp_seraph_search_at_version`, `mcp_seraph_search_history` and `mcp_seraph_index_repository`.",
    ].join("\n");
    addThread(ctx, response);
    return true;
  }
}

export const seraphCommand = new SeraphCommand();
