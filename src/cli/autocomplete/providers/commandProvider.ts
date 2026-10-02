/*
 * Command autocomplete provider: handles slash commands and argument completions.
 */

import type { SuggestionItem, AutocompleteContext } from "../types.js";
import { similarity } from "../../../utils/levenshtein.js";

interface CommandDef {
  name: string;
  description: string;
  aliases?: string[];
  hasArgs?: boolean;
}

const BUILTIN_COMMANDS: CommandDef[] = [
  { name: "/model", description: "Switch active LLM model", hasArgs: true },
  { name: "/help", description: "Display commands and keyboard shortcuts" },
  { name: "/stop", description: "Abort running task and clear queue", aliases: ["/abort", "/cancel"] },
  { name: "/queue", description: "Inspect pending prompt queue" },
  { name: "/clear-queue", description: "Clear all pending tasks from queue" },
  { name: "/diff", description: "Review accumulated file edits and diffs" },
  { name: "/settings", description: "Open runtime configuration settings" },
  { name: "/session", description: "Show current session or start /session new", hasArgs: true },
  { name: "/sessions", description: "Browse and resume past sessions" },
  { name: "/login", description: "Authenticate provider (antigravity, openrouter)", hasArgs: true },
  { name: "/auth", description: "Check authentication status of providers" },
  { name: "/neo", description: "Open Neo proxy router inspector and status window", aliases: ["/neo-status", "/status"] },
  { name: "/usage", description: "Open token usage, quotas, and model pricing dashboard", aliases: ["/tokens", "/cost", "/quota"] },
  { name: "/morpheus", description: "Display operative Morpheus TrueColor avatar", aliases: ["/avatar"] },
  { name: "/skills", description: "List all available agent skills and playbooks", aliases: ["/skill"] },
  { name: "/cua", description: "Configure and check Cua Driver computer use", hasArgs: true },
  { name: "/exit", description: "Exit Morpheus CLI", aliases: ["/quit"] },
];

const DEFAULT_MODELS = [
  "flash",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gemini-3.1-pro-high",
  "gemini-3.6-flash-high",
  "gpt-oss-120b-medium",
  "local/qwen2.5-coder:7b",
  "local/llama3.3",
  "local/deepseek-r1:8b",
  "cloud/anthropic/claude-3.5-sonnet",
  "cloud/openai/gpt-4o",
];

export function getCommandSuggestions(ctx: AutocompleteContext): SuggestionItem[] {
  const { input, cursorPos } = ctx;
  const beforeCursor = input.slice(0, cursorPos);

  if (!beforeCursor.startsWith("/")) {
    return [];
  }

  /* 1. Subargument completion for /model <arg> */
  if (beforeCursor.startsWith("/model ")) {
    const query = beforeCursor.slice("/model ".length).toLowerCase().trim();
    const models = ctx.availableModels && ctx.availableModels.length > 0 ? ctx.availableModels : DEFAULT_MODELS;

    return models
      .filter((m) => m.toLowerCase().includes(query))
      .map((m) => ({
        id: `subcommand-model-${m}`,
        label: `/model ${m}`,
        detail: `Model: ${m}`,
        insertText: `/model ${m}`,
        category: "subcommand" as const,
        replaceRange: { start: 0, end: input.length },
      }));
  }

  /* 2. Subargument completion for /login <provider> */
  if (beforeCursor.startsWith("/login ")) {
    const query = beforeCursor.slice("/login ".length).toLowerCase().trim();
    const providers = [
      { name: "antigravity", desc: "Google Cloud Code Keychain/OAuth" },
      { name: "openrouter", desc: "OpenRouter API Key authentication" },
    ];

    return providers
      .filter((p) => p.name.includes(query))
      .map((p) => ({
        id: `subcommand-login-${p.name}`,
        label: `/login ${p.name}`,
        detail: p.desc,
        insertText: `/login ${p.name}`,
        category: "subcommand" as const,
        replaceRange: { start: 0, end: input.length },
      }));
  }

  /* 3. Subargument completion for /session <action> */
  if (beforeCursor.startsWith("/session ")) {
    const query = beforeCursor.slice("/session ".length).toLowerCase().trim();
    const actions = [
      { name: "new", desc: "Start a fresh new conversation session" },
    ];

    return actions
      .filter((a) => a.name.includes(query))
      .map((a) => ({
        id: `subcommand-session-${a.name}`,
        label: `/session ${a.name}`,
        detail: a.desc,
        insertText: `/session ${a.name}`,
        category: "subcommand" as const,
        replaceRange: { start: 0, end: input.length },
      }));
  }

  /* 4. Top-level slash commands */
  const query = beforeCursor.toLowerCase();
  const suggestions: SuggestionItem[] = [];

  for (const cmd of BUILTIN_COMMANDS) {
    const matchesPrimary = cmd.name.toLowerCase().startsWith(query);
    const matchesAlias = cmd.aliases?.some((a) => a.toLowerCase().startsWith(query));

    if (matchesPrimary || matchesAlias) {
      suggestions.push({
        id: `command-${cmd.name}`,
        label: cmd.name + (cmd.hasArgs ? " [args]" : ""),
        detail: cmd.description,
        insertText: cmd.name + (cmd.hasArgs ? " " : ""),
        category: "command",
        replaceRange: { start: 0, end: beforeCursor.length },
      });
    }
  }

  /* Fallback: if user made a typo (e.g. /sessiions), find closest command via fuzzy similarity */
  if (suggestions.length === 0 && query.length >= 3) {
    const matchesFuzzy = BUILTIN_COMMANDS.filter((cmd) => {
      const sim = similarity(cmd.name.toLowerCase(), query);
      return sim >= 0.55 || cmd.name.toLowerCase().includes(query.slice(1, 4));
    });

    for (const cmd of matchesFuzzy) {
      suggestions.push({
        id: `command-fuzzy-${cmd.name}`,
        label: cmd.name + (cmd.hasArgs ? " [args]" : ""),
        detail: cmd.description,
        insertText: cmd.name + (cmd.hasArgs ? " " : ""),
        category: "command",
        replaceRange: { start: 0, end: beforeCursor.length },
      });
    }
  }

  return suggestions;
}
