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

export interface BuildFeedOptions {
  threads: Thread[];
  leftWidth: number;
  feedHeight: number;
  maxLineWidth: number;
  expandedThinkingIds?: Set<string>;
  collapsedThinkingIds?: Set<string>;
  matrixQuote?: string;
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
    return "morpheus is locked in...";
  }

  const rawMs = step.isRunning
    ? (step.startTime ? Date.now() - step.startTime : (step.durationMs || 0))
    : (step.durationMs || 0);
  const sec = (rawMs / 1000).toFixed(1);
  const timeSuffix = step.isRunning ? ` (${sec}s)...` : ` (${sec}s)`;

  if (step.type === "thinking") {
    return `overclocking neural net${timeSuffix}`;
  }

  const name = step.name || "";
  const args = step.args || {};

  switch (name) {
    case "grep_code":
    case "grepCode": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const cleanPat = pattern.length > 20 ? `${pattern.slice(0, 18)}…` : pattern;
      return cleanPat
        ? `sweeping matrix for "${cleanPat}"${timeSuffix}`
        : `sweeping codebase${timeSuffix}`;
    }

    case "read_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `jacking into: ${cleanFp}${timeSuffix}`
        : `decrypting construct${timeSuffix}`;
    }

    case "write_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `synthesizing: ${cleanFp}${timeSuffix}`
        : `synthesizing construct${timeSuffix}`;
    }

    case "edit_file": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 26 ? `${fp.slice(0, 24)}…` : fp;
      return cleanFp
        ? `rewiring construct: ${cleanFp}${timeSuffix}`
        : `patching construct${timeSuffix}`;
    }

    case "bash": {
      let cmd = typeof args.command === "string" ? args.command.trim() : "";
      if (cmd.startsWith(`cd ${cwd} && `)) cmd = cmd.slice(`cd ${cwd} && `.length);
      else if (cmd.startsWith(`cd "${cwd}" && `)) cmd = cmd.slice(`cd "${cwd}" && `.length);
      const cleanCmd = cmd.length > 24 ? `${cmd.slice(0, 22)}…` : cmd;
      return cleanCmd
        ? `breaching shell: ${cleanCmd}${timeSuffix}`
        : `executing payload${timeSuffix}`;
    }

    case "list_dir":
    case "listDir": {
      const dp = typeof args.dirPath === "string" ? toRel(args.dirPath, cwd) : "";
      const cleanDp = dp.length > 24 ? `${dp.slice(0, 22)}…` : dp;
      return cleanDp
        ? `mapping perimeter: ${cleanDp}${timeSuffix}`
        : `mapping construct perimeter${timeSuffix}`;
    }

    case "outline_code":
    case "outlineCode": {
      const fp = typeof args.filePath === "string" ? toRel(args.filePath, cwd) : "";
      const cleanFp = fp.length > 24 ? `${fp.slice(0, 22)}…` : fp;
      return cleanFp
        ? `deconstructing ast: ${cleanFp}${timeSuffix}`
        : `analyzing neural symbols${timeSuffix}`;
    }

    case "http_request": {
      const url = typeof args.url === "string" ? args.url : "";
      const cleanUrl = url.length > 24 ? `${url.slice(0, 22)}…` : url;
      return cleanUrl
        ? `uplink ping: ${cleanUrl}${timeSuffix}`
        : `tapping external uplink${timeSuffix}`;
    }

    case "load_skill": {
      const skillName = typeof args.name === "string" ? args.name : "";
      return skillName
        ? `loading combat playbook: ${skillName}${timeSuffix}`
        : `downloading skill construct${timeSuffix}`;
    }

    case "record_finding": {
      const topic = typeof args.topic === "string" ? args.topic : "";
      const cleanTopic = topic.length > 22 ? `${topic.slice(0, 20)}…` : topic;
      return cleanTopic
        ? `logging intel: ${cleanTopic}${timeSuffix}`
        : `archiving construct intel${timeSuffix}`;
    }

    default: {
      return `running ${name || "action"}${timeSuffix}`;
    }
  }
}

export function buildThreadFeedLines({
  threads,
  leftWidth,
  feedHeight,
  maxLineWidth,
  expandedThinkingIds,
  collapsedThinkingIds,
  matrixQuote,
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

    const thinkingSteps = thread.steps.filter((s) => s.type === "thinking");
    const activeToolStep = thread.steps.find((s) => s.type === "tool" && s.isRunning);
    const hasFollowingContent =
      thinkingSteps.length > 0 ||
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

    thinkingSteps.forEach((tStep) => {
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
        const label = getCoolActionLabel(tStep);
        const visLen = 2 + 5 + label.length;
        const pad = Math.max(0, leftWidth - visLen);
        lines.push({
          id: `${tStep.id}_think_hdr`,
          threadId: thread.id,
          stepId: tStep.id,
          node: (
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              {"  "}
              <CyberPulse />
              <Text color={theme.accentBright} italic>
                {label}
              </Text>
              {" ".repeat(pad)}
            </Text>
          ),
        });
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

    if (activeToolStep) {
      const label = getCoolActionLabel(activeToolStep);
      const visLen = 2 + 5 + label.length;
      const pad = Math.max(0, leftWidth - visLen);
      lines.push({
        id: `${activeToolStep.id}_tool_running`,
        threadId: thread.id,
        stepId: activeToolStep.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            {"  "}
            <CyberPulse />
            <Text color={theme.accentBright} italic>
              {label}
            </Text>
            {" ".repeat(pad)}
          </Text>
        ),
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
    } else if (
      thread.status === "running" &&
      !activeToolStep &&
      !thinkingSteps.some((s) => s.isRunning) &&
      !thread.response &&
      !thread.isStreaming
    ) {
      const runningLabel =
        thread.steps.length === 0
          ? "morpheus is locked in..."
          : "synthesizing next move...";
      const visLen = 2 + 5 + runningLabel.length;
      const pad = Math.max(0, leftWidth - visLen);
      lines.push({
        id: `${thread.id}_thinking_indicator`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            {"  "}
            <CyberPulse />
            <Text color={theme.secondary} italic>
              {runningLabel}
            </Text>
            {" ".repeat(pad)}
          </Text>
        ),
      });
    } else if (thread.response || thread.isStreaming) {
      if (thinkingSteps.length > 0) {
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
