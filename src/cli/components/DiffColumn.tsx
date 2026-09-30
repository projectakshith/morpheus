import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord } from "../types.js";

export type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord };

/* Divider + one status line. */
export const RIGHT_FOOTER_HEIGHT = 2;

function formatTokens(n?: number): string {
  if (!n) return "0k";
  return n >= 100_000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function DiffColumn({ width, height, lines, statusInfo }: DiffColumnProps) {
  const hasFooter = Boolean(statusInfo);
  const contentHeight = Math.max(1, height - (hasFooter ? RIGHT_FOOTER_HEIGHT : 0));

  const visible = lines.slice(0, contentHeight);
  const padCount = Math.max(0, contentHeight - visible.length);
  const innerWidth = Math.max(16, width - 1);

  const elapsed = statusInfo?.elapsedSeconds ?? 0;
  const timeStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const isRunning = statusInfo?.status === "running";
  const isAborted = statusInfo?.status === "aborted";
  const isError = statusInfo?.status === "error";

  const dot = isRunning ? "●" : "○";
  const stateWord = isRunning ? "running" : isAborted ? "stopped" : isError ? "failed" : "idle";
  const stateColor = isRunning ? theme.accentBright : isAborted ? theme.warning : isError ? theme.diffRemove : theme.muted;
  const queue = (statusInfo?.queueCount ?? 0) > 0 ? ` · ${statusInfo!.queueCount} queued` : "";
  const left = ` ${dot} ${stateWord} · step ${statusInfo?.stepCount ?? 0}/${statusInfo?.maxSteps ?? 25} · ${timeStr}${queue}`;
  const ctx = `ctx ${formatTokens(statusInfo?.usage?.peakContextTokens)}/${formatTokens(statusInfo?.usage?.contextLimit ?? 128_000)}`;
  const hint = isRunning ? "esc stop" : "ctrl+c exit";
  /* On narrow panels drop detail from the right rather than cutting words off. */
  const right = [`${ctx} · ${hint} `, `${hint} `, ""].find((r) => left.length + 1 + r.length <= innerWidth) ?? "";
  const gap = Math.max(1, innerWidth - left.length - right.length);

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
          <Text backgroundColor={theme.bg}> </Text>
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
        <Box flexDirection="column" height={RIGHT_FOOTER_HEIGHT} overflow="hidden">
          <Box height={1} overflow="hidden">
            <Text backgroundColor={theme.bg} color={theme.border}>
              {"─".repeat(innerWidth)}
            </Text>
          </Box>
          <Box height={1} overflow="hidden">
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={stateColor}>{` ${dot} ${stateWord}`}</Text>
              <Text color={theme.muted}>{left.slice(` ${dot} ${stateWord}`.length)}</Text>
              {" ".repeat(gap)}
              <Text color={theme.muted}>{right}</Text>
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

