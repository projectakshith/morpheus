import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";

export interface ModelUsageSpec {
  id: string;
  name: string;
  category: "claude" | "codex" | "antigravity" | "local" | "cloud";
  provider: string;
  contextLimit: string;
  contextTokens: number;
  costTier: string;
  rateLimit: string;
  badge: string;
  pricing: string;
}

export const MODEL_USAGE_CATALOG: ModelUsageSpec[] = [
  /* Claude (Anthropic Pro Direct Inference) */
  {
    id: "claude/claude-opus-5-5",
    name: "claude/claude-opus-5-5",
    category: "claude",
    provider: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    contextTokens: 1000000,
    costTier: "claude pro quota",
    rateLimit: "5h rolling window",
    badge: "1m · opus",
    pricing: "$0.00 (pro subscription)",
  },
  {
    id: "claude/claude-sonnet-5",
    name: "claude/claude-sonnet-5",
    category: "claude",
    provider: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    contextTokens: 1000000,
    costTier: "claude pro quota",
    rateLimit: "5h rolling window",
    badge: "1m · sonnet",
    pricing: "$0.00 (pro subscription)",
  },
  {
    id: "claude/claude-haiku-4-5",
    name: "claude/claude-haiku-4-5",
    category: "claude",
    provider: "claude pro (anthropic)",
    contextLimit: "200,000 tokens",
    contextTokens: 200000,
    costTier: "claude pro quota",
    rateLimit: "5h rolling window",
    badge: "200k · haiku",
    pricing: "$0.00 (pro subscription)",
  },
  {
    id: "claude/claude-opus-4-5",
    name: "claude/claude-opus-4-5",
    category: "claude",
    provider: "claude pro (anthropic)",
    contextLimit: "1,000,000 tokens",
    contextTokens: 1000000,
    costTier: "claude pro quota",
    rateLimit: "5h rolling window",
    badge: "1m · opus",
    pricing: "$0.00 (pro subscription)",
  },

  {
    id: "codex/gpt-6.1-sol",
    name: "codex/gpt-6.1-sol",
    category: "codex",
    provider: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "chatgpt plus quota",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    pricing: "$0.00 (plus subscription)",
  },
  {
    id: "codex/gpt-6-sol",
    name: "codex/gpt-6-sol",
    category: "codex",
    provider: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "chatgpt plus quota",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    pricing: "$0.00 (plus subscription)",
  },
  {
    id: "codex/gpt-6-luna",
    name: "codex/gpt-6-luna",
    category: "codex",
    provider: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "chatgpt plus quota",
    rateLimit: "5h rolling window",
    badge: "128k · fast",
    pricing: "$0.00 (plus subscription)",
  },
  {
    id: "codex/gpt-5.6-sol",
    name: "codex/gpt-5.6-sol",
    category: "codex",
    provider: "chatgpt plus (codex)",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "chatgpt plus quota",
    rateLimit: "5h rolling window",
    badge: "128k · plus",
    pricing: "$0.00 (plus subscription)",
  },
  {
    id: "flash",
    name: "flash (gemini-3.8-flash)",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "1,048,576 tokens (1m)",
    contextTokens: 1048576,
    costTier: "free / oauth quota",
    rateLimit: "60 rpm · 4m tpm",
    badge: "1m · free",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "claude-opus-4-6-thinking",
    name: "claude-opus-4-6-thinking",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "200,000 tokens",
    contextTokens: 200000,
    costTier: "included via oauth",
    rateLimit: "60 rpm · 2m tpm",
    badge: "200k · think",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "claude-sonnet-4-6",
    name: "claude-sonnet-4-6",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "200,000 tokens",
    contextTokens: 200000,
    costTier: "included via oauth",
    rateLimit: "60 rpm · 2m tpm",
    badge: "200k · fast",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "gemini-3.1-pro-high",
    name: "gemini-3.1-pro-high",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "2,097,152 tokens (2m)",
    contextTokens: 2097152,
    costTier: "included via oauth",
    rateLimit: "60 rpm · 4m tpm",
    badge: "2m · pro",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "gemini-3.6-flash-high",
    name: "gemini-3.6-flash-high",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "1,048,576 tokens (1m)",
    contextTokens: 1048576,
    costTier: "included via oauth",
    rateLimit: "60 rpm · 4m tpm",
    badge: "1m · fast",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "gpt-oss-120b-medium",
    name: "gpt-oss-120b-medium",
    category: "antigravity",
    provider: "antigravity oauth",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "included via oauth",
    rateLimit: "60 rpm · 2m tpm",
    badge: "128k · free",
    pricing: "$0.00 (cloud code)",
  },
  {
    id: "local/qwen2.5-coder:7b",
    name: "local/qwen2.5-coder:7b",
    category: "local",
    provider: "local ollama (11434)",
    contextLimit: "32,768 tokens",
    contextTokens: 32768,
    costTier: "zero cost (on-device)",
    rateLimit: "unlimited (hardware)",
    badge: "32k · local",
    pricing: "$0.00 (local metal/gpu)",
  },
  {
    id: "local/llama3.3",
    name: "local/llama3.3",
    category: "local",
    provider: "local ollama (11434)",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "zero cost (on-device)",
    rateLimit: "unlimited (hardware)",
    badge: "128k · local",
    pricing: "$0.00 (local metal/gpu)",
  },
  {
    id: "cloud/stealth/space-bunny-alpha",
    name: "cloud/stealth/space-bunny-alpha",
    category: "cloud",
    provider: "openrouter cloud",
    contextLimit: "1,000,000 tokens",
    contextTokens: 1000000,
    costTier: "openrouter credits",
    rateLimit: "tier bound",
    badge: "1m · credits",
    pricing: "openrouter api",
  },
];

