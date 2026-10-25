import type { Finding, FindingSeverity, ToolDefinition } from "../core/types";

export interface FindingParams {
  topic: string;
  takeaway: string;
  severity?: FindingSeverity;
  endpoint?: string;
}

export const FINDING_SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low"];

export function normalizeSeverity(value: unknown): FindingSeverity | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FINDING_SEVERITIES.includes(normalized as FindingSeverity)
    ? (normalized as FindingSeverity)
    : undefined;
}

export function recordFinding(
  params: FindingParams,
  onRecordFinding?: (finding: Finding) => void
): string {
  const topic = String(params.topic || "").trim();
  const takeaway = String(params.takeaway || "").trim();
  if (!topic || !takeaway) {
    return "Error: Both 'topic' and 'takeaway' are required.";
  }
  const finding: Finding = { topic, takeaway };
  const severity = normalizeSeverity(params.severity);
  if (severity) finding.severity = severity;
  const endpoint = String(params.endpoint || "").trim();
  if (endpoint) finding.endpoint = endpoint;
  onRecordFinding?.(finding);
  const detail = [severity?.toUpperCase(), endpoint].filter(Boolean).join(" · ");
  return `Recorded finding [${topic}]${detail ? ` (${detail})` : ""}: ${takeaway}`;
}

export function createFindingTool(
  onRecordFinding?: (finding: Finding) => void
): ToolDefinition {
  return {
    name: "record_finding",
    description:
      "Save an essential fact, auth flow, architectural insight, or confirmed security finding into persistent session memory. Once recorded, raw tool outputs can be safely compacted without losing your knowledge.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Short subject label (e.g. 'web-login', 'session-cookie', 'idor-invoices')",
        },
        takeaway: {
          type: "string",
          description: "Direct 1-2 sentence core fact with file paths and symbol names",
        },
        severity: {
          type: "string",
          description: "Security severity for a confirmed issue",
          enum: FINDING_SEVERITIES,
        },
        endpoint: {
          type: "string",
          description: "Affected route or asset for a security finding",
        },
      },
      required: ["topic", "takeaway"],
    },
    execute: async (params: Record<string, any>) => {
      return recordFinding(params as unknown as FindingParams, onRecordFinding);
    },
  };
}
