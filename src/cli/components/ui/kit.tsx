import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme";
import { cellWidth, truncateCells } from "../../../display/cells";

export function fit(text: string, width: number): string {
  const t = truncateCells(text, Math.max(0, width));
  return t + " ".repeat(Math.max(0, width - cellWidth(t)));
}

export function spread(left: string, right: string, width: number): [string, string, string] {
  const r = truncateCells(right, Math.max(0, width - 2));
  const l = truncateCells(left, Math.max(0, width - cellWidth(r) - 1));
  const gap = Math.max(right ? 1 : 0, width - cellWidth(l) - cellWidth(r));
  return [l, " ".repeat(gap), r];
}

export function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

export type Status = "online" | "needs-login" | "offline" | "checking" | "active" | "idle";

export function statusStyle(status: Status): { dot: string; color: string; label: string } {
  switch (status) {
    case "online":
      return { dot: "●", color: theme.accentBright, label: "online" };
    case "active":
      return { dot: "●", color: theme.accentBright, label: "active" };
    case "needs-login":
      return { dot: "●", color: theme.warning, label: "needs login" };
    case "offline":
      return { dot: "○", color: theme.error, label: "offline" };
    case "checking":
      return { dot: "◌", color: theme.muted, label: "checking…" };
    case "idle":
      return { dot: "○", color: theme.muted, label: "idle" };
  }
}

export interface Hint {
  keys: string;
  label: string;
}

export interface ModalProps {
  title: string;
  context?: string;
  hints: Hint[];
  width: number;
  height: number;
  aside?: React.ReactNode;
  children: (inner: { width: number; height: number }) => React.ReactNode;
}

const FRAME_ROWS = 6;

export function Modal({ title, context, hints, width, height, aside, children }: ModalProps) {
  const innerWidth = Math.max(20, width - 6);
  const bodyHeight = Math.max(4, height - FRAME_ROWS);
  const contextRoom = Math.max(0, innerWidth - cellWidth(title) - 2 - (aside ? 24 : 0));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      paddingX={2}
      overflow="hidden"
    >
      <Box height={1} width={innerWidth} justifyContent="space-between" overflow="hidden">
        <Text wrap="truncate-end">
          <Text bold color={theme.accentBright}>
            {title}
          </Text>
          {context ? <Text color={theme.muted}>{`  ${truncateCells(context, contextRoom)}`}</Text> : null}
        </Text>
        {aside ?? null}
      </Box>
      <Box height={1} />
      <Box height={bodyHeight} width={innerWidth} overflow="hidden" flexDirection="column">
        {children({ width: innerWidth, height: bodyHeight })}
      </Box>
      <Box height={1} />
      <Box height={1} width={innerWidth} overflow="hidden">
        <HintLine hints={hints} />
      </Box>
    </Box>
  );
}

export function HintLine({ hints }: { hints: Hint[] }) {
  return (
    <Text wrap="truncate-end">
      {hints.map((h, i) => (
        <Text key={h.keys}>
          {i > 0 ? <Text color={theme.border}>{"   "}</Text> : null}
          <Text color={theme.secondary}>{h.keys}</Text>
          <Text color={theme.muted}>{` ${h.label}`}</Text>
        </Text>
      ))}
    </Text>
  );
}

export interface SplitProps {
  width: number;
  height: number;
  ratio?: number;
  minLeft?: number;
  left: (w: number, h: number) => React.ReactNode;
  right: (w: number, h: number) => React.ReactNode;
}

