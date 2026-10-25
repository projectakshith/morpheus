import test from "node:test";
import assert from "node:assert/strict";
import { classifyRefusal, shouldRecover } from "../src/core/refusal";

test("hard refusals are detected", () => {
  assert.equal(classifyRefusal("I'm sorry, but I can't help with that."), "hard");
  assert.equal(classifyRefusal("I cannot assist with accessing that system."), "hard");
  assert.equal(classifyRefusal("That request violates my usage policy."), "hard");
  assert.equal(classifyRefusal("anything", "content_filter"), "hard");
});

test("clarifying questions are not treated as refusals", () => {
  assert.equal(classifyRefusal("Could you confirm you own this domain?"), "clarify");
  assert.equal(classifyRefusal("Can you provide the authorization reference?"), "clarify");
});

test("technical limits are not refusals", () => {
  assert.equal(classifyRefusal("I can't determine the server version from these headers."), "none");
  assert.equal(classifyRefusal("The endpoint returned 403, so I cannot read the body."), "none");
  assert.equal(classifyRefusal("I can't reach the host on port 443."), "none");
  assert.equal(classifyRefusal("Sorry, the scan found no open ports."), "none");
});

test("short hedged answers without technical content are partial refusals", () => {
  assert.equal(classifyRefusal("Sorry, I can't do that."), "hard");
  assert.equal(classifyRefusal("Unfortunately that is outside what I can cover."), "partial");
});

test("normal answers pass through", () => {
  assert.equal(classifyRefusal("The host exposes nginx 1.24 and no CSP header."), "none");
  assert.equal(classifyRefusal(""), "none");
});

test("recovery only applies to hard and partial refusals", () => {
  assert.equal(shouldRecover("hard"), true);
  assert.equal(shouldRecover("partial"), true);
  assert.equal(shouldRecover("clarify"), false);
  assert.equal(shouldRecover("none"), false);
});
