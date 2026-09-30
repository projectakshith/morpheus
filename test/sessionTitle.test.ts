import test from "node:test";
import assert from "node:assert/strict";
import {
  displayTitle,
  generateSessionTitle,
  isTrivialPrompt,
  promptTitle,
  sanitizeGeneratedTitle,
} from "../src/core/sessionTitle";
import type { StreamEvent, ChatStreamOptions } from "../src/provider/operator";

test("isTrivialPrompt catches greetings and slash commands, not real asks", () => {
  for (const p of ["hi", "yoo", "sup", "hey!", "ok", "thanks", "  ", "/model flash", "test"]) {
    assert.equal(isTrivialPrompt(p), true, p);
  }
  for (const p of ["talk bout india", "chk out morpheus", "fix the login bug", "hi can you fix the tests"]) {
    assert.equal(isTrivialPrompt(p), false, p);
  }
});

test("promptTitle cleans markdown and truncates on a word boundary", () => {
  assert.equal(promptTitle("hi"), null);
  assert.equal(promptTitle("fix **the** `login` bug"), "fix the login bug");
  const long = promptTitle("please refactor the entire authentication layer so it uses the new token service");
  assert.ok(long && long.length <= 48 && long.endsWith("…"), long ?? "");
  assert.ok(!long!.slice(0, -1).endsWith(" "));
});

test("sanitizeGeneratedTitle strips wrapper noise from model replies", () => {
  assert.equal(sanitizeGeneratedTitle("Fix Agent Loop Guards"), "Fix Agent Loop Guards");
  assert.equal(sanitizeGeneratedTitle('"Bridge Morpheus To Phone."'), "Bridge Morpheus To Phone");
  assert.equal(sanitizeGeneratedTitle("Title: **Matrix Streaming Reveal**"), "Matrix Streaming Reveal");
  assert.equal(sanitizeGeneratedTitle("<think>user wants a title</think>\n\nSession Naming Logic"), "Session Naming Logic");
  assert.equal(sanitizeGeneratedTitle("\n\n  Debug Retry Backoff  \nextra line"), "Debug Retry Backoff");
});

test("sanitizeGeneratedTitle rejects replies that are not titles", () => {
  assert.equal(sanitizeGeneratedTitle(""), null);
  assert.equal(sanitizeGeneratedTitle("<think>still thinking when the token limit hit"), null);
  assert.equal(
    sanitizeGeneratedTitle("Sure! Here is a title that describes what the user was working on today"),
    null
  );
});

function fakeOperator(behavior: (opts: ChatStreamOptions) => AsyncGenerator<StreamEvent>) {
  const calls: ChatStreamOptions[] = [];
  return {
    calls,
    operator: {
      chatStream(opts: ChatStreamOptions) {
        calls.push(opts);
        return behavior(opts);
      },
    },
  };
}

test("generateSessionTitle returns a clean title and keeps the request small", async () => {
  const { operator, calls } = fakeOperator(async function* () {
    yield { type: "reasoning", reasoning: "hmm" };
    yield { type: "text", text: '"Session ' };
    yield { type: "text", text: 'Naming Logic"' };
  });
  const title = await generateSessionTitle(operator, "how do we name sessions", "We generate a title...");
  assert.equal(title, "Session Naming Logic");
  assert.equal(calls[0].maxTokens, 200);
  assert.equal(calls[0].tools, undefined, "title requests never offer tools");
});

test("generateSessionTitle returns null instead of throwing on provider errors", async () => {
  const { operator } = fakeOperator(async function* () {
    throw new Error("[Operator HTTP 500] boom");
  });
  assert.equal(await generateSessionTitle(operator, "fix the build", "done"), null);
});

test("generateSessionTitle gives up when the caller aborts", async () => {
  const { operator } = fakeOperator(async function* (opts) {
    await new Promise((_, reject) =>
      opts.abortSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
    );
  });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);
  assert.equal(await generateSessionTitle(operator, "fix the build", "done", controller.signal), null);
});

test("displayTitle falls back to the start time for placeholder titles", () => {
  assert.equal(displayTitle("Fix Agent Loops", 0), "Fix Agent Loops");
  const created = new Date(2026, 8, 30, 14, 5).getTime();
  for (const placeholder of [undefined, "", "New Session", "Untitled Session", "Resumed Session"]) {
    assert.equal(displayTitle(placeholder, created), "Session · Sep 30, 2:05 PM");
  }
});
