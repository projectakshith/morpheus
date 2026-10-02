/*
 * AutocompletePopup: Smooth, fixed-height scrolling suggestion menu.
 * Renders a rock-solid 7-line viewport with arrow-key scrolling and no layout jitter.
 */

import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { SuggestionItem, SuggestionCategory } from "../../autocomplete/types";
import { glyphs } from "../glyphs";

export const POPUP_ROW_COUNT = 5;
export const POPUP_TOTAL_HEIGHT = POPUP_ROW_COUNT + 2; // 5 rows + top border + bottom border = 7

export interface AutocompletePopupProps {
  suggestions: SuggestionItem[];
  selectedIndex: number;
  width?: number;
}

function getCategoryBadge(category: SuggestionCategory): { tag: string; color: string } {
  switch (category) {
    case "command":
      return { tag: "[CMD]", color: theme.accent };
    case "subcommand":
      return { tag: "[ARG]", color: theme.secondary };
    case "file":
      return { tag: "[FILE]", color: theme.diffHunk };
    case "history":
      return { tag: "[HIST]", color: theme.muted };
    case "intent":
      return { tag: "[ACT]", color: theme.accentBright };
    default:
      return { tag: "[AUTO]", color: theme.muted };
  }
}

export function AutocompletePopup({
  suggestions,
  selectedIndex,
  width: customWidth,
}: AutocompletePopupProps) {
  const width = Math.max(
    40,
    customWidth ?? (process.stdout.columns ? process.stdout.columns : 80)
  );
  const innerWidth = width - 4;
  const total = suggestions.length;

  /* Calculate sliding window offset so selectedIndex is always visible in the 5 visible rows */
  let scrollOffset = 0;
  if (total > POPUP_ROW_COUNT) {
    if (selectedIndex < POPUP_ROW_COUNT) {
      scrollOffset = 0;
    } else {
      scrollOffset = Math.max(
        0,
        Math.min(
          selectedIndex - Math.floor(POPUP_ROW_COUNT / 2),
          total - POPUP_ROW_COUNT
        )
      );
      /* Ensure selectedIndex is strictly inside [scrollOffset, scrollOffset + POPUP_ROW_COUNT - 1] */
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex;
      } else if (selectedIndex >= scrollOffset + POPUP_ROW_COUNT) {
        scrollOffset = selectedIndex - POPUP_ROW_COUNT + 1;
      }
    }
  }

  const visibleItems = suggestions.slice(scrollOffset, scrollOffset + POPUP_ROW_COUNT);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + POPUP_ROW_COUNT < total;

  /* Top Border with Item Position and Up Arrow */
  const positionTag = total > 0 ? ` (${selectedIndex + 1}/${total}) ` : " ";
  const upIndicator = hasMoreAbove ? `${glyphs.arrowUp} ` : "";
  const headerPrefix = `┌─ Suggestions${positionTag}${upIndicator}`;
  const headerPad = Math.max(0, width - headerPrefix.length - 1);
  const topBorder = `${headerPrefix}${"─".repeat(headerPad)}┐`;

  /* Bottom Border with Down Arrow and Key Hints */
  const downIndicator = hasMoreBelow ? `${glyphs.arrowDown} ` : "";
  const footerHint = ` ${downIndicator}[Tab] accept · [↑↓] scroll · [Esc] close `;
  const footerPad = Math.max(0, width - footerHint.length - 2);
  const bottomBorder = `└─${"─".repeat(footerPad)}${footerHint}┘`;

  /* Render exactly POPUP_ROW_COUNT rows to guarantee rock-solid constant height */
  const rows: React.ReactNode[] = [];

  if (total === 0) {
    /* No matches notice row */
    const emptyMsg = "   No matching options found";
    const pad = Math.max(0, innerWidth - emptyMsg.length);
    rows.push(
      <Box key="no_matches" height={1} width={width} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.borderSubtle}>│</Text>
          <Text color={theme.muted} italic>
            {emptyMsg}
          </Text>
          <Text>{" ".repeat(pad)}</Text>
          <Text color={theme.borderSubtle}>│</Text>
        </Text>
      </Box>
    );

    /* Fill remaining rows */
    for (let i = 1; i < POPUP_ROW_COUNT; i++) {
      rows.push(
        <Box key={`empty_pad_${i}`} height={1} width={width} overflow="hidden">
          <Text backgroundColor={theme.bg} wrap="truncate-end">
            <Text color={theme.borderSubtle}>│</Text>
            <Text>{" ".repeat(innerWidth)}</Text>
            <Text color={theme.borderSubtle}>│</Text>
          </Text>
        </Box>
      );
    }
  } else {
    for (let r = 0; r < POPUP_ROW_COUNT; r++) {
      const item = visibleItems[r];
      if (item) {
        const itemActualIndex = scrollOffset + r;
        const isSelected = itemActualIndex === selectedIndex;
        const badge = getCategoryBadge(item.category);
        const prefix = isSelected ? " ▶ " : "   ";
        const labelText = item.label;
        const detailText = item.detail ? `  ${item.detail}` : "";
        const tagText = badge.tag;

        const maxContentLen = Math.max(10, innerWidth - prefix.length - tagText.length - 1);
        const combined = `${labelText}${detailText}`;
        const truncatedCombined =
          combined.length > maxContentLen
            ? combined.slice(0, maxContentLen - 1) + "…"
            : combined;
        const padLen = Math.max(0, innerWidth - prefix.length - truncatedCombined.length - tagText.length);

        rows.push(
          <Box key={item.id} height={1} width={width} overflow="hidden">
            <Text
              backgroundColor={isSelected ? theme.bgColumn : theme.bg}
              wrap="truncate-end"
            >
              <Text color={theme.borderSubtle}>│</Text>
              <Text
                color={isSelected ? theme.accentBright : theme.muted}
                bold={isSelected}
              >
                {prefix}
              </Text>
              <Text
                color={isSelected ? theme.text : theme.secondary}
                bold={isSelected}
              >
                {labelText}
              </Text>
              {item.detail ? (
                <Text color={theme.muted}>
                  {truncatedCombined.slice(labelText.length)}
                </Text>
              ) : null}
              <Text>{" ".repeat(padLen)}</Text>
              <Text color={badge.color}>{tagText}</Text>
              <Text> </Text>
              <Text color={theme.borderSubtle}>│</Text>
            </Text>
          </Box>
        );
      } else {
        /* Blank filler row to preserve exact constant height */
        rows.push(
          <Box key={`filler_${r}`} height={1} width={width} overflow="hidden">
            <Text backgroundColor={theme.bg} wrap="truncate-end">
              <Text color={theme.borderSubtle}>│</Text>
              <Text>{" ".repeat(innerWidth)}</Text>
              <Text color={theme.borderSubtle}>│</Text>
            </Text>
          </Box>
        );
      }
    }
  }

  return (
    <Box flexDirection="column" width={width} height={POPUP_TOTAL_HEIGHT} overflow="hidden">
      <Text color={theme.borderSubtle} wrap="truncate-end">
        {topBorder}
      </Text>
      {rows}
      <Text color={theme.borderSubtle} wrap="truncate-end">
        {bottomBorder}
      </Text>
    </Box>
  );
}
