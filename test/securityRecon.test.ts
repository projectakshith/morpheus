import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEngagement } from "../src/core/engagement";
import { createTools } from "../src/tools/index";
import {
  activateSecuritySession,
  deactivateSecuritySession,
} from "../src/core/securitySession";
import {
  baseUrl,
  buildPathList,
  isInterestingStatus,
  parseCertificateHosts,
  runRecon,
  summarizeHeaders,
  type ReconDeps,
} from "../src/tools/security";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" }, NOW);

async function withDeps(run: (deps: ReconDeps, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-recon-"));
  const deps: ReconDeps = {
    fetchUrl: async (url) => ({
      status: url.endsWith("/admin") ? 200 : 404,
      headers: { server: "nginx", "x-powered-by": "PHP/8.2" },
      body: url.endsWith("/admin") ? "<title>Admin</title>panel" : "missing",
    }),
    fetchCertificates: async () => ["example.edu", "api.example.edu", "dev.example.edu"],
    resolveHost: async (host) => (host === "dev.example.edu" ? [] : ["8.8.8.8"]),
    evidenceRoot: root,
    now: () => NOW.getTime(),
  };
  try {
    await run(deps, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("paths are normalized, deduplicated, and capped", () => {
  const paths = buildPathList(["admin", "/admin", "/api", "  "]);
  assert.equal(paths[0], "/admin");
  assert.equal(paths.filter((item) => item === "/admin").length, 1);
  assert.ok(paths.length <= 200);
});

test("status classification keeps guardless and blocked routes", () => {
  assert.equal(isInterestingStatus(200), true);
  assert.equal(isInterestingStatus(401), true);
  assert.equal(isInterestingStatus(403), true);
  assert.equal(isInterestingStatus(302), true);
  assert.equal(isInterestingStatus(404), false);
  assert.equal(isInterestingStatus(429), false);
});

test("header summary reports missing controls", () => {
  const summary = summarizeHeaders({ Server: "nginx", "X-Powered-By": "PHP/8.2" });
  assert.equal(summary.server, "nginx");
  assert.equal(summary.poweredBy, "PHP/8.2");
  assert.ok(summary.missingSecurityHeaders.includes("content-security-policy"));
});

test("certificate names stay inside the registered domain", () => {
  const payload = JSON.stringify([
    { name_value: "example.edu\n*.example.edu\napi.example.edu" },
    { name_value: "evil-example.edu" },
    { common_name: "dev.example.edu" },
  ]);
  assert.deepEqual(parseCertificateHosts(payload, "example.edu"), [
    "api.example.edu",
    "dev.example.edu",
    "example.edu",
  ]);
  assert.deepEqual(parseCertificateHosts("{bad json", "example.edu"), []);
});

test("base urls preserve schemes", () => {
  assert.equal(baseUrl("example.edu"), "https://example.edu");
  assert.equal(baseUrl("http://example.edu/"), "http://example.edu");
});

test("out-of-scope targets are refused", async () => {
  await withDeps(async (deps) => {
    const result = await runRecon({ mode: "headers", target: "other.example" }, engagement, deps);
    assert.match(result, /not in scope/);
  });
});

test("headers mode returns a summary and writes evidence", async () => {
  await withDeps(async (deps, root) => {
    const result = await runRecon({ mode: "headers", target: "example.edu" }, engagement, deps);
    assert.match(result, /nginx/);
    assert.match(result, /PHP\/8.2/);
    assert.match(result, /missing headers: content-security-policy/);
    const files = await fs.readdir(path.join(root, "example.edu", "evidence"));
    assert.equal(files.length, 1);
  });
});

test("recon blocks hostnames resolving private unless the scope allows it", async () => {
  await withDeps(async (deps) => {
    deps.resolveHost = async () => ["10.0.0.7"];
    await assert.rejects(
      () => runRecon({ mode: "headers", target: "example.edu" }, engagement, deps),
      /private or link-local/
    );
    const allowed = createEngagement({ target: "example.edu", authorizedBy: "ENG-1", allowPrivateTargets: true }, NOW);
    const result = await runRecon({ mode: "headers", target: "example.edu" }, allowed, deps);
    assert.match(result, /nginx/);
  });
});

test("paths mode reports only interesting routes", async () => {
  await withDeps(async (deps) => {
    const result = await runRecon({ mode: "paths", target: "example.edu" }, engagement, deps);
    assert.match(result, /200 \/admin/);
    assert.ok(!result.includes("404 /api"));
  });
});

test("the recon tool appears only in attack mode", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-tools-"));
  try {
    assert.equal(createTools(dir).security_recon, undefined);
    await fs.mkdir(path.join(dir, ".morpheus"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".morpheus", "engagement.json"),
      JSON.stringify(engagement),
      "utf8"
    );
    assert.equal(createTools(dir).security_recon, undefined);
    assert.ok(createTools(dir).http_request);
    activateSecuritySession(engagement);
    assert.ok(createTools(dir).security_recon);
    assert.ok(createTools(dir).http_probe);
    assert.equal(createTools(dir).http_request, undefined);
    assert.equal(createTools(dir).bash, undefined);
    deactivateSecuritySession();
    assert.equal(createTools(dir).security_recon, undefined);
    assert.equal(createTools(dir).http_probe, undefined);
    assert.ok(createTools(dir).http_request);
  } finally {
    deactivateSecuritySession();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("subdomain mode only reports resolved hosts", async () => {
  await withDeps(async (deps) => {
    const result = await runRecon({ mode: "subdomains", target: "example.edu" }, engagement, deps);
    assert.match(result, /2 live/);
    assert.match(result, /api\.example\.edu/);
    assert.ok(!result.includes("dev.example.edu ->"));
  });
});
