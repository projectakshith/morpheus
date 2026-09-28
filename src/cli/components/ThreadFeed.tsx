import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FeedLine, Thread } from "../types.js";
import { MarkdownFormatter } from "../format.js";
import { wrapLine } from "../utils/text.js";
import { buildHeroFeedLines } from "./MatrixIntro.js";
import { theme } from "../theme.js";

export interface BuildFeedOptions {
  threads: Thread[];
  leftWidth: number;
  feedHeight: number;
  maxLineWidth: number;
  collapsedThinkingIds: Set<string>;
  matrixQuote?: string;
}

export function buildThreadFeedLines({
  threads,
  leftWidth,
  feedHeight,
  maxLineWidth,
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

    if (thread.status === "queued") {
      lines.push({
        id: `${thread.id}_queued_line`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.warning}>  ⏳ [queued behind active task · waiting for turn]</Text>
            {" ".repeat(Math.max(0, leftWidth - 52))}
          </Text>
        ),
      });
    } else if (thread.response || thread.isStreaming) {
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
}
