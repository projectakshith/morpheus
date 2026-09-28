/*
 * Autocomplete coordination engine: combines providers, ranks suggestions, and computes inline ghost text.
 */

import type {
  SuggestionItem,
  AutocompleteContext,
  AutocompleteResult,
} from "./types.js";
import { getCommandSuggestions } from "./providers/commandProvider.js";
import { getFileSuggestions } from "./providers/fileProvider.js";
import { getHistorySuggestions } from "./providers/historyProvider.js";
import { getIntentSuggestions } from "./providers/intentProvider.js";

export function computeAutocomplete(
  ctx: AutocompleteContext,
  selectedIndex: number = 0
): AutocompleteResult {
  const { input, cursorPos } = ctx;

  if (!input || input.trim().length === 0) {
    return { suggestions: [], selectedIndex: 0 };
  }

  const allSuggestions: SuggestionItem[] = [];

  /* If user typed a slash, prioritize command suggestions */
  if (input.startsWith("/")) {
    allSuggestions.push(...getCommandSuggestions(ctx));
  } else {
    /* If user typed an @ mention or path character, prioritize file suggestions */
    const fileSuggestions = getFileSuggestions(ctx);
    allSuggestions.push(...fileSuggestions);

    /* Then history suggestions */
    allSuggestions.push(...getHistorySuggestions(ctx));

    /* Then intent templates if few history items matched */
    if (allSuggestions.length < 3) {
      allSuggestions.push(...getIntentSuggestions(ctx));
    }
  }

  /* Deduplicate by insertText */
  const seen = new Set<string>();
  const deduplicated = allSuggestions.filter((item) => {
    const key = `${item.category}:${item.insertText.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const suggestions = deduplicated.slice(0, 50);
  if (suggestions.length === 0) {
    return { suggestions: [], selectedIndex: 0 };
  }

  const safeIndex = Math.min(Math.max(0, selectedIndex), suggestions.length - 1);
  const activeSuggestion = suggestions[safeIndex];

  /* Compute dim ghost text for the active suggestion */
  let ghostText: string | undefined;

  if (activeSuggestion) {
    const { insertText, replaceRange } = activeSuggestion;
    if (replaceRange) {
      const tokenTyped = input.slice(replaceRange.start, cursorPos);
      if (
        tokenTyped &&
        insertText.toLowerCase().startsWith(tokenTyped.toLowerCase()) &&
        cursorPos === input.length
      ) {
        ghostText = insertText.slice(tokenTyped.length);
      }
    } else if (
      insertText.toLowerCase().startsWith(input.toLowerCase()) &&
      cursorPos === input.length
    ) {
      ghostText = insertText.slice(cursorPos);
    }
  }

  return {
    suggestions,
    selectedIndex: safeIndex,
    ghostText,
  };
}

export function applySuggestion(
  input: string,
  cursorPos: number,
  suggestion: SuggestionItem
): { newValue: string; newCursorPos: number } {
  if (suggestion.replaceRange) {
    const before = input.slice(0, suggestion.replaceRange.start);
    const after = input.slice(suggestion.replaceRange.end);
    const newValue = before + suggestion.insertText + after;
    const newCursorPos = before.length + suggestion.insertText.length;
    return { newValue, newCursorPos };
  }

  /* Default replacement: prefix match from start */
  if (suggestion.insertText.toLowerCase().startsWith(input.toLowerCase())) {
    return {
      newValue: suggestion.insertText,
      newCursorPos: suggestion.insertText.length,
    };
  }

  const newValue = input.slice(0, cursorPos) + suggestion.insertText + input.slice(cursorPos);
  return {
    newValue,
    newCursorPos: cursorPos + suggestion.insertText.length,
  };
}
