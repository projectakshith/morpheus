import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  category: "claude" | "codex" | "antigravity" | "local" | "cloud";
  providerName: string;
  contextLimit: string;
  costTier: string;
  rateLimit: string;
  badge: string;
  speed: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  /* Claude (Anthropic Pro Direct Inference) */
  {
    id: "claude/claude-opus-5-5",
    name: "claude/claude-opus-5-5",
    description: "opus 5.5 (flagship reasoning & coding)",
    category: "claude",
    providerName: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    costTier: "claude pro / oauth",
    rateLimit: "5h rolling window",
    badge: "1m · opus",
    speed: "fast",
  },
  {
    id: "claude/claude-sonnet-5",
    name: "claude/claude-sonnet-5",
    description: "sonnet 5 (high speed & intelligence)",
    category: "claude",
    providerName: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    costTier: "claude pro / oauth",
    rateLimit: "5h rolling window",
    badge: "1m · sonnet",
    speed: "ultra-fast",
  },
  {
    id: "claude/claude-haiku-4-5",
    name: "claude/claude-haiku-4-5",
    description: "haiku 4.5 (low latency & concise)",
    category: "claude",
    providerName: "claude pro (anthropic)",
    contextLimit: "200,000 tokens",
    costTier: "claude pro / oauth",
    rateLimit: "5h rolling window",
    badge: "200k · haiku",
    speed: "lightning",
  },
  {
    id: "claude/claude-opus-4-5",
    name: "claude/claude-opus-4-5",
    description: "opus 4.5 (deep architecture & refactor)",
    category: "claude",
    providerName: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    costTier: "claude pro / oauth",
    rateLimit: "5h rolling window",
    badge: "1m · opus",
    speed: "moderate",
  },

  /* Codex (ChatGPT Plus / Pro OAuth) */
  {
    id: "codex/gpt-6.1-sol",
    name: "codex/gpt-6.1-sol",
    description: "gpt 6.1 sol (flagship reasoning)",
    category: "codex",
    providerName: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    costTier: "chatgpt plus / oauth",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    speed: "fast",
  },
  {
    id: "codex/gpt-6-sol",
    name: "codex/gpt-6-sol",
    description: "gpt 6 sol (deep code & agent)",
    category: "codex",
    providerName: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    costTier: "chatgpt plus / oauth",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    speed: "fast",
  },
  {
    id: "codex/gpt-6-luna",
    name: "codex/gpt-6-luna",
    description: "gpt 6 luna (lightweight & snappy)",
    category: "codex",
    providerName: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    costTier: "chatgpt plus / oauth",
    rateLimit: "5h rolling window",
    badge: "128k · fast",
    speed: "ultra-fast",
  },
  {
    id: "codex/gpt-5.6-sol",
    name: "codex/gpt-5.6-sol",
    description: "gpt 5.6 sol (reliable & balanced)",
    category: "codex",
    providerName: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    costTier: "chatgpt plus / oauth",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    speed: "fast",
  },

  /* Antigravity (Google Cloud Code) */
  {
    id: "flash",
    name: "flash (gemini-3.8-flash)",
    description: "gemini 3.8 flash (fast & smart)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "1,048,576 tokens (1m)",
    costTier: "free / included",
    rateLimit: "60 rpm · 4m tpm",
    badge: "1m · free",
    speed: "ultra-fast",
  },
  {
    id: "claude-opus-4-6-thinking",
    name: "claude-opus-4-6-thinking",
    description: "claude opus 4.6 (deep reasoning)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "200,000 tokens",
    costTier: "free / included",
    rateLimit: "60 rpm · 2m tpm",
    badge: "200k · think",
    speed: "moderate",
  },
  {
    id: "claude-sonnet-4-6",
    name: "claude-sonnet-4-6",
    description: "claude sonnet 4.6 (thinking)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "200,000 tokens",
    costTier: "free / included",
    rateLimit: "60 rpm · 2m tpm",
    badge: "200k · fast",
    speed: "fast",
  },
  {
    id: "gemini-3.1-pro-high",
    name: "gemini-3.1-pro-high",
    description: "gemini 3.1 pro (high effort)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "2,097,152 tokens (2m)",
    costTier: "free / included",
    rateLimit: "60 rpm · 4m tpm",
    badge: "2m · pro",
    speed: "fast",
  },
  {
    id: "gemini-3.6-flash-high",
    name: "gemini-3.6-flash-high",
    description: "gemini 3.6 flash (high)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "1,048,576 tokens (1m)",
    costTier: "free / included",
    rateLimit: "60 rpm · 4m tpm",
    badge: "1m · fast",
    speed: "ultra-fast",
  },
  {
    id: "gpt-oss-120b-medium",
    name: "gpt-oss-120b-medium",
    description: "gpt-oss 120b (medium)",
    category: "antigravity",
    providerName: "antigravity oauth",
    contextLimit: "128,000 tokens",
    costTier: "free / included",
    rateLimit: "60 rpm · 2m tpm",
    badge: "128k · free",
    speed: "fast",
  },

  /* Local (Ollama) */
  {
    id: "local/qwen2.5-coder:7b",
    name: "local/qwen2.5-coder:7b",
    description: "qwen 2.5 coder 7b",
    category: "local",
    providerName: "local ollama (11434)",
    contextLimit: "32,768 tokens",
    costTier: "zero cost (local)",
    rateLimit: "unlimited",
    badge: "32k · local",
    speed: "gpu / metal",
  },
  {
    id: "local/llama3.3",
    name: "local/llama3.3",
    description: "llama 3.3",
    category: "local",
    providerName: "local ollama (11434)",
    contextLimit: "128,000 tokens",
    costTier: "zero cost (local)",
    rateLimit: "unlimited",
    badge: "128k · local",
    speed: "gpu / metal",
  },

  /* Cloud (OpenRouter) */
  {
    id: "cloud/stealth/space-bunny-alpha",
    name: "cloud/stealth/space-bunny-alpha",
    description: "space bunny alpha (1m context)",
    category: "cloud",
    providerName: "openrouter cloud",
    contextLimit: "1,000,000 tokens",
    costTier: "pay-as-you-go",
    rateLimit: "tier bound",
    badge: "1m · credits",
    speed: "cloud api",
  },
];

export interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  width?: number;
  height?: number;
  usage?: TokenUsage;
}

export function ModelSelector({
  currentModel,
  onSelect,
  onClose,
  width = 80,
  height = 24,
  usage,
}: ModelSelectorProps) {
  const initialIndex = Math.max(
    0,
    AVAILABLE_MODELS.findIndex(
      (m) =>
        m.id === currentModel ||
        (m.id === "flash" && currentModel.includes("flash"))
    )
  );

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }

    if (key.return) {
      const selected = AVAILABLE_MODELS[selectedIndex];
      if (selected) {
        onSelect(selected.id);
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : AVAILABLE_MODELS.length - 1
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) =>
        prev < AVAILABLE_MODELS.length - 1 ? prev + 1 : 0
      );
      return;
    }
  });

  const categories: Array<{
    key: "claude" | "codex" | "antigravity" | "local" | "cloud";
    label: string;
  }> = [
    { key: "claude", label: "claude (anthropic pro)" },
    { key: "codex", label: "codex (chatgpt plus)" },
    { key: "antigravity", label: "antigravity (google cloud code)" },
    { key: "local", label: "local (ollama 11434)" },
    { key: "cloud", label: "cloud (openrouter)" },
  ];

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(52, Math.max(38, Math.floor(totalContentWidth * 0.48)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 4);

  const selectedModel = AVAILABLE_MODELS[selectedIndex] || AVAILABLE_MODELS[0];
  const isSelectedActive =
    selectedModel.id === currentModel ||
    (selectedModel.id === "flash" && currentModel.includes("flash"));

  const sessionTokensStr = usage?.totalTokens
    ? `${(usage.totalTokens / 1000).toFixed(1)}k tokens (in: ${(usage.promptTokens / 1000).toFixed(1)}k · out: ${(usage.completionTokens / 1000).toFixed(1)}k)`
    : "0 tokens used";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      width={width}
      height={height}
      paddingX={2}
      paddingY={1}
      overflow="hidden"
    >
      {/* Top Header */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginBottom={1} overflow="hidden">
        <Box flexDirection="row">
          <Text bold color={theme.accentBright}>
            morpheus · model catalog
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.text}>active: {currentModel}</Text>
        </Box>
        <Text color={theme.muted}>
          [↑/↓ move · enter select · esc close]
        </Text>
      </Box>

      {/* Main Two-Column Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Categorized Model List */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          {categories.map((cat) => {
            const catModels = AVAILABLE_MODELS.filter((m) => m.category === cat.key);
            if (catModels.length === 0) return null;

            return (
              <Box key={cat.key} flexDirection="column" marginBottom={1}>
                <Text bold color={theme.secondary}>
                  {cat.label}
                </Text>

                {catModels.map((m) => {
                  const globalIdx = AVAILABLE_MODELS.findIndex((item) => item.id === m.id);
                  const isSelected = globalIdx === selectedIndex;
                  const isActive =
                    m.id === currentModel ||
                    (m.id === "flash" && currentModel.includes("flash"));

                  return (
                    <Box
                      key={m.id}
                      flexDirection="row"
                      justifyContent="space-between"
                      paddingLeft={1}
                    >
                      <Box flexDirection="row">
                        <Text color={isSelected ? theme.accentBright : theme.muted}>
                          {isSelected ? "▶ " : "  "}
                        </Text>
                        <Text
                          bold={isSelected}
                          color={isSelected ? theme.accentBright : theme.text}
                        >
                          {m.id}
                        </Text>
                      </Box>

                      <Box flexDirection="row">
                        <Text color={theme.muted}>[{m.badge}]</Text>
                        {isActive && (
                          <Text color={theme.accentBright} bold>
                            {" "}[active]
                          </Text>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>

        {/* Vertical Divider with comfortable margins */}
        <Box width={1} height={bodyHeight} flexDirection="column" overflow="hidden" marginX={1}>
          {Array.from({ length: bodyHeight }).map((_, i) => (
            <Box key={`div_${i}`} height={1}>
              <Text color={theme.border}>│</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Clean Specs & Usage Pane */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              model specifications
            </Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>model name</Text>
              <Text bold color={theme.secondary}>{selectedModel.name}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>provider</Text>
              <Text color={theme.text}>{selectedModel.providerName}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>speed tier</Text>
              <Text color={theme.text}>{selectedModel.speed}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>status</Text>
              <Text bold color={isSelectedActive ? theme.accentBright : theme.secondary}>
                {isSelectedActive ? "[active]" : "[available]"}
              </Text>
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              usage & quota
            </Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>context window</Text>
              <Text bold color={theme.text}>{selectedModel.contextLimit}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>cost / pricing</Text>
              <Text color={theme.accent}>{selectedModel.costTier}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>rate limits</Text>
              <Text color={theme.text}>{selectedModel.rateLimit}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>session usage</Text>
              <Text color={isSelectedActive && usage ? theme.accentBright : theme.muted}>
                {isSelectedActive ? sessionTokensStr : "inactive"}
              </Text>
            </Box>
          </Box>

          <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={isSelectedActive ? theme.accentBright : theme.border}>
            <Text bold color={isSelectedActive ? theme.accentBright : theme.secondary}>
              {isSelectedActive
                ? "active for agent operations"
                : "press [enter] to activate this model"}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Bottom Key Hints */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginTop={1} overflow="hidden">
        <Text color={theme.muted}>
          [enter select · esc cancel]
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
