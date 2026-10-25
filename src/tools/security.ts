import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { checkTarget, loadEngagement, type Engagement } from "../core/engagement";
import type { ToolDefinition } from "../core/types";
import { formatError } from "../utils/errors";

export type ReconMode = "headers" | "paths" | "subdomains";

export interface ReconParams {
  mode: ReconMode;
  target: string;
  paths?: string[];
}

export interface HttpSnapshot {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ReconDeps {
  fetchUrl: (url: string) => Promise<HttpSnapshot>;
  fetchCertificates: (host: string) => Promise<string[]>;
  resolveHost: (host: string) => Promise<string[]>;
  evidenceRoot: string;
  now: () => number;
}

export const DEFAULT_PATHS = [
  "/admin",
  "/administrator",
  "/api",
  "/api/v1",
  "/api/v2",
  "/api/docs",
  "/api/swagger",
  "/swagger",
  "/swagger-ui",
  "/graphql",
  "/uploads",
  "/files",
  "/backup",
  "/backups",
  "/debug",
  "/actuator",
  "/actuator/health",
  "/server-status",
  "/.well-known/security.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/login",
  "/register",
  "/dashboard",
  "/health",
  "/status",
  "/metrics",
  "/config",
  "/.env",
  "/.git/config",
  "/info.php",
  "/phpinfo.php",
  "/test",
  "/dev",
  "/staging",
  "/eval",
  "/internal",
  "/private",
  "/console",
  "/manage",
];

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

const MAX_PATHS = 200;
const MAX_HOSTS = 40;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CERTIFICATES = 400;
const INTERESTING_STATUS = new Set([200, 201, 202, 204, 206, 301, 302, 303, 307, 308, 401, 403, 405, 500, 502]);

export function buildPathList(custom: string[] = []): string[] {
  const merged = [...DEFAULT_PATHS, ...custom]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("/") ? value : `/${value}`));
  return [...new Set(merged)].slice(0, MAX_PATHS);
}

export function isInterestingStatus(status: number): boolean {
  return INTERESTING_STATUS.has(status);
}

export function summarizeHeaders(headers: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const missing = SECURITY_HEADERS.filter((name) => !lower[name]);
  return {
    server: lower.server ?? "",
    poweredBy: lower["x-powered-by"] ?? "",
    aspNet: lower["x-aspnet-version"] ?? "",
    via: lower.via ?? "",
    contentType: lower["content-type"] ?? "",
    cookies: (lower["set-cookie"] ?? "").split(/,(?=[^;]+?=)/).filter(Boolean).length,
    securityHeaders: Object.fromEntries(SECURITY_HEADERS.map((name) => [name, lower[name] ?? ""])),
    missingSecurityHeaders: missing,
  };
}

export function parseCertificateHosts(payload: string, domain: string): string[] {
  const suffix = domain.toLowerCase();
  let records: unknown;
  try {
    records = JSON.parse(payload);
  } catch {
    return [];
  }
  if (!Array.isArray(records)) return [];
  const hosts = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const value = record as Record<string, unknown>;
    const names = String(value.name_value ?? "")
      .split("\n")
      .concat(String(value.common_name ?? "").split("\n"));
    for (const name of names) {
      const host = name.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (!host || host.includes("*") || host.includes(" ")) continue;
      if (host === suffix || host.endsWith(`.${suffix}`)) hosts.add(host);
    }
  }
  return [...hosts].sort();
}

export function baseUrl(target: string): string {
  const trimmed = String(target || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function hostOf(target: string): string {
  try {
    return new URL(baseUrl(target)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function truncateBody(body: string): string {
  return body.length > MAX_BODY_BYTES ? body.slice(0, MAX_BODY_BYTES) : body;
}

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await run(items[index]);
      }
    })
  );
  return results;
}

