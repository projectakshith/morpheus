/*
 * Universal Glyphs & Developer Icon System for Morpheus CLI
 * Supports:
 * - "nerd": Rich developer glyphs from Nerd Fonts (Ghostty, WezTerm, Kitty, etc.)
 * - "unicode": Universal Unicode symbols compatible with 100% of modern terminals
 * - "ascii": Plain ASCII fallbacks for basic terminal environments
 */

export type GlyphMode = "nerd" | "unicode" | "ascii";

export interface GlyphSet {
  // Navigation & Prompts
  prompt: string;
  bullet: string;
  bulletOpen: string;
  arrowUp: string;
  arrowDown: string;
  arrowRight: string;
  chevronRight: string;
  chevronDown: string;

  // Status & Outcomes
  success: string;
  error: string;
  warning: string;
  info: string;
  running: string;
  pending: string;

  // Git & Version Control
  gitBranch: string;
  gitCommit: string;
  gitDiff: string;
  gitRepo: string;

  // Developer Tools & Actions
  bash: string;
  file: string;
  fileEdit: string;
  folder: string;
  search: string;
  outline: string;
  network: string;
  brain: string;
  skill: string;
  spark: string;
  clock: string;

  // System & Environment
  server: string;
  chip: string;
  key: string;
  user: string;
  robot: string;
}

export const GLYPH_SETS: Record<GlyphMode, GlyphSet> = {
  nerd: {
    // Navigation & Prompts
    prompt: "❯",
    bullet: "●",
    bulletOpen: "○",
    arrowUp: "▲",
    arrowDown: "▼",
    arrowRight: "→",
    chevronRight: "▶",
    chevronDown: "▼",

    // Status & Outcomes
    success: "✔",
    error: "✖",
    warning: "▲",
    info: "ℹ",
    running: "◌",
    pending: "⋯",

    // Git & Version Control
    gitBranch: "",
    gitCommit: "",
    gitDiff: "",
    gitRepo: "",

    // Developer Tools & Actions
    bash: "",
    file: "󰈚",
    fileEdit: "󰏫",
    folder: "󰉋",
    search: "󰍉",
    outline: "󰘳",
    network: "󰖟",
    brain: "󰧑",
    skill: "󰛦",
    spark: "",
    clock: "󱑎",

    // System & Environment
    server: "󰒋",
    chip: "󰘚",
    key: "󰌆",
    user: "",
    robot: "󰚩",
  },

  unicode: {
    // Navigation & Prompts
    prompt: "▲",
    bullet: "●",
    bulletOpen: "○",
    arrowUp: "▲",
    arrowDown: "▼",
    arrowRight: "→",
    chevronRight: "▶",
    chevronDown: "▼",

    // Status & Outcomes
    success: "✔",
    error: "✖",
    warning: "⚠",
    info: "ℹ",
    running: "◌",
    pending: "…",

    // Git & Version Control
    gitBranch: "◈",
    gitCommit: "◆",
    gitDiff: "±",
    gitRepo: "⌂",

    // Developer Tools & Actions
    bash: "$",
    file: "≡",
    fileEdit: "✎",
    folder: "📁",
    search: "🔍",
    outline: "☰",
    network: "🌐",
    brain: "🧠",
    skill: "✦",
    spark: "⚡",
    clock: "⏱",

    // System & Environment
    server: "▣",
    chip: "⬡",
    key: "⚿",
    user: "▲",
    robot: "▲",
  },

  ascii: {
    // Navigation & Prompts
    prompt: ">",
    bullet: "*",
    bulletOpen: "o",
    arrowUp: "^",
    arrowDown: "v",
    arrowRight: "->",
    chevronRight: ">",
    chevronDown: "v",

    // Status & Outcomes
    success: "[ok]",
    error: "[x]",
    warning: "[!]",
    info: "[i]",
    running: "[.]",
    pending: "[ ]",

    // Git & Version Control
    gitBranch: "*",
    gitCommit: "#",
    gitDiff: "+-",
    gitRepo: "^",

    // Developer Tools & Actions
    bash: "$",
    file: "[f]",
    fileEdit: "[edit]",
    folder: "[dir]",
    search: "[?]",
    outline: "[=]",
    network: "[http]",
    brain: "[ai]",
    skill: "[skill]",
    spark: "[!]",
    clock: "[t]",

    // System & Environment
    server: "[srv]",
    chip: "[cpu]",
    key: "[key]",
    user: "[you]",
    robot: "[morpheus]",
  },
};

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
 * Usage: import { glyphs } from "./glyphs.js"; glyphs.gitBranch;
 */
export const glyphs: GlyphSet = new Proxy({} as GlyphSet, {
  get: (_target, prop: string) => {
    const active = GLYPH_SETS[activeGlyphMode] || GLYPH_SETS.unicode;
    return (active as any)[prop] ?? (GLYPH_SETS.unicode as any)[prop] ?? "";
  },
});
