/*
 * History autocomplete provider: autocompletes from previous user prompts.
 */

import type { SuggestionItem, AutocompleteContext } from "../types";

export function getHistorySuggestions(ctx: AutocompleteContext): SuggestionItem[] {
  const { input, cursorPos, history } = ctx;
  if (!history || history.length === 0) return [];

  const trimmed = input.trim();
  if (trimmed.length < 2) return [];

  /* If input starts with slash command or @ file mention, history matches shouldn't shadow commands */
  if (input.startsWith("/") || input.startsWith("@")) return [];

  const query = input.slice(0, cursorPos).toLowerCase();
  const seen = new Set<string>();
  const suggestions: SuggestionItem[] = [];

  /* Search in reverse chronological order (most recent first) */
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i].trim();
    if (!item || seen.has(item) || item.toLowerCase() === query) continue;
    seen.add(item);

    const itemLower = item.toLowerCase();
    const isPrefix = itemLower.startsWith(query);
    const isSub = !isPrefix && itemLower.includes(query);

    if (isPrefix || isSub) {
      suggestions.push({
        id: `history-${i}`,
        label: item.length > 50 ? item.slice(0, 47) + "..." : item,
        detail: isPrefix ? "[recent prompt]" : "[history match]",
        insertText: item,
        category: "history",
        replaceRange: { start: 0, end: input.length },
      });
    }

    if (suggestions.length >= 6) break;
  }

  return suggestions;
}
