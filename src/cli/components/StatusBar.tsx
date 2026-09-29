import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TokenUsage } from "../../core/types";
import { theme } from "../theme";
import { glyphs } from "../glyphs";

export interface StatusBarProps {
  status: "idle" | "running" | "aborted" | "error";
  stepCount: number;
  maxSteps?: number;
  usage?: TokenUsage;
  elapsedSeconds: number;
  isThinkingExpanded?: boolean;
  width?: number;
  scrollOffset?: number;
  queueCount?: number;
}

export function StatusBar({
  status,
  stepCount,
  maxSteps = 25,
  usage,
  elapsedSeconds,
  width: customWidth,
  scrollOffset = 0,
  queueCount = 0,
}: StatusBarProps) {
  const width = customWidth ?? Math.max(40, process.stdout.columns ? process.stdout.columns - 2 : 76);

  const mins = Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (elapsedSeconds % 60).toString().padStart(2, "0");
  const timeStr = `${mins}:${secs}`;

  const peakCtx = usage?.peakContextTokens
    ? `${(usage.peakContextTokens / 1000).toFixed(1)}k`
    : "0k";
  const limitCtx = usage?.contextLimit
    ? `${Math.round(usage.contextLimit / 1000)}k`
    : "128k";
  const totalTokens = usage?.totalTokens
    ? `${(usage.totalTokens / 1000).toFixed(0)}k`
    : "0k";

  const statusLabel =
    status === "running"
      ? "RUNNING"
      : status === "aborted"
      ? `${glyphs.bullet} STOPPED`
      : status === "error"
      ? `${glyphs.error} ERROR`
      : `${glyphs.bullet} READY`;

  const queueStr = queueCount > 0 ? ` · ⏳ ${queueCount} queued` : "";
  const metricsStr = ` · ${glyphs.clock} ${timeStr} · step ${stepCount}/${maxSteps} · ctx ${peakCtx}/${limitCtx} · api ${totalTokens}${queueStr}`;
  const scrollStr = scrollOffset > 0 ? ` · ${glyphs.arrowUp} +${scrollOffset}` : "";
  const hintStr =
    scrollOffset > 0
      ? "[end] bottom · [esc] stop"
      : status === "running"
      ? "/command · type prompt to queue · [esc] stop"
      : "/model switch · [esc] stop · [ctrl+c] exit";

  const leftLen =
    (status === "running" ? 2 : 0) +
    statusLabel.length +
    metricsStr.length +
    scrollStr.length;
  const padBetween = Math.max(1, width - leftLen - hintStr.length);

  return (
    <Box flexDirection="column" width={width} height={2} overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text backgroundColor={theme.bg} color={theme.border}>
          {"─".repeat(width)}
        </Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          {status === "running" ? (
            <Text color={theme.accentBright}>
              <Spinner type="dots" /> <Text bold>{statusLabel}</Text>
            </Text>
          ) : status === "aborted" ? (
            <Text color={theme.accent}>{statusLabel}</Text>
          ) : status === "error" ? (
            <Text color={theme.diffRemove}>{statusLabel}</Text>
          ) : (
            <Text color={theme.muted}>{statusLabel}</Text>
          )}

          <Text color={theme.secondary}>{metricsStr}</Text>

          {scrollOffset > 0 && (
            <Text color={theme.accent} bold>
              {scrollStr}
            </Text>
          )}

          {" ".repeat(padBetween)}
          <Text color={theme.muted}>{hintStr}</Text>
        </Text>
      </Box>
    </Box>
  );
}
