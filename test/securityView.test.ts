import test from "node:test";
import assert from "node:assert/strict";
import type { Thread, ThreadStep } from "../src/core/thread";
import type { Finding } from "../src/core/types";
import { createEngagement } from "../src/core/engagement";
import {
  latestRefusal,
  probeRows,
  scopeView,
  securityPhase,
  severityCounts,
  stepPhase,
} from "../src/cli/modes/security/view";

function step(name: string, args: Record<string, unknown> = {}, extra: Partial<ThreadStep> = {}): ThreadStep {
  return { id: `${name}_${Math.random()}`, type: "tool", name, args, output: "", ...extra };
}

function thread(steps: ThreadStep[]): Thread {
  return {
    id: "t",
    index: 1,
    prompt: "map",
    response: "",
    steps,
    isExpanded: false,
    status: "completed",
    stepCount: steps.length,
    startTime: 0,
  };
}

test("phases advance from recon to report", () => {
  assert.equal(stepPhase(step("security_recon", { mode: "subdomains" })), 0);
  assert.equal(stepPhase(step("security_recon", { mode: "headers" })), 1);
  assert.equal(stepPhase(step("security_recon", { mode: "paths" })), 1);
  assert.equal(stepPhase(step("http_request", { method: "GET" })), 2);
  assert.equal(stepPhase(step("http_probe", { method: "GET" })), 2);
  assert.equal(stepPhase(step("record_finding", {})), 3);
  assert.equal(stepPhase(step("write_file", { filePath: "reports/report.md" })), 4);
  assert.equal(stepPhase(step("read_file", { filePath: "src/a.ts" })), null);
});

test("the furthest phase wins", () => {
  assert.equal(securityPhase([]), 0);
  assert.equal(
    securityPhase([
      thread([
        step("security_recon", { mode: "subdomains" }),
        step("record_finding", {}),
        step("security_recon", { mode: "headers" }),
      ]),
    ]),
    3
  );
});

test("severity counts ignore unrated findings", () => {
  const findings: Finding[] = [
    { topic: "a", takeaway: "x", severity: "critical" },
    { topic: "b", takeaway: "x", severity: "high" },
    { topic: "c", takeaway: "x", severity: "high" },
    { topic: "d", takeaway: "x" },
  ];
  assert.deepEqual(severityCounts(findings), { critical: 1, high: 2, medium: 0, low: 0 });
});

test("probe rows describe recon, requests, and findings", () => {
  const rows = probeRows([
    thread([
      step("security_recon", { mode: "headers", target: "example.edu" }, { output: "headers · example.edu · 200" }),
      step("http_probe", { method: "GET", url: "https://example.edu/api/users/101" }, { output: "Status: HTTP/200" }),
      step("record_finding", { severity: "high", endpoint: "/api/users/101", takeaway: "cross-account read" }),
    ]),
  ]);
  assert.equal(rows.length, 3);
  assert.match(rows[0].label, /headers example\.edu/);
  assert.equal(rows[0].status, "200");
  assert.match(rows[1].label, /GET \/api\/users\/101/);
  assert.match(rows[2].label, /HIGH \/api\/users\/101/);
});

test("running probes are marked", () => {
  const rows = probeRows([
    thread([step("security_recon", { mode: "paths", target: "example.edu" }, { isRunning: true })]),
  ]);
  assert.equal(rows[0].status, "…");
  assert.equal(rows[0].isRunning, true);
});

test("the latest refusal is exposed for the hud", () => {
  const first = { ...thread([]), refusals: [{ id: "r1", kind: "hard" as const, text: "no", model: "flash", retrying: true, createdAt: 10 }] };
  const second = { ...thread([]), refusals: [{ id: "r2", kind: "partial" as const, text: "maybe", model: "sonnet", retrying: false, createdAt: 20 }] };
  const latest = latestRefusal([first, second]);
  assert.equal(latest?.id, "r2");
  assert.equal(latestRefusal([thread([])]), null);
});

test("scope view reports expiry", () => {
  const engagement = createEngagement(
    { target: "example.edu", authorizedBy: "ENG-1" },
    new Date("2026-01-01T00:00:00.000Z")
  );
  const active = scopeView(engagement, new Date("2026-01-10T00:00:00.000Z"));
  assert.equal(active?.expired, false);
  assert.equal(active?.target, "example.edu");
  assert.equal(active?.methods, "GET/HEAD");
  const expired = scopeView(engagement, new Date("2026-03-01T00:00:00.000Z"));
  assert.equal(expired?.expired, true);
});