export interface UsageModalProps {
  currentModel: string;
  usage?: TokenUsage;
  baseURL?: string;
  sessionId?: string;
  width?: number;
  height?: number;
  onOpenModelSelector?: () => void;
  onClose: () => void;
}

export function UsageModal({
  currentModel,
  usage,
  baseURL = "http://127.0.0.1:8787/v1",
  sessionId = "active",
  width = 80,
  height = 24,
  onOpenModelSelector,
  onClose,
}: UsageModalProps) {
  const initialIndex = Math.max(
    0,
    MODEL_USAGE_CATALOG.findIndex(
      (m) =>
        m.id === currentModel ||
        (m.id === "flash" && currentModel.includes("flash"))
    )
  );

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [openRouterUsage, setOpenRouterUsage] = useState<string | null>(null);
  const [codexStatus, setCodexStatus] = useState<{
    fiveHour?: string;
    weekly?: string;
    resetsAt?: string;
    resetCredits?: number;
    planType?: string;
  } | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<{
    fiveHour?: string;
    weekly?: string;
    resetsAt?: string;
    subscriptionType?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchUsage = async () => {
      const rootBase = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;
      try {
        const res = await fetch(`${rootBase}/v1/auth/status?provider=openrouter`, {
          signal: AbortSignal.timeout(600),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            details?: { usage?: number; limit?: number; isFreeTier?: boolean };
          };
          if (data.details && isMounted) {
            const used = data.details.usage ? `$${data.details.usage.toFixed(6)}` : "$0.00";
            const lim = data.details.limit ? `$${data.details.limit.toFixed(2)}` : "$1.00";
            setOpenRouterUsage(`${used} / ${lim}`);
          }
        }
      } catch {}

      try {
        const clRes = await fetch(`${rootBase}/v1/auth/status?provider=claude`, {
          signal: AbortSignal.timeout(600),
        });
        if (clRes.ok) {
          const data = (await clRes.json()) as {
            authenticated?: boolean;
            details?: {
              fiveHourUsedPercent?: string;
              weeklyUsedPercent?: string;
              fiveHourResetsAt?: string;
              subscriptionType?: string;
            };
          };
          if (data.authenticated && data.details && isMounted) {
            setClaudeStatus({
              fiveHour: data.details.fiveHourUsedPercent,
              weekly: data.details.weeklyUsedPercent,
              resetsAt: data.details.fiveHourResetsAt,
              subscriptionType: data.details.subscriptionType,
            });
          }
        }
      } catch {}

      try {
        const cRes = await fetch(`${rootBase}/v1/auth/status?provider=codex`, {
          signal: AbortSignal.timeout(600),
        });
        if (cRes.ok) {
          const data = (await cRes.json()) as {
            authenticated?: boolean;
            details?: {
              fiveHourUsedPercent?: string;
              weeklyUsedPercent?: string;
              fiveHourResetsAt?: string;
              availableResetCredits?: number;
              planType?: string;
            };
          };
          if (data.authenticated && data.details && isMounted) {
            setCodexStatus({
              fiveHour: data.details.fiveHourUsedPercent,
              weekly: data.details.weeklyUsedPercent,
              resetsAt: data.details.fiveHourResetsAt,
              resetCredits: data.details.availableResetCredits,
              planType: data.details.planType,
            });
          }
        }
      } catch {}
    };
    fetchUsage();
    return () => {
      isMounted = false;
    };
  }, [baseURL]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (input === "m") {
      onOpenModelSelector?.();
      return;
    }

    if (key.return) {
      onOpenModelSelector?.();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : MODEL_USAGE_CATALOG.length - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < MODEL_USAGE_CATALOG.length - 1 ? prev + 1 : 0));
      return;
    }
  });

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(50, Math.max(36, Math.floor(totalContentWidth * 0.46)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 9);

  const selectedModel = MODEL_USAGE_CATALOG[selectedIndex] || MODEL_USAGE_CATALOG[0];
  const isSelectedActive =
    selectedModel.id === currentModel ||
    (selectedModel.id === "flash" && currentModel.includes("flash"));

  /* Session Token Calculations */
  const totalTokens = usage?.totalTokens ?? 0;
  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  const peakContext = usage?.peakContextTokens ?? 0;
  const contextLimit = usage?.contextLimit ?? 128000;

  const pct = Math.min(100, Math.round((peakContext / contextLimit) * 100));
  const barLen = 16;
  const filled = Math.min(barLen, Math.round((pct / 100) * barLen));
  const progressBar = "█".repeat(filled) + "░".repeat(barLen - filled);

  const colWidth = Math.max(16, Math.floor((totalContentWidth - 4) / 3));

  /* Model-specific usage */
  const modelAccumulated = usage?.byModel?.[selectedModel.id] || (isSelectedActive ? {
    promptTokens,
    completionTokens,
    totalTokens,
  } : null);

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
      {/* Top Header in clean lowercase */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginBottom={1} overflow="hidden">
        <Box flexDirection="row">
          <Text bold color={theme.accentBright}>
            morpheus · usage & quotas
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.text}>session: {sessionId.slice(0, 16)}</Text>
        </Box>
        <Text color={theme.muted}>
          [↑/↓ move · m switch model · esc close]
        </Text>
      </Box>

      {/* Top Metrics Row with explicit integer column widths */}
      <Box flexDirection="row" width={totalContentWidth} justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column" width={colWidth}>
          <Text color={theme.muted}>session tokens</Text>
          <Text bold color={theme.accentBright}>
            {totalTokens.toLocaleString()} tokens
          </Text>
          <Text color={theme.text}>
            in: {promptTokens.toLocaleString()} · out: {completionTokens.toLocaleString()}
          </Text>
        </Box>

        <Box flexDirection="column" width={colWidth}>
          <Text color={theme.muted}>context usage</Text>
          <Text bold color={pct > 80 ? theme.error : theme.secondary}>
            {peakContext.toLocaleString()} / {contextLimit.toLocaleString()} ({pct}%)
          </Text>
          <Text color={pct > 80 ? theme.error : theme.accent}>
            [{progressBar}]
          </Text>
        </Box>

        <Box flexDirection="column" width={colWidth}>
          <Text color={theme.muted}>cost / credits</Text>
          <Text bold color={theme.accentBright}>
            {selectedModel.category === "codex" && codexStatus
              ? `chatgpt ${codexStatus.planType || "plus"}: ${codexStatus.fiveHour || "0%"} (5h)`
              : selectedModel.category === "claude" && claudeStatus
              ? `claude ${claudeStatus.subscriptionType || "pro"}: ${claudeStatus.fiveHour || "0%"} (5h)`
              : "$0.00 usd (free quota)"}
          </Text>
          <Text color={theme.text}>
            {selectedModel.category === "codex" && codexStatus
              ? `weekly: ${codexStatus.weekly || "0%"} · resets ${codexStatus.resetsAt || "soon"}`
              : selectedModel.category === "claude" && claudeStatus
              ? `weekly: ${claudeStatus.weekly || "0%"} · resets ${claudeStatus.resetsAt || "soon"}`
              : openRouterUsage ? `openrouter: ${openRouterUsage}` : "unlimited local / oauth"}
          </Text>
        </Box>
      </Box>

      {/* Clean Divider Line */}
      <Box height={1} width={totalContentWidth} marginBottom={1} overflow="hidden">
        <Text color={theme.border}>{"─".repeat(totalContentWidth)}</Text>
      </Box>

      {/* Main Two-Column Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Models List */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          <Box marginBottom={1}>
            <Text bold color={theme.secondary}>
              models & rate limits
            </Text>
          </Box>

          {MODEL_USAGE_CATALOG.map((m, idx) => {
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

        {/* Right Column: Quota & Pricing Specification */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              details & quota
            </Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>model</Text>
              <Text bold color={theme.secondary}>{selectedModel.name}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>provider</Text>
              <Text color={theme.text}>{selectedModel.provider}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>context ceiling</Text>
              <Text bold color={theme.text}>{selectedModel.contextLimit}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>rate limit</Text>
              <Text color={theme.text}>{selectedModel.rateLimit}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>cost tier</Text>
              <Text color={theme.accent}>{selectedModel.costTier}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>pricing</Text>
              <Text color={theme.accentBright}>{selectedModel.pricing}</Text>
            </Box>
          </Box>

          {selectedModel.category === "codex" && codexStatus && (
            <Box flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>5h rolling quota</Text>
                <Text bold color={theme.accentBright}>{codexStatus.fiveHour || "0%"} used</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>5h reset window</Text>
                <Text color={theme.text}>{codexStatus.resetsAt || "rolling"}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>weekly quota</Text>
                <Text color={theme.text}>{codexStatus.weekly || "0%"} used</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>reset credits</Text>
                <Text color={theme.secondary}>{codexStatus.resetCredits ?? 0} available</Text>
              </Box>
            </Box>
          )}

          {selectedModel.category === "claude" && claudeStatus && (
            <Box flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>5h rolling quota</Text>
                <Text bold color={theme.accentBright}>{claudeStatus.fiveHour || "0%"} used</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>5h reset window</Text>
                <Text color={theme.text}>{claudeStatus.resetsAt || "rolling"}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>weekly quota</Text>
                <Text color={theme.text}>{claudeStatus.weekly || "0%"} used</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>subscription</Text>
                <Text color={theme.secondary}>{claudeStatus.subscriptionType || "pro"} account</Text>
              </Box>
            </Box>
          )}

          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              usage
            </Text>
          </Box>

          {modelAccumulated && modelAccumulated.totalTokens > 0 ? (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>session</Text>
                <Text bold color={theme.accentBright}>{modelAccumulated.totalTokens.toLocaleString()} tokens</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>prompt</Text>
                <Text color={theme.text}>{modelAccumulated.promptTokens.toLocaleString()} tokens</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>completion</Text>
                <Text color={theme.text}>{modelAccumulated.completionTokens.toLocaleString()} tokens</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>turn cost</Text>
                <Text color={theme.accentBright}>$0.00 (quota)</Text>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={theme.muted}>0 tokens consumed in this session</Text>
              {!isSelectedActive && (
                <Box marginTop={1}>
                  <Text color={theme.secondary}>press [enter] to switch to this model</Text>
                </Box>
              )}
            </Box>
          )}

          {isSelectedActive && (
            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
              <Text color={theme.accentBright} bold>
                active model driving morpheus
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom Key Hints in lowercase */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginTop={1} overflow="hidden">
        <Text color={theme.muted}>
          [enter switch model · esc close]
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
