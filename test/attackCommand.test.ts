import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CommandContext } from "../src/commands/types";
import type { Thread } from "../src/core/thread";
import { attackCommand, normalCommand } from "../src/commands/attack";
import { loadEngagement } from "../src/core/engagement";
import {
  deactivateSecuritySession,
  getSecuritySession,
} from "../src/core/securitySession";

function makeCtx(cwd: string) {
  const threads: Thread[] = [];
  let history: string[] = [];
  const ctx = {
    taskText: "/attack",
    cwd,
    baseURL: "",
    currentModel: "test",
    setCurrentModel: () => {},
    setIsModelSelectorOpen: () => {},
    setThreads: (action: Thread[] | ((prev: Thread[]) => Thread[])) => {
      const next = typeof action === "function" ? action(threads) : action;
      threads.splice(0, threads.length, ...next);
    },
    setPromptHistory: (action: string[] | ((prev: string[]) => string[])) => {
      const next = typeof action === "function" ? action(history) : action;
      history = next;
    },
    threadsCount: 0,
  } as unknown as CommandContext;
  return { ctx, threads };
}

async function withDir(run: (dir: string) => Promise<void>) {
  deactivateSecuritySession();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-attack-"));
  try {
    await run(dir);
  } finally {
    deactivateSecuritySession();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("bare /attack enters attack mode without a scope", async () => {
  await withDir(async (dir) => {
    const { ctx, threads } = makeCtx(dir);
    assert.equal(await attackCommand.execute("/attack", ctx), true);
    assert.equal(getSecuritySession().active, true);
    assert.equal(getSecuritySession().target, undefined);
    assert.match(threads[0].response, /attack mode active/);
    assert.match(threads[0].response, /No scope yet/);
    assert.equal(await loadEngagement(dir), null);
  });
});

test("/attack with a target but no authorization stays unarmed", async () => {
  await withDir(async (dir) => {
    const { ctx, threads } = makeCtx(dir);
    await attackCommand.execute("/attack example.edu", ctx);
    assert.equal(getSecuritySession().active, true);
    assert.equal(getSecuritySession().target, "example.edu");
    assert.match(threads[0].response, /authorization reference/);
    assert.equal(await loadEngagement(dir), null);
  });
});

test("/attack with a target and authorization writes the scope", async () => {
  await withDir(async (dir) => {
    const { ctx } = makeCtx(dir);
    await attackCommand.execute("/attack http://localhost:3000 --auth ENG-1 --rps 3 --allow-private", ctx);
    assert.equal(getSecuritySession().active, true);
    assert.equal(getSecuritySession().target, "localhost");
    const scope = await loadEngagement(dir);
    assert.deepEqual(scope?.allowedHosts, ["localhost"]);
    assert.deepEqual(scope?.allowedMethods, ["GET", "HEAD"]);
    assert.equal(scope?.maxRequestsPerSecond, 3);
    assert.equal(scope?.allowPrivateTargets, true);
  });
});

test("/normal clears attack mode but keeps the scope file", async () => {
  await withDir(async (dir) => {
    const { ctx } = makeCtx(dir);
    await attackCommand.execute("/attack example.edu --auth ENG-1", ctx);
    await normalCommand.execute("/normal", ctx);
    assert.equal(getSecuritySession().active, false);
    assert.ok(await loadEngagement(dir));
  });
});
