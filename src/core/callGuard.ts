import path from "node:path";
import type { ChatMessage } from "./types";

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "list_dir",
  "grep_code",
  "outline_code",
  "record_finding",
  "load_skill",
]);

const SINGLE_FILE_WRITERS = new Set(["edit_file", "write_file"]);

const READ_DEFAULT_LIMIT = 1000;
const READ_MAX_LIMIT = 2000;

interface CachedCall {
  toolCallId: string;
  step: number;
  output: string;
}

interface CachedRead extends CachedCall {
  resolvedPath: string;
}

export type GuardVerdict =
  | { skip: false; repeat: boolean }
  | { skip: true; repeat: true; notice: string };

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/* Skips a call only if nothing that could change its result ran since, and the earlier result is still visible in the context the model was sent. */
export class ToolCallGuard {
  private reads = new Map<string, CachedRead>();
  private lastBash: { command: string; call: CachedCall } | null = null;
  private seenSinceChange = new Set<string>();

  constructor(private readonly cwd: string) {}

  check(
    toolName: string,
    args: Record<string, unknown>,
    step: number,
    visibleMessages: ChatMessage[]
  ): GuardVerdict {
    if (toolName === "read_file") {
      const key = this.readKey(args);
      const cached = key ? this.reads.get(key) : undefined;
      if (cached && this.isVisible(cached, step, visibleMessages)) {
        return {
          skip: true,
          repeat: true,
          notice: `[Notice: This exact range of '${args.filePath}' was already read in step ${cached.step} and nothing has changed since. Its full contents are in that earlier tool result—use them instead of re-reading.]`,
        };
      }
    } else if (toolName === "bash") {
      const command = typeof args.command === "string" ? args.command.trim() : "";
      const last = this.lastBash;
      if (last && command && last.command === command && this.isVisible(last.call, step, visibleMessages)) {
        return {
          skip: true,
          repeat: true,
          notice: `[Notice: '${command}' was just run in step ${last.call.step} and nothing has changed since, so its output would be identical. Use that earlier result, or change something before rerunning.]`,
        };
      }
    }
    return { skip: false, repeat: this.seenSinceChange.has(this.callKey(toolName, args)) };
  }

  record(
    toolName: string,
    args: Record<string, unknown>,
    step: number,
    toolCallId: string,
    output: string,
    isError: boolean
  ): void {
    if (READ_ONLY_TOOLS.has(toolName)) {
      const key = toolName === "read_file" ? this.readKey(args) : null;
      if (key && !isError) {
        this.reads.set(key, { toolCallId, step, output, resolvedPath: this.resolve(args.filePath as string) });
      }
      this.seenSinceChange.add(this.callKey(toolName, args));
      return;
    }

    this.lastBash = null;
    this.seenSinceChange.clear();
    const target = typeof args.filePath === "string" ? this.resolve(args.filePath) : null;
    if (SINGLE_FILE_WRITERS.has(toolName) && target) {
      for (const [key, read] of this.reads) {
        if (read.resolvedPath === target) this.reads.delete(key);
      }
    } else {
      this.reads.clear();
    }

    this.seenSinceChange.add(this.callKey(toolName, args));
    if (toolName === "bash" && !isError && typeof args.command === "string") {
      this.lastBash = { command: args.command.trim(), call: { toolCallId, step, output } };
    }
  }

  private callKey(toolName: string, args: Record<string, unknown>): string {
    if (toolName === "read_file") return `read_file:${this.readKey(args) ?? JSON.stringify(args)}`;
    if (toolName === "bash" && typeof args.command === "string") return `bash:${args.command.trim()}`;
    return `${toolName}:${JSON.stringify(args)}`;
  }

  private readKey(args: Record<string, unknown>): string | null {
    if (typeof args.filePath !== "string" || !args.filePath) return null;
    const offset = Math.max(1, toInt(args.offset, 1));
    const limit = Math.max(1, Math.min(toInt(args.limit, READ_DEFAULT_LIMIT), READ_MAX_LIMIT));
    return `${this.resolve(args.filePath)}:${offset}:${limit}`;
  }

  private resolve(filePath: string): string {
    return path.resolve(this.cwd, filePath);
  }

  private isVisible(call: CachedCall, step: number, visibleMessages: ChatMessage[]): boolean {
    if (call.step === step) return true;
    return visibleMessages.some(
      (m) => m.role === "tool" && m.tool_call_id === call.toolCallId && m.content === call.output
    );
  }
}