export function Split({ width, height, ratio = 0.46, minLeft = 30, left, right }: SplitProps) {
  const leftWidth = Math.min(width - 20, Math.max(minLeft, Math.floor(width * ratio)));
  const rightWidth = Math.max(10, width - leftWidth - 3);
  return (
    <Box flexDirection="row" height={height} width={width} overflow="hidden">
      <Box flexDirection="column" width={leftWidth} height={height} overflow="hidden">
        {left(leftWidth, height)}
      </Box>
      <Box flexDirection="column" width={3} height={height} overflow="hidden">
        {Array.from({ length: height }, (_, i) => (
          <Text key={i} color={theme.borderSubtle}>
            {" │ "}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" width={rightWidth} height={height} overflow="hidden">
        {right(rightWidth, height)}
      </Box>
    </Box>
  );
}

export function Section({ label, detail, width }: { label: string; detail?: string; width: number }) {
  const text = label.toUpperCase();
  const extra = detail ? ` · ${detail}` : "";
  return (
    <Text wrap="truncate-end">
      <Text color={theme.muted} bold>
        {text}
      </Text>
      <Text color={theme.muted}>{extra}</Text>
      <Text color={theme.borderSubtle}>{" " + "─".repeat(Math.max(0, width - cellWidth(text) - cellWidth(extra) - 1))}</Text>
    </Text>
  );
}

export function Blank() {
  return <Text> </Text>;
}

export interface ListRowProps {
  label: string;
  value?: string;
  valueColor?: string;
  selected: boolean;
  width: number;
  icon?: string;
  iconColor?: string;
  dim?: boolean;
}

export function ListRow({ label, value = "", valueColor, selected, width, icon, iconColor, dim }: ListRowProps) {
  const lead = selected ? "›" : " ";
  const iconPart = icon ? `${icon} ` : "";
  const room = width - 2 - cellWidth(iconPart) - 1;
  const [l, gap, r] = spread(label, value, room);
  const bg = selected ? theme.bgUser : undefined;
  return (
    <Text wrap="truncate-end" backgroundColor={bg}>
      <Text color={theme.accentBright} bold>
        {`${lead} `}
      </Text>
      {icon ? <Text color={iconColor ?? theme.muted}>{iconPart}</Text> : null}
      <Text color={selected ? theme.text : dim ? theme.muted : theme.secondary} bold={selected}>
        {l}
      </Text>
      <Text>{gap}</Text>
      <Text color={valueColor ?? theme.muted}>{r}</Text>
      <Text> </Text>
    </Text>
  );
}

export function KeyValue({ k, v, width, color, keyWidth = 14 }: { k: string; v: string; width: number; color?: string; keyWidth?: number }) {
  const key = fit(k, Math.min(keyWidth, Math.floor(width / 2)) - 1) + " ";
  return (
    <Text wrap="truncate-end">
      <Text color={theme.muted}>{key}</Text>
      <Text color={color ?? theme.text}>{truncateCells(v, Math.max(0, width - cellWidth(key)))}</Text>
    </Text>
  );
}

export function StatusValue({ status, detail, width, keyLabel = "status" }: { status: Status; detail?: string; width: number; keyLabel?: string }) {
  const s = statusStyle(status);
  const key = fit(keyLabel, Math.min(14, Math.floor(width / 2)));
  const text = detail ? `${s.label} · ${detail}` : s.label;
  return (
    <Text wrap="truncate-end">
      <Text color={theme.muted}>{key}</Text>
      <Text color={s.color}>{`${s.dot} `}</Text>
      <Text color={s.color}>{truncateCells(text, Math.max(0, width - cellWidth(key) - 2))}</Text>
    </Text>
  );
}

export function Callout({ text, tone = "accent", width }: { text: string; tone?: "accent" | "warning" | "danger" | "muted"; width: number }) {
  const color =
    tone === "warning" ? theme.warning : tone === "danger" ? theme.error : tone === "muted" ? theme.muted : theme.accentBright;
  return (
    <Text wrap="truncate-end">
      <Text color={color}>→ </Text>
      <Text color={tone === "muted" ? theme.muted : theme.secondary}>{truncateCells(text, Math.max(0, width - 2))}</Text>
    </Text>
  );
}

export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && cellWidth(line) + 1 + cellWidth(word) > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => truncateCells(l, width));
}

export function Meter({ value, max, width, label, barWidth: fixedBar }: { value: number; max: number; width: number; label?: string; barWidth?: number }) {
  const suffix = label ? ` ${label}` : "";
  const barWidth =
    fixedBar !== undefined ? Math.max(4, Math.min(fixedBar, width - 4)) : Math.max(4, width - cellWidth(suffix));
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * barWidth);
  const color = ratio > 0.85 ? theme.error : ratio > 0.6 ? theme.warning : theme.accentBright;
  return (
    <Text wrap="truncate-end">
      <Text color={color}>{"━".repeat(filled)}</Text>
      <Text color={theme.borderSubtle}>{"─".repeat(barWidth - filled)}</Text>
      <Text color={theme.muted}>{suffix}</Text>
    </Text>
  );
}

export function Tabs({ tabs, active }: { tabs: Array<{ label: string; count?: number }>; active: number }) {
  return (
    <Text wrap="truncate-end">
      {tabs.map((t, i) => {
        const on = i === active;
        const text = t.count !== undefined ? `${t.label} ${t.count}` : t.label;
        return (
          <Text key={t.label}>
            {i > 0 ? "  " : ""}
            <Text color={on ? theme.bg : theme.muted} backgroundColor={on ? theme.accentBright : undefined} bold={on}>
              {` ${text} `}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
}

export function windowFor(selected: number, total: number, height: number): [number, number] {
  if (total <= height) return [0, total];
  const start = Math.min(Math.max(0, selected - Math.floor(height / 2)), total - height);
  return [start, start + height];
}

export interface Row {
  key: string;
  node: React.ReactNode;
  focus?: boolean;
}

/* Rows never shrink: Ink squashes overflowing rows to zero height instead of clipping them. */
export function RowList({ rows, height }: { rows: Row[]; height: number }) {
  const focusIndex = rows.findIndex((r) => r.focus);
  let start = 0;
  if (rows.length > height && focusIndex >= 0) {
    start = Math.min(Math.max(0, focusIndex - Math.floor(height / 3)), rows.length - height);
  }
  const visible = rows.slice(start, start + height);
  const hiddenAbove = start;
  const hiddenBelow = rows.length - start - visible.length;
  return (
    <>
      {visible.map((r, i) => {
        const marker =
          (i === 0 && hiddenAbove > 0) || (i === visible.length - 1 && hiddenBelow > 0) ? true : false;
        return (
          <Box key={r.key} height={1} flexShrink={0} overflow="hidden">
            {marker && !r.focus ? (
              <Text color={theme.muted}>{i === 0 ? `  ↑ ${hiddenAbove} more` : `  ↓ ${hiddenBelow} more`}</Text>
            ) : (
              r.node
            )}
          </Box>
        );
      })}
    </>
  );
}

/* Drops rows past `height` itself; Ink's clipping doesn't hold for rows that can't shrink. */
export function Lines({ children, height }: { children: React.ReactNode; height?: number }) {
  const rows = React.Children.toArray(children);
  return (
    <>
      {(height === undefined ? rows : rows.slice(0, Math.max(0, height))).map((child, i) => (
        <Box key={i} flexShrink={0} height={1} overflow="hidden">
          {child}
        </Box>
      ))}
    </>
  );
}
