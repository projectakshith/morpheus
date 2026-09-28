/*
 * Session tests: verifies session serialization, listing, resumption, and slash commands.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  type SessionData,
} from "../src/core/session.js";
import { commandRegistry } from "../src/cli/commands/registry.js";
import type { CommandContext } from "../src/cli/commands/types.js";

describe("Session Management Engine", () => {
  it("generates well-formed unique session IDs", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    assert.match(id1, /^sess_\d+_[a-z0-9]+$/);
    assert.notEqual(id1, id2);
  });

  it("saves, loads, and round-trips session data cleanly", async () => {
    const testId = `sess_test_${Date.now()}_abc`;
    const mockSession: SessionData = {
      id: testId,
      title: "Refactor auth controller",
      cwd: process.cwd(),
      createdAt: Date.now() - 5000,
      updatedAt: Date.now(),
      model: "antigravity/gemini-2.5-flash",
      threads: [
        {
          id: "thread_1",
          index: 1,
          prompt: "Please refactor the auth system",
          response: "Refactored cleanly.",
          steps: [],
          isExpanded: false,
          status: "completed",
          stepCount: 1,
          startTime: Date.now(),
        },
      ],
      history: [
        { role: "user", content: "Please refactor the auth system" },
        { role: "assistant", content: "Refactored cleanly." },
      ],
      findings: [{ topic: "Auth", takeaway: "Tokens stored in keychain" }],
      fileEdits: [],
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };

    await saveSession(mockSession);

    const loaded = await loadSession(testId);
    assert.ok(loaded);
    assert.equal(loaded.id, testId);
    assert.equal(loaded.title, "Refactor auth controller");
    assert.equal(loaded.threads.length, 1);
    assert.equal(loaded.threads[0].prompt, "Please refactor the auth system");
    assert.equal(loaded.history.length, 2);
    assert.equal(loaded.findings[0].topic, "Auth");

    /* Cleanup */
    await deleteSession(testId);
    const afterDelete = await loadSession(testId);
    assert.equal(afterDelete, null);
  });

  it("lists sessions with metadata and summary turn counts", async () => {
    const idA = `sess_test_a_${Date.now()}`;
    const idB = `sess_test_b_${Date.now()}`;

    await saveSession({
      id: idA,
      title: "Task A",
      cwd: process.cwd(),
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 5000,
      model: "flash",
      threads: [],
      history: [],
      findings: [],
      fileEdits: [],
    });

    await saveSession({
      id: idB,
      title: "Task B",
      cwd: process.cwd(),
      createdAt: Date.now() - 2000,
      updatedAt: Date.now(),
      model: "flash",
      threads: [
        {
          id: "t1",
          index: 1,
          prompt: "Task B turn",
          response: "done",
          steps: [],
          isExpanded: false,
          status: "completed",
          stepCount: 1,
          startTime: Date.now(),
        },
      ],
      history: [],
      findings: [],
      fileEdits: [],
    });

    const list = await listSessions(process.cwd(), 10);
    assert.ok(list.length >= 2);

    /* Must be sorted by updatedAt descending */
    const itemB = list.find((s) => s.id === idB);
    const itemA = list.find((s) => s.id === idA);
    assert.ok(itemB);
    assert.ok(itemA);
    assert.equal(itemB.turnCount, 1);
    assert.equal(itemA.turnCount, 0);

    /* Cleanup */
    await deleteSession(idA);
    await deleteSession(idB);
  });

  it("dispatches /session slash command and returns active session information", async () => {
    let responseText = "";
    const ctx: CommandContext = {
      taskText: "/session",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "antigravity/gemini-2.5-flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        responseText = next[0]?.response || "";
      },
      setPromptHistory: () => {},
      threadsCount: 3,
      sessionId: "sess_mock_current",
      sessionTitle: "Active Session Work",
      usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
    };

    const handled = await commandRegistry.dispatch("/session", ctx);
    assert.equal(handled, true);
    assert.ok(responseText.includes("sess_mock_current"));
    assert.ok(responseText.includes("Active Session Work"));
    assert.ok(responseText.includes("400 tokens"));
  });

  it("dispatches /sessions slash command to list past sessions", async () => {
    const testId = `sess_list_test_${Date.now()}`;
    await saveSession({
      id: testId,
      title: "Listable Test Session",
      cwd: process.cwd(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: "flash",
      threads: [],
      history: [],
      findings: [],
      fileEdits: [],
    });

    let responseText = "";
    const ctx: CommandContext = {
      taskText: "/sessions",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        responseText = next[0]?.response || "";
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      sessionId: "other_session",
    };

    const handled = await commandRegistry.dispatch("/sessions", ctx);
    assert.equal(handled, true);
    assert.ok(responseText.includes(testId));
    assert.ok(responseText.includes("Listable Test Session"));

    /* Cleanup */
    await deleteSession(testId);
  });
});
