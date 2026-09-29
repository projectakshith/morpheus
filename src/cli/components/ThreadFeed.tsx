import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FeedLine, Thread } from "../types.js";
import { MarkdownFormatter } from "../format.js";
import { wrapLine } from "../utils/text.js";
import { buildHeroFeedLines } from "./MatrixIntro.js";
import { CyberPulse } from "./CyberPulse.js";
import { theme } from "../theme.js";

export interface BuildFeedOptions {
  threads: Thread[];
  leftWidth: number;
  feedHeight: number;
  maxLineWidth: number;
  expandedThinkingIds?: Set<string>;
  collapsedThinkingIds?: Set<string>;
  matrixQuote?: string;
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
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accent}>❯ </Text>
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
    const hasFollowingContent =
      thinkingSteps.length > 0 ||
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
        const label = `thinking (${sec}s)...`;
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
              <Text color={theme.secondary} italic>
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
          rawThinkLines.forEach((rLine) => {
            const wrapped = wrapLine(rLine, maxLineWidth);
            wrapped.forEach((wLine) => {
              const visLen = 4 + wLine.length;
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
        }
      }
    });

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
      thread.steps.length === 0 &&
      !thread.response &&
      !thread.isStreaming
    ) {
      const runningLabel = "morpheus is thinking...";
      const pad = Math.max(0, leftWidth - runningLabel.length - 8);
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
