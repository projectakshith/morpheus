export interface ThemeColors {
  bg: string;
  bgFeed: string;
  bgColumn: string;
  text: string;
  secondary: string;
  accent: string;
  accentBright: string;
  border: string;
  borderSubtle: string;
  muted: string;
  success: string;
  diffAdd: string;
  diffRemove: string;
  diffHunk: string;
  error: string;
  warning: string;
}

export interface ToolBadgeInfo {
  label: string;
  color: string;
}

export const PALETTE = {
  dynamicBlack: "#161415",
  deepOnyx: "#121011",
  honeyBeige: "#f5d4b5",
  eggLiqueur: "#dacca7",
  sapGreen: "#739e5a",
  sapGreenBright: "#98d976",
  sapGreenDeep: "#436034",
  borderDark: "#383330",
  borderSubtle: "#262221",
  mutedText: "#70665f",
  diffAdd: "#85c483",
  diffRemove: "#e06c52",
  diffHunk: "#70b0ff",
};

export const BUILTIN_THEMES: Record<string, ThemeColors> = {
  morpheus: {
    bg: PALETTE.dynamicBlack,
    bgFeed: PALETTE.dynamicBlack,
    bgColumn: PALETTE.dynamicBlack,
    text: PALETTE.honeyBeige,
    secondary: PALETTE.eggLiqueur,
    accent: PALETTE.sapGreen,
    accentBright: PALETTE.sapGreenBright,
    border: PALETTE.borderDark,
    borderSubtle: PALETTE.borderSubtle,
    muted: PALETTE.mutedText,
    success: PALETTE.sapGreenBright,
    diffAdd: PALETTE.diffAdd,
    diffRemove: PALETTE.diffRemove,
    diffHunk: PALETTE.diffHunk,
    error: PALETTE.diffRemove,
    warning: PALETTE.eggLiqueur,
  },
  matrix: {
    bg: "#0d0208",
    bgFeed: "#0d0208",
    bgColumn: "#0d0208",
    text: "#00ff41",
    secondary: "#008f11",
    accent: "#008f11",
    accentBright: "#00ff41",
    border: "#003b00",
    borderSubtle: "#002000",
    muted: "#005511",
    success: "#00ff41",
    diffAdd: "#00ff66",
    diffRemove: "#cc3333",
    diffHunk: "#00bbff",
    error: "#cc3333",
    warning: "#99ff33",
  },
  cyberpunk: {
    bg: "#050814",
    bgFeed: "#050814",
    bgColumn: "#050814",
    text: "#e0e6ed",
    secondary: "#ffe600",
    accent: "#00f0ff",
    accentBright: "#00f0ff",
    border: "#1f2a44",
    borderSubtle: "#121929",
    muted: "#5b6b8c",
    success: "#00ff9f",
    diffAdd: "#00ff9f",
    diffRemove: "#ff003c",
    diffHunk: "#7122fa",
    error: "#ff003c",
    warning: "#ffe600",
  },
  dracula: {
    bg: "#282a36",
    bgFeed: "#282a36",
    bgColumn: "#282a36",
    text: "#f8f8f2",
    secondary: "#f1fa8c",
    accent: "#bd93f9",
    accentBright: "#ff79c6",
    border: "#44475a",
    borderSubtle: "#383a4c",
    muted: "#6272a4",
    success: "#50fa7b",
    diffAdd: "#50fa7b",
    diffRemove: "#ff5555",
    diffHunk: "#8be9fd",
    error: "#ff5555",
    warning: "#ffb86c",
  },
};

const THEMES: Record<string, ThemeColors> = { ...BUILTIN_THEMES };
let activeThemeName = "morpheus";

export function getActiveThemeName(): string {
  return activeThemeName;
}

export function getAvailableThemes(): string[] {
  return Object.keys(THEMES);
}

export function setTheme(name: string): boolean {
  if (THEMES[name]) {
    activeThemeName = name;
    return true;
  }
  return false;
}

export function registerTheme(name: string, customColors: Partial<ThemeColors>): void {
  const base = THEMES[activeThemeName] || BUILTIN_THEMES.morpheus;
  THEMES[name] = { ...base, ...customColors };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function ansiFg(hex: string, text: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function ansiBg(hex: string, text: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function getToolBadge(name?: string): ToolBadgeInfo {
  const t = THEMES[activeThemeName] || BUILTIN_THEMES.morpheus;
  switch (name) {
    case "bash":
      return { label: "BASH", color: t.warning };
    case "read_file":
      return { label: "READ", color: t.diffHunk };
    case "edit_file":
      return { label: "EDIT", color: t.accentBright };
    case "write_file":
      return { label: "WRITE", color: t.diffAdd };
    case "grep_code":
    case "grepCode":
      return { label: "GREP", color: t.secondary };
    case "list_dir":
    case "listDir":
      return { label: "LIST", color: t.secondary };
    case "outline_code":
    case "outlineCode":
      return { label: "SYMBOLS", color: t.diffHunk };
    case "http_request":
      return { label: "HTTP", color: t.accent };
    case "record_finding":
      return { label: "FINDING", color: t.accentBright };
    default:
      return { label: (name || "TOOL").toUpperCase().slice(0, 7), color: t.muted };
  }
}

export const theme = {
  get bg() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).bg;
  },
  get bgFeed() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).bgFeed;
  },
  get bgColumn() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).bgColumn;
  },
  get text() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).text;
  },
  get secondary() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).secondary;
  },
  get accent() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).accent;
  },
  get accentBright() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).accentBright;
  },
  get border() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).border;
  },
  get borderSubtle() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).borderSubtle;
  },
  get muted() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).muted;
  },
  get success() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).success;
  },
  get diffAdd() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).diffAdd;
  },
  get diffRemove() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).diffRemove;
  },
  get diffHunk() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).diffHunk;
  },
  get error() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).error;
  },
  get warning() {
    return (THEMES[activeThemeName] || BUILTIN_THEMES.morpheus).warning;
  },
  hexToRgb,
  ansiFg,
  ansiBg,
};
