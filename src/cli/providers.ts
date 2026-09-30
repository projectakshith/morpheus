export type ProviderKey = "claude" | "codex" | "antigravity" | "local" | "cloud";

export const PROVIDERS: Array<{ key: ProviderKey; label: string }> = [
  { key: "claude", label: "claude" },
  { key: "codex", label: "codex" },
  { key: "antigravity", label: "antigravity" },
  { key: "local", label: "local" },
  { key: "cloud", label: "openrouter" },
];

export function providerLabel(key: ProviderKey): string {
  return PROVIDERS.find((p) => p.key === key)?.label ?? key;
}

export function providerOf(modelId: string, catalog?: Array<{ id: string; category: ProviderKey }>): ProviderKey {
  const match = catalog?.find((m) => m.id === modelId);
  if (match) return match.category;
  if (modelId.startsWith("claude/")) return "claude";
  if (modelId.startsWith("codex/")) return "codex";
  if (modelId.startsWith("local/")) return "local";
  if (modelId.startsWith("cloud/")) return "cloud";
  return "antigravity";
}
