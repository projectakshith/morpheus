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
  type ProbeRow,
} from "./view";

export interface SecurityHudProps {
  width: number;
  height: number;
  threads: Thread[];
  findings: Finding[];
  engagement: Engagement | null;
  target?: string;
}

function label(text: string, width: number): React.ReactNode {
  return (
    <Text backgroundColor={theme.bg} color={theme.muted} bold>
      {truncateCells(` ${text}`, width)}
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

function spacer(width: number): React.ReactNode {
  return <Text backgroundColor={theme.bg}>{" ".repeat(Math.max(0, width))}</Text>;
}

function statusColor(row: ProbeRow): string {
  if (row.isRunning) return theme.accentBright;
  if (row.isError) return theme.error;
  if (row.status.startsWith("2") || row.status === "ok") return theme.success;
  if (row.status.startsWith("3")) return theme.warning;
  if (row.status.startsWith("4") || row.status.startsWith("5")) return theme.error;
  return theme.muted;
}

export function SecurityHud({ width, height, threads, findings, engagement, target }: SecurityHudProps) {
  const inner = Math.max(18, width - 1);
  const phase = securityPhase(threads);
  const counts = severityCounts(findings);
  const scope = scopeView(engagement);
  const rows = probeRows(threads, 5);
  const lines: React.ReactNode[] = [];

  const chip = scope
    ? scope.expired
      ? { text: "EXPIRED", color: theme.error }
      : { text: "SCOPED", color: theme.success }
    : { text: "ARMED", color: theme.warning };
  const headerGap = Math.max(1, inner - 10 - chip.text.length);

  lines.push(
    <Text backgroundColor={theme.bg}>
      <Text color={theme.accentBright} bold>
        {" SECURITY"}
      </Text>
      {" ".repeat(headerGap)}
      <Text color={chip.color} bold>
        {chip.text}
      </Text>
      {" "}
    </Text>
  );
  lines.push(spacer(inner));

  lines.push(label("SCOPE", inner));
  if (scope) {
    lines.push(padded(scope.target, inner, theme.text, true));
    lines.push(
      padded(
        `${scope.expired ? "expired" : "expires"} ${scope.expiresAt} · ${scope.methods} · ${scope.rps} rps`,
        inner,
        scope.expired ? theme.error : theme.muted
      )
    );
    lines.push(padded(`authorized by ${scope.authorizedBy}`, inner, theme.muted));
  } else {
    lines.push(padded(target ?? "no scope", inner, theme.muted));
    lines.push(padded("/attack <host> --auth <ref>", inner, theme.warning));
  }
  lines.push(spacer(inner));

  lines.push(label("PHASE", inner));
  const phaseNodes: React.ReactNode[] = [];
  SECURITY_PHASES.forEach((name, index) => {
    if (index > 0) {
      phaseNodes.push(
        <Text key={`sep_${name}`} color={theme.border}>
          {"  ·  "}
        </Text>
      );
    }
    const active = index === phase;
    const done = index < phase;
    phaseNodes.push(
      <Text
        key={name}
        color={active ? theme.accentBright : done ? theme.success : theme.muted}
        bold={active}
      >
        {active ? "● " : done ? "✓ " : "○ "}
        {name}
      </Text>
    );
  });
  lines.push(
    <Text backgroundColor={theme.bg}>
      {" "}
      {phaseNodes}
    </Text>
  );
  lines.push(spacer(inner));

  lines.push(label("ACTIVITY", inner));
  if (rows.length === 0) {
    lines.push(padded("waiting for the first probe", inner, theme.muted));
  }
  for (const row of rows) {
    const marker = row.isRunning ? "◌" : row.isError ? "✖" : "✔";
    const markerColor = row.isRunning
      ? theme.accentBright
      : row.isError
        ? theme.error
        : theme.success;
    const room = Math.max(4, inner - row.status.length - 4);
    const rowLabel = truncateCells(row.label, room);
    const pad = Math.max(1, inner - 4 - rowLabel.length - row.status.length);
    lines.push(
      <Text backgroundColor={theme.bg}>
        {" "}
        <Text color={markerColor}>{marker}</Text>
        <Text color={theme.text}> {rowLabel}</Text>
        {" ".repeat(pad)}
        <Text color={statusColor(row)} bold={row.isRunning}>
          {row.status}
        </Text>
        {" "}
      </Text>
    );
  }
  lines.push(spacer(inner));

  lines.push(label("FINDINGS", inner));
  const severities: Array<[string, number, string]> = [
    ["critical", counts.critical, theme.diffRemove],
    ["high", counts.high, theme.warning],
    ["medium", counts.medium, theme.accent],
    ["low", counts.low, theme.muted],
  ];
  lines.push(
    <Text backgroundColor={theme.bg}>
      {" "}
      {severities.map(([name, value, color], index) => (
        <Text key={name}>
          {index > 0 ? <Text color={theme.border}>{"  ·  "}</Text> : null}
          <Text color={theme.muted}>{name} </Text>
          <Text color={color} bold>
            {value}
          </Text>
        </Text>
      ))}
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
