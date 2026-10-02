import React from "react";
import { Text } from "ink";
import type { FeedLine } from "../types";
import { getMorpheusPixel } from "../../display/morpheusArt";

const HERO_STOPS: Array<[number, [number, number, number]]> = [
  [0.00, [ 24,  28,  22]],
  [0.18, [ 36,  48,  30]],
  [0.38, [ 68, 102,  52]],
  [0.58, [115, 158,  90]],
  [0.78, [152, 217, 118]],
  [0.90, [ 67,  96,  52]],
  [1.00, [ 22,  20,  21]],
];

function clampColor(v: number, lo = 0, hi = 255): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function getHeroColor(t: number): [number, number, number] {
  const ct = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HERO_STOPS.length - 1; i++) {
    const [t0, c0] = HERO_STOPS[i];
    const [t1, c1] = HERO_STOPS[i + 1];
    if (ct >= t0 && ct <= t1) {
      const f = (ct - t0) / (t1 - t0);
      const r = c0[0] + (c1[0] - c0[0]) * f;
      const g = c0[1] + (c1[1] - c0[1]) * f;
      const b = c0[2] + (c1[2] - c0[2]) * f;
      return [r, g, b];
    }
  }
  return HERO_STOPS[HERO_STOPS.length - 1][1];
}

const HERO_DITHERS = [" ", " ", "░", "▒", "░", " ", "·"];
const MATRIX_CHARS = "0101XYZ0123456789ABCDEF01$#@%&*<>+=-/:;~";

