import { GLYPH_SETS, type GlyphMode, type GlyphSet } from "../display/glyphSets";

export { GLYPH_SETS, type GlyphMode, type GlyphSet };

/**
 * Automatically detects whether the host terminal supports Nerd Fonts natively.
 * Ghostty, WezTerm, and Kitty bundle Nerd Font glyphs at engine level.
 */
export function detectDefaultGlyphMode(): GlyphMode {
  const envPref = (process.env.MORPHEUS_GLYPHS || process.env.MORPHEUS_ICONS || "").toLowerCase();
  if (envPref === "nerd" || envPref === "unicode" || envPref === "ascii") {
    return envPref as GlyphMode;
  }

  const termProgram = (process.env.TERM_PROGRAM || "").toLowerCase();

  // Terminals that natively embed and render Nerd Fonts without custom config
  if (
    termProgram.includes("ghostty") ||
    termProgram.includes("wezterm") ||
    termProgram.includes("kitty") ||
    Boolean(process.env.GHOSTTY_RESOURCES_DIR) ||
    Boolean(process.env.KITTY_WINDOW_ID)
  ) {
    return "nerd";
  }

  // Explicit user flag
  if (process.env.NERD_FONT === "1" || process.env.NERD_FONTS === "1") {
    return "nerd";
  }

  // Default to universal Unicode (100% rendering compatibility across all terminals)
  return "unicode";
}

let activeGlyphMode: GlyphMode = detectDefaultGlyphMode();

export function setGlyphMode(mode: GlyphMode): void {
  activeGlyphMode = mode;
}

export function getGlyphMode(): GlyphMode {
  return activeGlyphMode;
}

export function cycleGlyphMode(): GlyphMode {
  const order: GlyphMode[] = ["nerd", "unicode", "ascii"];
  const nextIdx = (order.indexOf(activeGlyphMode) + 1) % order.length;
  activeGlyphMode = order[nextIdx];
  return activeGlyphMode;
}

/**
 * Dynamic Proxy providing instant access to the active glyph set.
 * Usage: import { glyphs } from "./glyphs"; glyphs.gitBranch;
 */
export const glyphs: GlyphSet = new Proxy({} as GlyphSet, {
  get: (_target, prop: string) => {
    const active = GLYPH_SETS[activeGlyphMode] || GLYPH_SETS.unicode;
    return (active as any)[prop] ?? (GLYPH_SETS.unicode as any)[prop] ?? "";
  },
});
