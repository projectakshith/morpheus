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
    bullet: "◈",
    bulletOpen: "◇",
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
    bullet: "◈",
    bulletOpen: "◇",
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
    folder: "▤",
    search: "⌕",
    outline: "☰",
    network: "◈",
    brain: "◎",
    skill: "✦",
    spark: "⚡",
    clock: "◷",

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
