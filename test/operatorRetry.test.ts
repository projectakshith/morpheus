import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { Operator, parseRetryAfterMs } from "../src/provider/operator";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function textStream(text: string): Response {
  const body =
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n` +
    "data: [DONE]\n\n";
  return new Response(body, { status: 200 });
}

/* Each entry builds a fresh Response, since a body can only be consumed once.
 * The last entry repeats for any further calls. */
function mockFetch(responses: Array<() => Response | Error>): { calls: () => number } {
  let calls = 0;
  globalThis.fetch = (async () => {
    const next = responses[Math.min(calls++, responses.length - 1)]();
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { calls: () => calls };
}

const status = (code: number, headers?: Record<string, string>) => () =>
  new Response(`status ${code}`, { status: code, headers });
const stream = (text: string) => () => textStream(text);

function networkError(code: string): Error {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}

async function collectText(operator: Operator, signal?: AbortSignal): Promise<string> {
  let text = "";
  for await (const event of operator.chatStream({ messages: [{ role: "user", content: "hi" }], abortSignal: signal })) {
    if (event.type === "text") text += event.text;
  }
  return text;
}

const fastOperator = (maxRetries = 3) =>
  new Operator({ baseURL: "https://example.test/v1", apiKey: "k", maxRetries, retryBaseDelayMs: 1 });

test("Operator retries rate limits and overloads, then streams", async () => {
  const mock = mockFetch([
    status(429),
    status(529),
    stream("ok"),
  ]);
  assert.equal(await collectText(fastOperator()), "ok");
  assert.equal(mock.calls(), 3);
});

test("Operator does not retry client errors", async () => {
  const mock = mockFetch([status(400), stream("unreachable")]);
  await assert.rejects(collectText(fastOperator()), /HTTP 400/);
  assert.equal(mock.calls(), 1);
});

test("Operator gives up after maxRetries and surfaces the last status", async () => {
  const mock = mockFetch([status(503)]);
  await assert.rejects(collectText(fastOperator(2)), /HTTP 503/);
  assert.equal(mock.calls(), 3);
});

test("Operator surfaces a Retry-After longer than it is willing to wait", async () => {
  const mock = mockFetch([
    status(429, { "retry-after": "3600" }),
    stream("unreachable"),
  ]);
  await assert.rejects(collectText(fastOperator()), /HTTP 429/);
  assert.equal(mock.calls(), 1);
});

test("Operator retries dropped connections but fails fast when nothing is listening", async () => {
  const reset = mockFetch([() => networkError("ECONNRESET"), stream("ok")]);
  assert.equal(await collectText(fastOperator()), "ok");
  assert.equal(reset.calls(), 2);

  const refused = mockFetch([() => networkError("ECONNREFUSED"), stream("unreachable")]);
  await assert.rejects(collectText(fastOperator()), /fetch failed/);
  assert.equal(refused.calls(), 1);
});

test("Operator stops backing off as soon as the run is aborted", async () => {
  mockFetch([status(503, { "retry-after": "20" })]);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  const started = Date.now();
  await assert.rejects(collectText(fastOperator(), controller.signal), { name: "AbortError" });
  assert.ok(Date.now() - started < 5000);
});

test("parseRetryAfterMs handles seconds, dates, and junk", () => {
  assert.equal(parseRetryAfterMs("2"), 2000);
  assert.equal(parseRetryAfterMs(new Date(10_000).toUTCString(), 4_000), 6000);
  assert.equal(parseRetryAfterMs("soon"), undefined);
  assert.equal(parseRetryAfterMs(null), undefined);
});
