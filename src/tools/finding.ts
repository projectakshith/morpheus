import type { ToolDefinition } from "../core/types";

export interface FindingParams {
  topic: string;
  takeaway: string;
}

export function recordFinding(
  params: FindingParams,
  onRecordFinding?: (finding: { topic: string; takeaway: string }) => void
): string {
  const topic = String(params.topic || "").trim();
  const takeaway = String(params.takeaway || "").trim();
  if (!topic || !takeaway) {
    return "Error: Both 'topic' and 'takeaway' are required.";
  }
  onRecordFinding?.({ topic, takeaway });
  return `Recorded finding [${topic}]: ${takeaway}`;
}

export function createFindingTool(
  onRecordFinding?: (finding: { topic: string; takeaway: string }) => void
): ToolDefinition {
  return {
    name: "record_finding",
    description:
      "Save an essential fact, auth flow, or architectural insight into persistent session memory. Once recorded, raw tool outputs can be safely compacted without losing your knowledge.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Short subject label (e.g. 'web-login', 'session-cookie', 'go-cli-hmac')",
        },
        takeaway: {
          type: "string",
          description: "Direct 1-2 sentence core fact with file paths and symbol names",
        },
      },
      required: ["topic", "takeaway"],
    },
    execute: async (params: Record<string, any>) => {
      return recordFinding(params as unknown as FindingParams, onRecordFinding);
    },
  };
}
