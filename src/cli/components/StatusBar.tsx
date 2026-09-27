import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TokenUsage } from "../../core/types";

export interface StatusBarProps {
  status: "idle" | "running" | "aborted" | "error";
  stepCount: number;
  maxSteps?: number;
  usage?: TokenUsage;
  elapsedSeconds: number;
  isThinkingExpanded?: boolean;
  width?: number;
  scrollOffset?: number;
}

/* Minimalist Vercel-style telemetry status bar with thin divider */
export function StatusBar({
  status,
  stepCount,
  maxSteps = 25,
  usage,
  elapsedSeconds,
  isThinkingExpanded = false,
  width: customWidth,
  scrollOffset = 0,
}: StatusBarProps) {
  const width = customWidth ?? Math.max(40, process.stdout.columns ? process.stdout.columns - 2 : 76);

  /* Format elapsed time as mm:ss */
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

  return (
    <Box flexDirection="column">
      <Text color="gray">{"─".repeat(width)}</Text>
      <Box justifyContent="space-between">
        <Box>
          {status === "running" ? (
            <Text color="greenBright">
              <Spinner type="dots" /> <Text bold>RUNNING</Text>
            </Text>
          ) : status === "aborted" ? (
            <Text color="yellow">● STOPPED</Text>
          ) : status === "error" ? (
            <Text color="red">● ERROR</Text>
          ) : (
            <Text color="gray">● READY</Text>
          )}

          <Text color="gray"> · </Text>
          <Text color="white">{timeStr}</Text>
          <Text color="gray"> · step </Text>
          <Text color="white">
            {stepCount}/{maxSteps}
          </Text>
          <Text color="gray"> · ctx </Text>
          <Text color="cyan">{peakCtx}</Text>
          <Text color="gray">/{limitCtx}</Text>
          <Text color="gray"> · api </Text>
          <Text color="white">{totalTokens}</Text>

          {scrollOffset > 0 && (
            <Text color="yellow" bold>
              {" "}· ▲ +{scrollOffset} [end to reset]
            </Text>
          )}
        </Box>

        <Box>
          <Text color="gray">
            [esc] stop · [tab] steps · [pgup/dn] scroll · [ctrl+c] exit
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
