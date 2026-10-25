import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { executeHttpRequest } from "../src/tools/http";

test("http_request rejects invalid or missing URLs", async () => {
  await assert.rejects(
    () => executeHttpRequest({ url: "" }),
    /URL is required/
  );
  await assert.rejects(
    () => executeHttpRequest({ url: "ftp://example.com" }),
    /Invalid URL/
  );
});

test("http_request performs GET request and parses JSON body", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ status: "healthy", version: "1.0.0" }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const result = await executeHttpRequest({
      url: `http://127.0.0.1:${port}/health`,
      method: "GET",
    });

    assert.ok(result.output.includes("Status: HTTP/200"));
    assert.ok(result.output.includes('"status": "healthy"'));
    assert.equal(result.metadata?.status, 200);
    assert.equal(result.metadata?.isError, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("http_request handles connection refused gracefully", async () => {
  await assert.rejects(
    () => executeHttpRequest({ url: "http://127.0.0.1:49999/does-not-exist" }),
    /Connection refused/
  );
});

test("scoped HTTP checks the engagement and follows in-scope redirects", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-scoped-http-"));
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-1" });
  const server = http.createServer((req, res) => {
    if (req.url === "/start") {
      res.writeHead(302, { Location: "/final" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const result = await executeScopedHttpRequest({
      url: `http://127.0.0.1:${port}/start`,
      method: "GET",
    }, engagement, { evidenceRoot: root });
    assert.match(result.output, /status: HTTP\/200/);
    assert.match(result.output, /302 http:\/\/127\.0\.0\.1:\d+\/start/);
    assert.match(result.output, /"ok": true/);
    assert.equal(result.metadata?.status, 200);
    const files = await fs.readdir(path.join(root, "127.0.0.1", "evidence"));
    assert.equal(files.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scoped HTTP blocks a redirect that leaves the engagement", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const os = await import("node:os");
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-2" });
  let finalRequests = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/hop") {
      res.writeHead(302, { Location: `http://localhost:${(server.address() as { port: number }).port}/final` });
      res.end();
      return;
    }
    finalRequests++;
    res.writeHead(200);
    res.end("should not run");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await assert.rejects(
      () => executeScopedHttpRequest({ url: `http://127.0.0.1:${port}/hop`, method: "GET" }, engagement, {
        evidenceRoot: os.tmpdir(),
      }),
      /Scope denied|not in scope/
    );
    assert.equal(finalRequests, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("scoped HTTP rejects methods outside the engagement", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-3" });
  await assert.rejects(
    () => executeScopedHttpRequest({ url: "http://127.0.0.1:1/", method: "POST" }, engagement),
    /Method POST is not allowed/
  );
});

test("scoped HTTP rejects credential URLs and Host overrides", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-4" });
  await assert.rejects(
    () => executeScopedHttpRequest({ url: "http://user:pass@127.0.0.1/", method: "GET" }, engagement),
    /Credentials in the URL/
  );
  await assert.rejects(
    () => executeScopedHttpRequest({ url: "http://127.0.0.1/", method: "GET", headers: { Host: "evil.example" } }, engagement),
    /Header Host is not allowed/
  );
});

test("scoped HTTP redacts sensitive request headers in evidence", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-scoped-http-redact-"));
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-5" });
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const result = await executeScopedHttpRequest({
      url: `http://127.0.0.1:${port}/`,
      method: "GET",
      headers: { Authorization: "Bearer supersecret" },
    }, engagement, { evidenceRoot: root });
    const evidencePath = String(result.metadata?.evidence ?? "");
    assert.ok(evidencePath);
    const evidence = await fs.readFile(evidencePath, "utf8");
    assert.match(evidence, /"Authorization": "\[redacted\]"/);
    assert.doesNotMatch(evidence, /supersecret/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scoped HTTP neutralizes terminal escape sequences from target bodies", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-6" });
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("\u001b[31mowned\u001b[0m");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const result = await executeScopedHttpRequest({
      url: `http://127.0.0.1:${port}/`,
      method: "GET",
    }, engagement, { evidenceRoot: await import("node:os").then((os) => os.tmpdir()) });
    assert.doesNotMatch(result.output, /\u001b\[/);
    assert.match(result.output, /\[ansi\]owned\[ansi\]/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("scoped HTTP strips credentials when a redirect changes origin", async () => {
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest } = await import("../src/tools/http");
  const engagement = createEngagement({ target: "127.0.0.1", authorizedBy: "TEST-7" });
  let finalAuthorization: string | undefined;
  let firstAuthorization: string | undefined;
  const finalServer = http.createServer((req, res) => {
    finalAuthorization = req.headers.authorization;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("final");
  });
  await new Promise<void>((resolve) => finalServer.listen(0, "127.0.0.1", resolve));
  const finalPort = (finalServer.address() as { port: number }).port;
  const firstServer = http.createServer((req, res) => {
    firstAuthorization = req.headers.authorization;
    res.writeHead(302, { Location: `http://127.0.0.1:${finalPort}/final` });
    res.end();
  });
  await new Promise<void>((resolve) => firstServer.listen(0, "127.0.0.1", resolve));
  const firstPort = (firstServer.address() as { port: number }).port;
  try {
    const result = await executeScopedHttpRequest({
      url: `http://127.0.0.1:${firstPort}/start`,
      method: "GET",
      headers: { Authorization: "Bearer supersecret", Cookie: "session=secret" },
    }, engagement, { evidenceRoot: await import("node:os").then((os) => os.tmpdir()) });
    assert.equal(firstAuthorization, "Bearer supersecret");
    assert.equal(finalAuthorization, undefined);
    assert.match(result.output, /status: HTTP\/200/);
  } finally {
    await new Promise<void>((resolve) => firstServer.close(() => resolve()));
    await new Promise<void>((resolve) => finalServer.close(() => resolve()));
  }
});

test("scoped HTTP blocks hostnames resolving private unless the scope allows it", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createEngagement } = await import("../src/core/engagement");
  const { executeScopedHttpRequest, isPrivateAddress } = await import("../src/tools/http");
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  const blocked = createEngagement({ target: "example.edu", authorizedBy: "TEST-8" });
  await assert.rejects(
    () => executeScopedHttpRequest(
      { url: "https://example.edu/", method: "GET" },
      blocked,
      { resolveHost: async () => ["10.0.0.7"] }
    ),
    /private or link-local/
  );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-scoped-http-private-"));
  try {
    const allowed = createEngagement({ target: "example.edu", authorizedBy: "TEST-8", allowPrivateTargets: true });
    const result = await executeScopedHttpRequest(
      { url: "https://example.edu/", method: "GET" },
      allowed,
      {
        fetchImpl: async () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }),
        resolveHost: async () => ["10.0.0.7"],
        evidenceRoot: root,
      }
    );
    assert.match(result.output, /status: HTTP\/200/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
