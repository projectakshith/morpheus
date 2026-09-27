import test from "node:test";
import assert from "node:assert/strict";
import { parseCLIArgs } from "../src/cli/args";

test("parseCLIArgs handles verbose flag", () => {
  const parsed = parseCLIArgs(["-v", "fix issue"]);
  assert.equal(parsed.isVerbose, true);
  assert.equal(parsed.task, "fix issue");
});

test("parseCLIArgs handles local flag and model specification", () => {
  const parsed = parseCLIArgs(["--local", "-m", "llama3:8b", "test query"]);
  assert.equal(parsed.isLocal, true);
  assert.equal(parsed.model, "llama3:8b");
  assert.equal(parsed.task, "test query");
});

test("parseCLIArgs handles custom base-url", () => {
  const parsed = parseCLIArgs(["--base-url", "http://localhost:8000/v1", "explain architecture"]);
  assert.equal(parsed.baseURL, "http://localhost:8000/v1");
  assert.equal(parsed.task, "explain architecture");
});

test("parseCLIArgs defaults properly with no arguments", () => {
  const parsed = parseCLIArgs([]);
  assert.equal(parsed.isVerbose, false);
  assert.equal(parsed.isLocal, false);
  assert.equal(parsed.model, undefined);
  assert.equal(parsed.baseURL, undefined);
  assert.equal(parsed.maxSteps, undefined);
  assert.equal(parsed.task, "");
});

test("parseCLIArgs handles --max-steps and -s flags", () => {
  const parsed1 = parseCLIArgs(["--max-steps", "15", "run query"]);
  assert.equal(parsed1.maxSteps, 15);
  assert.equal(parsed1.task, "run query");

  const parsed2 = parseCLIArgs(["-s", "6", "explore repo"]);
  assert.equal(parsed2.maxSteps, 6);
  assert.equal(parsed2.task, "explore repo");
});
