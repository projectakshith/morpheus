import React from "react";
import path from "node:path";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FeedLine, Thread, ThreadStep } from "../types.js";
import { MarkdownFormatter } from "../format.js";
import { wrapLine, visibleLength } from "../utils/text.js";
import { buildHeroFeedLines } from "./MatrixIntro.js";
import { CyberPulse } from "./CyberPulse.js";
import { theme } from "../theme.js";
import { glyphs } from "../glyphs.js";
import { applyTrail } from "../effects/streamReveal.js";

export interface BuildFeedOptions {
  threads: Thread[];
  leftWidth: number;
  feedHeight: number;
  maxLineWidth: number;
  expandedThinkingIds?: Set<string>;
  collapsedThinkingIds?: Set<string>;
  matrixQuote?: string;
  elapsedSeconds?: number;
  streamReveal?: {
    threadId: string;
    text: string;
    glow: number;
    random?: () => number;
  };
}

function toRel(filePath: string, cwd: string = process.cwd()): string {
  if (path.isAbsolute(filePath)) {
    const rel = path.relative(cwd, filePath);
    return rel.startsWith("..") ? filePath : rel;
  }
  return filePath;
}

export function getCoolActionLabel(step?: ThreadStep, cwd: string = process.cwd()): string {
  if (!step) {
    return "cooking...";
  }

  const rawMs = step.isRunning
    ? (step.startTime ? Date.now() - step.startTime : (step.durationMs || 0))
    : (step.durationMs || 0);
  const sec = (rawMs / 1000).toFixed(1);
  const timeSuffix = step.isRunning ? ` (${sec}s)...` : ` (${sec}s)`;

  if (step.type === "thinking") {
    return `thinking rn${timeSuffix}`;
  }

  const name = step.name || "";
  const args = step.args || {};

  switch (name) {
    case "grep_code":
    case "grepCode": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const cleanPat = pattern.length > 20 ? `${pattern.slice(0, 18)}…` : pattern;
      return cleanPat
        ? `searching for "${cleanPat}"${timeSuffix}`
        : `searching code${timeSuffix}`;
    }

    case "read_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `reading: ${cleanFp}${timeSuffix}`
        : `reading file${timeSuffix}`;
    }

    case "write_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `writing: ${cleanFp}${timeSuffix}`
        : `writing file${timeSuffix}`;
    }

    case "edit_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `editing: ${cleanFp}${timeSuffix}`
        : `editing file${timeSuffix}`;
    }

    case "bash": {
      let cmd = typeof args.command === "string" ? args.command.trim() : "";
      if (cmd.startsWith(`cd ${cwd} && `)) cmd = cmd.slice(`cd ${cwd} && `.length);
      else if (cmd.startsWith(`cd "${cwd}" && `)) cmd = cmd.slice(`cd "${cwd}" && `.length);
      const cleanCmd = cmd.length > 24 ? `${cmd.slice(0, 22)}…` : cmd;
      return cleanCmd
        ? `running: ${cleanCmd}${timeSuffix}`
        : `running command${timeSuffix}`;
    }

    case "list_dir":
    case "listDir": {
      const dp = typeof args.dirPath === "string" ? toRel(args.dirPath, cwd) : "";
      const cleanDp = dp.length > 24 ? `${dp.slice(0, 22)}…` : dp;
      return cleanDp
        ? `looking through: ${cleanDp}${timeSuffix}`
        : `checking folders${timeSuffix}`;
    }

    case "outline_code":
    case "outlineCode": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 24 ? `${fp.slice(0, 22)}…` : fp;
      return cleanFp
        ? `peeking at: ${cleanFp}${timeSuffix}`
        : `inspecting code${timeSuffix}`;
    }

    case "http_request": {
      const url = typeof args.url === "string" ? args.url : "";
      const cleanUrl = url.length > 24 ? `${url.slice(0, 22)}…` : url;
      return cleanUrl
        ? `pinging: ${cleanUrl}${timeSuffix}`
        : `pinging link${timeSuffix}`;
    }

    case "load_skill": {
      const skillName = typeof args.name === "string" ? args.name : "";
      return skillName
        ? `loading: ${skillName}${timeSuffix}`
        : `loading skill${timeSuffix}`;
    }

    case "record_finding": {
      const topic = typeof args.topic === "string" ? args.topic : "";
      const cleanTopic = topic.length > 22 ? `${topic.slice(0, 20)}…` : topic;
      return cleanTopic
        ? `noting down: ${cleanTopic}${timeSuffix}`
        : `taking notes${timeSuffix}`;
    }

    default: {
      return `running: ${name || "something"}${timeSuffix}`;
    }
  }
}

