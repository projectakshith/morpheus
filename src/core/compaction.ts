import type { ChatMessage, CoreMessage } from "./types";
import { isToolError } from "../utils/errors";

export interface CompactionOptions {
  /**
   * Number of recent user turns to protect from compaction in full fidelity.
   * Default: 2
   */
  recentTurnsToProtect?: number;

  /**
   * Number of recent assistant tool execution steps to protect in full fidelity.
   * Default: 2
   */
  recentStepsToProtect?: number;

  /**
   * Minimum character length of tool output before compaction kicks in.
   * Short outputs (e.g. git branch, whoami) are kept intact to avoid re-fetching.
   * Default: 400 characters (~100 tokens)
   */
  compactThresholdChars?: number;

  /**
   * Number of error lines (header + stack trace top) to preserve when compacting failed tools.
   * Default: 4 lines
   */
  errorLinesToPreserve?: number;
}

/**
 * Performs micro-compaction on conversation history.
 *
 * Safeguards implemented:
 * 1. Sliding Window: Protects the most recent K user turns in 100% full fidelity.
 * 2. Intra-Step Compaction: Protects the most recent K tool execution steps within the active turn.
 * 3. Threshold Guard: Small tool outputs (<400 chars) are never touched to prevent entity loss.
 * 4. Error Preservation: Tool failures preserve the top stack trace/error lines so root cause context is never lost.
 * 5. Tombstone Summaries: Successful older tool outputs are replaced with a 1-line metadata tombstone.
 */
export function extractFileOutline(rawContent: string): string {
  const lines = rawContent.split("\n");
  if (lines.length <= 80) {
    return rawContent;
  }

  const result: string[] = [];
  let omitted = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeaderOrDeclaration =
      i < 6 ||
      i >= lines.length - 2 ||
      /^\s*(?:\d+:\s*)?(import|export|class|function|interface|type|const|let|var|def|async|func|struct|package)/.test(line) ||
      /^\s*(?:\d+:\s*)?([A-Za-z0-9_]+:\s*(async\s*)?\([^)]*\)|[A-Za-z0-9_]+:\s*\{)/.test(line);

    if (isHeaderOrDeclaration) {
      if (omitted > 2) {
        result.push(`  ... [${omitted} implementation lines omitted]`);
      } else if (omitted > 0) {
        for (let j = i - omitted; j < i; j++) {
          result.push(lines[j]);
        }
      }
      omitted = 0;
      result.push(line);
    } else {
      omitted++;
    }
  }

  if (omitted > 0) {
    result.push(`  ... [${omitted} implementation lines omitted]`);
  }

  result.push(`[Structural outline | ${lines.length} lines total | use read_file with offset to inspect details]`);
  return result.join("\n");
}

export function extractDirSummary(content: string, maxLines = 14): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  const top = lines.slice(0, maxLines);
  return `${top.join("\n")}\n... [${lines.length - maxLines} deeper entries omitted | use list_dir with targeted path to inspect]`;
}

export function extractGrepSummary(content: string, maxMatchesPerFile = 2): string {
  const lines = content.split("\n");
  if (lines.length <= 15) return content;
  const result: string[] = [];
  let fileMatches = 0;
  for (const line of lines) {
    if (!line.startsWith("  ") && line.includes(":")) {
      result.push(line);
      fileMatches = 0;
    } else if (fileMatches < maxMatchesPerFile) {
      result.push(line);
      fileMatches++;
    } else if (fileMatches === maxMatchesPerFile) {
      result.push("    ... [additional matches omitted]");
      fileMatches++;
    }
  }
  return result.join("\n");
}

/* Preserves the head (command context) and tail (exit code / test count summary)
 * of bash execution outputs so models retain test verification outcomes without amnesia. */
export function extractBashSummary(rawContent: string): string {
  const lines = rawContent.split("\n");
  if (lines.length <= 10) {
    return rawContent;
  }
  const head = lines.slice(0, 2);
  const tail = lines.slice(-6);
  const omitted = lines.length - 8;
  return `${head.join("\n")}\n... [${omitted} intermediate output lines omitted] ...\n${tail.join("\n")}`;
}

/* Applies micro-compaction to a tool output:
 * 1. For active turns, specialized formatters preserve semantic structure (read_file, list_dir, grep_code, bash).
 * 2. Small outputs under compactThresholdChars are kept intact to avoid entity loss.
 * 3. Error outputs preserve root cause stack headers.
 * 4. Cold historical outputs are replaced with a concise operator tombstone. */
