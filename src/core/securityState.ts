import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types";
import { formatError } from "../utils/errors";
import { loadEngagement } from "./engagement";
import { sanitizePromptValue } from "./securityPrompt";

export const SECURITY_CASE_STATUSES = ["planned", "running", "confirmed", "rejected", "blocked"] as const;
export type SecurityCaseStatus = (typeof SECURITY_CASE_STATUSES)[number];

export interface SecurityCase {
  id: string;
  hypothesis: string;
  asset: string;
  method: string;
  path: string;
  identity: string;
  expected: string;
  observed: string;
  status: SecurityCaseStatus;
  evidenceRefs: string[];
  updatedAt: string;
}

export interface SecurityState {
  version: 1;
  revision: number;
  engagementId: string;
  objective: string;
  coverage: string[];
  nextSteps: string[];
  cases: SecurityCase[];
  updatedAt: string;
}

export interface SecurityCaseInput {
  id?: string;
  hypothesis: string;
  asset: string;
  method?: string;
  path?: string;
  identity?: string;
  expected?: string;
  observed?: string;
  status?: SecurityCaseStatus;
  evidenceRefs?: string[];
}

export interface SecurityStatePatch {
  objective?: string;
  addCoverage?: string[];
  addNextSteps?: string[];
  case?: SecurityCaseInput;
}

const STATE_FILE = path.join(".morpheus", "security-state.json");
const MAX_STATE_BYTES = 32_000;
const MAX_CASES = 40;
const MAX_LIST = 24;
const MAX_TEXT = 500;
const MAX_REF = 200;
const SECRET_PATTERN =
  /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*\S+)/i;

function clean(value: unknown, limit: number, label: string, allowEmpty = false): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!allowEmpty && !text) throw new Error(`${label} must not be empty.`);
  if (text.length > limit) throw new Error(`${label} must be at most ${limit} characters.`);
  if (SECRET_PATTERN.test(text)) throw new Error(`${label} contains a possible raw secret; store a redacted evidence reference instead.`);
  return text;
}

function list(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  if (value.length > MAX_LIST) throw new Error(`${label} accepts at most ${MAX_LIST} entries.`);
  return [...new Set(value.map((item) => clean(item, MAX_REF, label)))];
}

function status(value: unknown): SecurityCaseStatus {
  const normalized = String(value ?? "planned").toLowerCase();
  if (!SECURITY_CASE_STATUSES.includes(normalized as SecurityCaseStatus)) {
    throw new Error(`status must be one of: ${SECURITY_CASE_STATUSES.join(", ")}.`);
  }
  return normalized as SecurityCaseStatus;
}

function caseId(value: unknown): string {
  const id = clean(value, 40, "caseId");
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("caseId may contain only letters, digits, dot, underscore, and dash.");
  return id;
}

function parseCase(value: unknown): SecurityCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each case must be an object.");
  const raw = value as Record<string, unknown>;
  return {
    id: caseId(raw.id),
    hypothesis: clean(raw.hypothesis, MAX_TEXT, "hypothesis"),
    asset: clean(raw.asset, MAX_REF, "asset"),
    method: clean(raw.method, 12, "method", true).toUpperCase(),
    path: clean(raw.path, MAX_TEXT, "path", true),
    identity: clean(raw.identity, MAX_REF, "identity", true),
    expected: clean(raw.expected, MAX_TEXT, "expected", true),
    observed: clean(raw.observed, MAX_TEXT, "observed", true),
    status: status(raw.status),
    evidenceRefs: list(raw.evidenceRefs ?? [], "evidenceRefs"),
    updatedAt: clean(raw.updatedAt, 40, "updatedAt"),
  };
}

function clone(state: SecurityState): SecurityState {
  return JSON.parse(JSON.stringify(state)) as SecurityState;
}

