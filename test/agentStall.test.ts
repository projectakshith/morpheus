import test from "node:test";
import assert from "node:assert/strict";
import { isConversationalStall } from "../src/core/agent";

test("isConversationalStall catches 'let's take a look' local model idiom", () => {
  const content =
    "Okay, no auth directory found either. Let's take a look at the main backend entry point to see if there are any mentions of authentication.";
  assert.equal(isConversationalStall(content, 2, 8, 0), true);
});

test("isConversationalStall catches various future narrative patterns", () => {
  assert.equal(isConversationalStall("I will now inspect src/index.ts", 1, 8, 0), true);
  assert.equal(isConversationalStall("Let's dig into the auth router", 1, 8, 0), true);
  assert.equal(isConversationalStall("We need to check package.json", 1, 8, 0), true);
  assert.equal(isConversationalStall("Let's see whether there are other routes", 1, 8, 0), true);
  assert.equal(isConversationalStall("I'll proceed to examine the config", 1, 8, 0), true);
});

test("isConversationalStall catches advisory deflections to the user", () => {
  assert.equal(isConversationalStall("You can check the auth file in src/auth.ts", 2, 8, 0), true);
  assert.equal(isConversationalStall("Feel free to inspect the database schema", 2, 8, 0), true);
});

test("isConversationalStall catches dangling colons", () => {
  assert.equal(isConversationalStall("Here is the next file to look at:\n", 2, 8, 0), true);
});

test("isConversationalStall does not flag genuine explanatory answers", () => {
  const answer =
    "Authentication in ratio-d is handled using HMAC SHA-256 signatures generated in the CLI and verified in the worker.";
  assert.equal(isConversationalStall(answer, 3, 8, 0), false);
});

test("isConversationalStall respects step budget and nudge limit", () => {
  const stallText = "Let's take a look at the file.";
  assert.equal(isConversationalStall(stallText, 8, 8, 0), false);
  assert.equal(isConversationalStall(stallText, 2, 8, 3), false);
});
