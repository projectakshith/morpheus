/*
 * Autocomplete engine type definitions and contracts.
 */

export type SuggestionCategory = "command" | "subcommand" | "file" | "history" | "intent";

export interface SuggestionItem {
  id: string;
  label: string;
  detail?: string;
  insertText: string;
  category: SuggestionCategory;
  /** Optional range of characters in the original input to replace */
  replaceRange?: {
    start: number;
    end: number;
  };
}

export interface AutocompleteContext {
  input: string;
  cursorPos: number;
  history?: string[];
  cwd?: string;
  currentModel?: string;
  availableModels?: string[];
}

export interface AutocompleteResult {
  suggestions: SuggestionItem[];
  selectedIndex: number;
  ghostText?: string;
}
