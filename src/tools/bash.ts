import { spawn } from "node:child_process";
import { truncateOutput } from "./construct";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface BashParams {
  command: string;
  timeoutMs?: number;
}

export async function executeBash(
  params: BashParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  const timeoutMs = params.timeoutMs ?? 60_000;

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", ["-c", params.command], {
      cwd,
      env: {
        ...process.env,
        PAGER: "cat",
        TERM: "xterm-256color",
      },
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${params.command}`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", async (code) => {
      clearTimeout(timer);
      if (killed) return;

      const combined = [
        stdout.trim(),
        stderr.trim() ? `[stderr]\n${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = combined || "(command completed with no output)";
      const processed = await truncateOutput(raw);

      if (code !== 0) {
        resolve({
          output: `Command exited with code ${code}\n${processed.content}`,
          metadata: { exitCode: code, truncated: processed.truncated },
        });
        return;
      }

      resolve({
        output: processed.content,
        metadata: { exitCode: 0, truncated: processed.truncated },
      });
    });
  });
}

export function createBashTool(cwd: string = process.cwd()): ToolDefinition {
  return {
    name: "bash",
    description:
      "Execute a terminal command in the host environment. Use this for git, builds, package managers, and tests.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command line string to run",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds (defaults to 60000)",
        },
      },
      required: ["command"],
    },
    execute: async (params: Record<string, any>) => {
      try {
        return await executeBash(params as unknown as BashParams, cwd);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