function pushNoteLines(
  lines: FeedLine[],
  threadId: string,
  step: ThreadStep,
  withSpacer: boolean,
  leftWidth: number,
  maxLineWidth: number
): void {
  if (withSpacer) {
    lines.push({
      id: `${step.id}_note_spacer`,
      threadId,
      stepId: step.id,
      node: <Text backgroundColor={theme.bg}>{" ".repeat(leftWidth)}</Text>,
    });
  }

  const formatter = new MarkdownFormatter();
  const formatted = [
    ...(step.content || "").split("\n").flatMap((raw) => formatter.processLine(raw)),
    ...formatter.flush(),
  ];
  const wrapped = formatted.flatMap((line) => wrapLine(line, Math.max(10, maxLineWidth - 2)));

  wrapped.forEach((wLine, idx) => {
    const prefix = idx === 0 ? "  › " : "    ";
    const pad = Math.max(0, leftWidth - prefix.length - visibleLength(wLine));
    lines.push({
      id: `${step.id}_note_${idx}`,
      threadId,
      stepId: step.id,
      node: (
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accent}>{prefix}</Text>
          <Text color={theme.secondary}>{wLine}</Text>
          {" ".repeat(pad)}
        </Text>
      ),
    });
  });
}

export function buildThreadFeedLines({
  threads,
  leftWidth,
  feedHeight,
  maxLineWidth,
  expandedThinkingIds,
  collapsedThinkingIds,
  matrixQuote,
  streamReveal,
}: BuildFeedOptions): FeedLine[] {
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
        <Text backgroundColor={theme.bgUser} wrap="truncate-end">
          <Text color={theme.accent}>{glyphs.prompt} </Text>
          <Text color={theme.secondary} bold>
            you
          </Text>
          {" ".repeat(Math.max(0, leftWidth - 6))}
        </Text>
      ),
    });

    const promptLines = thread.prompt.split("\n");
    promptLines.forEach((pLine) => {
      const wrapped = wrapLine(pLine, maxLineWidth);
      wrapped.forEach((wLine) => {
        const visLen = 2 + visibleLength(wLine);
        const pad = Math.max(0, leftWidth - visLen);
        lines.push({
          id: `${thread.id}_prompt_${lines.length}`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bgUser} wrap="truncate-end">
              <Text color={theme.text} bold>  {wLine}</Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });
      });
    });

    const timelineSteps = thread.steps.filter((s) => s.type === "thinking" || s.type === "note");
    const activeToolStep = thread.steps.find((s) => s.type === "tool" && s.isRunning);
    const hasFollowingContent =
      timelineSteps.length > 0 ||
      Boolean(activeToolStep) ||
      Boolean(thread.response) ||
      Boolean(thread.isStreaming) ||
      thread.status === "running" ||
      thread.status === "queued";

    if (hasFollowingContent) {
      lines.push({
        id: `${thread.id}_prompt_spacer`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg}>
            {" ".repeat(leftWidth)}
          </Text>
        ),
      });
    }

    timelineSteps.forEach((tStep, stepIdx) => {
      if (tStep.type === "note") {
        pushNoteLines(lines, thread.id, tStep, stepIdx > 0, leftWidth, maxLineWidth);
        return;
      }

      const isExpanded = expandedThinkingIds
        ? expandedThinkingIds.has(tStep.id)
        : collapsedThinkingIds
        ? !collapsedThinkingIds.has(tStep.id)
        : false;

      const rawMs = tStep.isRunning
        ? (tStep.startTime ? Date.now() - tStep.startTime : (tStep.durationMs || 0))
        : (tStep.durationMs || 0);
      const sec = (rawMs / 1000).toFixed(1);

      if (tStep.isRunning) {
        return;
      }

      if (!isExpanded) {
        let glimpse = "";
        if (tStep.content) {
          const firstLine = tStep.content
            .trim()
            .split("\n")[0]
            ?.replace(/^#+\s*/, "")
            ?.replace(/[`*_]/g, "")
            ?.trim();
          if (firstLine) {
            glimpse = firstLine.length > 28 ? `${firstLine.slice(0, 27)}…` : firstLine;
          }
        }

        const tag = `  ◇ thought (${sec}s)`;
        const glimpsePart = glimpse ? ` · "${glimpse}"` : "";
        const togglePart = " [+]";
        const visLen = tag.length + glimpsePart.length + togglePart.length;
        const pad = Math.max(0, leftWidth - visLen);

        lines.push({
          id: `${tStep.id}_think_hdr`,
          threadId: thread.id,
          stepId: tStep.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.muted}>{tag}</Text>
              {glimpse ? (
                <Text color={theme.muted} italic>{glimpsePart}</Text>
              ) : null}
              <Text color={theme.border}>{togglePart}</Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });
      } else {
        const tag = `  ◆ thought (${sec}s)`;
        const togglePart = " [-]";
        const visLen = tag.length + togglePart.length;
        const pad = Math.max(0, leftWidth - visLen);

        lines.push({
          id: `${tStep.id}_think_hdr`,
          threadId: thread.id,
          stepId: tStep.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.secondary}>{tag}</Text>
              <Text color={theme.accent}>{togglePart}</Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });

        if (tStep.content) {
          const rawThinkLines = tStep.content.trim().split("\n");
          const cappedLines = rawThinkLines.slice(-12);
          const hiddenCount = rawThinkLines.length - cappedLines.length;

          if (hiddenCount > 0) {
            const hidText = `  │ ... [${hiddenCount} earlier lines hidden]`;
            const padHid = Math.max(0, leftWidth - hidText.length);
            lines.push({
              id: `${tStep.id}_think_hidden`,
              threadId: thread.id,
              stepId: tStep.id,
              node: (
                <Text backgroundColor={theme.bg} wrap="truncate-end">
                  <Text color={theme.borderSubtle}>{hidText}</Text>
                  {" ".repeat(padHid)}
                </Text>
              ),
            });
          }

          cappedLines.forEach((rLine) => {
            const wrapped = wrapLine(rLine, maxLineWidth);
            wrapped.forEach((wLine) => {
              const visLen = 4 + visibleLength(wLine);
              const padLine = Math.max(0, leftWidth - visLen);
              lines.push({
                id: `${tStep.id}_think_${lines.length}`,
                threadId: thread.id,
                stepId: tStep.id,
                node: (
                  <Text backgroundColor={theme.bg} wrap="truncate-end">
                    <Text color={theme.borderSubtle}>  │ </Text>
                    <Text color={theme.muted} italic>
                      {wLine}
                    </Text>
                    {" ".repeat(padLine)}
                  </Text>
                ),
              });
            });
          });

          lines.push({
            id: `${tStep.id}_think_footer`,
            threadId: thread.id,
            stepId: tStep.id,
            node: (
              <Text backgroundColor={theme.bg} wrap="truncate-end">
                <Text color={theme.borderSubtle}>  └</Text>
                {" ".repeat(Math.max(0, leftWidth - 3))}
              </Text>
            ),
          });
        }
      }
    });

    if (thread.response || thread.isStreaming) {
      if (timelineSteps.length > 0) {
        lines.push({
          id: `${thread.id}_asst_spacer`,
          threadId: thread.id,
          node: (
            <Text backgroundColor={theme.bg}>
              {" ".repeat(leftWidth)}
            </Text>
          ),
        });
      }

      const asstHdr = "▰ morpheus";
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

      const reveal = streamReveal?.threadId === thread.id ? streamReveal : undefined;
      const formatter = new MarkdownFormatter();
      const rawLines = (reveal ? reveal.text : thread.response).split("\n");
      const formattedLines: string[] = [];
      for (const raw of rawLines) {
        formattedLines.push(...formatter.processLine(raw));
      }
      formattedLines.push(...formatter.flush());

      const wrappedLines = formattedLines.flatMap((mLine) => wrapLine(mLine, maxLineWidth));
      if (reveal && reveal.glow > 0) {
        let tail = wrappedLines.length - 1;
        while (tail > 0 && visibleLength(wrappedLines[tail]) === 0) tail--;
        if (tail >= 0) {
          wrappedLines[tail] = applyTrail(wrappedLines[tail], reveal.glow, {
            deep: theme.accent,
            bright: theme.accentBright,
            settled: theme.text,
          }, { scramble: reveal.random ?? Math.random });
        }
      }

      wrappedLines.forEach((wLine) => {
        const vis = visibleLength(wLine);
        if (vis === 0) {
          lines.push({
            id: `${thread.id}_asst_line_${lines.length}`,
            threadId: thread.id,
            node: (
              <Text backgroundColor={theme.bg}>
                {" ".repeat(leftWidth)}
              </Text>
            ),
          });
          return;
        }
        const visLen = 2 + vis;
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
    }

    if (thread.status === "queued") {
      lines.push({
        id: `${thread.id}_queued_line`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.warning}>  [queued behind active task · waiting for turn]</Text>
            {" ".repeat(Math.max(0, leftWidth - 50))}
          </Text>
        ),
      });
    } else if (thread.status === "running") {
      const activeToolStep = thread.steps.find((s) => s.type === "tool" && s.isRunning);
      const activeThinkingStep = thread.steps.find((s) => s.type === "thinking" && s.isRunning);
      const rawSec = ((Date.now() - (thread.startTime || Date.now())) / 1000).toFixed(1);

      let activeLabel = "";
      if (activeToolStep) {
        activeLabel = getCoolActionLabel(activeToolStep);
      } else if (activeThinkingStep) {
        activeLabel = getCoolActionLabel(activeThinkingStep);
      } else if (thread.isStreaming) {
        activeLabel = `typing it out (${rawSec}s)...`;
      } else if (thread.steps.length === 0) {
        activeLabel = thread.stepCount && thread.stepCount > 1
          ? `thinking rn (${rawSec}s)...`
          : `cooking (${rawSec}s)...`;
      } else {
        activeLabel = `working on it (${rawSec}s)...`;
      }

      const visLen = 2 + 5 + activeLabel.length;
      const pad = Math.max(0, leftWidth - visLen);
      const lineId = (thread.response || thread.isStreaming)
        ? `${thread.id}_asst_running_pulse`
        : `${thread.id}_thinking_indicator`;

      lines.push({
        id: lineId,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            {"  "}
            <CyberPulse />
            <Text color={theme.accentBright} italic>
              {activeLabel}
            </Text>
            {" ".repeat(pad)}
          </Text>
        ),
      });
    }

    if (tIdx < threads.length - 1) {
      lines.push({
        id: `${thread.id}_spacer_1`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg}>
            {" ".repeat(leftWidth)}
          </Text>
        ),
      });
      const sep = "  " + "─".repeat(Math.max(4, leftWidth - 4));
      lines.push({
        id: `${thread.id}_turn_divider`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.borderSubtle}>{sep}</Text>
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
}