function bounded(state: SecurityState): SecurityState {
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    throw new Error(`Security state exceeds ${MAX_STATE_BYTES} characters; keep summaries short and use evidence references.`);
  }
  return state;
}

function normalize(state: SecurityState): SecurityState {
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new Error("Unsupported security state.");
  }
  if (!state.engagementId || typeof state.engagementId !== "string") throw new Error("Security state is missing an engagement id.");
  if (!Array.isArray(state.cases) || state.cases.length > MAX_CASES) throw new Error(`Security state accepts at most ${MAX_CASES} cases.`);
  return bounded({
    version: 1,
    revision: state.revision,
    engagementId: state.engagementId,
    objective: clean(state.objective, MAX_TEXT, "objective", true),
    coverage: list(state.coverage, "coverage"),
    nextSteps: list(state.nextSteps, "nextSteps"),
    cases: state.cases.map(parseCase),
    updatedAt: clean(state.updatedAt, 40, "updatedAt"),
  });
}

export function securityStatePath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, STATE_FILE);
}

export function emptySecurityState(engagementId: string, now: Date = new Date()): SecurityState {
  return {
    version: 1,
    revision: 0,
    engagementId,
    objective: "",
    coverage: [],
    nextSteps: [],
    cases: [],
    updatedAt: now.toISOString(),
  };
}

export function loadSecurityState(engagementId: string, cwd: string = process.cwd()): Promise<SecurityState> {
  return fs.readFile(securityStatePath(cwd), "utf8").then(
    (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Security state is not valid JSON.");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Security state must be an object.");
      const record = parsed as Record<string, unknown>;
      if (record.engagementId !== engagementId) throw new Error("Security state belongs to a different engagement.");
      return normalize({
        version: 1,
        revision: Number(record.revision),
        engagementId,
        objective: String(record.objective ?? ""),
        coverage: Array.isArray(record.coverage) ? record.coverage as string[] : [],
        nextSteps: Array.isArray(record.nextSteps) ? record.nextSteps as string[] : [],
        cases: Array.isArray(record.cases) ? record.cases as SecurityCase[] : [],
        updatedAt: String(record.updatedAt ?? ""),
      });
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return emptySecurityState(engagementId);
      throw error;
    }
  );
}

export async function saveSecurityState(state: SecurityState, cwd: string = process.cwd()): Promise<string> {
  const next = normalize(state);
  const filePath = securityStatePath(cwd);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(tmpPath, 0o600);
  await fs.rename(tmpPath, filePath);
  return filePath;
}

