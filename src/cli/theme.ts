export interface ThemeColors {
  bg: string;
  bgFeed: string;
  bgColumn: string;
  bgUser: string;
  bgCode: string;
  bgDiffAdd: string;
  bgDiffRemove: string;
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
  bgUser: "#1b211a",
  bgCode: "#121011",
  bgDiffAdd: "#152414",
  bgDiffRemove: "#261313",
};

export const BUILTIN_THEMES: Record<string, ThemeColors> = {
  morpheus: {
    bg: PALETTE.dynamicBlack,
    bgFeed: PALETTE.dynamicBlack,
    bgColumn: PALETTE.dynamicBlack,
    bgUser: PALETTE.bgUser,
    bgCode: PALETTE.bgCode,
    bgDiffAdd: PALETTE.bgDiffAdd,
    bgDiffRemove: PALETTE.bgDiffRemove,
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
    bgUser: "#0d1a0d",
    bgCode: "#070205",
    bgDiffAdd: "#00240d",
    bgDiffRemove: "#240000",
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
    bgUser: "#0c1529",
    bgCode: "#040610",
    bgDiffAdd: "#002c1c",
    bgDiffRemove: "#330011",
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
  attack: {
    bg: "#0d0a0b",
    bgFeed: "#0d0a0b",
    bgColumn: "#0d0a0b",
    bgUser: "#1b1114",
    bgCode: "#090607",
    bgDiffAdd: "#0f1f16",
    bgDiffRemove: "#241012",
    text: "#f2d6ce",
    secondary: "#ffb454",
    accent: "#e5484d",
    accentBright: "#ff6369",
    border: "#33282b",
    borderSubtle: "#1e1719",
    muted: "#a38780",
    success: "#5bb98c",
    diffAdd: "#5bb98c",
    diffRemove: "#e5484d",
    diffHunk: "#ffb454",
    error: "#e5484d",
    warning: "#ffb454",
  },
  dracula: {
    bg: "#282a36",
    bgFeed: "#282a36",
    bgColumn: "#282a36",
    bgUser: "#323545",
    bgCode: "#1e1f29",
    bgDiffAdd: "#1e382b",
    bgDiffRemove: "#3d1f24",
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
let currentColors: ThemeColors = THEMES[activeThemeName];
let themeVersion = 0;
let transitionTimer: NodeJS.Timeout | null = null;
const themeListeners = new Set<() => void>();

function notifyTheme(): void {
  themeVersion++;
  for (const listener of themeListeners) listener();
}

export function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export function getThemeVersion(): number {
  return themeVersion;
}

export function getActiveThemeName(): string {
  return activeThemeName;
}

export function getAvailableThemes(): string[] {
  return Object.keys(THEMES);
}

export function cancelThemeTransition(): void {
  if (transitionTimer) {
    clearInterval(transitionTimer);
    transitionTimer = null;
  }
}

export function setTheme(name: string): boolean {
  const target = THEMES[name];
  if (!target) return false;
  cancelThemeTransition();
  activeThemeName = name;
  currentColors = target;
  notifyTheme();
  return true;
}

export function transitionTheme(name: string, durationMs = 650): boolean {
  const target = THEMES[name];
  if (!target) return false;
  cancelThemeTransition();
  const from = { ...currentColors };
  const startedAt = Date.now();
  let done = false;
  activeThemeName = name;
  const frame = () => {
    const progress = durationMs <= 0 ? 1 : Math.min(1, (Date.now() - startedAt) / durationMs);
    if (progress >= 1) {
      done = true;
      currentColors = target;
      cancelThemeTransition();
      notifyTheme();
      return;
    }
    const eased = progress * progress * (3 - 2 * progress);
    currentColors = lerpTheme(from, target, eased);
    notifyTheme();
  };
  frame();
  if (!done) {
    transitionTimer = setInterval(frame, 28);
    transitionTimer.unref?.();
  }
  return true;
}

export function registerTheme(name: string, customColors: Partial<ThemeColors>): void {
  const base = THEMES[activeThemeName] || BUILTIN_THEMES.morpheus;
  THEMES[name] = { ...base, ...customColors };
  if (name === activeThemeName) {
    currentColors = THEMES[name];
    notifyTheme();
  }
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return null;
  const clean = match[1];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function hexToRgb(hex: string): [number, number, number] {
  return parseHex(hex) ?? [0, 0, 0];
}

function lerpHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return t < 0.5 ? from : to;
  const mix = (left: number, right: number) => Math.round(left + (right - left) * t);
  const [r, g, bl] = [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])];
  return `#${[r, g, bl].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function lerpTheme(from: ThemeColors, to: ThemeColors, t: number): ThemeColors {
  const next = {} as ThemeColors;
  for (const key of Object.keys(from) as Array<keyof ThemeColors>) {
    next[key] = lerpHex(from[key], to[key], t);
  }
  return next;
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
  const t = currentColors;
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
    case "http_probe":
      return { label: "PROBE", color: t.warning };
    case "uplink_search":
      return { label: "SEARCH", color: t.secondary };
    case "uplink_browse":
      return { label: "UPLINK", color: t.accent };
    case "record_finding":
      return { label: "FINDING", color: t.accentBright };
    case "security_recon":
      return { label: "RECON", color: t.warning };
    default:
      return { label: (name || "TOOL").toUpperCase().slice(0, 7), color: t.muted };
  }
}

export const theme = {
  get bg() {
    return currentColors.bg;
  },
  get bgFeed() {
    return currentColors.bgFeed;
  },
  get bgColumn() {
    return currentColors.bgColumn;
  },
  get bgUser() {
    return currentColors.bgUser;
  },
  get bgCode() {
    return currentColors.bgCode;
  },
  get bgDiffAdd() {
    return currentColors.bgDiffAdd;
  },
  get bgDiffRemove() {
    return currentColors.bgDiffRemove;
  },
  get text() {
    return currentColors.text;
  },
  get secondary() {
    return currentColors.secondary;
  },
  get accent() {
    return currentColors.accent;
  },
  get accentBright() {
    return currentColors.accentBright;
  },
  get border() {
    return currentColors.border;
  },
  get borderSubtle() {
    return currentColors.borderSubtle;
  },
  get muted() {
    return currentColors.muted;
  },
  get success() {
    return currentColors.success;
  },
  get diffAdd() {
    return currentColors.diffAdd;
  },
  get diffRemove() {
    return currentColors.diffRemove;
  },
  get diffHunk() {
    return currentColors.diffHunk;
  },
  get error() {
    return currentColors.error;
  },
  get warning() {
    return currentColors.warning;
  },
  hexToRgb,
  ansiFg,
  ansiBg,
};
