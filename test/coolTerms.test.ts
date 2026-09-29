import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCoolActionLabel, buildThreadFeedLines } from "../src/cli/components/ThreadFeed";
import type { Thread, ThreadStep } from "../src/cli/types";

describe("Cool Action Labels (Chill Friend / Gen-Z Aesthetic)", () => {
  it("defaults to 'cooking...' when no step is active", () => {
    const label = getCoolActionLabel(undefined);
    assert.equal(label, "cooking...");
  });

  it("formats running thinking step as 'thinking rn'", () => {
    const step: ThreadStep = {
      id: "think_1",
      type: "thinking",
      isRunning: true,
      startTime: Date.now() - 1200,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.startsWith("thinking rn (1.2s)...") || label.includes("thinking rn"));
  });

  it("formats search / grep_code as 'searching for'", () => {
    const step: ThreadStep = {
      id: "tool_1",
      type: "tool",
      name: "grep_code",
      args: { pattern: "wrapLine" },
      isRunning: true,
      startTime: Date.now() - 500,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("searching for \"wrapLine\""));
  });

  it("formats read_file as 'reading:'", () => {
    const step: ThreadStep = {
      id: "tool_2",
      type: "tool",
      name: "read_file",
      args: { filePath: "/test/src/index.ts" },
      isRunning: true,
      startTime: Date.now() - 300,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("reading: src/index.ts"));
  });

  it("formats write_file as 'writing:'", () => {
    const step: ThreadStep = {
      id: "tool_3",
      type: "tool",
      name: "write_file",
      args: { filePath: "/test/src/bundle.js" },
      isRunning: true,
      startTime: Date.now() - 400,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("writing: src/bundle.js"));
  });

  it("formats edit_file as 'editing:'", () => {
    const step: ThreadStep = {
      id: "tool_4",
      type: "tool",
      name: "edit_file",
      args: { filePath: "/test/src/app.ts" },
      isRunning: true,
      startTime: Date.now() - 200,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("editing: src/app.ts"));
  });

  it("formats bash execution as 'running:'", () => {
    const step: ThreadStep = {
      id: "tool_5",
      type: "tool",
      name: "bash",
      args: { command: "npm test" },
      isRunning: true,
      startTime: Date.now() - 1500,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("running: npm test"));
  });

  it("formats list_dir as 'looking through:'", () => {
    const step: ThreadStep = {
      id: "tool_6",
      type: "tool",
      name: "list_dir",
      args: { dirPath: "/test/src/cli" },
      isRunning: true,
      startTime: Date.now() - 100,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("looking through: src/cli"));
  });

  it("formats outline_code as 'peeking at:'", () => {
    const step: ThreadStep = {
      id: "tool_7",
      type: "tool",
      name: "outline_code",
      args: { filePath: "/test/src/agent.ts" },
      isRunning: true,
      startTime: Date.now() - 250,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("peeking at: src/agent.ts"));
  });

  it("formats http_request as 'pinging:'", () => {
    const step: ThreadStep = {
      id: "tool_8",
      type: "tool",
      name: "http_request",
      args: { url: "https://api.github.com" },
      isRunning: true,
      startTime: Date.now() - 600,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("pinging: https://api.github.com"));
  });

  it("formats load_skill as 'loading:'", () => {
    const step: ThreadStep = {
      id: "tool_9",
      type: "tool",
      name: "load_skill",
      args: { name: "matrix-combat" },
      isRunning: true,
      startTime: Date.now() - 50,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("loading: matrix-combat"));
  });
});

describe("ThreadFeed Continuous UI Activity", () => {
  it("renders live thinking indicator when thread is running without steps or response", () => {
    const thread: Thread = {
      id: "t1",
      index: 1,
      prompt: "inspect construct",
      response: "",
      isStreaming: false,
      steps: [],
      status: "running",
      stepCount: 1,
      startTime: Date.now() - 1000,
    };
    const lines = buildThreadFeedLines({
      threads: [thread],
      leftWidth: 80,
      feedHeight: 20,
      maxLineWidth: 76,
    });
    const hasRunningIndicator = lines.some((l) => l.id.includes("thinking_indicator"));
    assert.ok(hasRunningIndicator, "Must show running indicator during initial processing");
  });

  it("renders live running pulse beneath assistant response while thread is still running", () => {
    const thread: Thread = {
      id: "t2",
      index: 1,
      prompt: "run analysis",
      response: "Preliminary finding recorded.",
      isStreaming: true,
      steps: [],
      status: "running",
      stepCount: 2,
      startTime: Date.now() - 2000,
    };
    const lines = buildThreadFeedLines({
      threads: [thread],
      leftWidth: 80,
      feedHeight: 20,
      maxLineWidth: 76,
    });
    const hasStreamingPulse = lines.some((l) => l.id.includes("asst_running_pulse"));
    assert.ok(hasStreamingPulse, "Must show running pulse below assistant response while streaming");
  });

  it("cleans up running indicators once thread status transitions to completed", () => {
    const thread: Thread = {
      id: "t3",
      index: 1,
      prompt: "conclude mission",
      response: "Construct verified and deployed.",
      isStreaming: false,
      steps: [],
      status: "completed",
      stepCount: 2,
      startTime: Date.now() - 3000,
    };
    const lines = buildThreadFeedLines({
      threads: [thread],
      leftWidth: 80,
      feedHeight: 20,
      maxLineWidth: 76,
    });
    const hasPulse = lines.some((l) => l.id.includes("asst_running_pulse") || l.id.includes("thinking_indicator"));
    assert.ok(!hasPulse, "Must not show running indicators when thread is completed");
  });

  it("enforces strictly ONE active loader even when tools and thinking steps are active", () => {
    const thread: Thread = {
      id: "t4",
      index: 1,
      prompt: "run multi-step task",
      response: "Here is partial output.",
      isStreaming: false,
      steps: [
        {
          id: "step_think",
          type: "thinking",
          isRunning: true,
          startTime: Date.now() - 500,
        },
        {
          id: "step_tool",
          type: "tool",
          name: "read_file",
          args: { filePath: "/src/index.ts" },
          isRunning: true,
          startTime: Date.now() - 200,
        },
      ],
      status: "running",
      stepCount: 2,
      startTime: Date.now() - 3000,
    };
    const lines = buildThreadFeedLines({
      threads: [thread],
      leftWidth: 80,
      feedHeight: 20,
      maxLineWidth: 76,
    });
    const loaderLines = lines.filter((l) => l.id.includes("running_pulse") || l.id.includes("thinking_indicator") || l.id.includes("tool_running"));
    assert.equal(loaderLines.length, 1, "Must never render more than 1 loader at any time");
  });
});
