import type { SuggestionItem } from "./types";

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
