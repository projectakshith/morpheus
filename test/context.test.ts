import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { securitySkillsEnabled } from "../src/core/context";
import {
  activateSecuritySession,
  deactivateSecuritySession,
} from "../src/core/securitySession";
import { createEngagement } from "../src/core/engagement";

test("security skills follow attack mode, not a leftover scope file", async () => {
  deactivateSecuritySession();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-context-"));
  try {
    assert.equal(securitySkillsEnabled(dir), false);
    await fs.mkdir(path.join(dir, ".morpheus"), { recursive: true });
    await fs.writeFile(path.join(dir, ".morpheus", "engagement.json"), "{}", "utf8");
    assert.equal(securitySkillsEnabled(dir), false);

    const engagement = createEngagement(
      { target: "example.edu", authorizedBy: "ENG-1" },
      new Date("2026-01-01T00:00:00.000Z")
    );
    activateSecuritySession(engagement);
    assert.equal(securitySkillsEnabled(dir), true);

    deactivateSecuritySession();
    assert.equal(securitySkillsEnabled(dir), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
