import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { securitySkillsEnabled } from "../src/core/context";
import { deactivateSecuritySession } from "../src/core/securitySession";

test("security skills stay hidden without a scope", async () => {
  deactivateSecuritySession();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-context-"));
  try {
    assert.equal(securitySkillsEnabled(dir), false);
    await fs.mkdir(path.join(dir, ".morpheus"), { recursive: true });
    await fs.writeFile(path.join(dir, ".morpheus", "engagement.json"), "{}", "utf8");
    assert.equal(securitySkillsEnabled(dir), true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
