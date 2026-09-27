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

function buildFullScreenIntro(width: number, height: number): FeedLine[] {
  const W = Math.max(40, width);
  const H = Math.max(12, height);
  const hasInnerGrid = W >= 68;
  const colL = Math.max(4, Math.floor(W * 0.16));
  const colR = Math.min(W - 5, Math.floor(W * 0.84));

  const borderCol: [number, number, number] = [70, 95, 60];
  const gridCol: [number, number, number] = [48, 65, 42];
  const honeyBeige: [number, number, number] = [245, 212, 181];
  const eggLiqueur: [number, number, number] = [218, 204, 167];
  const sapBright: [number, number, number] = [152, 217, 118];
  const sapMuted: [number, number, number] = [115, 158, 90];
  const mutedText: [number, number, number] = [135, 148, 125];

  const textOverlays: Array<{ y: number; x: number; text: string; fg: [number, number, number]; bold?: boolean }> = [];

  textOverlays.push({ y: 0, x: 4, text: " 2K26 ", fg: eggLiqueur, bold: true });
  const sysTag = " [SYS.01 // MORPHEUS] ";
  textOverlays.push({ y: 0, x: W - sysTag.length - 4, text: sysTag, fg: sapBright, bold: false });

  if (H >= 14) {
    textOverlays.push({ y: 1, x: 3, text: "CREATIVE HARNESS · ID 01", fg: eggLiqueur, bold: false });
    const right1 = "82% ENG RETURN · C03/S4/0028";
    if (W > 70) {
      textOverlays.push({ y: 1, x: W - right1.length - 3, text: right1, fg: mutedText, bold: false });
    }

    textOverlays.push({ y: 2, x: 3, text: "ATMOSPHERE: SAP GREEN · 46°02'N 14°30'E", fg: mutedText, bold: false });
    const pill = "( FIELD TESTED )";
    if (W > 60) {
      textOverlays.push({ y: 2, x: W - pill.length - 3, text: pill, fg: sapBright, bold: true });
    }
  }

  const midY1 = Math.floor(H * 0.42);
  const disc = "· · ·   D I S C O V E R Y   · · ·";
  if (midY1 > 4 && midY1 < H - 7) {
    const dX = Math.floor((W - disc.length) / 2);
    textOverlays.push({ y: midY1, x: dX, text: disc, fg: eggLiqueur, bold: false });
    if (W >= 60) {
      textOverlays.push({ y: midY1, x: 4, text: "<<<<<", fg: sapMuted, bold: false });
      textOverlays.push({ y: midY1, x: W - 9, text: ">>>>>", fg: sapMuted, bold: false });
    }
  }

  const midY2 = Math.floor(H * 0.54);
  if (midY2 > midY1 && midY2 < H - 7 && W >= 60) {
    textOverlays.push({ y: midY2, x: colL + 3, text: "[ 14.8 ]", fg: sapBright, bold: true });
    const hud = "00  □  00";
    textOverlays.push({ y: midY2, x: Math.floor((W - hud.length) / 2), text: hud, fg: mutedText, bold: false });
    const spec = "TRX-7 / A21-MX22";
    if (W > 75) {
      textOverlays.push({ y: midY2, x: colR - spec.length - 3, text: spec, fg: mutedText, bold: false });
    }
  }

  const titleY = H - 5;
  const title = W >= 60 ? "M   O   R   P   H   E   U   S" : "M O R P H E U S";
  textOverlays.push({ y: titleY, x: Math.floor((W - title.length) / 2), text: title, fg: honeyBeige, bold: true });

  const subY = H - 4;
  const sub = "a g e n t i c   h a r n e s s";
  textOverlays.push({ y: subY, x: Math.floor((W - sub.length) / 2), text: sub, fg: sapBright, bold: false });

  const capY = H - 3;
  const cap = W >= 70
    ? "DEEP REASONING · REAL-TIME DIFF STREAM · CONTEXT SAFETY"
    : "REASONING · DIFF STREAM · SAFETY";
  textOverlays.push({ y: capY, x: Math.floor((W - cap.length) / 2), text: cap, fg: mutedText, bold: false });

  const hintY = H - 2;
  const hint = "[ READY ]  ask a question or describe a task below  ·  [esc] stop";
  const hintShort = "[ READY ]  ask a question or describe a task below";
  const hintText = W >= hint.length + 6 ? hint : hintShort;
  textOverlays.push({ y: hintY, x: Math.floor((W - hintText.length) / 2), text: hintText, fg: eggLiqueur, bold: false });

  const botTag = " archive // morpheus ";
  textOverlays.push({ y: H - 1, x: 4, text: " C03/S4/0028 ", fg: mutedText, bold: false });
  textOverlays.push({ y: H - 1, x: W - botTag.length - 4, text: botTag, fg: mutedText, bold: false });

  const lines: FeedLine[] = [];

  for (let y = 0; y < H; y++) {
    const t = y / Math.max(1, H - 1);
    const lineChars: Array<{ ch: string; fg: [number, number, number]; bold?: boolean; isLocked?: boolean }> = [];

    for (let x = 0; x < W; x++) {
      let ch = " ";
      let fg: [number, number, number] = borderCol;
      let bold = false;

      if (y === 0) {
        if (x === 0) ch = "┌";
        else if (x === W - 1) ch = "┐";
        else if (hasInnerGrid && (x === colL || x === colR)) ch = "┬";
        else ch = "─";
        fg = borderCol;
      } else if (y === H - 1) {
        if (x === 0) ch = "└";
        else if (x === W - 1) ch = "┘";
        else if (hasInnerGrid && (x === colL || x === colR)) ch = "┴";
        else ch = "─";
        fg = borderCol;
      } else if ((H >= 14 && y === 3) || y === H - 6) {
        if (x === 0) ch = "├";
        else if (x === W - 1) ch = "┤";
        else if (hasInnerGrid && (x === colL || x === colR)) ch = "┼";
        else ch = "─";
        fg = borderCol;
      } else if (x === 0 || x === W - 1) {
        ch = "│";
        fg = borderCol;
      } else if (hasInnerGrid && y < H - 6 && (x === colL || x === colR)) {
        ch = "│";
        fg = gridCol;
      }

      lineChars.push({ ch, fg, bold });
    }

    const onLine = textOverlays.filter((o) => o.y === y);
    for (const item of onLine) {
      let text = item.text;
      const isFrame = y === 0 || y === H - 1;
      const minX = isFrame ? 1 : 2;
      const maxX = isFrame ? W - 2 : W - 3;
      const maxLen = maxX - minX + 1;
      if (text.length > maxLen) {
        text = text.slice(0, maxLen);
      }
      const actualX = Math.max(minX, Math.min(maxX - text.length + 1, item.x));
      for (let i = 0; i < text.length; i++) {
        const targetX = actualX + i;
        if (targetX >= minX && targetX <= maxX) {
          lineChars[targetX] = {
            ch: text[i],
            fg: item.fg,
            bold: item.bold,
            isLocked: true,
          };
        }
      }
    }

    let line = "";
    for (let x = 0; x < W; x++) {
      const wave =
        Math.sin(x * 0.28 + y * 0.2) * 0.05 +
        Math.sin(x * 0.11 - y * 0.15) * 0.04;
      const grain = heroNoise(x, y) - 0.5;
      const localT = Math.max(0, Math.min(1, t + wave));
      const [r, g, b] = getHeroColor(localT);

      const noiseAmp = 12 * Math.sin(t * Math.PI);
      const gr = clampColor(r + grain * noiseAmp);
      const gg = clampColor(g + grain * noiseAmp);
      const gb = clampColor(b + grain * noiseAmp);

      const item = lineChars[x];
      let ch = item.ch;
      let fgr = item.fg[0];
      let fgg = item.fg[1];
      let fgb = item.fg[2];

      if (ch === " " && !item.isLocked) {
        const charIdx = Math.floor(Math.abs(grain) * HERO_DITHERS.length) % HERO_DITHERS.length;
        ch = (t > 0.12 && y < H - 6) ? HERO_DITHERS[charIdx] : " ";
        fgr = clampColor(gr + 26);
        fgg = clampColor(gg + 20);
        fgb = clampColor(gb + 14);
      }

      const boldCode = item.bold ? ";1" : "";
      line += `\x1b[48;2;${gr};${gg};${gb}m\x1b[38;2;${fgr};${fgg};${fgb}${boldCode}m${ch}`;
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

function buildHeroFeedLines(width: number, totalLines: number): FeedLine[] {
  const safeWidth = Math.max(20, width - 2);
  const safeLines = Math.max(6, totalLines);

  const title = safeWidth >= 40 ? "M  O  R  P  H  E  U  S" : "MORPHEUS";
  const sub = "a g e n t i c   h a r n e s s";
  const hint =
    safeWidth >= 45
      ? "ask a question or describe a task below"
      : "enter a prompt below";

  const textMap: Record<number, [string, [number, number, number], boolean]> = {};

  if (safeLines >= 10) {
    textMap[1] = ["·  2 0 2 6  ·", [22, 20, 21], true];
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
  }, [leftWidth, isSplitLayout]);

  useInput((input, key) => {
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
        model,
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
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: "error",
                isStreaming: false,
                response: `Error: ${err instanceof Error ? err.message : String(err)}`,
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
    lines.push(...buildHeroFeedLines(leftWidth, heroHeight));

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

  const isIntroMode = threads.length === 0;

  const introLines = useMemo(() => {
    return buildFullScreenIntro(terminalWidth, workspaceHeight);
  }, [terminalWidth, workspaceHeight]);

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      <Header
        version={MORPHEUS_VERSION}
        model={model}
        branch={baseContext.current.branch}
        gitStatus={baseContext.current.gitStatus}
        width={terminalWidth}
      />

      {isIntroMode ? (
        <Box
          flexDirection="column"
          width={terminalWidth}
          height={workspaceHeight}
          overflow="hidden"
        >
          {introLines.map((line) => (
            <Box key={line.id} height={1} overflow="hidden">
              {line.node}
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="row" width={terminalWidth} height={workspaceHeight} overflow="hidden">
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
        </Box>
      )}

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
        isDisabled={status === "running"}
        history={promptHistory}
        width={terminalWidth}
      />
    </Box>
  );
}
