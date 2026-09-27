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
  if (lines.length <= 60) {
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

      if (toolName === "read_file" && !isColdTurn) {
        return {
          ...msg,
          content: extractFileOutline(msg.content),
        };
      }

      if (toolName === "list_dir" && !isColdTurn) {
        return {
          ...msg,
          content: extractDirSummary(msg.content),
        };
      }

      if (toolName === "grep_code" && !isColdTurn) {
        return {
          ...msg,
          content: extractGrepSummary(msg.content),
        };
      }

      const rawResult = msg.content;
      const lines = rawResult.split("\n");

      if (lines.length <= 15 && rawResult.length <= compactThresholdChars) {
        return msg as ChatMessage;
      }

      const isError = isToolError(rawResult, msg.isError);
      if (isError) {
        const preserved = lines.slice(0, errorLinesToPreserve).join("\n");
        const remainingCount = lines.length - errorLinesToPreserve;
        return {
          ...msg,
          content: `${preserved}\n... [${remainingCount} lines pruned for token efficiency]`,
        };
      }

      const tombstone = `[Operator: ${toolName} | ${lines.length} lines, done]`;
      return {
        ...msg,
        content: tombstone,
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

        if (toolName === "read_file" && !isColdTurn) {
          return {
            ...part,
            result: extractFileOutline(rawResult),
          };
        }

        if (toolName === "list_dir" && !isColdTurn) {
          return {
            ...part,
            result: extractDirSummary(rawResult),
          };
        }

        if (toolName === "grep_code" && !isColdTurn) {
          return {
            ...part,
            result: extractGrepSummary(rawResult),
          };
        }

        const lines = rawResult.split("\n");

        if (lines.length <= 15 && rawResult.length <= compactThresholdChars) {
          return part;
        }
        const isError = isToolError(rawResult, part.isError !== undefined ? Boolean(part.isError) : undefined);

        if (isError) {
          const preserved = lines.slice(0, errorLinesToPreserve).join("\n");
          const remainingCount = lines.length - errorLinesToPreserve;
          return {
            ...part,
            result: `${preserved}\n... [${remainingCount} lines pruned for token efficiency]`,
          };
        }

        const tombstone = `[Operator: ${toolName} | ${lines.length} lines, done]`;

        return {
          ...part,
          result: tombstone,
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
