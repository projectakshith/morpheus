/*
 * AutocompletePopup: Floating suggestion menu rendered directly above the prompt box.
 */

import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { SuggestionItem, SuggestionCategory } from "../autocomplete/types.js";

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
  if (suggestions.length === 0) return null;

  const width = Math.max(
    40,
    customWidth ?? (process.stdout.columns ? process.stdout.columns : 80)
  );
  const innerWidth = width - 4;

  const headerTitle = " Suggestions ";
  const topBorder = `┌─${headerTitle}${"─".repeat(Math.max(0, width - headerTitle.length - 3))}┐`;
  const footerHint = " [Tab] accept · [↑↓] cycle · [Esc] close ";
  const bottomBorder = `└─${"─".repeat(Math.max(0, width - footerHint.length - 3))}${footerHint}┘`;

  return (
    <Box flexDirection="column" width={width}>
      <Text color={theme.borderSubtle} wrap="truncate-end">
        {topBorder}
      </Text>

      {suggestions.map((item, index) => {
        const isSelected = index === selectedIndex;
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

        return (
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
      })}

      <Text color={theme.borderSubtle} wrap="truncate-end">
        {bottomBorder}
      </Text>
    </Box>
  );
}
