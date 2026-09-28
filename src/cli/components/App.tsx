import React, { useState, useEffect, useRef, useMemo } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { Box, Text, useInput, useWindowSize } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { DiffColumn, buildRightLines, type FileEditRecord, type RightLine } from "./DiffColumn";
import { InputBox } from "./InputBox";
import { ModelSelector } from "./ModelSelector";
import { runAgent } from "../../core/agent";
import { gatherContext } from "../../core/context";
import { MORPHEUS_VERSION } from "../../index";
import { MarkdownFormatter } from "../format";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types";
import { isToolError } from "../../utils/errors";
import { theme } from "../theme";

export interface ThreadStep {
  id: string;
  type: "thinking" | "tool";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  startTime?: number;
  durationMs?: number;
  outputSummary?: string;
  outputPreview?: string[];
  output?: string;
  isOutputExpanded?: boolean;
}

export interface Thread {
  id: string;
  index: number;
  prompt: string;
  response: string;
  isStreaming?: boolean;
  steps: ThreadStep[];
  isExpanded: boolean;
  status: "running" | "completed" | "aborted" | "error";
  stepCount: number;
  startTime: number;
  durationMs?: number;
}

export interface AppProps {
  model: string;
  isLocal?: boolean;
  baseURL?: string;
  isVerbose?: boolean;
  initialTask?: string;
  maxSteps?: number;
}

interface FeedLine {
  id: string;
  threadId: string;
  stepId?: string;
  node: React.ReactNode;
}