function nextCaseId(cases: SecurityCase[]): string {
  const highest = cases.reduce((max, item) => {
    const match = /^CASE-(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CASE-${highest + 1}`;
}

function upsertCase(state: SecurityState, input: SecurityCaseInput, now: Date): SecurityCase[] {
  const targetId = input.id ? caseId(input.id) : nextCaseId(state.cases);
  const existing = state.cases.find((item) => item.id === targetId);
  if (!existing && state.cases.length >= MAX_CASES) throw new Error(`Security state accepts at most ${MAX_CASES} cases.`);
  const next: SecurityCase = {
    id: targetId,
    hypothesis: clean(input.hypothesis, MAX_TEXT, "hypothesis"),
    asset: clean(input.asset, MAX_REF, "asset"),
    method: clean(input.method ?? existing?.method ?? "", 12, "method", true).toUpperCase(),
    path: clean(input.path ?? existing?.path ?? "", MAX_TEXT, "path", true),
    identity: clean(input.identity ?? existing?.identity ?? "", MAX_REF, "identity", true),
    expected: clean(input.expected ?? existing?.expected ?? "", MAX_TEXT, "expected", true),
    observed: clean(input.observed ?? existing?.observed ?? "", MAX_TEXT, "observed", true),
    status: input.status ? status(input.status) : existing?.status ?? "planned",
    evidenceRefs: input.evidenceRefs ? list(input.evidenceRefs, "evidenceRefs") : existing?.evidenceRefs ?? [],
    updatedAt: now.toISOString(),
  };
  const cases = existing
    ? state.cases.map((item) => item.id === targetId ? next : item)
    : [...state.cases, next];
  return cases;
}

export function updateSecurityState(
  state: SecurityState,
  patch: SecurityStatePatch,
  now: Date = new Date()
): SecurityState {
  const next = clone(state);
  if (patch.objective !== undefined) next.objective = clean(patch.objective, MAX_TEXT, "objective", true);
  if (patch.addCoverage) next.coverage = [...new Set([...next.coverage, ...list(patch.addCoverage, "coverage")])];
  if (patch.addNextSteps) next.nextSteps = [...new Set([...next.nextSteps, ...list(patch.addNextSteps, "nextSteps")])];
  if (next.coverage.length > MAX_LIST) throw new Error(`coverage accepts at most ${MAX_LIST} entries.`);
  if (next.nextSteps.length > MAX_LIST) throw new Error(`nextSteps accepts at most ${MAX_LIST} entries.`);
  if (patch.case) next.cases = upsertCase(next, patch.case, now);
  next.revision += 1;
  next.updatedAt = now.toISOString();
  return normalize(next);
}

export function formatSecurityStateBlock(state: SecurityState, full = false): string {
  const cases = full ? state.cases : state.cases.slice(-10);
  const lines = [
    `<security-state revision="${state.revision}">`,
    `objective: ${sanitizePromptValue(state.objective || "not set", MAX_TEXT)}`,
    `coverage: ${state.coverage.length ? state.coverage.map((item) => sanitizePromptValue(item, MAX_REF)).join("; ") : "none"}`,
    `next steps: ${state.nextSteps.length ? state.nextSteps.map((item) => sanitizePromptValue(item, MAX_REF)).join("; ") : "none"}`,
    "cases:",
  ];
  if (cases.length === 0) {
    lines.push("- none");
  } else {
    for (const item of cases) {
      const target = [item.method, item.path].filter(Boolean).join(" ");
      const evidence = item.evidenceRefs.length ? item.evidenceRefs.map((ref) => sanitizePromptValue(ref, MAX_REF)).join(", ") : "none";
      lines.push(
        `- ${sanitizePromptValue(item.id, 40)} [${item.status}] ${sanitizePromptValue(item.hypothesis, MAX_TEXT)} | ${sanitizePromptValue(target || item.asset, MAX_TEXT)} | observed: ${sanitizePromptValue(item.observed || "not recorded", MAX_TEXT)} | evidence: ${evidence}`
      );
    }
  }
  lines.push("Update this ledger with security_state after each meaningful test. Keep credentials and raw secrets out; store redacted evidence references.");
  lines.push("</security-state>");
  return lines.join("\n");
}

function arrayArg(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  return value.map((item) => clean(item, MAX_REF, label));
}

export function createSecurityStateTool(onState?: (state: SecurityState) => void): ToolDefinition {
  return {
    name: "security_state",
    description:
      "Durable security test ledger for the current engagement. Read or update the objective, coverage, next steps, and bounded test cases. Use this after each meaningful test so the investigation survives compaction. Never store credentials or raw secrets.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "read, set_objective, add_coverage, add_next_steps, upsert_case, or update_case.",
          enum: ["read", "set_objective", "add_coverage", "add_next_steps", "upsert_case", "update_case"],
        },
        objective: { type: "string", description: "Engagement objective for set_objective." },
        items: { type: "array", items: { type: "string" }, description: "Coverage or next-step items for add_coverage/add_next_steps." },
        caseId: { type: "string", description: "Existing case id for update_case." },
        hypothesis: { type: "string", description: "Test hypothesis." },
        asset: { type: "string", description: "Target asset." },
        method: { type: "string", description: "HTTP method or operation." },
        path: { type: "string", description: "Path or operation detail." },
        identity: { type: "string", description: "Role label, never credentials." },
        expected: { type: "string", description: "Expected result." },
        observed: { type: "string", description: "Observed result." },
        status: {
          type: "string",
          description: "planned, running, confirmed, rejected, or blocked.",
          enum: [...SECURITY_CASE_STATUSES],
        },
        evidenceRefs: { type: "array", items: { type: "string" }, description: "Redacted evidence references or file paths." },
      },
      required: ["action"],
    },
    execute: async (args, cwd = process.cwd()) => {
      try {
        const engagement = await loadEngagement(cwd);
        if (!engagement) return "Error: no engagement scope found. Run `/attack <host> --auth <reference>` before updating the test ledger.";
        let state = await loadSecurityState(engagement.id, cwd);
        const action = String(args.action ?? "").trim();
        if (action === "read") {
          onState?.(state);
          return { output: formatSecurityStateBlock(state, true), metadata: { revision: state.revision, cases: state.cases.length } };
        }
        if (action === "set_objective") {
          state = updateSecurityState(state, { objective: String(args.objective ?? "") });
        } else if (action === "add_coverage") {
          state = updateSecurityState(state, { addCoverage: arrayArg(args.items, "items") });
        } else if (action === "add_next_steps") {
          state = updateSecurityState(state, { addNextSteps: arrayArg(args.items, "items") });
        } else if (action === "upsert_case") {
          state = updateSecurityState(state, {
            case: {
              id: typeof args.caseId === "string" ? args.caseId : undefined,
              hypothesis: String(args.hypothesis ?? ""),
              asset: String(args.asset ?? ""),
              method: typeof args.method === "string" ? args.method : undefined,
              path: typeof args.path === "string" ? args.path : undefined,
              identity: typeof args.identity === "string" ? args.identity : undefined,
              expected: typeof args.expected === "string" ? args.expected : undefined,
              observed: typeof args.observed === "string" ? args.observed : undefined,
              status: typeof args.status === "string" ? status(args.status) : undefined,
              evidenceRefs: Array.isArray(args.evidenceRefs) ? arrayArg(args.evidenceRefs, "evidenceRefs") : undefined,
            },
          });
        } else if (action === "update_case") {
          if (typeof args.caseId !== "string" || !args.caseId.trim()) throw new Error("caseId is required for update_case.");
          const existing = state.cases.find((item) => item.id === args.caseId);
          if (!existing) throw new Error(`Unknown caseId: ${args.caseId}.`);
          state = updateSecurityState(state, {
            case: {
              id: existing.id,
              hypothesis: typeof args.hypothesis === "string" ? args.hypothesis : existing.hypothesis,
              asset: typeof args.asset === "string" ? args.asset : existing.asset,
              method: typeof args.method === "string" ? args.method : existing.method,
              path: typeof args.path === "string" ? args.path : existing.path,
              identity: typeof args.identity === "string" ? args.identity : existing.identity,
              expected: typeof args.expected === "string" ? args.expected : existing.expected,
              observed: typeof args.observed === "string" ? args.observed : existing.observed,
              status: typeof args.status === "string" ? status(args.status) : existing.status,
              evidenceRefs: Array.isArray(args.evidenceRefs) ? arrayArg(args.evidenceRefs, "evidenceRefs") : existing.evidenceRefs,
            },
          });
        } else {
          throw new Error(`Unknown action: ${action}.`);
        }
        const filePath = await saveSecurityState(state, cwd);
        onState?.(state);
        return {
          output: `${formatSecurityStateBlock(state, true)}\nstate file: ${path.relative(cwd, filePath)}`,
          metadata: { revision: state.revision, cases: state.cases.length, evidenceRefs: state.cases.reduce((sum, item) => sum + item.evidenceRefs.length, 0) },
        };
      } catch (error) {
        return `Error: ${formatError(error)}`;
      }
    },
  };
}