function colHash(x: number): number {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function fastNoise(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) ^ (x >> 3);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

export const MATRIX_QUOTES = [
  "There is no spoon.",
  "Follow the white rabbit.",
  "I know kung fu.",
  "Free your mind.",
  "What is real?",
  "Welcome to the desert of the real.",
  "The Matrix has you.",
  "Knock, knock, Neo.",
  "Choice. The problem is choice.",
  "Wake up, Neo...",
  "The answer is out there, Neo.",
  "I can only show you the door.",
  "You take the red pill...",
  "Dodge this.",
  "Ignorance is bliss.",
];

const BRAILLE_DOTS = ["⠶", "⠾", "⠿", "⠷", "⠵", "⠯", "⠮", "⠺"];

interface StripCell {
  ch: string;
  kind: "title" | "sub" | "sap" | "num" | "badge" | "dots" | "quote";
  bold?: boolean;
}

const TYPE_END = 0.12;
const RAIN_START = 0.26;
const DECODING_KINDS = new Set<StripCell["kind"]>(["title", "sub", "num"]);

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function glyphAt(i: number, tick: number, seed = 0): string {
  return MATRIX_CHARS[Math.floor(fastNoise(i + seed * 31, tick) * MATRIX_CHARS.length) % MATRIX_CHARS.length];
}

/* Typed text whose next few characters flicker as glyphs before settling. */
function decodeText(text: string, t: number, tick: number, seed = 0): Array<{ ch: string; settled: boolean } | null> {
  const chars = Array.from(text);
  if (t >= 1) return chars.map((ch) => ({ ch, settled: true }));
  const done = Math.floor(t * chars.length);
  return chars.map((ch, i) => {
    if (i < done) return { ch, settled: true };
    if (i < done + 3 && ch !== " ") return { ch: glyphAt(i, tick, seed), settled: false };
    return null;
  });
}

export function buildFullScreenIntro(
  width: number,
  height: number,
  progress: number,
  tick: number,
  quote?: string,
  greetName?: string
): FeedLine[] {
  const W = Math.max(20, width);
  const H = Math.max(8, height);

  const rainProgress = greetName ? Math.max(0, (progress - RAIN_START) / (1 - RAIN_START)) : progress;

  const rawQuote = quote || MATRIX_QUOTES[0];
  const fullQuote = `· ${rawQuote} ·`;
  const quoteText = fullQuote.length <= W - 4 ? fullQuote : rawQuote.length <= W - 2 ? rawQuote : "";

  const stripY = Math.floor(H / 2);

  const greet = new Map<string, { ch: string; settled: boolean }>();
  if (greetName) {
    const text = `wake up, ${greetName}…`;
    const typed = clamp01(progress / TYPE_END);
    const x0 = Math.max(0, Math.floor((W - Array.from(text).length) / 2));
    let x = x0;
    for (const c of decodeText(text, typed, tick)) {
      if (!c) break;
      if (x < W) greet.set(`${x},${stripY}`, c);
      x++;
    }
    if (((tick >> 3) & 1) === 0 && x < W) greet.set(`${x},${stripY}`, { ch: "▌", settled: true });
  }
  const quoteY = Math.max(1, Math.min(stripY - 3, Math.floor(H * 0.1)));

  const cells = new Map<string, StripCell>();
  const setCell = (x: number, y: number, ch: string, kind: StripCell["kind"], bold = false) => {
    if (x >= 0 && x < W && y >= 0 && y < H && ch !== " ") {
      cells.set(`${x},${y}`, { ch, kind, bold });
    }
  };
  const setStr = (x: number, y: number, str: string, kind: StripCell["kind"], bold = false) => {
    for (let i = 0; i < str.length; i++) {
      setCell(x + i, y, str[i], kind, bold);
    }
  };

  if (quoteText && H >= 11) {
    const qX = Math.floor((W - quoteText.length) / 2);
    setStr(qX, quoteY, quoteText, "quote", false);
  }

  const brailleStr = [
    BRAILLE_DOTS[(tick + 0) % BRAILLE_DOTS.length],
    BRAILLE_DOTS[(tick + 1) % BRAILLE_DOTS.length],
    BRAILLE_DOTS[(tick + 2) % BRAILLE_DOTS.length],
    BRAILLE_DOTS[(tick + 3) % BRAILLE_DOTS.length],
  ].join("");

  const isWide = W >= 72;
  if (isWide) {
    const leftMargin = Math.max(3, Math.floor(W * 0.04));
    const title = W >= 95 ? "MORPHEUS  FORWARD" : "MORPHEUS  CORE";
    const sub = "AGENTIC HARNESS";

    setStr(leftMargin, stripY, "M/", "title", true);
    setStr(leftMargin + 4, stripY, "●●", "sap", true);
    setStr(leftMargin + 8, stripY, "01", "num", true);

    const textX = leftMargin + 13;
    setStr(textX, stripY - 1, title, "title", true);
    setStr(textX, stripY + 1, sub, "sub", false);

    const centerBox = "████";
    const centerFullWidth = centerBox.length + 2 + brailleStr.length;
    const centerX = Math.floor((W - centerFullWidth) / 2);
    setStr(centerX, stripY, centerBox, "badge", true);
    setStr(centerX + centerBox.length + 2, stripY, brailleStr, "dots", true);

    const rightX = W - leftMargin - 10;
    if (rightX > centerX + centerFullWidth + 4) {
      setStr(rightX, stripY, "M/", "title", true);
      setStr(rightX + 4, stripY, "●●", "sap", true);
      setStr(rightX + 8, stripY, "01", "num", true);
    }
  } else {
    const title = "M O R P H E U S";
    const sub = "agentic harness";
    setStr(Math.floor((W - title.length) / 2), stripY - 1, title, "title", true);

    const centerBox = "████";
    const midStr = `M/  ●●  01    ${centerBox}  ${brailleStr}`;
    const midX = Math.floor((W - midStr.length) / 2);
    setStr(midX, stripY, "M/", "title", true);
    setStr(midX + 4, stripY, "●●", "sap", true);
    setStr(midX + 8, stripY, "01", "num", true);
    setStr(midX + 14, stripY, centerBox, "badge", true);
    setStr(midX + 14 + centerBox.length + 2, stripY, brailleStr, "dots", true);

    setStr(Math.floor((W - sub.length) / 2), stripY + 1, sub, "sub", false);
  }

  const lines: FeedLine[] = [];

  for (let y = 0; y < H; y++) {
    const t = y / Math.max(1, H - 1);
    let line = "";
    let lastBg = "";
    let lastFg = "";

    for (let x = 0; x < W; x++) {
      const seed = colHash(x);
      const delay = seed * 0.15;
      const speed = 0.9 + colHash(x * 5 + 19) * 0.25;
      const rainP = Math.min(1, Math.max(0, (rainProgress - delay) / 0.42));
      const frontier = rainP * (H + 6) * speed;
      const dist = frontier > 0 ? frontier - y : -Infinity;

      const cell = cells.get(`${x},${y}`);
      let ch = " ";
      let bgCode = "";
      let fgCode = "";

      if (dist >= 3) {
        const wave =
          Math.sin(x * 0.28 + y * 0.2 + tick * 0.05) * 0.05 +
          Math.sin(x * 0.11 - y * 0.15) * 0.04;
        const grain = fastNoise(x, y + (tick & 7)) - 0.5;
        const localT = Math.max(0, Math.min(1, t + wave));
        const [r, g, b] = getHeroColor(localT);

        const noiseAmp = 14 * Math.sin(t * Math.PI);
        const gr = clampColor(r + grain * noiseAmp);
        const gg = clampColor(g + grain * noiseAmp);
        const gb = clampColor(b + grain * noiseAmp);

        bgCode = `\x1b[48;2;${gr};${gg};${gb}m`;

        const decoding = cell && DECODING_KINDS.has(cell.kind) && dist < 7 && fastNoise(x, y + tick) < (7 - dist) / 4;
        if (cell && decoding) {
          ch = glyphAt(x, tick, y);
          fgCode = "\x1b[38;2;152;217;118;1m";
        } else if (cell) {
          ch = cell.ch;
          if (cell.kind === "badge") {
            fgCode = "\x1b[38;2;255;255;255;1m";
          } else if (cell.kind === "title") {
            fgCode = "\x1b[38;2;255;238;210;1m";
          } else if (cell.kind === "num") {
            fgCode = "\x1b[38;2;218;204;167;1m";
          } else if (cell.kind === "sap") {
            fgCode = "\x1b[38;2;165;240;135;1m";
          } else if (cell.kind === "sub") {
            fgCode = "\x1b[38;2;165;240;135m";
          } else if (cell.kind === "dots") {
            fgCode = "\x1b[38;2;165;240;135;1m";
          } else {
            fgCode = "\x1b[38;2;218;204;167m";
          }
        } else {
          const charIdx = Math.floor(Math.abs(grain) * HERO_DITHERS.length) % HERO_DITHERS.length;
          ch = t < 0.72 ? HERO_DITHERS[charIdx] : " ";
          const fgr = clampColor(gr + 26);
          const fgg = clampColor(gg + 20);
          const fgb = clampColor(gb + 14);
          fgCode = `\x1b[38;2;${fgr};${fgg};${fgb}m`;
        }
      } else if (dist >= 0) {
        if (cell) {
          ch = cell.ch;
          bgCode = "\x1b[48;2;28;46;28m";
          fgCode = dist < 1 ? "\x1b[38;2;255;255;255;1m" : "\x1b[38;2;210;255;195;1m";
        } else {
          const charIdx = (x * 7 + y * 13 + tick) % MATRIX_CHARS.length;
          const matrixChar = MATRIX_CHARS[charIdx];
          const step = Math.floor(dist);
          if (step === 0) {
            bgCode = "\x1b[48;2;22;34;22m";
            fgCode = "\x1b[38;2;240;255;240;1m";
            ch = matrixChar;
          } else if (step === 1) {
            bgCode = "\x1b[48;2;18;26;18m";
            fgCode = "\x1b[38;2;152;217;118;1m";
            ch = matrixChar;
          } else {
            bgCode = "\x1b[48;2;16;22;16m";
            fgCode = "\x1b[38;2;95;145;75m";
            ch = matrixChar;
          }
        }
      } else {
        bgCode = "\x1b[48;2;22;20;21m";
        const letter = greet.get(`${x},${y}`);
        if (letter) {
          const swallowing = dist > -3 || !letter.settled;
          ch = swallowing ? glyphAt(x, tick, y) : letter.ch;
          fgCode = dist > -3 ? "\x1b[38;2;152;217;118;1m" : letter.settled ? "\x1b[38;2;210;255;195;1m" : "\x1b[38;2;95;145;75m";
        } else if (cell && !greetName) {
          ch = cell.ch;
          if (cell.kind === "badge") {
            fgCode = "\x1b[38;2;95;135;85m";
          } else if (cell.kind === "title" || cell.kind === "num") {
            fgCode = "\x1b[38;2;90;135;80;1m";
          } else if (cell.kind === "sap" || cell.kind === "sub") {
            fgCode = "\x1b[38;2;75;115;65m";
          } else if (cell.kind === "dots") {
            fgCode = "\x1b[38;2;65;105;55m";
          } else {
            fgCode = "\x1b[38;2;85;110;80m";
          }
        } else {
          fgCode = "\x1b[38;2;22;20;21m";
          ch = " ";
        }
      }

      if (bgCode !== lastBg) {
        line += bgCode;
        lastBg = bgCode;
      }
      if (fgCode !== lastFg) {
        line += fgCode;
        lastFg = fgCode;
      }
      line += ch;
    }

    line += "\x1b[0m";

    lines.push({
      id: `full_intro_${y}`,
      threadId: "intro",
      node: <Text wrap="truncate-end">{line}</Text>,
    });
  }

  return lines;
}

export function buildHeroFeedLines(width: number, totalLines: number, quote?: string): FeedLine[] {
  const W = Math.max(20, width);
  const H = Math.max(4, totalLines);
  const rawQuote = quote || MATRIX_QUOTES[0];

  const lines: FeedLine[] = [];
  const midY = Math.floor(H / 2);
  const artAnchorX = W >= 70 ? Math.floor(W * 0.62) : Math.floor(W / 2);

  const textRows: Record<number, Array<{ text: string; color: string }>> = {};
  const topPad = Math.max(0, Math.floor((H - 4) / 2));

  textRows[topPad + 0] = [
    { text: "M/ ", color: "\x1b[38;2;255;238;210;1m" },
    { text: "●● ", color: "\x1b[38;2;165;240;135;1m" },
    { text: "01", color: "\x1b[38;2;218;204;167;1m" },
  ];
  textRows[topPad + 1] = [
    { text: "▰ ", color: "\x1b[38;2;165;240;135;1m" },
    { text: "morpheus", color: "\x1b[38;2;255;238;210;1m" },
  ];
  if (topPad + 3 < H) {
    const maxQuoteLen = Math.max(15, Math.floor(W * 0.45));
    const dispQuote = rawQuote.length > maxQuoteLen ? rawQuote.slice(0, maxQuoteLen - 3) + "..." : rawQuote;
    textRows[topPad + 3] = [{ text: `"${dispQuote}"`, color: "\x1b[38;2;218;204;167;3m" }];
  }

  for (let y = 0; y < H; y++) {
    const srcY = 25 + (y - midY);

    interface Cell {
      ch: string;
      fg: string;
      bg: string;
    }
    const rowCells: Cell[] = [];

    for (let x = 0; x < W; x++) {
      const srcX = 60 + (x - artAnchorX);
      const pixel = getMorpheusPixel(srcX, srcY);
      if (pixel && pixel.char !== " ") {
        let r = pixel.r;
        let g = pixel.g;
        let b = pixel.b;

        if (srcX < 48) {
          const dim = 0.16 + 0.22 * Math.max(0, (srcX - 15) / 33);
          r = Math.floor(r * dim);
          g = Math.floor(g * dim);
          b = Math.floor(b * dim);
        } else if (srcX <= 82 && [":", "-", "+", ".", "*", "\\", "/", "=", "`"].includes(pixel.char)) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 25) {
            const boost = Math.min(1.35, 180 / Math.max(1, lum));
            r = Math.min(240, Math.floor(r * boost));
            g = Math.min(255, Math.floor(g * boost));
            b = Math.min(240, Math.floor(b * boost));
          }
        }

        rowCells.push({
          ch: pixel.char,
          fg: `\x1b[38;2;${r};${g};${b}m`,
          bg: "\x1b[48;2;12;16;13m",
        });
      } else {
        rowCells.push({
          ch: " ",
          fg: "\x1b[38;2;22;28;23m",
          bg: "\x1b[48;2;12;16;13m",
        });
      }
    }

    if (textRows[y]) {
      const segments = textRows[y];
      const totalLen = segments.reduce((sum, s) => sum + s.text.length, 0);
      const startX = 2;
      const endX = Math.min(W - 1, startX + totalLen + 2);

      for (let px = startX; px < endX; px++) {
        rowCells[px].ch = " ";
        rowCells[px].bg = "\x1b[48;2;14;18;15m";
      }

      let curX = startX + 1;
      for (const seg of segments) {
        for (let i = 0; i < seg.text.length; i++) {
          if (curX < W) {
            rowCells[curX].ch = seg.text[i];
            rowCells[curX].fg = seg.color;
            rowCells[curX].bg = "\x1b[48;2;14;18;15m";
            curX++;
          }
        }
      }
    }

    let lineStr = "";
    let lastFg = "";
    let lastBg = "";

    for (const cell of rowCells) {
      if (cell.bg !== lastBg) {
        lineStr += cell.bg;
        lastBg = cell.bg;
      }
      if (cell.fg !== lastFg) {
        lineStr += cell.fg;
        lastFg = cell.fg;
      }
      lineStr += cell.ch;
    }
    lineStr += "\x1b[0m";

    lines.push({
      id: `hero_${y}`,
      threadId: "hero",
      node: <Text wrap="truncate-end">{lineStr}</Text>,
    });
  }

  return lines;
}
