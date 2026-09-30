import React, { useState, useEffect, useMemo } from "react";
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
  {
    id: "claude/claude-sonnet-4-5",
    name: "claude/claude-sonnet-4-5",
    description: "sonnet 4.5 (balanced coding)",
    category: "claude",
    providerName: "claude pro (anthropic)",
    contextLimit: "200,000 tokens",
    costTier: "claude pro / oauth",
    rateLimit: "5h rolling window",
    badge: "200k · sonnet",
    speed: "fast",
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
    id: "gemini-3.8-flash-high",
    name: "gemini-3.8-flash-high",
    description: "gemini 3.8 flash (high effort)",
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

  /* Local Ollama (Zero Cost / On-Device) */
  {
    id: "local/qwen2.5-coder:7b",
    name: "local/qwen2.5-coder:7b",
    description: "qwen 2.5 coder 7b (on-device)",
    category: "local",
    providerName: "local ollama (11434)",
    contextLimit: "32,768 tokens",
    costTier: "zero cost (on-device)",
    rateLimit: "unlimited (hardware)",
    badge: "32k · local",
    speed: "gpu / metal",
  },
  {
    id: "local/qwen3:14b",
    name: "local/qwen3:14b",
    description: "qwen 3 14b (on-device)",
    category: "local",
    providerName: "local ollama (11434)",
    contextLimit: "32,768 tokens",
    costTier: "zero cost (on-device)",
    rateLimit: "unlimited (hardware)",
    badge: "32k · local",
    speed: "gpu / metal",
  },
  {
    id: "local/llama3.3",
    name: "local/llama3.3",
    description: "llama 3.3 (on-device)",
    category: "local",
    providerName: "local ollama (11434)",
    contextLimit: "128,000 tokens",
    costTier: "zero cost (on-device)",
    rateLimit: "unlimited (hardware)",
    badge: "128k · local",
    speed: "gpu / metal",
  },

  /* Cloud OpenRouter (100% Free Tier Models & Hosted NVIDIA Nemotron) */
  {
    id: "cloud/nvidia/nemotron-3.5-lightning:free",
    name: "cloud/nvidia/nemotron-3.5-lightning:free",
    description: "nemotron 3.5 lightning (nvidia)",
    category: "cloud",
    providerName: "nvidia / openrouter",
    contextLimit: "128,000 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    speed: "fast",
  },
  {
    id: "cloud/nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "cloud/nvidia/nemotron-3-ultra-550b-a55b:free",
    description: "nemotron 3 ultra 550b (nvidia reasoning)",
    category: "cloud",
    providerName: "nvidia / openrouter",
    contextLimit: "128,000 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    speed: "deep reasoning",
  },
  {
    id: "cloud/qwen/qwen3.8-27b:free",
    name: "cloud/qwen/qwen3.8-27b:free",
    description: "qwen 3.8 27b",
    category: "cloud",
    providerName: "openrouter cloud",
    contextLimit: "32,768 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "32k · free",
    speed: "fast",
  },
  {
    id: "cloud/deepseek/deepseek-r1:free",
    name: "cloud/deepseek/deepseek-r1:free",
    description: "deepseek r1 (671b reasoning)",
    category: "cloud",
    providerName: "openrouter cloud",
    contextLimit: "128,000 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    speed: "moderate",
  },
  {
    id: "cloud/meta-llama/llama-3.3-70b-instruct:free",
    name: "cloud/meta-llama/llama-3.3-70b-instruct:free",
    description: "llama 3.3 70b instruct",
    category: "cloud",
    providerName: "openrouter cloud",
    contextLimit: "128,000 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    speed: "fast",
  },
  {
    id: "cloud/stealth/space-bunny-alpha",
    name: "cloud/stealth/space-bunny-alpha",
    description: "space bunny alpha (1m context)",
    category: "cloud",
    providerName: "openrouter cloud",
    contextLimit: "1,000,000 tokens",
    costTier: "$0.00 / 100% free",
    rateLimit: "tier bound",
    badge: "1m · free",
    speed: "cloud api",
  },
];

export interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  baseURL?: string;
  width?: number;
  height?: number;
  usage?: TokenUsage;
}

export type CategoryKey = "claude" | "codex" | "antigravity" | "local" | "cloud";

const CATEGORY_TABS: Array<{ key: CategoryKey; label: string; num: string }> = [
  { key: "claude", label: "claude pro", num: "1" },
  { key: "codex", label: "codex plus", num: "2" },
  { key: "antigravity", label: "antigravity", num: "3" },
  { key: "local", label: "local (free)", num: "4" },
  { key: "cloud", label: "cloud (free)", num: "5" },
];

function getInitialCategory(modelId: string, modelList: ModelOption[]): CategoryKey {
  const match = modelList.find(
    (m) => m.id === modelId || (m.id === "flash" && modelId.includes("flash"))
  );
  if (match) return match.category;
  if (modelId.startsWith("claude/")) return "claude";
  if (modelId.startsWith("codex/")) return "codex";
  if (modelId.startsWith("local/")) return "local";
  if (modelId.startsWith("cloud/")) return "cloud";
  return "antigravity";
}

