/*
 * Terminal cell math: display width, ANSI-safe truncation, and cleanup of raw
 * tool output so it can be laid out in fixed-width columns without drifting.
 */

const ANSI_TOKEN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/y;

/* East Asian wide and emoji ranges occupy two cells. Combining marks and
 * zero-width joiners occupy none. Everything else is one cell. */
export function charWidth(codePoint: number): number {
  if (
    codePoint === 0x200b ||
    codePoint === 0x200d ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

type Token = { esc: string } | { char: string; width: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    ANSI_TOKEN.lastIndex = i;
    const esc = ANSI_TOKEN.exec(text);
    if (esc) {
      tokens.push({ esc: esc[0] });
      i += esc[0].length;
      continue;
    }
    const cp = text.codePointAt(i)!;
    const char = String.fromCodePoint(cp);
    tokens.push({ char, width: charWidth(cp) });
    i += char.length;
  }
  return tokens;
}

/* Number of terminal cells the text occupies, ignoring ANSI codes. */
export function cellWidth(text: string): number {
  let width = 0;
  for (const token of tokenize(text)) if ("char" in token) width += token.width;
  return width;
}

/* Styles that may be open inside highlighted text; closed without touching the
 * background, which Ink applies around the whole row. */
const CLOSE_STYLES = "\x1b[39;22;23;24m";

/**
 * Truncates to at most `width` cells, ending with `ellipsis` when cut. ANSI
 * codes are preserved, and any styles are closed so they can't bleed onward.
 */
export function truncateCells(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (cellWidth(text) <= width) return text;
  const room = width - cellWidth(ellipsis);
  let out = "";
  let used = 0;
  for (const token of tokenize(text)) {
    if ("esc" in token) {
      out += token.esc;
      continue;
    }
    if (used + token.width > room) break;
    out += token.char;
    used += token.width;
  }
  return `${out}${CLOSE_STYLES}${room >= 0 ? ellipsis : ""}`;
}

/* Truncates from the left, keeping the end (e.g. the file name of a long path). */
export function truncateCellsStart(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  const chars = Array.from(text);
  if (cellWidth(text) <= width) return text;
  const room = width - cellWidth(ellipsis);
  let used = 0;
  let start = chars.length;
  while (start > 0) {
    const w = charWidth(chars[start - 1].codePointAt(0)!);
    if (used + w > room) break;
    used += w;
    start--;
  }
  return ellipsis + chars.slice(start).join("");
}

/* Pads with spaces to exactly `width` cells, truncating if longer. */
export function fitCells(text: string, width: number): string {
  const fitted = truncateCells(text, width);
  return fitted + " ".repeat(Math.max(0, width - cellWidth(fitted)));
}

/**
 * Makes raw tool output safe for fixed-width rendering: drops ANSI codes (they
 * could reset the row background), resolves carriage-return progress redraws
 * to their final state, expands tabs, and removes other control characters.
 */
export function sanitizeOutputLine(line: string): string {
  const withoutAnsi = line.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  const lastRedraw = withoutAnsi.split("\r").filter((part) => part.length > 0).pop() ?? "";
  return lastRedraw.replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/**
 * Wraps plain text to `width` cells, preferring to break after a space in the
 * back half of the line and hard-breaking otherwise (long paths, minified code).
 */
export function wrapCells(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const out: string[] = [];
  let rest = Array.from(text);
  while (rest.length > 0) {
    let used = 0;
    let cut = 0;
    while (cut < rest.length && used + charWidth(rest[cut].codePointAt(0)!) <= width) {
      used += charWidth(rest[cut].codePointAt(0)!);
      cut++;
    }
    if (cut === rest.length) {
      out.push(rest.join(""));
      break;
    }
    const space = rest.slice(0, cut).lastIndexOf(" ");
    const breakAt = space >= Math.floor(cut / 2) ? space + 1 : Math.max(1, cut);
    out.push(rest.slice(0, breakAt).join("").trimEnd());
    rest = rest.slice(breakAt);
  }
  return out.length > 0 ? out : [""];
}
