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
  cwd: string = process.cwd(),
  signal?: AbortSignal
): Promise<ToolResult> {
  const timeoutMs = params.timeoutMs ?? 60_000;
  if (signal?.aborted) {
    return { output: "[Command cancelled before execution.]", metadata: { cancelled: true } };
  }

  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", params.command], {
      detached: process.platform !== "win32",
      cwd,
      env: {
        ...process.env,
        PAGER: "cat",
        TERM: "xterm-256color",
      },
    });

    const HEAD_LIMIT = 32 * 1024;
    const TAIL_LIMIT = 96 * 1024;
    const streams = {
      stdout: { head: "", tail: "", bytes: 0 },
      stderr: { head: "", tail: "", bytes: 0 },
    };
    let settled = false;
    let stopReason: "timeout" | "cancelled" | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const capture = (name: "stdout" | "stderr", chunk: Buffer) => {
      const stream = streams[name];
      stream.bytes += chunk.length;
      const text = chunk.toString("utf-8");
      const headRoom = Math.max(0, HEAD_LIMIT - stream.head.length);
      stream.head += text.slice(0, headRoom);
      const overflow = text.slice(headRoom);
      if (overflow) stream.tail = (stream.tail + overflow).slice(-TAIL_LIMIT);
    };

    const signalProcess = (signalName: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && proc.pid) process.kill(-proc.pid, signalName);
        else proc.kill(signalName);
      } catch {
        try {
          proc.kill(signalName);
        } catch {
          // The process has already exited.
        }
      }
    };

    const stop = (reason: "timeout" | "cancelled") => {
      if (stopReason) return;
      stopReason = reason;
      signalProcess("SIGTERM");
      killTimer = setTimeout(() => signalProcess("SIGKILL"), 1_000);
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => stop("cancelled");

    const timer = setTimeout(() => {
      stop("timeout");
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    proc.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));

    proc.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    proc.on("error", (err) => {
      finish({ output: `Error: ${formatError(err)}`, metadata: { isError: true } });
    });

    proc.on("close", async (code) => {
      if (stopReason === "cancelled") {
        finish({ output: "[Command cancelled by user.]", metadata: { cancelled: true } });
        return;
      }
      if (stopReason === "timeout") {
        finish({
          output: `Error: Command timed out after ${timeoutMs / 1000}s: ${params.command}`,
          metadata: { isError: true, timedOut: true },
        });
        return;
      }

      const formatStream = (name: "stdout" | "stderr") => {
        const stream = streams[name];
        const retained = Buffer.byteLength(stream.head + stream.tail, "utf-8");
        const omitted = Math.max(0, stream.bytes - retained);
        return `${stream.head}${omitted > 0 ? `\n... [${omitted} bytes omitted from ${name}] ...\n` : ""}${stream.tail}`.trim();
      };

      const combined = [
        formatStream("stdout"),
        ...(formatStream("stderr") ? [`[stderr]\n${formatStream("stderr")}`] : []),
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = combined || "(command completed with no output)";
      const captureTruncated = Object.values(streams).some((stream) =>
        stream.bytes > Buffer.byteLength(stream.head + stream.tail, "utf-8")
      );
      let processed: Awaited<ReturnType<typeof truncateOutput>>;
      try {
        processed = await truncateOutput(raw);
      } catch (err: unknown) {
        const preview = raw.slice(0, 50 * 1024);
        finish({
          output: `${preview}\n... [capture could not be saved: ${formatError(err)}]`,
          metadata: { isError: code !== 0, exitCode: code, captureTruncated: true },
        });
        return;
      }

      if (code !== 0) {
        finish({
          output: `Command exited with code ${code}\n${processed.content}`,
          metadata: { isError: true, exitCode: code, truncated: processed.truncated, captureTruncated },
        });
        return;
      }

      finish({
        output: processed.content,
        metadata: { exitCode: 0, truncated: processed.truncated, captureTruncated },
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
    execute: async (params: Record<string, any>, _toolCwd, signal) => {
      try {
        return await executeBash(params as unknown as BashParams, cwd, signal);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
