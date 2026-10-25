import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkTarget,
  createEngagement,
  engagementPath,
  loadEngagement,
  normalizeHost,
  normalizeMethods,
  saveEngagement,
  validateEngagement,
} from "../src/core/engagement";

const NOW = new Date("2026-01-01T00:00:00.000Z");

test("hosts and methods normalize", () => {
  assert.equal(normalizeHost("https://API.Example.edu:8443/login"), "api.example.edu");
  assert.equal(normalizeHost("example.edu."), "example.edu");
  assert.equal(normalizeHost("user:pass@example.edu"), "");
  assert.equal(normalizeHost("not a host"), "");
  assert.deepEqual(normalizeMethods(["get", "GET", "post", "bogus"]), ["GET", "POST"]);
});

test("engagement creation applies safe defaults", () => {
  const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" }, NOW);
  assert.equal(engagement.target, "example.edu");
  assert.deepEqual(engagement.allowedMethods, ["GET", "HEAD"]);
  assert.equal(engagement.maxRequestsPerSecond, 5);
  assert.equal(engagement.expiresAt, "2026-01-31T00:00:00.000Z");
  assert.deepEqual(engagement.allowedHosts, ["example.edu"]);
});

test("creation requires authorization and a valid target", () => {
  assert.throws(() => createEngagement({ target: "", authorizedBy: "ENG-1" }, NOW));
  assert.throws(() => createEngagement({ target: "example.edu", authorizedBy: "" }, NOW));
});

test("scope allows the target and its subdomains", () => {
  const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" }, NOW);
  assert.equal(checkTarget(engagement, "example.edu", "GET", NOW).allowed, true);
  assert.equal(checkTarget(engagement, "https://api.example.edu/users", "HEAD", NOW).allowed, true);
  assert.equal(checkTarget(engagement, "other.example", "GET", NOW).allowed, false);
});

test("scope denies unlisted methods and expired engagements", () => {
  const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" }, NOW);
  assert.equal(checkTarget(engagement, "example.edu", "POST", NOW).allowed, false);
  const later = new Date("2026-03-01T00:00:00.000Z");
  assert.equal(checkTarget(engagement, "example.edu", "GET", later).allowed, false);
});

test("invalid records are rejected", () => {
  assert.equal(validateEngagement(null), null);
  assert.equal(validateEngagement({ target: "example.edu" }), null);
  assert.equal(
    validateEngagement({
      target: "example.edu",
      authorizedBy: "ENG-1",
      allowedHosts: ["example.edu"],
      allowedMethods: ["GET"],
      maxRequestsPerSecond: 0,
      createdAt: NOW.toISOString(),
      expiresAt: NOW.toISOString(),
    }),
    null
  );
});

test("engagements save and load from the workspace", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-engagement-"));
  try {
    const engagement = createEngagement({ target: "example.edu", authorizedBy: "ENG-1" }, NOW);
    const filePath = await saveEngagement(engagement, dir);
    assert.equal(filePath, engagementPath(dir));
    const loaded = await loadEngagement(dir);
    assert.equal(loaded?.id, engagement.id);
    assert.equal(loaded?.target, "example.edu");
    const mode = (await fs.stat(filePath)).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a missing or malformed scope file loads as null", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-engagement-"));
  try {
    assert.equal(await loadEngagement(dir), null);
    await fs.mkdir(path.dirname(engagementPath(dir)), { recursive: true });
    await fs.writeFile(engagementPath(dir), "{not json", "utf8");
    assert.equal(await loadEngagement(dir), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
