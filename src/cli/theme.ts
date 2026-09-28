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

export const theme = {
  bg: PALETTE.dynamicBlack,
  bgFeed: PALETTE.dynamicBlack,
  bgColumn: PALETTE.deepOnyx,
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
  hexToRgb,
  ansiFg,
  ansiBg,
};
