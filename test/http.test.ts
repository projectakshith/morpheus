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
