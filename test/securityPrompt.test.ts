import test from "node:test";
import assert from "node:assert/strict";
import type { Skill } from "../src/core/types";
import { createEngagement } from "../src/core/engagement";
import { buildSystemPrompt } from "../src/core/context";
import { formatEngagementBlock, withSecurityRouter } from "../src/core/securityPrompt";

const engagement = createEngagement(
  {
    target: "example.edu",
    authorizedBy: "ENG-42",
    allowedHosts: ["example.edu", "api.example.edu"],
    allowedMethods: ["GET", "HEAD"],
    maxRequestsPerSecond: 4,
  },
  new Date("2026-01-01T00:00:00.000Z")
);

function skill(name: string, category = "security"): Skill {
  return { name, category, description: "", triggers: [], content: "", path: "" };
}

test("the engagement block carries scope and a sticky directive", () => {
  const block = formatEngagementBlock(engagement);
  assert.match(block, /<engagement mode="attack">/);
  assert.match(block, /target: example\.edu/);
  assert.match(block, /allowed hosts: example\.edu, api\.example\.edu/);
  assert.match(block, /allowed methods: GET, HEAD/);
  assert.match(block, /max requests per second: 4/);
  assert.match(block, /Every user message in this session is a task/);
});

test("security mode replaces the coding prompt", () => {
  const base = { cwd: "/tmp/work", isGit: false, platform: "darwin", date: "2026-01-01" };
  const security = buildSystemPrompt({ ...base, mode: "security" });
  assert.match(security, /authorized security engagement/);
  assert.doesNotMatch(security, /For code tasks/);
  const coding = buildSystemPrompt({ ...base, mode: "coding" });
  assert.match(coding, /For code tasks/);
  assert.doesNotMatch(coding, /authorized security engagement/);
});

test("the router skill is always active inside an engagement", () => {
  const available = [skill("security-engagement"), skill("path-discovery"), skill("debugging", "dev")];
  const matched = [skill("path-discovery")];
  const active = withSecurityRouter(available, matched, true);
  assert.equal(active[0].name, "security-engagement");
  assert.equal(active.filter((item) => item.name === "security-engagement").length, 1);
  assert.ok(active.some((item) => item.name === "path-discovery"));
});

test("coding runs keep their normal skill selection", () => {
  const available = [skill("security-engagement"), skill("path-discovery")];
  const matched = [skill("path-discovery")];
  assert.deepEqual(withSecurityRouter(available, matched, false), matched);
});
