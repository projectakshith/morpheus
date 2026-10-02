const ANSI_TOKEN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/y;

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

export function cellWidth(text: string): number {
  let width = 0;
  for (const token of tokenize(text)) if ("char" in token) width += token.width;
  return width;
}

/* Closes styles without resetting the background, which Ink applies to the whole row. */
const CLOSE_STYLES = "\x1b[39;22;23;24m";

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

export function fitCells(text: string, width: number): string {
  const fitted = truncateCells(text, width);
  return fitted + " ".repeat(Math.max(0, width - cellWidth(fitted)));
}

export function sanitizeOutputLine(line: string): string {
  const withoutAnsi = line.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  const lastRedraw = withoutAnsi.split("\r").filter((part) => part.length > 0).pop() ?? "";
  return lastRedraw.replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

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
