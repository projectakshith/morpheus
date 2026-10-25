/*
 * CommandRegistry tests: verifies modular slash command dispatching and handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commandRegistry } from "../src/commands/registry";
import type { CommandContext } from "../src/commands/types";
import type { Thread } from "../src/cli/types";

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

  it("dispatches /morpheus command and renders TrueColor avatar", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/morpheus",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/morpheus", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Free your mind"));
    assert.ok((threadCreated as Thread).response.includes("\x1b[38;2;"));
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

  it("dispatches /stop command and triggers abort callback", async () => {
    let aborted = false;
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/stop",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      abort: () => {
        aborted = true;
      },
    };

    const handled = await commandRegistry.dispatch("/stop", ctx);
    assert.equal(handled, true);
    assert.equal(aborted, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("stopped"));
  });

  it("dispatches /queue and /clear-queue commands cleanly", async () => {
    let queueCleared = false;
    let threadCreated: Thread | null = null;
    const mockQueue = ["fix authentication", "run build"];

    const ctx: CommandContext = {
      taskText: "/queue",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      getQueue: () => mockQueue,
      clearQueue: () => {
        queueCleared = true;
      },
    };

    const handledQueue = await commandRegistry.dispatch("/queue", ctx);
    assert.equal(handledQueue, true);
    assert.ok((threadCreated as Thread).response.includes("fix authentication"));

    const handledClear = await commandRegistry.dispatch("/clear-queue", ctx);
    assert.equal(handledClear, true);
    assert.equal(queueCleared, true);
  });

  it("resolves prefix slash commands like /sess and /mod automatically", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/sess",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    // Typing /sess should resolve to session command rather than falling through to LLM chat
    const handled = await commandRegistry.dispatch("/sess", ctx);
    assert.equal(handled, true, "Prefix command /sess should be handled by CommandRegistry");
    assert.ok(threadCreated, "Should create a response thread for /sess");
  });

  it("intercepts unrecognized slash commands and prevents leaking to LLM", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/nonexistentcommand",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/nonexistentcommand", ctx);
    assert.equal(handled, true, "Unrecognized slash command should be intercepted");
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Unknown command"));
  });

  it("dispatches /neo command and reports proxy router health", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/neo",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/neo", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Neo Router"));
  });

  it("dispatches /neo command and opens neo modal when openModal is provided", async () => {
    let openedModal: string | null = null;
    const ctx: CommandContext = {
      taskText: "/neo",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
      openModal: (modal) => {
        openedModal = modal;
      },
    };

    const handled = await commandRegistry.dispatch("/neo", ctx);
    assert.equal(handled, true);
    assert.equal(openedModal, "neo");
  });

  it("dispatches /usage command and reports token metrics", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/usage",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      usage: {
        promptTokens: 1200,
        completionTokens: 300,
        totalTokens: 1500,
        peakContextTokens: 1500,
        contextLimit: 128000,
      },
    };

    const handled = await commandRegistry.dispatch("/usage", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Token Usage"));
  });

  it("dispatches /usage command and opens usage modal when openModal is provided", async () => {
    let openedModal: string | null = null;
    const ctx: CommandContext = {
      taskText: "/usage",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
      openModal: (modal) => {
        openedModal = modal;
      },
    };

    const handled = await commandRegistry.dispatch("/usage", ctx);
    assert.equal(handled, true);
    assert.equal(openedModal, "usage");
  });

  it("dispatches /programs and opens programs modal when openModal is provided", async () => {
    let openedModal: string | null = null;
    const ctx: CommandContext = {
      taskText: "/programs",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: () => {},
      setPromptHistory: () => {},
      threadsCount: 0,
      openModal: (modal) => {
        openedModal = modal;
      },
    };

    const handled = await commandRegistry.dispatch("/programs", ctx);
    assert.equal(handled, true);
    assert.equal(openedModal, "programs");
  });

  it("dispatches /programs and outputs manifest when openModal is absent", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/programs",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
    };

    const handled = await commandRegistry.dispatch("/programs", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Matrix Operative Programs"));
    assert.ok((threadCreated as Thread).response.includes("⚿ Keymaker"));
    assert.ok((threadCreated as Thread).response.includes("✦ Sati"));
  });

  it("dispatches /rewind and pops turns from thread history", async () => {
    let threads: Thread[] = [
      { id: "1", index: 1, prompt: "p1", response: "r1", isStreaming: false, steps: [], isExpanded: false, status: "completed", stepCount: 0, startTime: 0, durationMs: 0 },
      { id: "2", index: 2, prompt: "p2", response: "r2", isStreaming: false, steps: [], isExpanded: false, status: "completed", stepCount: 0, startTime: 0, durationMs: 0 },
    ];
    let chatHistory = [{ role: "user", content: "p1" }, { role: "assistant", content: "r1" }, { role: "user", content: "p2" }, { role: "assistant", content: "r2" }] as any[];

    const ctx: CommandContext = {
      taskText: "/rewind 1",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        threads = typeof updater === "function" ? updater(threads) : updater;
      },
      setHistory: (updater) => {
        chatHistory = typeof updater === "function" ? updater(chatHistory) : updater;
      },
      setPromptHistory: () => {},
      threadsCount: threads.length,
    };

    const handled = await commandRegistry.dispatch("/rewind 1", ctx);
    assert.equal(handled, true);
    assert.equal(threads.length, 2); // 1 preserved original turn + 1 rewind notice turn
    assert.ok(threads[1].response.includes("Rewound 1 turn"));
    assert.equal(chatHistory.length, 2); // 4 - 2 = 2 messages
  });

  it("dispatches /steer and injects instruction when agent is running", async () => {
    let threadCreated: Thread | null = null;
    let steeredText = "";
    const ctx: CommandContext = {
      taskText: "/steer use pnpm instead of npm",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      isAgentRunning: true,
      steer: (instruction) => {
        steeredText = instruction;
        return true;
      },
    };

    const handled = await commandRegistry.dispatch("/steer use pnpm instead of npm", ctx);
    assert.equal(handled, true);
    assert.equal(steeredText, "use pnpm instead of npm");
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("Steering Note Injected"));
  });

  it("dispatches /steer and reports idle state when agent is not running", async () => {
    let threadCreated: Thread | null = null;
    const ctx: CommandContext = {
      taskText: "/steer do something",
      baseURL: "http://127.0.0.1:8787/v1",
      currentModel: "flash",
      setCurrentModel: () => {},
      setIsModelSelectorOpen: () => {},
      setThreads: (updater) => {
        const next = typeof updater === "function" ? updater([]) : updater;
        threadCreated = next[0] || null;
      },
      setPromptHistory: () => {},
      threadsCount: 0,
      isAgentRunning: false,
    };

    const handled = await commandRegistry.dispatch("/steer do something", ctx);
    assert.equal(handled, true);
    assert.ok(threadCreated);
    assert.ok((threadCreated as Thread).response.includes("No Active Run to Steer"));
  });
});


