import test, { describe, it } from "node:test";
import assert from "node:assert";
import { computeAutocomplete, applySuggestion } from "../src/autocomplete/engine";
import { getCommandSuggestions } from "../src/autocomplete/providers/commandProvider";
import { getFileSuggestions } from "../src/autocomplete/providers/fileProvider";
import { getHistorySuggestions } from "../src/autocomplete/providers/historyProvider";
import { getIntentSuggestions } from "../src/autocomplete/providers/intentProvider";

describe("Autocomplete Engine & Providers", () => {
  it("suggests built-in slash commands on slash prefix", () => {
    const res = computeAutocomplete({
      input: "/",
      cursorPos: 1,
    });

    assert.ok(res.suggestions.length > 0, "Should return command suggestions for /");
    const labels = res.suggestions.map((s) => s.label);
    assert.ok(labels.some((l) => l.includes("/model")), "Should contain /model");
    assert.ok(labels.some((l) => l.includes("/help")), "Should contain /help");
    assert.ok(labels.some((l) => l.includes("/stop")), "Should contain /stop");
    assert.ok(labels.some((l) => l.includes("/session")), "Should contain /session");
    assert.ok(labels.some((l) => l.includes("/sessions")), "Should contain /sessions");
    assert.ok(res.suggestions.length >= 10, "Should include all built-in commands without premature truncation");
  });

  it("handles typos like /sessiions via fuzzy similarity", () => {
    const res = computeAutocomplete({
      input: "/sessiions",
      cursorPos: 10,
    });

    assert.ok(res.suggestions.length > 0, "Should find closest command for /sessiions");
    assert.ok(res.suggestions.some((s) => s.insertText.includes("/session")));
  });

  it("computes dim inline ghost text for matching slash command", () => {
    const res = computeAutocomplete({
      input: "/mod",
      cursorPos: 4,
    });

    assert.ok(res.suggestions.length > 0);
    assert.strictEqual(res.suggestions[0].insertText, "/model ");
    assert.strictEqual(res.ghostText, "el ");
  });

  it("suggests available models when typing /model [query]", () => {
    const res = computeAutocomplete({
      input: "/model cla",
      cursorPos: 10,
      availableModels: ["flash", "claude-sonnet-4-6", "claude-opus-4-6-thinking"],
    });

    assert.ok(res.suggestions.length >= 2);
    assert.strictEqual(res.suggestions[0].category, "subcommand");
    assert.strictEqual(res.suggestions[0].insertText, "/model claude-sonnet-4-6");
    assert.strictEqual(res.ghostText, "ude-sonnet-4-6");
  });

  it("suggests workspace files for @ mentions", () => {
    const res = computeAutocomplete({
      input: "@src/cli/i",
      cursorPos: 10,
      cwd: process.cwd(),
    });

    assert.ok(res.suggestions.length > 0);
    assert.strictEqual(res.suggestions[0].category, "file");
    assert.ok(res.suggestions[0].label.includes("index.ts"));
    assert.ok(res.ghostText !== undefined);
  });

  it("suggests prompt history with prefix ghost text", () => {
    const history = [
      "check git status and show diffs",
      "test the newly added queue feature",
    ];

    const res = computeAutocomplete({
      input: "test the new",
      cursorPos: 12,
      history,
    });

    assert.ok(res.suggestions.length > 0);
    assert.strictEqual(res.suggestions[0].category, "history");
    assert.strictEqual(res.suggestions[0].insertText, "test the newly added queue feature");
    assert.strictEqual(res.ghostText, "ly added queue feature");
  });

  it("suggests coding intent templates for action starters", () => {
    const res = computeAutocomplete({
      input: "refactor",
      cursorPos: 8,
    });

    assert.ok(res.suggestions.length > 0);
    const intent = res.suggestions.find((s) => s.category === "intent");
    assert.ok(intent, "Should provide intent suggestion for refactor");
    assert.ok(intent.label.includes("cleaner separation") || intent.detail?.includes("Restructure code"));
  });

  it("applies suggestions cleanly into input buffer", () => {
    // 1. Slash command replacement
    const cmdItem = {
      id: "cmd-model",
      label: "/model [args]",
      insertText: "/model ",
      category: "command" as const,
      replaceRange: { start: 0, end: 4 },
    };
    const r1 = applySuggestion("/mod", 4, cmdItem);
    assert.strictEqual(r1.newValue, "/model ");
    assert.strictEqual(r1.newCursorPos, 7);

    // 2. Mid-sentence file @mention token replacement
    const fileItem = {
      id: "file-1",
      label: "@src/cli/index.ts",
      insertText: "@src/cli/index.ts ",
      category: "file" as const,
      replaceRange: { start: 13, end: 24 },
    };
    const r2 = applySuggestion("inspect file @src/cli/i carefully", 24, fileItem);
    assert.strictEqual(r2.newValue, "inspect file @src/cli/index.ts carefully");
    assert.strictEqual(r2.newCursorPos, "inspect file @src/cli/index.ts ".length);
  });
});
