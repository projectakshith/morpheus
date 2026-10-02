/*
 * Coding intent autocomplete provider: contextual quick actions for common developer workflows.
 */

import type { SuggestionItem, AutocompleteContext } from "../types";

interface IntentTemplate {
  trigger: string;
  label: string;
  template: string;
  description: string;
}

const COMMON_INTENTS: IntentTemplate[] = [
  {
    trigger: "test",
    label: "run test suite and report any failures",
    template: "run test suite and report any failures",
    description: "Execute tests and diagnose issues",
  },
  {
    trigger: "fix",
    label: "find and fix TypeScript or runtime errors",
    template: "find and fix TypeScript or runtime errors",
    description: "Diagnose and repair code errors",
  },
  {
    trigger: "refactor",
    label: "refactor for cleaner separation of concerns",
    template: "refactor this module for cleaner separation of concerns",
    description: "Restructure code cleanly without changing behavior",
  },
  {
    trigger: "git",
    label: "check git status and review unstaged diffs",
    template: "check git status and review unstaged diffs",
    description: "Inspect git repository status and changes",
  },
  {
    trigger: "explain",
    label: "explain architecture and component flow",
    template: "explain the architecture and component flow of this project",
    description: "High-level codebase walkthrough",
  },
  {
    trigger: "review",
    label: "review code quality and potential edge cases",
    template: "review code quality and potential edge cases in recent changes",
    description: "Code review and safety analysis",
  },
];

export function getIntentSuggestions(ctx: AutocompleteContext): SuggestionItem[] {
  const { input, cursorPos } = ctx;
  const beforeCursor = input.slice(0, cursorPos).toLowerCase().trim();

  if (beforeCursor.length < 2 || beforeCursor.startsWith("/") || beforeCursor.startsWith("@")) {
    return [];
  }

  const suggestions: SuggestionItem[] = [];

  for (const intent of COMMON_INTENTS) {
    if (intent.trigger.startsWith(beforeCursor) || beforeCursor.startsWith(intent.trigger)) {
      suggestions.push({
        id: `intent-${intent.trigger}`,
        label: intent.label,
        detail: intent.description,
        insertText: intent.template,
        category: "intent",
        replaceRange: { start: 0, end: input.length },
      });
    }
  }

  return suggestions;
}
