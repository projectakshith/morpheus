import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { glyphs } from "../glyphs.js";
import type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord } from "../types.js";
import { buildRightLines } from "./diff/buildRightLines.js";

export type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord };
export { buildRightLines };

export function DiffColumn({ width, height, lines, statusInfo }: DiffColumnProps) {
  const hasFooter = Boolean(statusInfo);
  const footerHeight = hasFooter ? 3 : 0;
  const contentHeight = Math.max(1, height - footerHeight);

  const visible = lines.slice(0, contentHeight);
  const padCount = Math.max(0, contentHeight - visible.length);
  const innerWidth = Math.max(16, width - 1);

  const mins = Math.floor((statusInfo?.elapsedSeconds ?? 0) / 60)
    .toString()
    .padStart(2, "0");
  const secs = ((statusInfo?.elapsedSeconds ?? 0) % 60).toString().padStart(2, "0");
  const timeStr = `${mins}:${secs}`;

  const peakCtx = statusInfo?.usage?.peakContextTokens
    ? `${(statusInfo.usage.peakContextTokens / 1000).toFixed(1)}k`
    : "0k";
  const limitCtx = statusInfo?.usage?.contextLimit
    ? `${Math.round(statusInfo.usage.contextLimit / 1000)}k`
    : "128k";
  const totalTokens = statusInfo?.usage?.totalTokens
    ? `${(statusInfo.usage.totalTokens / 1000).toFixed(0)}k`
    : "0k";

  const isRunning = statusInfo?.status === "running";
  const isAborted = statusInfo?.status === "aborted";
  const isError = statusInfo?.status === "error";

  const queueStr = (statusInfo?.queueCount ?? 0) > 0 ? ` +${statusInfo!.queueCount}q` : "";
  const stepStr = `step ${statusInfo?.stepCount ?? 0}/${statusInfo?.maxSteps ?? 25}`;
  const hintStr = isRunning ? "[esc] stop" : "[ctrl+c] exit";

  const statusTag = isRunning ? "EXEC" : isAborted ? "STOP" : isError ? "FAIL" : "IDLE";
  const statusColor = isRunning
    ? theme.accentBright
    : isAborted
    ? theme.warning
    : isError
    ? theme.diffRemove
    : theme.muted;

  const statusBadgeLength = 8;
  const line2VisLen =
    1 +
    statusBadgeLength +
    3 + stepStr.length +
    3 + timeStr.length +
    queueStr.length;
  const padLine2 = Math.max(0, innerWidth - line2VisLen);

  const line3VisLen =
    1 +
    4 + peakCtx.length + 1 + limitCtx.length +
    3 + 4 + totalTokens.length +
    3 + hintStr.length;
  const padLine3 = Math.max(0, innerWidth - line3VisLen);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor={theme.border}
      paddingLeft={0}
    >
      {visible.map((line) => (
        <Box key={line.id} height={1} overflow="hidden">
          {line.node}
        </Box>
      ))}
      {Array.from({ length: padCount }).map((_, idx) => (
        <Box key={`pad_${idx}`} height={1} overflow="hidden">
          <Text backgroundColor={theme.bg}>
            {" ".repeat(innerWidth)}
          </Text>
        </Box>
      ))}

      {hasFooter && (
        <Box flexDirection="column" height={3} overflow="hidden">
          <Box height={1} overflow="hidden">
            <Text backgroundColor={theme.bg} color={theme.border}>
              {"─".repeat(innerWidth)}
            </Text>
          </Box>
          <Box height={1} overflow="hidden">
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              {" "}
              <Text color={theme.border}>[ </Text>
              <Text color={statusColor} bold>
                {statusTag}
              </Text>
              <Text color={theme.border}> ]</Text>
              <Text color={theme.secondary}> · {stepStr} · {timeStr}{queueStr}</Text>
              {" ".repeat(padLine2)}
            </Text>
          </Box>
          <Box height={1} overflow="hidden">
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              {" "}
              <Text color={theme.muted}>ctx </Text>
              <Text color={theme.secondary}>{peakCtx}</Text>
              <Text color={theme.border}>/</Text>
              <Text color={theme.muted}>{limitCtx}</Text>
              <Text color={theme.border}> │ </Text>
              <Text color={theme.muted}>api </Text>
              <Text color={theme.secondary}>{totalTokens}</Text>
              <Text color={theme.border}> │ </Text>
              <Text color={theme.muted}>{hintStr}</Text>
              {" ".repeat(padLine3)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