export function compactToolOutput(
  toolName: string,
  rawContent: string,
  isColdTurn: boolean,
  isError?: boolean,
  options: {
    compactThresholdChars?: number;
    errorLinesToPreserve?: number;
  } = {}
): string {
  if (!isColdTurn) {
    if (toolName === "read_file") {
      return extractFileOutline(rawContent);
    }
    if (toolName === "list_dir") {
      return extractDirSummary(rawContent);
    }
    if (toolName === "grep_code") {
      return extractGrepSummary(rawContent);
    }
    if (toolName === "bash") {
      return extractBashSummary(rawContent);
    }
  }

  const lines = rawContent.split("\n");
  const threshold = options.compactThresholdChars ?? 400;
  if (lines.length <= 15 && rawContent.length <= threshold) {
    return rawContent;
  }

  const errorPreserve = options.errorLinesToPreserve ?? 4;
  if (isToolError(rawContent, isError)) {
    const preserved = lines.slice(0, errorPreserve).join("\n");
    const remainingCount = lines.length - errorPreserve;
    return `${preserved}\n... [${remainingCount} lines pruned for token efficiency]`;
  }

  return `[Operator: ${toolName} | ${lines.length} lines omitted from context; this output is no longer visible. Re-run with targeted arguments to recover details.]`;
}

export function compactHistory(
  history: (ChatMessage | CoreMessage)[],
  options: CompactionOptions = {}
): ChatMessage[] {
  const recentTurnsToProtect = options.recentTurnsToProtect ?? 2;
  const recentStepsToProtect = options.recentStepsToProtect ?? 2;
  const compactThresholdChars = options.compactThresholdChars ?? 400;
  const errorLinesToPreserve = options.errorLinesToPreserve ?? 4;

  if (history.length <= 2) {
    return history as ChatMessage[];
  }

  const userIndices: number[] = [];
  const toolStepAssistantIndices: number[] = [];

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === "user") {
      userIndices.push(i);
    } else if (msg.role === "assistant") {
      const chatMsg = msg as ChatMessage;
      if (chatMsg.tool_calls && chatMsg.tool_calls.length > 0) {
        toolStepAssistantIndices.push(i);
      } else if (
        Array.isArray(msg.content) &&
        (msg.content as any[]).some((p) => p.type === "tool-call")
      ) {
        toolStepAssistantIndices.push(i);
      }
    }
  }

  const turnCutoffIndex =
    userIndices.length > recentTurnsToProtect
      ? userIndices[userIndices.length - recentTurnsToProtect]
      : -1;

  const stepCutoffIndex =
    toolStepAssistantIndices.length > recentStepsToProtect
      ? toolStepAssistantIndices[toolStepAssistantIndices.length - recentStepsToProtect]
      : -1;

  if (turnCutoffIndex === -1 && stepCutoffIndex === -1) {
    return history as ChatMessage[];
  }

  return history.map((msg, idx) => {
    const isColdTurn = turnCutoffIndex !== -1 && idx < turnCutoffIndex;
    const isColdStep = stepCutoffIndex !== -1 && idx < stepCutoffIndex;

    if (!isColdTurn && !isColdStep) {
      return msg as ChatMessage;
    }

    if (msg.role === "tool" && typeof msg.content === "string") {
      const toolName = msg.name || "tool";
      return {
        ...msg,
        content: compactToolOutput(toolName, msg.content, isColdTurn, msg.isError, {
          compactThresholdChars,
          errorLinesToPreserve,
        }),
      };
    }

    if (msg.role === "tool" && Array.isArray(msg.content)) {
      const compactedContent = (msg.content as any[]).map((part) => {
        if (part.type !== "tool-result") {
          return part;
        }

        const toolName = part.toolName || "tool";
        const rawResult =
          typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result);

        return {
          ...part,
          result: compactToolOutput(
            toolName,
            rawResult,
            isColdTurn,
            part.isError !== undefined ? Boolean(part.isError) : undefined,
            { compactThresholdChars, errorLinesToPreserve }
          ),
        };
      });

      return {
        ...msg,
        content: compactedContent,
      };
    }
    return msg as ChatMessage;
  });
}
