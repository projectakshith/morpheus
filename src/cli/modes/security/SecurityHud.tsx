import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme";
import { truncateCells } from "../../../display/cells";
import type { Thread } from "../../../core/thread";
import type { Engagement } from "../../../core/engagement";
import type { Finding } from "../../../core/types";
import {
  SECURITY_PHASES,
  probeRows,
  scopeView,
  securityPhase,
  severityCounts,
} from "./view";

export interface SecurityHudProps {
  width: number;
  height: number;
  threads: Thread[];
  findings: Finding[];
  engagement: Engagement | null;
  target?: string;
}

function sectionLabel(text: string, width: number): React.ReactNode {
  return (
    <Text backgroundColor={theme.bg} color={theme.muted}>
      {truncateCells(` ${text} ${"─".repeat(Math.max(0, width - text.length - 3))}`, width)}
    </Text>
  );
}

function padded(text: string, width: number, color: string, bold = false): React.ReactNode {
  const fitted = truncateCells(text, width - 1);
  return (
    <Text backgroundColor={theme.bg} color={color} bold={bold}>
      {` ${fitted}${" ".repeat(Math.max(0, width - 1 - fitted.length))}`}
    </Text>
  );
}

export function SecurityHud({ width, height, threads, findings, engagement, target }: SecurityHudProps) {
  const inner = Math.max(18, width - 1);
  const phase = securityPhase(threads);
  const counts = severityCounts(findings);
  const scope = scopeView(engagement);
  const rows = probeRows(threads, 6);
  const lines: React.ReactNode[] = [];

  lines.push(padded("SECURITY", inner, theme.accentBright, true));
  lines.push(sectionLabel("TARGET", inner));
  lines.push(padded(scope?.target ?? target ?? "no scope", inner, theme.text));
  if (scope) {
    lines.push(
      padded(
        `${scope.expired ? "EXPIRED" : "scope ok"} · ${scope.expiresAt} · ${scope.methods} · ${scope.rps} rps`,
        inner,
        scope.expired ? theme.diffRemove : theme.muted
      )
    );
    lines.push(padded(`auth ${scope.authorizedBy}`, inner, theme.muted));
  } else {
    lines.push(padded("run /attack <host> --auth <ref>", inner, theme.warning));
  }

  lines.push(sectionLabel("PHASE", inner));
  const phaseLine = SECURITY_PHASES.map((label, index) => {
    const active = index === phase;
    return (
      <Text key={label} color={active ? theme.accentBright : theme.muted} bold={active}>
        {index > 0 ? " " : ""}
        {label}
      </Text>
    );
  });
  lines.push(
    <Text backgroundColor={theme.bg}>
      {" "}
      {phaseLine}
      {" ".repeat(Math.max(0, inner - 1 - SECURITY_PHASES.join(" ").length))}
    </Text>
  );

  lines.push(sectionLabel("ACTIVITY", inner));
  if (rows.length === 0) {
    lines.push(padded("waiting for the first probe", inner, theme.muted));
  }
  for (const row of rows) {
    const color = row.isRunning
      ? theme.accentBright
      : row.isError
        ? theme.diffRemove
        : theme.text;
    const marker = row.isRunning ? "◌" : row.isError ? "✖" : "✔";
    lines.push(
      <Text backgroundColor={theme.bg}>
        {truncateCells(` ${marker} ${row.label}`, inner - 6).padEnd(inner - 6)}
        <Text color={color}>{row.status}</Text>
      </Text>
    );
    if (row.note) lines.push(padded(row.note, inner, theme.muted));
  }

  lines.push(sectionLabel("FINDINGS", inner));
  lines.push(
    <Text backgroundColor={theme.bg}>
      <Text color={theme.diffRemove}>{` CRIT ${counts.critical}`}</Text>
      <Text color={theme.warning}>{`  HIGH ${counts.high}`}</Text>
      <Text color={theme.accent}>{`  MED ${counts.medium}`}</Text>
      <Text color={theme.muted}>{`  LOW ${counts.low}`}</Text>
    </Text>
  );

  const contentHeight = Math.max(0, height - 1);
  const visible = lines.slice(0, contentHeight);
  const padding = Math.max(0, contentHeight - visible.length);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      backgroundColor={theme.bg}
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor={theme.border}
    >
      {visible.map((node, index) => (
        <Box key={`security_${index}`} height={1} overflow="hidden">
          {node}
        </Box>
      ))}
      {Array.from({ length: padding }, (_, index) => (
        <Box key={`security_pad_${index}`} height={1} overflow="hidden">
          <Text backgroundColor={theme.bg}>{" ".repeat(inner)}</Text>
        </Box>
      ))}
    </Box>
  );
}
