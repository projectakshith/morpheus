import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";

export interface SettingsSelectorProps {
  currentModel: string;
  onOpenModelSelector: () => void;
  onOpenSessionSelector: () => void;
  onOpenNeoModal?: () => void;
  onOpenUsageModal?: () => void;
  onResetSession: () => void;
  onClose: () => void;
  baseURL?: string;
  width?: number;
  height?: number;
  maxSteps?: number;
  onUpdateMaxSteps?: (steps: number) => void;
  sessionId?: string;
  usage?: TokenUsage;
}

interface SettingItem {
  id: string;
  category: "providers" | "execution" | "session";
  label: string;
  value: string;
  hint: string;
  action: () => void;
}

export function SettingsSelector({
  currentModel,
  onOpenModelSelector,
  onOpenSessionSelector,
  onOpenNeoModal,
  onOpenUsageModal,
  onResetSession,
  onClose,
  baseURL = "http://127.0.0.1:8787/v1",
  width = 80,
  height = 24,
  maxSteps = 25,
  onUpdateMaxSteps,
  sessionId = "active",
  usage,
}: SettingsSelectorProps) {
  const [providerStatuses, setProviderStatuses] = useState<Record<string, string>>({
    neo: "checking...",
    claude: "checking...",
    codex: "checking...",
    antigravity: "checking...",
    openrouter: "checking...",
    local: "checking...",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkProviders = async () => {
      const providers = ["claude", "codex", "antigravity", "openrouter", "local"];
      const nextStatus: Record<string, string> = {};

      const rootBase = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;
      try {
        const hRes = await fetch(`${rootBase}/health`, { signal: AbortSignal.timeout(600) });
        nextStatus.neo = hRes.ok ? "online" : "error";
      } catch {
        nextStatus.neo = "offline";
      }

      for (const p of providers) {
        try {
          const url = baseURL.endsWith("/v1")
            ? `${baseURL}/auth/status?provider=${p}`
            : `${baseURL}/v1/auth/status?provider=${p}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(600) });
          if (res.ok) {
            const data = (await res.json()) as { authenticated?: boolean };
            nextStatus[p] = data.authenticated ? "online" : "unauthenticated";
          } else {
            nextStatus[p] = "offline";
          }
        } catch {
          nextStatus[p] = "offline";
        }
      }

      if (isMounted) {
        setProviderStatuses(nextStatus);
      }
    };

    checkProviders();
    return () => {
      isMounted = false;
    };
  }, [baseURL]);

  const items: SettingItem[] = [
    /* Providers */
    {
      id: "neo",
      category: "providers",
      label: "neo router (8787)",
      value: providerStatuses.neo || "checking",
      hint: "[enter to inspect router]",
      action: () => {
        if (onOpenNeoModal) {
          onOpenNeoModal();
        } else {
          setActionFeedback(
            providerStatuses.neo === "online"
              ? "neo router online on port 8787."
              : "neo router offline. run `cd ~/Developer/neo && npm run dev`."
          );
        }
      },
    },
    {
      id: "claude",
      category: "providers",
      label: "claude (anthropic pro)",
      value: providerStatuses.claude || "checking",
      hint: "[enter to check claude]",
      action: () => {
        setActionFeedback(
          providerStatuses.claude === "online"
            ? "claude authenticated via keychain (pro)."
            : "claude unauthenticated. run `claude auth login`."
        );
      },
    },
    {
      id: "codex",
      category: "providers",
      label: "codex (chatgpt plus)",
      value: providerStatuses.codex || "checking",
      hint: "[enter to check codex]",
      action: () => {
        setActionFeedback(
          providerStatuses.codex === "online"
            ? "codex authenticated via ~/.codex/auth.json."
            : "codex unauthenticated. run `codex login`."
        );
      },
    },
    {
      id: "antigravity",
      category: "providers",
      label: "antigravity oauth",
      value: providerStatuses.antigravity || "checking",
      hint: "[enter to login]",
      action: () => {
        setActionFeedback("run `/login antigravity` to authenticate.");
      },
    },
    {
      id: "openrouter",
      category: "providers",
      label: "openrouter cloud",
      value: providerStatuses.openrouter || "checking",
      hint: "[enter to configure]",
      action: () => {
        setActionFeedback("run `/login openrouter <api-key>` to configure key.");
      },
    },
    {
      id: "local",
      category: "providers",
      label: "local ollama (11434)",
      value: providerStatuses.local || "checking",
      hint: "[enter to probe]",
      action: () => {
        setActionFeedback("ensure `ollama serve` is active on port 11434.");
      },
    },

    /* Execution */
    {
      id: "model",
      category: "execution",
      label: "active model",
      value: currentModel,
      hint: "[enter to switch model]",
      action: () => {
        onOpenModelSelector();
      },
    },
    {
      id: "usage",
      category: "execution",
      label: "token & model usage",
      value: usage?.totalTokens ? `${(usage.totalTokens / 1000).toFixed(1)}k tokens` : "0 tokens",
      hint: "[enter to open usage]",
      action: () => {
        if (onOpenUsageModal) {
          onOpenUsageModal();
        } else {
          setActionFeedback(`total tokens: ${usage?.totalTokens ?? 0}`);
        }
      },
    },
    {
      id: "steps",
      category: "execution",
      label: "step budget",
      value: `${maxSteps} steps`,
      hint: "[enter to cycle budget]",
      action: () => {
        if (onUpdateMaxSteps) {
          const stepsCycle = [15, 25, 50, 100];
          const curIdx = stepsCycle.indexOf(maxSteps);
          const next = stepsCycle[(curIdx + 1) % stepsCycle.length];
          onUpdateMaxSteps(next);
        }
      },
    },

    /* Session */
    {
      id: "sessions",
      category: "session",
      label: "manage sessions",
      value: sessionId.slice(0, 16) + (sessionId.length > 16 ? "…" : ""),
      hint: "[enter to browse past sessions]",
      action: () => {
        onOpenSessionSelector();
      },
    },
    {
      id: "reset",
      category: "session",
      label: "start fresh session",
      value: "reset context",
      hint: "[enter to reset context]",
      action: () => {
        onResetSession();
        setActionFeedback("context reset. fresh session created.");
      },
    },
  ];

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }

    if (key.return) {
      const cur = items[selectedIndex];
      if (cur) {
        cur.action();
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      setActionFeedback(null);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      setActionFeedback(null);
      return;
    }
  });

  const categories: Array<{
    key: "providers" | "execution" | "session";
    title: string;
  }> = [
    { key: "providers", title: "ai providers" },
    { key: "execution", title: "execution & runtime" },
    { key: "session", title: "session & workspace" },
  ];

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(52, Math.max(38, Math.floor(totalContentWidth * 0.48)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 4);

  const selectedItem = items[selectedIndex] || items[0];

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
            morpheus · settings
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.text}>router: {baseURL}</Text>
        </Box>
        <Text color={theme.muted}>
          [↑/↓ move · enter action · esc close]
        </Text>
      </Box>

      {/* Main Two-Column Master-Detail Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Settings List */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          {categories.map((cat) => {
            const catItems = items.filter((it) => it.category === cat.key);
            if (catItems.length === 0) return null;

            return (
              <Box key={cat.key} flexDirection="column" marginBottom={1}>
                <Text bold color={theme.secondary}>
                  {cat.title}
                </Text>

                {catItems.map((item) => {
                  const globalIdx = items.findIndex((it) => it.id === item.id);
                  const isSelected = globalIdx === selectedIndex;

                  const isOnline = item.value === "online";
                  const valColor = isOnline
                    ? theme.accentBright
                    : item.value === "offline" || item.value === "unauthenticated"
                    ? theme.error
                    : theme.secondary;

                  return (
                    <Box
                      key={item.id}
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
                          {item.label}
                        </Text>
                      </Box>

                      <Text color={valColor} bold={isOnline}>
                        [{item.value}]
                      </Text>
                    </Box>
                  );
                })}
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

        {/* Right Column: Clean Inspector Pane */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              inspector & details
            </Text>
          </Box>

          {selectedItem.id === "neo" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>service</Text>
                <Text bold color={theme.secondary}>neo proxy router v0.1.0</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>endpoint</Text>
                <Text color={theme.text}>http://127.0.0.1:8787</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>status</Text>
                <Text bold color={providerStatuses.neo === "online" ? theme.accentBright : theme.error}>
                  {providerStatuses.neo === "online" ? "[online]" : "[offline]"}
                </Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright}>press [enter] to open dedicated neo window.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "codex" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>service</Text>
                <Text bold color={theme.secondary}>openai codex (chatgpt plus)</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>endpoint</Text>
                <Text color={theme.text}>chatgpt.com/backend-api/codex/responses</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>status</Text>
                <Text bold color={providerStatuses.codex === "online" ? theme.accentBright : theme.error}>
                  {providerStatuses.codex === "online" ? "[authenticated]" : "[inactive]"}
                </Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright}>run `codex login` to manage chatgpt credentials.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "antigravity" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>adapter</Text>
                <Text bold color={theme.secondary}>google cloud code (antigravity)</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>auth type</Text>
                <Text color={theme.text}>oauth 2.0 pkce</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>status</Text>
                <Text bold color={providerStatuses.antigravity === "online" ? theme.accentBright : theme.error}>
                  {providerStatuses.antigravity === "online" ? "[authenticated]" : "[unauthenticated]"}
                </Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.border}>
                <Text color={theme.text}>run `/login antigravity` to refresh oauth session.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "openrouter" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>gateway</Text>
                <Text bold color={theme.secondary}>openrouter cloud</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>status</Text>
                <Text bold color={providerStatuses.openrouter === "online" ? theme.accentBright : theme.error}>
                  {providerStatuses.openrouter === "online" ? "[key active]" : "[no key]"}
                </Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.border}>
                <Text color={theme.text}>run `/login openrouter &lt;key&gt;` to configure credentials.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "local" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>engine</Text>
                <Text bold color={theme.secondary}>local ollama node</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>endpoint</Text>
                <Text color={theme.text}>http://127.0.0.1:11434</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>status</Text>
                <Text bold color={providerStatuses.local === "online" ? theme.accentBright : theme.error}>
                  {providerStatuses.local === "online" ? "[online]" : "[offline]"}
                </Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.border}>
                <Text color={theme.text}>ensure `ollama serve` is active on port 11434.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "model" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>current model</Text>
                <Text bold color={theme.accentBright}>{currentModel}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>router target</Text>
                <Text color={theme.text}>neo proxy (8787)</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright}>press [enter] to open model catalog.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "usage" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>session tokens</Text>
                <Text bold color={theme.accentBright}>{usage?.totalTokens?.toLocaleString() ?? 0} tokens</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>prompt / output</Text>
                <Text color={theme.text}>{usage?.promptTokens?.toLocaleString() ?? 0} in · {usage?.completionTokens?.toLocaleString() ?? 0} out</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>peak context</Text>
                <Text color={theme.secondary}>{usage?.peakContextTokens?.toLocaleString() ?? 0} tokens</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright}>press [enter] to open full usage & quotas dashboard.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "steps" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>current runway</Text>
                <Text bold color={theme.accentBright}>{maxSteps} consecutive steps</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>cycle options</Text>
                <Text color={theme.text}>15 → 25 → 50 → 100</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.border}>
                <Text color={theme.secondary}>press [enter] to cycle step budget.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "sessions" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>session id</Text>
                <Text bold color={theme.accentBright}>{sessionId.slice(0, 18)}</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright}>press [enter] to open session explorer.</Text>
              </Box>
            </Box>
          )}

          {selectedItem.id === "reset" && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>action</Text>
                <Text bold color={theme.error}>reset context</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.error}>
                <Text color={theme.error}>press [enter] to archive active context and restart.</Text>
              </Box>
            </Box>
          )}

          {actionFeedback && (
            <Box marginTop={1} borderStyle="single" borderColor={theme.accent} paddingX={1}>
              <Text color={theme.accentBright} bold>
                {actionFeedback}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom Status / Key Hints */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginTop={1} overflow="hidden">
        <Text color={theme.muted}>
          {selectedItem.hint}
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
