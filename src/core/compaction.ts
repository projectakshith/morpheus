import type { CoreMessage, ToolContent } from "ai";
import { isToolError } from "../utils/errors";

export interface CompactionOptions {
  /**
   * Number of recent user turns to protect from compaction in full fidelity.
   * Default: 2
   */
  recentTurnsToProtect?: number;

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
 * 2. Threshold Guard: Small tool outputs (<400 chars) are never touched to prevent entity loss.
 * 3. Error Preservation: Tool failures preserve the top stack trace/error lines so root cause context is never lost.
 * 4. Tombstone Summaries: Successful older tool outputs are replaced with a 1-line metadata tombstone.
 */
export function compactHistory(
  history: CoreMessage[],
  options: CompactionOptions = {}
): CoreMessage[] {
  const recentTurnsToProtect = options.recentTurnsToProtect ?? 2;
  const compactThresholdChars = options.compactThresholdChars ?? 400;
  const errorLinesToPreserve = options.errorLinesToPreserve ?? 4;

  if (history.length <= 2) {
    return history;
  }

  const userIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === "user") {
      userIndices.push(i);
    }
  }

  if (userIndices.length <= recentTurnsToProtect) {
    return history;
  }

  const coldBoundaryIndex = userIndices[userIndices.length - recentTurnsToProtect];

  return history.map((msg, idx) => {
    if (idx >= coldBoundaryIndex) {
      return msg;
    }

    if (msg.role === "tool" && Array.isArray(msg.content)) {
      const compactedContent = (msg.content as ToolContent).map((part) => {
        if (part.type !== "tool-result") {
          return part;
        }

        const rawResult =
          typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result);

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

        const toolName = part.toolName || "tool";
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

    return msg;
  });
}