function wrapLine(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function extractDiffRecord(
  name: string,
  args: Record<string, unknown>,
  output: string
): FileEditRecord | null {
  if (name === "edit_file" && typeof args.filePath === "string") {
    const rawLines = output.split("\n");
    const diffLines = rawLines.filter(
      (l) => l.startsWith("@@") || l.startsWith("+") || l.startsWith("-") || l.startsWith(" ")
    );
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return {
      filePath: args.filePath,
      type: "edit",
      diffLines: diffLines.length > 0 ? diffLines : rawLines.slice(0, 15),
      linesAdded: added,
      linesRemoved: removed,
      timestamp: Date.now(),
    };
  }

  if (name === "write_file" && typeof args.filePath === "string") {
    const content = typeof args.content === "string" ? args.content : "";
    const lines = content.split("\n");
    return {
      filePath: args.filePath,
      type: "write",
      diffLines: lines.slice(0, 15).map((l) => `+ ${l}`),
      linesAdded: lines.length,
      linesRemoved: 0,
      timestamp: Date.now(),
    };
  }

  return null;
}

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

function heroNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
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

const MATRIX_QUOTES = [
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

function buildFullScreenIntro(
  width: number,
  height: number,
  progress: number,
  tick: number,
  quote?: string
): FeedLine[] {
  const W = Math.max(20, width);
  const H = Math.max(8, height);

  const rawQuote = quote || MATRIX_QUOTES[0];
  const fullQuote = `· ${rawQuote} ·`;
  const quoteText = fullQuote.length <= W - 4 ? fullQuote : rawQuote.length <= W - 2 ? rawQuote : "";

  const stripY = Math.floor(H / 2);
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
      const rainP = Math.min(1, Math.max(0, (progress - delay) / 0.42));
      const frontier = rainP * (H + 6) * speed;
      const dist = frontier - y;

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

        if (cell) {
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
        if (cell) {
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

function buildHeroFeedLines(width: number, totalLines: number, quote?: string): FeedLine[] {
  const safeWidth = Math.max(20, width - 2);
  const safeLines = Math.max(6, totalLines);

  const title = safeWidth >= 40 ? "M  O  R  P  H  E  U  S" : "MORPHEUS";
  const sub = "a g e n t i c   h a r n e s s";
  const hint =
    safeWidth >= 45
      ? "ask a question or describe a task below"
      : "enter a prompt below";

  const rawQuote = quote || MATRIX_QUOTES[0];
  const fullQuote = `· ${rawQuote} ·`;
  const heroQuote = fullQuote.length <= safeWidth ? fullQuote : rawQuote.length <= safeWidth ? rawQuote : "· wake up, neo ·";

  const textMap: Record<number, [string, [number, number, number], boolean]> = {};

  if (safeLines >= 10) {
    textMap[1] = [heroQuote, [218, 204, 167], true];
    textMap[safeLines - 5] = [title, [245, 212, 181], true];
    textMap[safeLines - 4] = [sub, [152, 217, 118], false];
    textMap[safeLines - 2] = [hint, [218, 204, 167], false];
  } else {
    textMap[safeLines - 4] = [title, [245, 212, 181], true];
    textMap[safeLines - 3] = [sub, [152, 217, 118], false];
    textMap[safeLines - 1] = [hint, [218, 204, 167], false];
  }

  const lines: FeedLine[] = [];

  for (let y = 0; y < safeLines; y++) {
    let line = "";
    const t = y / Math.max(1, safeLines - 1);
    const entry = textMap[y];
    let rawText = entry ? entry[0] : "";
    const fgCol = entry ? entry[1] : null;
    const isBold = entry ? entry[2] : false;

    if (rawText && rawText.length > safeWidth) {
      rawText = rawText.slice(0, safeWidth);
    }
    const startX = rawText ? Math.floor((safeWidth - rawText.length) / 2) : 999;
    const endX = rawText ? startX + rawText.length : -1;

    for (let x = 0; x < safeWidth; x++) {
      const wave =
        Math.sin(x * 0.42) * 0.08 +
        Math.sin(x * 0.19 + 0.8) * 0.05 +
        Math.sin(x * 0.85) * 0.03;
      const grain = heroNoise(x, y) - 0.5;
      const localT = Math.max(0, Math.min(1, t + wave));
      const [r, g, b] = getHeroColor(localT);

      const noiseAmp = 18 * Math.max(0, 1 - t * 0.9);
      const gr = clampColor(r + grain * noiseAmp);
      const gg = clampColor(g + grain * noiseAmp);
      const gb = clampColor(b + grain * noiseAmp);

      if (startX <= x && x < endX && fgCol) {
        const ch = rawText[x - startX];
        const [fgr, fgg, fgb] = fgCol;
        const boldCode = isBold ? ";1" : "";
        line += `\x1b[48;2;${gr};${gg};${gb}m\x1b[38;2;${fgr};${fgg};${fgb}${boldCode}m${ch}`;
      } else {
        const fgR = clampColor(gr + 32);
        const fgG = clampColor(gg + 24);
        const fgB = clampColor(gb + 16);
        const charIdx = Math.floor(Math.abs(grain) * HERO_DITHERS.length) % HERO_DITHERS.length;
        const ch = t < 0.65 ? HERO_DITHERS[charIdx] : " ";
        line += `\x1b[48;2;${gr};${gg};${gb}m\x1b[38;2;${fgR};${fgG};${fgB}m${ch}`;
      }
    }
    line += "\x1b[0m";

    lines.push({
      id: `hero_intro_${y}`,
      threadId: "intro",
      node: <Text wrap="truncate-end">{line + "  "}</Text>,
    });
  }

  return lines;
}

export function App({
  model,
  isLocal = false,
  baseURL,
  isVerbose = false,
  initialTask,
  maxSteps,
}: AppProps) {
  const { columns, rows } = useWindowSize();

  const [currentModel, setCurrentModel] = useState(model);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "aborted" | "error">(
    initialTask ? "running" : "idle"
  );
  const [stepCount, setStepCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEditRecord[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [collapsedThinkingIds, setCollapsedThinkingIds] = useState<Set<string>>(new Set());
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(new Set());
  const [expandedFileEdits, setExpandedFileEdits] = useState<Set<string>>(new Set());
  const [rightScrollTop, setRightScrollTop] = useState(0);
  const [isIntroActive, setIsIntroActive] = useState(!initialTask);
  const [introProgress, setIntroProgress] = useState(0);
  const [introTick, setIntroTick] = useState(0);
  const [matrixQuote] = useState(() => MATRIX_QUOTES[Math.floor(Math.random() * MATRIX_QUOTES.length)]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const baseContext = useRef(gatherContext(process.cwd()));
  const initialTaskFired = useRef(false);
  const isUserScrolledRef = useRef(false);
  const maxScrollRef = useRef(0);
  const visibleLinesRef = useRef<FeedLine[]>([]);
  const activeToolArgsRef = useRef<Record<string, unknown>>({});
  const isRightUserScrolledRef = useRef(false);
  const maxRightScrollRef = useRef(0);
  const visibleRightLinesRef = useRef<RightLine[]>([]);
  const currentRightScrollRef = useRef(0);

  const terminalWidth = columns || process.stdout.columns || 80;
  const terminalHeight = rows || process.stdout.rows || 24;
  const isSplitLayout = terminalWidth >= 72;
  const leftWidth = isSplitLayout ? Math.floor(terminalWidth * 0.58) : terminalWidth;
  const rightWidth = isSplitLayout ? terminalWidth - leftWidth : 0;

  const headerHeight = 2;
  const statusBarHeight = 2;
  const inputBoxHeight = 1;
  const workspaceHeight = Math.max(4, terminalHeight - headerHeight - statusBarHeight - inputBoxHeight);
  const feedHeight = workspaceHeight;
  const maxLineWidth = Math.max(20, leftWidth - 6);

  useEffect(() => {
    if (!isIntroActive) return;
    const startTime = Date.now();
    const duration = 3200;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawP = Math.min(1, elapsed / duration);
      setIntroProgress(rawP);
      setIntroTick((prev) => prev + 1);
      if (rawP >= 1) {
        clearInterval(interval);
        setTimeout(() => {
          setIsIntroActive(false);
        }, 100);
      }
    }, 33);
    return () => clearInterval(interval);
  }, [isIntroActive]);

  useEffect(() => {
    try {
      process.stdout.write("\x1b]11;#161415\x07");
      process.stdout.write("\x1b[?1000h\x1b[?1006h");
    } catch {}

    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const mouseMatches = str.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g);

      for (const match of mouseMatches) {
        const button = parseInt(match[1], 10);
        const col = parseInt(match[2], 10);
        const row = parseInt(match[3], 10);
        const isRelease = match[4] === "m";

        if (isIntroActive) {
          if (button === 0 && !isRelease) {
            setIsIntroActive(false);
          }
          return;
        }

        if (isSplitLayout && col > leftWidth) {
          if (button === 64) {
            setRightScrollTop((prev) => {
              const base = isRightUserScrolledRef.current ? prev : maxRightScrollRef.current;
              return Math.max(0, base - 2);
            });
            isRightUserScrolledRef.current = true;
          } else if (button === 65) {
            setRightScrollTop((prev) => {
              const base = isRightUserScrolledRef.current ? prev : maxRightScrollRef.current;
              const next = Math.min(maxRightScrollRef.current, base + 2);
              if (next >= maxRightScrollRef.current) {
                isRightUserScrolledRef.current = false;
              }
              return next;
            });
          } else if (button === 0 && !isRelease) {
            const workspaceRow = row - 3;
            if (workspaceRow >= 0 && workspaceRow < visibleRightLinesRef.current.length) {
              const clickedLine = visibleRightLinesRef.current[workspaceRow];
              if (clickedLine?.threadId) {
                const tId = clickedLine.threadId;
                setRightScrollTop(currentRightScrollRef.current);
                isRightUserScrolledRef.current = true;
                setCollapsedThreadIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(tId)) {
                    next.delete(tId);
                  } else {
                    next.add(tId);
                  }
                  return next;
                });
              } else if (clickedLine?.editFilePath) {
                const fp = clickedLine.editFilePath;
                setRightScrollTop(currentRightScrollRef.current);
                isRightUserScrolledRef.current = true;
                setExpandedFileEdits((prev) => {
                  const next = new Set(prev);
                  if (next.has(fp)) {
                    next.delete(fp);
                  } else {
                    next.add(fp);
                  }
                  return next;
                });
              } else if (clickedLine?.toolId) {
                const clickedId = clickedLine.toolId;
                setRightScrollTop(currentRightScrollRef.current);
                isRightUserScrolledRef.current = true;
                setExpandedToolIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(clickedId)) {
                    next.delete(clickedId);
                  } else {
                    next.add(clickedId);
                  }
                  return next;
                });
              }
            }
          }
        } else {
          if (button === 64) {
            isUserScrolledRef.current = true;
            setScrollOffset((prev) => Math.min(maxScrollRef.current, prev + 2));
          } else if (button === 65) {
            setScrollOffset((prev) => {
              const next = Math.max(0, prev - 2);
              if (next === 0) {
                isUserScrolledRef.current = false;
              }
              return next;
            });
          } else if (button === 0 && !isRelease) {
            const workspaceRow = row - 3;
            if (workspaceRow >= 0 && workspaceRow < visibleLinesRef.current.length) {
              const clickedLine = visibleLinesRef.current[workspaceRow];
              if (clickedLine?.stepId) {
                const sId = clickedLine.stepId;
                setCollapsedThinkingIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(sId)) {
                    next.delete(sId);
                  } else {
                    next.add(sId);
                  }
                  return next;
                });
              }
            }
          }
        }
      }
    };

    process.stdin.on("data", onData);

    const cleanup = () => {
      try {
        process.stdout.write("\x1b]111\x07");
        process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      } catch {}
      process.stdin.off("data", onData);
    };

    process.on("exit", cleanup);
    return cleanup;
  }, [leftWidth, isSplitLayout, isIntroActive]);

  useInput((input, key) => {
    if (isIntroActive) {
      setIsIntroActive(false);
      return;
    }
    if (isModelSelectorOpen) {
      return;
    }
    if (key.escape && status === "running") {
      abortControllerRef.current?.abort();
      setStatus("aborted");
      return;
    }

    if (key.pageUp || (key.ctrl && input === "u")) {
      isUserScrolledRef.current = true;
      setScrollOffset((prev) => Math.min(maxScrollRef.current, prev + 5));
      return;
    }

    if (key.pageDown || (key.ctrl && input === "d")) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 5);
        if (next === 0) {
          isUserScrolledRef.current = false;
        }
        return next;
      });
      return;
    }

    if (key.end) {
      isUserScrolledRef.current = false;
      setScrollOffset(0);
      isRightUserScrolledRef.current = false;
      setRightScrollTop(0);
      return;
    }
  });

  const executeTask = async (taskText: string) => {
    if (status === "running") return;

    const trimmed = taskText.trim();
    if (trimmed === "/log" || trimmed === "/logs" || trimmed === "/session") {
      let logContent = "";
      try {
        const latestPath = path.join(os.homedir(), ".morpheus", "logs", "latest.log");
        const raw = await fs.readFile(latestPath, "utf-8");
        const lines = raw.trim().split("\n");
        logContent = lines.slice(-40).join("\n");
      } catch {
        logContent = "No previous session log found at ~/.morpheus/logs/latest.log";
      }
      const logThread: Thread = {
        id: `thread_${Date.now()}`,
        index: threads.length + 1,
        prompt: taskText,
        response: `Latest session log (~/.morpheus/logs/latest.log):\n\`\`\`\n${logContent}\n\`\`\``,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      setPromptHistory((prev) => [...prev, taskText]);
      setThreads((prev) => [...prev, logThread]);
      return;
    }

    if (trimmed === "/diff") {
      let diffOut = "";
      try {
        diffOut = execSync("git diff HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
        if (!diffOut.trim()) {
          diffOut = "No unstaged or staged git changes against HEAD.";
        }
      } catch (e: unknown) {
        diffOut = `Error reading git diff: ${e instanceof Error ? e.message : String(e)}`;
      }
      const diffThread: Thread = {
        id: `thread_${Date.now()}`,
        index: threads.length + 1,
        prompt: taskText,
        response: `Git diff (HEAD):\n\`\`\`diff\n${diffOut}\n\`\`\``,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      setPromptHistory((prev) => [...prev, taskText]);
      setThreads((prev) => [...prev, diffThread]);
      return;
    }

    if (trimmed === "/model" || trimmed === "/models" || trimmed.startsWith("/model ")) {
      const parts = trimmed.split(/\s+/);
      if (parts.length > 1 && parts[1]) {
        const targetModel = parts[1];
        setCurrentModel(targetModel);
        const switchThread: Thread = {
          id: `thread_${Date.now()}`,
          index: threads.length + 1,
          prompt: taskText,
          response: `Switched active model to: \`${targetModel}\`\nAll future turns will route through Neo using this model.`,
          isStreaming: false,
          steps: [],
          isExpanded: false,
          status: "completed",
          stepCount: 0,
          startTime: Date.now(),
          durationMs: 0,
        };
        setPromptHistory((prev) => [...prev, taskText]);
        setThreads((prev) => [...prev, switchThread]);
        return;
      }

      /* Open interactive UI model picker */
      setPromptHistory((prev) => [...prev, taskText]);
      setIsModelSelectorOpen(true);
      return;
    }

    if (trimmed === "/login" || trimmed.startsWith("/login ")) {
      const parts = trimmed.split(/\s+/);
      const subCommand = parts[1]?.toLowerCase();
      const arg = parts.slice(2).join(" ").trim();
      const loginThreadId = `thread_${Date.now()}`;

      /* Handle /login help or unknown subcommand */
      if (subCommand && !["antigravity", "agy", "google", "openrouter", "local", "ollama"].includes(subCommand)) {
        const helpText = `● **Modular Authentication Providers**\n\n• \`/login antigravity\` - Authenticate Google Cloud Code via browser OAuth\n• \`/login openrouter <api-key>\` - Validate and store OpenRouter API key\n• \`/login local [baseUrl]\` - Connect to local Ollama server (default: http://127.0.0.1:11434)\n• \`/auth\` - View real-time status across all providers`;
        const helpThread: Thread = {
          id: loginThreadId,
          index: threads.length + 1,
          prompt: taskText,
          response: helpText,
          isStreaming: false,
          steps: [],
          isExpanded: false,
          status: "completed",
          stepCount: 0,
          startTime: Date.now(),
          durationMs: 0,
        };
        setPromptHistory((prev) => [...prev, taskText]);
        setThreads((prev) => [...prev, helpThread]);
        return;
      }

      /* Determine target provider */
      let targetProvider = "antigravity";
      let requestBody: Record<string, unknown> = { provider: "antigravity" };
      let initialMessage = "Opening Google authentication in your default browser...\nPlease complete sign-in and return to this terminal.";

      if (subCommand === "openrouter") {
        targetProvider = "openrouter";
        if (!arg) {
          const errThread: Thread = {
            id: loginThreadId,
            index: threads.length + 1,
            prompt: taskText,
            response: "Error: OpenRouter API key is required.\nUsage: `/login openrouter <your-api-key>`",
            isStreaming: false,
            steps: [],
            isExpanded: false,
            status: "error",
            stepCount: 0,
            startTime: Date.now(),
            durationMs: 0,
          };
          setPromptHistory((prev) => [...prev, taskText]);
          setThreads((prev) => [...prev, errThread]);
          return;
        }
        requestBody = { provider: "openrouter", apiKey: arg };
        initialMessage = "Validating OpenRouter API key...";
      } else if (subCommand === "local" || subCommand === "ollama") {
        targetProvider = "local";
        requestBody = { provider: "local", baseUrl: arg || undefined };
        initialMessage = "Connecting to local Ollama server...";
      }

      const initialLoginThread: Thread = {
        id: loginThreadId,
        index: threads.length + 1,
        prompt: taskText,
        response: initialMessage,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "running",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      setPromptHistory((prev) => [...prev, taskText]);
      setThreads((prev) => [...prev, initialLoginThread]);

      try {
        const neoBase = baseURL || "http://127.0.0.1:8787/v1";
        const loginUrl = neoBase.endsWith("/v1")
          ? `${neoBase}/auth/login`
          : `${neoBase}/v1/auth/login`;

        const res = await fetch(loginUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          const resData = (await res.json()) as {
            status?: string;
            provider?: string;
            auth?: { identity?: string; details?: Record<string, unknown> };
          };
          let successMessage = "";
          if (targetProvider === "antigravity") {
            successMessage = "Authentication successful! Google Cloud credentials have been refreshed and saved to macOS Keychain.";
          } else if (targetProvider === "openrouter") {
            const maskedKey = resData?.auth?.identity || "sk-or-v1-***";
            successMessage = `Authentication successful! OpenRouter API key validated (\`${maskedKey}\`) and securely saved to macOS Keychain.`;
          } else if (targetProvider === "local") {
            const count = (resData?.auth?.details?.count as number) || 0;
            successMessage = `Connected to local runtime successfully! Discovered ${count} local models from Ollama.`;
          }

          setThreads((prev) =>
            prev.map((t) =>
              t.id === loginThreadId
                ? {
                    ...t,
                    status: "completed",
                    response: successMessage,
                  }
                : t
            )
          );
        } else {
          const errText = await res.text();
          let parsedErr = errText;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error) parsedErr = typeof parsed.error === "string" ? parsed.error : parsed.error.message;
          } catch {}
          setThreads((prev) =>
            prev.map((t) =>
              t.id === loginThreadId
                ? {
                    ...t,
                    status: "error",
                    response: `Authentication error (${res.status}): ${parsedErr}`,
                  }
                : t
            )
          );
        }
      } catch (err: unknown) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === loginThreadId
              ? {
                  ...t,
                  status: "error",
                  response: `Could not reach Neo proxy: ${err instanceof Error ? err.message : String(err)}. Ensure Neo is running on port 8787.`,
                }
              : t
          )
        );
      }
      return;
    }

    if (trimmed === "/auth" || trimmed === "/whoami" || trimmed === "/status") {
      let authStatusText = "";
      try {
        const neoBase = baseURL || "http://127.0.0.1:8787/v1";
        const statusUrl = neoBase.endsWith("/v1")
          ? `${neoBase}/auth/status`
          : `${neoBase}/v1/auth/status`;

        const res = await fetch(statusUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const info = (await res.json()) as {
            authenticated?: boolean;
            email?: string;
            expiry?: string;
            service?: string;
            account?: string;
            providers?: Array<{
              provider: string;
              name: string;
              authType: string;
              authenticated: boolean;
              identity?: string;
              expiry?: string;
              details?: Record<string, unknown>;
              error?: string;
            }>;
          };

          if (info.providers && Array.isArray(info.providers)) {
            const sections = info.providers.map((p) => {
              if (p.authenticated) {
                let detailLines = "";
                if (p.identity) {
                  detailLines += `\n• **Identity:** \`${p.identity}\``;
                }
                if (p.expiry) {
                  detailLines += `\n• **Token Expiry:** \`${p.expiry}\``;
                }
                if (p.details?.count !== undefined) {
                  detailLines += `\n• **Discovered Models:** \`${p.details.count}\``;
                }
                return `● **${p.name}**: Active${detailLines}`;
              } else {
                let hint = "";
                if (p.provider === "antigravity") {
                  hint = "Type `/login antigravity` to authenticate via Google OAuth.";
                } else if (p.provider === "openrouter") {
                  hint = "Type `/login openrouter <api-key>` to configure.";
                } else if (p.provider === "local") {
                  hint = "Start Ollama (`ollama serve`) or run `/login local [url]`.";
                }
                return `○ **${p.name}**: Not Active\n• *${p.error || "Unauthenticated"}*\n• ${hint}`;
              }
            });

            authStatusText = `### Provider Authentication Status\n\n${sections.join("\n\n")}\n\n*Configure any provider with \`/login <provider>\`.*`;
          } else if (info.authenticated) {
            authStatusText = `● **Authentication Active** (macOS Keychain)\n• **Account:** \`${info.email || "Active"}\`\n• **Keychain Target:** \`${info.service || "gemini"} / ${info.account || "antigravity"}\`\n• **Token Expiry:** \`${info.expiry || "Auto-refreshing"}\`\n\n*All Antigravity models route through this identity.*`;
          } else {
            authStatusText = `● **Authentication Missing**\nNo credentials found in macOS Keychain. Type \`/login\` to authenticate.`;
          }
        }
      } catch {
        authStatusText = `● **Neo Router Offline**\nCould not connect to Neo on port 8787. Ensure Neo is active.`;
      }

      const authThread: Thread = {
        id: `thread_${Date.now()}`,
        index: threads.length + 1,
        prompt: taskText,
        response: authStatusText,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      setPromptHistory((prev) => [...prev, taskText]);
      setThreads((prev) => [...prev, authThread]);
      return;
    }

    setStatus("running");
    setStepCount(0);
    setElapsedSeconds(0);
    isUserScrolledRef.current = false;
    setScrollOffset(0);
    isRightUserScrolledRef.current = false;
    setRightScrollTop(0);
    setPromptHistory((prev) => [...prev, taskText]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 200);

    const threadId = `thread_${Date.now()}`;
    const newThread: Thread = {
      id: threadId,
      index: threads.length + 1,
      prompt: taskText,
      response: "",
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "running",
      stepCount: 0,
      startTime,
    };
    setThreads((prev) => [...prev, newThread]);

    let activeThinkingId: string | null = null;
    let activeToolId: string | null = null;
    let thinkingStartTime = 0;
    let activeToolStartTime = 0;

    try {
      const result = await runAgent(taskText, history, {
        abortSignal: abortController.signal,
        model: currentModel,
        isLocal,
        baseURL,
        verbose: isVerbose,
        maxSteps,
        findings,
        onStepStart: (step) => {
          setStepCount(step);
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, stepCount: step } : t
            )
          );
        },
        onReasoningDelta: (chunk) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (!activeThinkingId) {
            activeThinkingId = `think_${Date.now()}`;
            thinkingStartTime = Date.now();
            const newStep: ThreadStep = {
              id: activeThinkingId,
              type: "thinking",
              content: chunk,
              isRunning: true,
              startTime: thinkingStartTime,
              durationMs: 0,
            };
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
              )
            );
          } else {
            const curThinkId = activeThinkingId;
            const curDur = Date.now() - thinkingStartTime;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId
                      ? {
                          ...s,
                          content: (s.content || "") + chunk,
                          durationMs: curDur,
                        }
                      : s
                  ),
                };
              })
            );
          }
        },
        onToolCall: (name, toolArgs) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          activeToolArgsRef.current = toolArgs;
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                  ),
                };
              })
            );
            activeThinkingId = null;
          }

          const toolStartTime = Date.now();
          activeToolStartTime = toolStartTime;
          activeToolId = `tool_${toolStartTime}_${name}`;
          const newStep: ThreadStep = {
            id: activeToolId,
            type: "tool",
            name,
            args: toolArgs,
            isRunning: true,
            startTime: toolStartTime,
          };
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, steps: [...t.steps, newStep] } : t
            )
          );
        },
        onToolResult: (name, res) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          const isError = isToolError(res.output, res.metadata?.isError as boolean | undefined);
          const lines = res.output.trim().split("\n").filter(Boolean);
          const outputSummary = `${lines.length} lines output`;
          const curToolId = activeToolId;
          const toolDur = activeToolStartTime ? Date.now() - activeToolStartTime : undefined;

          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              return {
                ...t,
                steps: t.steps.map((s) =>
                  s.id === curToolId
                    ? {
                        ...s,
                        isRunning: false,
                        isError,
                        durationMs: toolDur,
                        outputSummary,
                        outputPreview: lines.slice(0, 4),
                        output: res.output,
                      }
                    : s
                ),
              };
            })
          );
          activeToolId = null;

          const editRecord = extractDiffRecord(
            name,
            activeToolArgsRef.current || {},
            res.output
          );
          if (editRecord) {
            setFileEdits((prev) => [...prev, editRecord]);
          }
        },
        onTextDelta: (chunk) => {
          if (!isUserScrolledRef.current) {
            setScrollOffset(0);
          }
          if (activeThinkingId) {
            const curThinkId = activeThinkingId;
            const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
                  ),
                };
              })
            );
            activeThinkingId = null;
          }

          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    response: (t.response || "") + chunk,
                    isStreaming: true,
                  }
                : t
            )
          );
        },
      });

      if (activeThinkingId) {
        const curThinkId = activeThinkingId;
        const thinkDur = thinkingStartTime ? Date.now() - thinkingStartTime : 0;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            return {
              ...t,
              steps: t.steps.map((s) =>
                s.id === curThinkId ? { ...s, isRunning: false, durationMs: thinkDur } : s
              ),
            };
          })
        );
        activeThinkingId = null;
      }

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: result.aborted ? "aborted" : "completed",
                isStreaming: false,
                durationMs: Date.now() - t.startTime,
              }
            : t
        )
      );

      setHistory(result.messages);
      if (result.findings) {
        setFindings(result.findings);
      }
      setUsage(result.usage);
      setStatus(result.aborted ? "aborted" : "idle");
    } catch (err: unknown) {
      setStatus("error");
      const errMsg = err instanceof Error ? err.message : String(err);
      let errorResponse = `Error: ${errMsg}`;
      if (errMsg.includes("fetch failed") || errMsg.includes("ECONNREFUSED")) {
        errorResponse += `\n\n*Unable to connect to model proxy (${baseURL || "http://127.0.0.1:8787"}). Type \`/auth\` to check credentials or ensure Neo is running.*`;
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: "error",
                isStreaming: false,
                response: errorResponse,
                durationMs: Date.now() - t.startTime,
              }
            : t
        )
      );
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (initialTask && !initialTaskFired.current) {
      initialTaskFired.current = true;
      executeTask(initialTask);
    }
  }, []);

  const allFeedLines = useMemo<FeedLine[]>(() => {
    const lines: FeedLine[] = [];

    const heroHeight = Math.min(14, feedHeight);
    lines.push(...buildHeroFeedLines(leftWidth, heroHeight, matrixQuote));

    if (threads.length > 0) {
      lines.push({
        id: "hero_divider",
        threadId: "intro",
        node: (
          <Text backgroundColor={theme.bg}>
            {" ".repeat(leftWidth)}
          </Text>
        ),
      });
    }

    threads.forEach((thread, tIdx) => {
      lines.push({
        id: `${thread.id}_user_hdr`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.secondary} bold>
              ▲ you
            </Text>
            {" ".repeat(Math.max(0, leftWidth - 5))}
          </Text>
        ),
      });

      const promptLines = thread.prompt.split("\n");
      promptLines.forEach((pLine) => {
        const wrapped = wrapLine(pLine, maxLineWidth);
        wrapped.forEach((wLine) => {
          const visLen = 2 + wLine.length;
          const pad = Math.max(0, leftWidth - visLen);
          lines.push({
            id: `${thread.id}_prompt_${lines.length}`,
            threadId: thread.id,
            node: (
              <Text backgroundColor={theme.bg} wrap="truncate-end">
                <Text color={theme.text} bold>  {wLine}</Text>
                {" ".repeat(pad)}
              </Text>
            ),
          });
        });
      });

      const thinkingSteps = thread.steps.filter((s) => s.type === "thinking");
      thinkingSteps.forEach((tStep) => {
        const isCollapsed = collapsedThinkingIds.has(tStep.id);
        const rawMs = tStep.isRunning
          ? (tStep.startTime ? Date.now() - tStep.startTime : (tStep.durationMs || 0))
          : (tStep.durationMs || 0);
        const sec = (rawMs / 1000).toFixed(1);
        const arrow = isCollapsed ? "▶" : "▼";
        const toggle = isCollapsed ? " · [+]" : " · [-]";
        const hdrText = `${arrow} reasoning (${sec}s)${toggle}`;
        const visLen = tStep.isRunning ? hdrText.length + 3 : hdrText.length;
        const pad = Math.max(0, leftWidth - visLen);
        lines.push({
          id: `${tStep.id}_think_hdr`,
          threadId: thread.id,
          stepId: tStep.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              {tStep.isRunning ? (
                <Text color={theme.accentBright}>
                  <Spinner type="dots" />{" "}
                </Text>
              ) : null}
              <Text color={tStep.isRunning ? theme.secondary : theme.muted} italic>
                {hdrText}
              </Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });

        if (!isCollapsed && tStep.content) {
          const rawThinkLines = tStep.content.trim().split("\n");
          rawThinkLines.forEach((rLine) => {
            const wrapped = wrapLine(rLine, maxLineWidth);
            wrapped.forEach((wLine) => {
              const visLen = 4 + wLine.length;
              const pad = Math.max(0, leftWidth - visLen);
              lines.push({
                id: `${tStep.id}_think_${lines.length}`,
                threadId: thread.id,
                stepId: tStep.id,
                node: (
                  <Text backgroundColor={theme.bg} wrap="truncate-end">
                    <Text color={theme.border}>  │ </Text>
                    <Text color={theme.secondary} italic>
                      {wLine}
                    </Text>
                    {" ".repeat(pad)}
                  </Text>
                ),
              });
            });
          });
        }
      });

      if (thread.response || thread.isStreaming) {
        const asstHdr = "▲ morpheus";
        const padHdr = Math.max(0, leftWidth - asstHdr.length);
        lines.push({
          id: `${thread.id}_asst_hdr`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.accentBright} bold>
                {asstHdr}
              </Text>
              {" ".repeat(padHdr)}
            </Text>
          ),
        });

        const formatter = new MarkdownFormatter();
        const rawLines = thread.response.split("\n");
        const formattedLines: string[] = [];
        for (const raw of rawLines) {
          formattedLines.push(...formatter.processLine(raw));
        }
        formattedLines.push(...formatter.flush());

        formattedLines.forEach((mLine) => {
          const wrapped = wrapLine(mLine, maxLineWidth);
          wrapped.forEach((wLine) => {
            const cleanText = wLine.replace(/\x1b\[[0-9;]*m/g, "");
            const visLen = 2 + cleanText.length;
            const pad = Math.max(0, leftWidth - visLen);
            lines.push({
              id: `${thread.id}_asst_line_${lines.length}`,
              threadId: thread.id,
              node: (
                <Text backgroundColor={theme.bg} wrap="truncate-end">
                  <Text color={theme.text}>  {wLine}</Text>
                  {" ".repeat(pad)}
                </Text>
              ),
            });
          });
        });
      }

      if (tIdx < threads.length - 1) {
        const dots = "  " + "· ".repeat(Math.min(16, Math.max(4, Math.floor(leftWidth / 6))));
        const padDots = Math.max(0, leftWidth - dots.length);
        lines.push({
          id: `${thread.id}_spacer_1`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.border}>{dots}</Text>
              {" ".repeat(padDots)}
            </Text>
          ),
        });
        lines.push({
          id: `${thread.id}_spacer_2`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg}>
              {" ".repeat(leftWidth)}
            </Text>
          ),
        });
      }
    });

    return lines;
  }, [threads, leftWidth, maxLineWidth, feedHeight, collapsedThinkingIds]);

  const maxScroll = Math.max(0, allFeedLines.length - feedHeight);
  maxScrollRef.current = maxScroll;

  const visibleLines = useMemo(() => {
    const total = allFeedLines.length;
    if (total <= feedHeight) {
      return allFeedLines;
    }
    const clampedOffset = Math.min(scrollOffset, maxScroll);
    const startIndex = Math.max(0, total - feedHeight - clampedOffset);
    return allFeedLines.slice(startIndex, startIndex + feedHeight);
  }, [allFeedLines, scrollOffset, feedHeight, maxScroll]);

  visibleLinesRef.current = visibleLines;

  const rightContentWidth = Math.max(16, rightWidth - 1);

  const allRightLines = useMemo<RightLine[]>(() => {
    return buildRightLines(
      threads,
      fileEdits,
      findings,
      baseContext.current.branch,
      baseContext.current.gitStatus,
      expandedToolIds,
      collapsedThreadIds,
      expandedFileEdits,
      rightContentWidth
    );
  }, [threads, fileEdits, findings, expandedToolIds, collapsedThreadIds, expandedFileEdits, rightContentWidth]);

  const maxRightScroll = Math.max(0, allRightLines.length - workspaceHeight);
  maxRightScrollRef.current = maxRightScroll;

  const effectiveRightScroll = isRightUserScrolledRef.current
    ? Math.min(rightScrollTop, maxRightScroll)
    : maxRightScroll;
  currentRightScrollRef.current = effectiveRightScroll;

  const visibleRightLines = useMemo(() => {
    return allRightLines.slice(effectiveRightScroll, effectiveRightScroll + workspaceHeight);
  }, [allRightLines, effectiveRightScroll, workspaceHeight]);

  visibleRightLinesRef.current = visibleRightLines;

  const fullIntroLines = useMemo(() => {
    if (!isIntroActive) return [];
    return buildFullScreenIntro(terminalWidth, terminalHeight, introProgress, introTick, matrixQuote);
  }, [isIntroActive, terminalWidth, terminalHeight, introProgress, introTick, matrixQuote]);

  if (isIntroActive) {
    return (
      <Box
        flexDirection="column"
        width={terminalWidth}
        height={terminalHeight}
        overflow="hidden"
      >
        {fullIntroLines.map((line) => (
          <Box key={line.id} height={1} overflow="hidden">
            {line.node}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      <Header
        version={MORPHEUS_VERSION}
        model={currentModel}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      <Box flexDirection="row" width={terminalWidth} height={workspaceHeight} overflow="hidden">
        {isModelSelectorOpen ? (
          <Box
            width={terminalWidth}
            height={workspaceHeight}
            alignItems="center"
            justifyContent="center"
          >
            <ModelSelector
              currentModel={currentModel}
              width={Math.min(terminalWidth, 80)}
              onSelect={(selectedId) => {
                setCurrentModel(selectedId);
                setIsModelSelectorOpen(false);
                const switchThread: Thread = {
                  id: `thread_${Date.now()}`,
                  index: threads.length + 1,
                  prompt: `/model ${selectedId}`,
                  response: `Switched active model to: \`${selectedId}\`\nAll future turns will route through Neo using this model.`,
                  isStreaming: false,
                  steps: [],
                  isExpanded: false,
                  status: "completed",
                  stepCount: 0,
                  startTime: Date.now(),
                  durationMs: 0,
                };
                setThreads((prev) => [...prev, switchThread]);
              }}
              onClose={() => {
                setIsModelSelectorOpen(false);
              }}
            />
          </Box>
        ) : (
          <>
            <Box
              flexDirection="column"
              width={leftWidth}
              height={workspaceHeight}
            >
              <Box flexDirection="column" height={feedHeight} overflow="hidden">
                {visibleLines.map((line) => (
                  <Box key={line.id} height={1} overflow="hidden">
                    {line.node}
                  </Box>
                ))}
                {Array.from({ length: Math.max(0, feedHeight - visibleLines.length) }).map((_, idx) => (
                  <Box key={`feed_pad_${idx}`} height={1} overflow="hidden">
                    <Text backgroundColor={theme.bg}>{" ".repeat(leftWidth)}</Text>
                  </Box>
                ))}
              </Box>
            </Box>

            {isSplitLayout && (
              <DiffColumn
                width={rightWidth}
                height={workspaceHeight}
                lines={visibleRightLines}
              />
            )}
          </>
        )}
      </Box>

      <StatusBar
        status={status}
        stepCount={stepCount}
        maxSteps={maxSteps}
        usage={usage}
        elapsedSeconds={elapsedSeconds}
        width={terminalWidth}
        scrollOffset={scrollOffset}
      />

      <InputBox
        onSubmit={executeTask}
        isDisabled={status === "running" || isModelSelectorOpen}
        disabledMessage={
          isModelSelectorOpen
            ? "selecting model... (use [↑/↓] to navigate, [enter] to select, [esc] to cancel)"
            : undefined
        }
        history={promptHistory}
        width={terminalWidth}
      />
    </Box>
  );
}
