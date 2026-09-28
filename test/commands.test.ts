/*
 * CommandRegistry tests: verifies modular slash command dispatching and handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commandRegistry } from "../src/cli/commands/registry.js";
import type { CommandContext } from "../src/cli/commands/types.js";
import type { Thread } from "../src/cli/types.js";

describe("CommandRegistry", () => {
  it("dispatches /help command and populates response", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/help",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "antigravity/gemini-2.5-flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/help", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("/model"));
    assert.ok((threadCreated as Thread).response.includes("/login"));
  });

  it("dispatches /model switch command and updates model state", async () => {
    let switchedModel = "";
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/model space-bunny",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "antigravity/gemini-2.5-flash",
      setCurrentModel: (m) => {
        switchedModel = m;
      },
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/model space-bunny", ctx);
    assert.equal(handled, true);
    assert.equal(switchedModel, "space-bunny");
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("space-bunny"));
  });

  it("returns false for regular prompt text", async () => {
    const ctx: CommandContext = {
      taskText: "Refactor this component to be modular",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "antigravity/gemini-2.5-flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("Refactor this component to be modular", ctx);
    assert.equal(handled, false);
  });

  it("triggers settings modal on /settings dispatch", async () => {
    let modalOpened: string | null = null;
    const ctx: CommandContext = {
      taskText: "/settings",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
      openModal: (modal) => {
        modalOpened = modal;
      },
    };

    const handled = await commandRegistry.dispatch("/settings", ctx);
    assert.equal(handled, true);
    assert.equal(modalOpened, "settings");
  });

  it("triggers session modal on /sessions dispatch", async () => {
    let modalOpened: string | null = null;
    const ctx: CommandContext = {
      taskText: "/sessions",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
      openModal: (modal) => {
        modalOpened = modal;
      },
    };

    const handled = await commandRegistry.dispatch("/sessions", ctx);
    assert.equal(handled, true);
    assert.equal(modalOpened, "session");
  });
});

