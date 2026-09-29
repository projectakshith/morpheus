import { describe, it } from "node:test";
import assert from "node:assert";
import {
  glyphs,
  setGlyphMode,
  getGlyphMode,
  cycleGlyphMode,
  detectDefaultGlyphMode,
  GLYPH_SETS,
} from "../src/cli/glyphs";

describe("Developer Glyphs & Icon System", () => {
  it("detects a valid default glyph mode", () => {
    const mode = detectDefaultGlyphMode();
    assert.ok(["nerd", "unicode", "ascii"].includes(mode));
  });

  it("switches glyph modes dynamically", () => {
    setGlyphMode("unicode");
    assert.strictEqual(getGlyphMode(), "unicode");
    assert.strictEqual(glyphs.gitBranch, "◈");
    assert.strictEqual(glyphs.prompt, "▲");
    assert.strictEqual(glyphs.success, "✔");

    setGlyphMode("nerd");
    assert.strictEqual(getGlyphMode(), "nerd");
    assert.strictEqual(glyphs.gitBranch, "");
    assert.strictEqual(glyphs.bash, "");
    assert.strictEqual(glyphs.file, "󰈚");

    setGlyphMode("ascii");
    assert.strictEqual(getGlyphMode(), "ascii");
    assert.strictEqual(glyphs.gitBranch, "*");
    assert.strictEqual(glyphs.prompt, ">");
    assert.strictEqual(glyphs.success, "[ok]");
  });

  it("cycles through all modes cleanly", () => {
    setGlyphMode("nerd");
    assert.strictEqual(cycleGlyphMode(), "unicode");
    assert.strictEqual(cycleGlyphMode(), "ascii");
    assert.strictEqual(cycleGlyphMode(), "nerd");
  });

  it("has non-empty values for all keys across all sets", () => {
    for (const [mode, set] of Object.entries(GLYPH_SETS)) {
      for (const [key, value] of Object.entries(set)) {
        assert.ok(
          typeof value === "string" && value.length > 0,
          `Glyph ${key} in ${mode} set must be a non-empty string`
        );
      }
    }
  });
});
