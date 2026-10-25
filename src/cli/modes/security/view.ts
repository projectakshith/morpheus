import type { Thread, ThreadStep } from "../../../core/thread";
import type { Engagement } from "../../../core/engagement";
import type { Finding, FindingSeverity, RefusalRecord } from "../../../core/types";

export const SECURITY_PHASES = ["RECON", "STATIC", "PROBE", "IMPACT", "REPORT"] as const;

export interface ProbeRow {
  id: string;
  label: string;
  status: string;
  note: string;
  isRunning: boolean;
  isError: boolean;
}

export interface ScopeView {
  target: string;
  authorizedBy: string;
  expiresAt: string;
  expired: boolean;
  methods: string;
  rps: number;
  allowPrivateTargets: boolean;
}

export function stepPhase(step: ThreadStep): number | null {
  if (step.type !== "tool" || !step.name) return null;
  if (step.name === "security_recon") {
    const mode = String(step.args?.mode ?? "");
    if (mode === "subdomains") return 0;
    if (mode === "headers") return 1;
    if (mode === "paths") return 1;
    return 0;
  }
  if (step.name === "http_request" || step.name === "http_probe" || step.name === "security_probe") return 2;
  if (step.name === "record_finding") return 3;
  const filePath = String(step.args?.filePath ?? "");
  if ((step.name === "write_file" || step.name === "edit_file") && /(^|\/)report\.md$/.test(filePath)) {
    return 4;
  }
  return null;
}

export function securityPhase(threads: Thread[]): number {
  let phase = 0;
  for (const thread of threads) {
    for (const step of thread.steps) {
      const next = stepPhase(step);
      if (next !== null) phase = Math.max(phase, next);
    }
  }
  return phase;
}

export function severityCounts(findings: Finding[]): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if (finding.severity) counts[finding.severity] += 1;
  }
  return counts;
}

function firstLine(value: string | undefined): string {
  return (value ?? "").split("\n")[0].trim();
}

function statusOf(step: ThreadStep): string {
  if (step.isRunning) return "…";
  if (step.isError) return "ERR";
  const match = (step.output ?? "").match(/\b(?:HTTP\/)?([1-5]\d{2})\b/);
  return match ? match[1] : "ok";
}

function rowFor(step: ThreadStep): ProbeRow | null {
  if (step.type !== "tool" || !step.name) return null;
  if (step.name === "security_recon") {
    const mode = String(step.args?.mode ?? "recon");
    const target = String(step.args?.target ?? "");
    return {
      id: step.id,
      label: `${mode} ${target}`.trim(),
      status: statusOf(step),
      note: firstLine(step.output ?? step.outputSummary),
      isRunning: Boolean(step.isRunning),
      isError: Boolean(step.isError),
    };
  }
  if (step.name === "http_request" || step.name === "http_probe") {
    const method = String(step.args?.method ?? "GET").toUpperCase();
    const url = String(step.args?.url ?? "");
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      path = url;
    }
    return {
      id: step.id,
      label: `${method} ${path}`,
      status: statusOf(step),
      note: firstLine(step.output ?? step.outputSummary),
      isRunning: Boolean(step.isRunning),
      isError: Boolean(step.isError),
    };
  }
  if (step.name === "security_state") {
    const action = String(step.args?.action ?? "ledger").replace(/_/g, " ");
    return {
      id: step.id,
      label: `ledger ${action}`,
      status: statusOf(step),
      note: firstLine(step.output ?? step.outputSummary),
      isRunning: Boolean(step.isRunning),
      isError: Boolean(step.isError),
    };
  }
  if (step.name === "record_finding") {
    const severity = String(step.args?.severity ?? "finding").toUpperCase();
    const endpoint = String(step.args?.endpoint ?? step.args?.topic ?? "");
    return {
      id: step.id,
      label: `${severity} ${endpoint}`.trim(),
      status: "▲",
      note: String(step.args?.takeaway ?? ""),
      isRunning: false,
      isError: false,
    };
  }
  return null;
}

export function probeRows(threads: Thread[], limit: number = 6): ProbeRow[] {
  const rows: ProbeRow[] = [];
  for (const thread of threads) {
    for (const step of thread.steps) {
      const row = rowFor(step);
      if (row) rows.push(row);
    }
  }
  return rows.slice(-limit);
}

export function latestRefusal(threads: Thread[]): RefusalRecord | null {
  let latest: RefusalRecord | null = null;
  for (const thread of threads) {
    for (const refusal of thread.refusals ?? []) {
      if (!latest || refusal.createdAt >= latest.createdAt) latest = refusal;
    }
  }
  return latest;
}

export function scopeView(engagement: Engagement | null, now: Date = new Date()): ScopeView | null {
  if (!engagement) return null;
  return {
    target: engagement.target,
    authorizedBy: engagement.authorizedBy,
    expiresAt: engagement.expiresAt.slice(0, 10),
    expired: now.getTime() > new Date(engagement.expiresAt).getTime(),
    methods: engagement.allowedMethods.join("/"),
    rps: engagement.maxRequestsPerSecond,
    allowPrivateTargets: engagement.allowPrivateTargets,
  };
}
