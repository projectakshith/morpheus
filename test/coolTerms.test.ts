import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCoolActionLabel } from "../src/cli/components/ThreadFeed";
import type { ThreadStep } from "../src/cli/types";

describe("Cool Action Labels (Matrix / Cyberpunk Aesthetic)", () => {
  it("defaults to 'morpheus is locked in...' when no step is active", () => {
    const label = getCoolActionLabel(undefined);
    assert.equal(label, "morpheus is locked in...");
  });

  it("formats running thinking step as 'overclocking neural net'", () => {
    const step: ThreadStep = {
      id: "think_1",
      type: "thinking",
      isRunning: true,
      startTime: Date.now() - 1200,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.startsWith("overclocking neural net (1.2s)...") || label.includes("overclocking neural net"));
  });

  it("formats search / grep_code as 'sweeping matrix'", () => {
    const step: ThreadStep = {
      id: "tool_1",
      type: "tool",
      name: "grep_code",
      args: { pattern: "wrapLine" },
      isRunning: true,
      startTime: Date.now() - 500,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("sweeping matrix for \"wrapLine\""));
  });

  it("formats read_file as 'jacking into'", () => {
    const step: ThreadStep = {
      id: "tool_2",
      type: "tool",
      name: "read_file",
      args: { filePath: "/test/src/index.ts" },
      isRunning: true,
      startTime: Date.now() - 300,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("jacking into: src/index.ts"));
  });

  it("formats write_file as 'synthesizing'", () => {
    const step: ThreadStep = {
      id: "tool_3",
      type: "tool",
      name: "write_file",
      args: { filePath: "/test/src/bundle.js" },
      isRunning: true,
      startTime: Date.now() - 400,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("synthesizing: src/bundle.js"));
  });

  it("formats edit_file as 'rewiring construct'", () => {
    const step: ThreadStep = {
      id: "tool_4",
      type: "tool",
      name: "edit_file",
      args: { filePath: "/test/src/app.ts" },
      isRunning: true,
      startTime: Date.now() - 200,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("rewiring construct: src/app.ts"));
  });

  it("formats bash execution as 'breaching shell'", () => {
    const step: ThreadStep = {
      id: "tool_5",
      type: "tool",
      name: "bash",
      args: { command: "npm test" },
      isRunning: true,
      startTime: Date.now() - 1500,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("breaching shell: npm test"));
  });

  it("formats list_dir as 'mapping perimeter'", () => {
    const step: ThreadStep = {
      id: "tool_6",
      type: "tool",
      name: "list_dir",
      args: { dirPath: "/test/src/cli" },
      isRunning: true,
      startTime: Date.now() - 100,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("mapping perimeter: src/cli"));
  });

  it("formats outline_code as 'deconstructing ast'", () => {
    const step: ThreadStep = {
      id: "tool_7",
      type: "tool",
      name: "outline_code",
      args: { filePath: "/test/src/agent.ts" },
      isRunning: true,
      startTime: Date.now() - 250,
    };
    const label = getCoolActionLabel(step, "/test");
    assert.ok(label.includes("deconstructing ast: src/agent.ts"));
  });

  it("formats http_request as 'uplink ping'", () => {
    const step: ThreadStep = {
      id: "tool_8",
      type: "tool",
      name: "http_request",
      args: { url: "https://api.github.com" },
      isRunning: true,
      startTime: Date.now() - 600,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("uplink ping: https://api.github.com"));
  });

  it("formats load_skill as 'loading combat playbook'", () => {
    const step: ThreadStep = {
      id: "tool_9",
      type: "tool",
      name: "load_skill",
      args: { name: "matrix-combat" },
      isRunning: true,
      startTime: Date.now() - 50,
    };
    const label = getCoolActionLabel(step);
    assert.ok(label.includes("loading combat playbook: matrix-combat"));
  });
});
