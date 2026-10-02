import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

type CuaServer = { command?: string; args?: string[]; disabled?: boolean; [key: string]: unknown };
type MorpheusConfig = { mcpServers?: Record<string, CuaServer>; [key: string]: unknown };

function configPath(): string {
  return path.join(os.homedir(), ".morpheus", "config.json");
}

function driverCommand(): string {
  const localBinary = path.join(os.homedir(), ".local", "bin", "cua-driver");
  return fs.existsSync(localBinary) ? localBinary : "cua-driver";
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

export class CuaCommand implements CommandHandler {
  public readonly name = "cua";
  public readonly description = "Set up and check Cua Driver computer use";
  public readonly aliases = ["/cua"];

  public matches(trimmed: string): boolean {
    return /^\/cua(?:\s|$)/i.test(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const action = trimmed.trim().split(/\s+/)[1]?.toLowerCase() ?? "status";
    if (action === "setup") {
      try {
        const config = readConfig();
        const mcpServers = config.mcpServers ?? {};
        const existing = mcpServers.cua;
        const command = driverCommand();
        if (existing && existing.command && existing.command !== "cua-driver" && existing.command !== command) {
          addThread(ctx, `Cua MCP is already configured with a custom command: \`${existing.command}\`. I left it unchanged.`);
          return true;
        }
        mcpServers.cua = { ...(existing ?? {}), command, args: ["mcp"], disabled: false };
        await writeConfig({ ...config, mcpServers });
        addThread(ctx, "Cua Driver MCP is configured in `~/.morpheus/config.json`. After installing Cua Driver and granting OS permissions, run `/cua status`; the next task connects automatically.");
      } catch (error) {
        addThread(ctx, `Could not configure Cua MCP: ${error instanceof Error ? error.message : String(error)}`);
      }
      return true;
    }

    if (action === "enable" || action === "disable") {
      try {
        const config = readConfig();
        const server = config.mcpServers?.cua;
        if (!server) {
          addThread(ctx, "Cua is not configured yet. Run `/cua setup` first.");
          return true;
        }
        await writeConfig({ ...config, mcpServers: { ...config.mcpServers, cua: { ...server, disabled: action === "disable" } } });
        addThread(ctx, `Cua MCP ${action}d. This takes effect on the next agent run.`);
      } catch (error) {
        addThread(ctx, `Could not update Cua MCP: ${error instanceof Error ? error.message : String(error)}`);
      }
      return true;
    }

    if (action !== "status" && action !== "help") {
      addThread(ctx, "Usage: `/cua setup`, `/cua status`, `/cua enable`, or `/cua disable`.");
      return true;
    }

    let configStatus = "not configured";
    try {
      const server = readConfig().mcpServers?.cua;
      if (server) configStatus = server.disabled ? "configured, disabled" : "configured, enabled";
    } catch (error) {
      addThread(ctx, `Could not read Morpheus config: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
    const command = driverCommand();
    const version = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 3000 });
    const installStatus = (version.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
      ? "not installed or not on PATH"
      : version.status === 0
        ? (version.stdout || version.stderr).trim()
        : `not ready (${version.error?.message ?? version.stderr?.trim() ?? "version check failed"})`;
    const permission = spawnSync(command, ["permissions", "status"], { encoding: "utf8", timeout: 5000 });
    const permissionStatus = permission.status === 0
      ? (permission.stdout || permission.stderr).trim()
      : "not checked; start CuaDriver.app and run `cua-driver permissions status`";
    const response = [
      "## Cua Driver",
      `- **Morpheus config:** ${configStatus}`,
      `- **Driver:** ${installStatus}`,
      "- **Permissions:**",
      "```",
      permissionStatus,
      "```",
      "",
      "Run /cua setup to add the MCP server. After setup, start a new task that asks Morpheus to use Cua tools.",
    ].join("\n");
    addThread(ctx, response);
    return true;
  }
}

export const cuaCommand = new CuaCommand();