export function ModelSelector({
  currentModel,
  onSelect,
  onClose,
  baseURL = "http://127.0.0.1:8787/v1",
  width = 80,
  height = 24,
  usage,
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>(AVAILABLE_MODELS);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(() =>
    getInitialCategory(currentModel, AVAILABLE_MODELS)
  );

  /* Fetch live dynamic models from Neo proxy if available */
  useEffect(() => {
    let isMounted = true;
    const fetchLiveModels = async () => {
      try {
        const rootBase = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;
        const res = await fetch(`${rootBase}/v1/models`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: ModelOption[] };
          if (Array.isArray(json.data) && json.data.length > 0 && isMounted) {
            setModels(json.data);
          }
        }
      } catch {}
    };

    fetchLiveModels();
    return () => {
      isMounted = false;
    };
  }, [baseURL]);

  const tabModels = useMemo(() => {
    const filtered = models.filter((m) => m.category === activeCategory);
    return filtered.length > 0 ? filtered : models;
  }, [models, activeCategory]);

  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = tabModels.findIndex(
      (m) => m.id === currentModel || (m.id === "flash" && currentModel.includes("flash"))
    );
    return idx >= 0 ? idx : 0;
  });

  const switchTab = (newCat: CategoryKey) => {
    setActiveCategory(newCat);
    const newTabModels = models.filter((m) => m.category === newCat);
    const idx = newTabModels.findIndex(
      (m) => m.id === currentModel || (m.id === "flash" && currentModel.includes("flash"))
    );
    setSelectedIndex(idx >= 0 ? idx : 0);
  };

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }

    /* Direct jump to tab with numeric keys 1 - 5 */
    if (input === "1") { switchTab("claude"); return; }
    if (input === "2") { switchTab("codex"); return; }
    if (input === "3") { switchTab("antigravity"); return; }
    if (input === "4") { switchTab("local"); return; }
    if (input === "5") { switchTab("cloud"); return; }

    /* Cycle tabs with Tab, Right Arrow, Left Arrow */
    if (key.tab || key.rightArrow || input === "l") {
      const curIdx = CATEGORY_TABS.findIndex((t) => t.key === activeCategory);
      const nextIdx = (curIdx + 1) % CATEGORY_TABS.length;
      switchTab(CATEGORY_TABS[nextIdx].key);
      return;
    }
    if (key.leftArrow || input === "h") {
      const curIdx = CATEGORY_TABS.findIndex((t) => t.key === activeCategory);
      const prevIdx = (curIdx - 1 + CATEGORY_TABS.length) % CATEGORY_TABS.length;
      switchTab(CATEGORY_TABS[prevIdx].key);
      return;
    }

    /* Move up and down within active tab */
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : tabModels.length - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < tabModels.length - 1 ? prev + 1 : 0));
      return;
    }

    /* Activate selected model */
    if (key.return) {
      const selected = tabModels[selectedIndex];
      if (selected) {
        onSelect(selected.id);
      }
      return;
    }
  });

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(52, Math.max(38, Math.floor(totalContentWidth * 0.48)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 6);

  const selectedModel = tabModels[selectedIndex] || tabModels[0];
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
      borderColor={theme.secondary}
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
          [1-5/tab switch category · esc close]
        </Text>
      </Box>

      {/* Horizontal Category Tabs Bar */}
      <Box height={1} width={totalContentWidth} flexDirection="row" marginBottom={1} overflow="hidden">
        {CATEGORY_TABS.map((tab, idx) => {
          const isActive = tab.key === activeCategory;
          return (
            <Box key={tab.key} marginRight={2}>
              {isActive ? (
                <Text bold color={theme.accentBright}>
                  [{tab.num}] {tab.label}
                </Text>
              ) : (
                <Text color={theme.muted}>
                  [{tab.num}] {tab.label}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Main Two-Column Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Models in Active Tab (Always fits without clipping) */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          <Box marginBottom={1} justifyContent="space-between">
            <Text bold color={theme.secondary}>
              {CATEGORY_TABS.find((t) => t.key === activeCategory)?.label} models ({tabModels.length})
            </Text>
            <Text color={theme.muted}>
              {selectedIndex + 1}/{tabModels.length}
            </Text>
          </Box>

          {tabModels.map((m, idx) => {
            const isSelected = idx === selectedIndex;
            const isActive =
              m.id === currentModel ||
              (m.id === "flash" && currentModel.includes("flash"));

            return (
              <Box
                key={m.id}
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                marginBottom={1}
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

        {/* Vertical Divider */}
        <Box width={1} height={bodyHeight} flexDirection="column" overflow="hidden" marginX={1}>
          {Array.from({ length: bodyHeight }).map((_, i) => (
            <Box key={`div_${i}`} height={1}>
              <Text color={theme.border}>│</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Model Specifications & Live Quota */}
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
          [1-5/tab] tabs · [↑/↓] select · [enter] activate · [esc] close
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