function defaultDeps(now: number): ReconDeps {
  return {
    fetchUrl: async (url) => {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "text/html,application/json,*/*", "User-Agent": "Morpheus-Security-Audit/1.0" },
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body = await response.text();
      return { status: response.status, headers, body: truncateBody(body) };
    },
    fetchCertificates: async (host) => {
      const response = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(host)}&output=json`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return [];
      return parseCertificateHosts((await response.text()).slice(0, MAX_CERTIFICATES * 400), host);
    },
    resolveHost: async (host) => {
      const dns = await import("node:dns/promises");
      try {
        return await dns.resolve4(host);
      } catch {
        return [];
      }
    },
    evidenceRoot: path.join(os.homedir(), ".morpheus", "engagements"),
    now: () => now,
  };
}

async function writeEvidence(deps: ReconDeps, host: string, payload: unknown): Promise<string> {
  const dir = path.join(deps.evidenceRoot, host, "evidence");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${deps.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

export async function runRecon(
  params: ReconParams,
  engagement: Engagement,
  deps: ReconDeps = defaultDeps(Date.now())
): Promise<string> {
  const base = baseUrl(params.target);
  const host = hostOf(params.target);
  const scope = checkTarget(engagement, base, "GET", new Date(deps.now()));
  if (!scope.allowed) return `Error: ${scope.reason}`;

  if (params.mode === "headers") {
    const snapshot = await deps.fetchUrl(base);
    const summary = summarizeHeaders(snapshot.headers);
    const title = snapshot.body.match(/<title>([^<]{1,120})<\/title>/i)?.[1]?.trim() ?? "";
    const evidence = await writeEvidence(deps, host, {
      mode: params.mode,
      target: base,
      engagement: engagement.id,
      status: snapshot.status,
      headers: snapshot.headers,
      bodyExcerpt: snapshot.body.slice(0, 4000),
    });
    return [
      `headers · ${base} · ${snapshot.status} · ${snapshot.body.length}b`,
      `server: ${summary.server || "unknown"}`,
      `framework: ${summary.poweredBy || summary.aspNet || "unknown"}`,
      `title: ${title || "(none)"}`,
      `missing headers: ${summary.missingSecurityHeaders.join(", ") || "none"}`,
      `evidence: ${evidence}`,
    ].join("\n");
  }

  if (params.mode === "paths") {
    const paths = buildPathList(params.paths);
    const results = await mapLimited(paths, Math.max(1, Math.min(4, engagement.maxRequestsPerSecond)), async (route) => {
      const url = `${base}${route}`;
      try {
        const snapshot = await deps.fetchUrl(url);
        return { route, status: snapshot.status, bytes: snapshot.body.length, location: snapshot.headers.location ?? "" };
      } catch (error) {
        return { route, status: 0, bytes: 0, location: formatError(error) };
      }
    });
    const interesting = results.filter((result) => isInterestingStatus(result.status));
    const evidence = await writeEvidence(deps, host, {
      mode: params.mode,
      target: base,
      engagement: engagement.id,
      results,
    });
    const lines = [
      `paths · ${base} · ${paths.length} tried · ${interesting.length} interesting`,
      ...interesting.slice(0, 40).map((result) => `${result.status} ${result.route} ${result.bytes}b${result.location ? ` -> ${result.location}` : ""}`),
      `evidence: ${evidence}`,
    ];
    return lines.join("\n");
  }

  const certificateHosts = (await deps.fetchCertificates(host)).slice(0, MAX_HOSTS);
  const resolved = await mapLimited(certificateHosts, 8, async (candidate) => {
    const addresses = await deps.resolveHost(candidate);
    return { host: candidate, addresses };
  });
  const live = resolved.filter((entry) => entry.addresses.length > 0);
  const evidence = await writeEvidence(deps, host, {
    mode: params.mode,
    target: host,
    engagement: engagement.id,
    hosts: resolved,
  });
  return [
    `subdomains · ${host} · ${certificateHosts.length} candidates · ${live.length} live`,
    ...live.slice(0, 40).map((entry) => `${entry.host} -> ${entry.addresses[0]}`),
    `evidence: ${evidence}`,
  ].join("\n");
}

export function createSecurityReconTool(): ToolDefinition {
  return {
    name: "security_recon",
    description:
      "Bounded reconnaissance for an authorized engagement. Requires .morpheus/engagement.json in the workspace. Modes: headers, paths, subdomains. GET only, rate limited, evidence written under ~/.morpheus/engagements/<host>/.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "Recon mode",
          enum: ["headers", "paths", "subdomains"],
        },
        target: {
          type: "string",
          description: "In-scope host or URL",
        },
        paths: {
          type: "array",
          description: "Extra paths for paths mode",
          items: { type: "string" },
        },
      },
      required: ["mode", "target"],
    },
    execute: async (args, cwd) => {
      const engagement = await loadEngagement(cwd ?? process.cwd());
      if (!engagement) {
        return "Error: no engagement scope found. Create .morpheus/engagement.json with /attack before probing.";
      }
      const mode = String(args.mode ?? "").toLowerCase();
      if (mode !== "headers" && mode !== "paths" && mode !== "subdomains") {
        return "Error: mode must be headers, paths, or subdomains.";
      }
      try {
        return await runRecon(
          {
            mode,
            target: String(args.target ?? ""),
            paths: Array.isArray(args.paths) ? args.paths.map(String) : [],
          },
          engagement
        );
      } catch (error) {
        return `Error: ${formatError(error)}`;
      }
    },
  };
}
