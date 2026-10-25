import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const ENGAGEMENT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
export type EngagementMethod = (typeof ENGAGEMENT_METHODS)[number];

export interface Engagement {
  id: string;
  target: string;
  authorizedBy: string;
  allowedHosts: string[];
  allowedMethods: EngagementMethod[];
  maxRequestsPerSecond: number;
  createdAt: string;
  expiresAt: string;
}

export interface ScopeDecision {
  allowed: boolean;
  reason?: string;
}

export interface EngagementInput {
  target: string;
  authorizedBy: string;
  allowedHosts?: string[];
  allowedMethods?: string[];
  maxRequestsPerSecond?: number;
  days?: number;
}

const ENGAGEMENT_FILE = path.join(".morpheus", "engagement.json");
const MAX_REQUESTS_PER_SECOND = 50;

export function engagementPath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, ENGAGEMENT_FILE);
}

export function normalizeHost(input: string): string {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    return "";
  }
  if (!parsed.hostname || parsed.username || parsed.password) return "";
  return parsed.hostname.replace(/\.$/, "");
}

export function normalizeMethods(methods: string[] = ["GET", "HEAD"]): EngagementMethod[] {
  const normalized = methods
    .map((method) => String(method || "").trim().toUpperCase())
    .filter((method): method is EngagementMethod =>
      (ENGAGEMENT_METHODS as readonly string[]).includes(method)
    );
  return [...new Set(normalized)];
}

export function createEngagement(input: EngagementInput, now: Date = new Date()): Engagement {
  const target = normalizeHost(input.target);
  if (!target) throw new Error("Engagement target must be a host or URL.");
  const authorizedBy = String(input.authorizedBy || "").trim();
  if (!authorizedBy) throw new Error("Engagement requires an authorization reference.");
  const allowedHosts = (input.allowedHosts?.length ? input.allowedHosts : [target])
    .map(normalizeHost)
    .filter(Boolean);
  if (allowedHosts.length === 0) throw new Error("Engagement requires at least one allowed host.");
  const allowedMethods = normalizeMethods(input.allowedMethods);
  if (allowedMethods.length === 0) throw new Error("Engagement requires at least one allowed method.");
  const maxRequestsPerSecond = Math.min(
    MAX_REQUESTS_PER_SECOND,
    Math.max(1, Math.floor(input.maxRequestsPerSecond ?? 5))
  );
  const days = Math.min(90, Math.max(1, Math.floor(input.days ?? 30)));
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: randomUUID(),
    target,
    authorizedBy,
    allowedHosts: [...new Set(allowedHosts)],
    allowedMethods,
    maxRequestsPerSecond,
    createdAt,
    expiresAt,
  };
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function validateEngagement(value: unknown): Engagement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const target = normalizeHost(String(record.target ?? ""));
  const authorizedBy = String(record.authorizedBy ?? "").trim();
  const allowedHosts = Array.isArray(record.allowedHosts)
    ? record.allowedHosts.map((host) => normalizeHost(String(host))).filter(Boolean)
    : [];
  const allowedMethods = normalizeMethods(
    Array.isArray(record.allowedMethods) ? record.allowedMethods.map(String) : []
  );
  const createdAt = parseDate(record.createdAt);
  const expiresAt = parseDate(record.expiresAt);
  const maxRequestsPerSecond = Number(record.maxRequestsPerSecond);
  if (!target || !authorizedBy || allowedHosts.length === 0 || allowedMethods.length === 0) return null;
  if (!createdAt || !expiresAt) return null;
  if (!Number.isFinite(maxRequestsPerSecond) || maxRequestsPerSecond < 1) return null;
  return {
    id: typeof record.id === "string" && record.id ? record.id : randomUUID(),
    target,
    authorizedBy,
    allowedHosts: [...new Set(allowedHosts)],
    allowedMethods,
    maxRequestsPerSecond: Math.min(MAX_REQUESTS_PER_SECOND, Math.floor(maxRequestsPerSecond)),
    createdAt,
    expiresAt,
  };
}

export async function loadEngagement(cwd: string = process.cwd()): Promise<Engagement | null> {
  try {
    const raw = await fs.readFile(engagementPath(cwd), "utf8");
    return validateEngagement(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveEngagement(
  engagement: Engagement,
  cwd: string = process.cwd()
): Promise<string> {
  const valid = validateEngagement(engagement);
  if (!valid) throw new Error("Refusing to save an invalid engagement.");
  const filePath = engagementPath(cwd);
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(valid, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tempPath, filePath);
  return filePath;
}

export function checkTarget(
  engagement: Engagement,
  target: string,
  method: string = "GET",
  now: Date = new Date()
): ScopeDecision {
  if (now.getTime() > new Date(engagement.expiresAt).getTime()) {
    return { allowed: false, reason: "Engagement scope has expired." };
  }
  const host = normalizeHost(target);
  if (!host) return { allowed: false, reason: "Target is not a valid host or URL." };
  const inScope = engagement.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
  if (!inScope) return { allowed: false, reason: `Host ${host} is not in scope.` };
  const normalizedMethod = String(method || "").trim().toUpperCase();
  if (!engagement.allowedMethods.includes(normalizedMethod as EngagementMethod)) {
    return { allowed: false, reason: `Method ${normalizedMethod || "unknown"} is not allowed.` };
  }
  return { allowed: true };
}
