import test from "node:test";
import assert from "node:assert/strict";
import {
  activateSecuritySession,
  beginSecuritySession,
  deactivateSecuritySession,
  getSecuritySession,
  setSecuritySession,
  subscribeSecuritySession,
} from "../src/core/securitySession";
import { createEngagement } from "../src/core/engagement";

test("security session activates and deactivates", () => {
  const engagement = createEngagement(
    { target: "example.edu", authorizedBy: "ENG-1" },
    new Date("2026-01-01T00:00:00.000Z")
  );
  activateSecuritySession(engagement);
  assert.deepEqual(getSecuritySession(), {
    active: true,
    target: "example.edu",
    engagementId: engagement.id,
  });
  deactivateSecuritySession();
  assert.deepEqual(getSecuritySession(), {
    active: false,
    target: undefined,
    engagementId: undefined,
  });
});

test("attack mode can begin before a scope exists", () => {
  deactivateSecuritySession();
  beginSecuritySession("example.edu");
  assert.deepEqual(getSecuritySession(), {
    active: true,
    target: "example.edu",
    engagementId: undefined,
  });
  deactivateSecuritySession();
});

test("subscribers receive updates", () => {
  let calls = 0;
  const unsubscribe = subscribeSecuritySession(() => {
    calls += 1;
  });
  setSecuritySession({ active: true });
  setSecuritySession({ active: false });
  unsubscribe();
  setSecuritySession({ active: true });
  assert.equal(calls, 2);
  setSecuritySession({ active: false });
});
