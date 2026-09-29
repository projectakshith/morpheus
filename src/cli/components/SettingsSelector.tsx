/*
 * SettingsSelector: Interactive settings and auth dashboard with arrow key navigation.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface SettingsSelectorProps {
  currentModel: string;
  onOpenModelSelector: () => void;
  onOpenSessionSelector: () => void;
  onResetSession: () => void;
  onClose: () => void;
  baseURL?: string;
  width?: number;
  maxSteps?: number;
  onUpdateMaxSteps?: (steps: number) => void;
  sessionId?: string;
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
  onResetSession,
  onClose,
  baseURL = "http://127.0.0.1:8787/v1",
  width = 72,
  maxSteps = 25,
  onUpdateMaxSteps,
  sessionId = "active",
}: SettingsSelectorProps) {
  const [providerStatuses, setProviderStatuses] = useState<Record<string, string>>({
    antigravity: "checking...",
    openrouter: "checking...",
    local: "checking...",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkProviders = async () => {
      const providers = ["antigravity", "openrouter", "local"];
      const nextStatus: Record<string, string> = {};

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
      id: "antigravity",
      category: "providers",
      label: "Google Cloud Code (Antigravity)",
      value: providerStatuses.antigravity || "checking",
      hint: "[Enter to authenticate via OAuth]",
      action: () => {
        setActionFeedback("Run `/login antigravity` to start browser OAuth.");
      },
    },
    {
      id: "openrouter",
      category: "providers",
      label: "OpenRouter (Space Bunny)",
      value: providerStatuses.openrouter || "checking",
      hint: "[Enter to configure API key]",
      action: () => {
        setActionFeedback("Run `/login openrouter <api-key>` to configure key.");
      },
    },
    {
      id: "local",
      category: "providers",
      label: "Local Ollama (127.0.0.1:11434)",
      value: providerStatuses.local || "checking",
      hint: "[Enter to check status]",
      action: () => {
        setActionFeedback("Ensure `ollama serve` is running on port 11434.");
      },
    },

    /* Execution */
    {
      id: "model",
      category: "execution",
      label: "Active Model",
      value: currentModel,
      hint: "[Enter to switch model]",
      action: () => {
        onOpenModelSelector();
      },
    },
    {
      id: "steps",
      category: "execution",
      label: "Step Budget",
      value: `${maxSteps} steps`,
      hint: "[Enter to cycle 15 -> 25 -> 50 -> 100]",
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
      label: "Manage Sessions",
      value: sessionId.slice(0, 16) + (sessionId.length > 16 ? "…" : ""),
      hint: "[Enter to browse past sessions]",
      action: () => {
        onOpenSessionSelector();
      },
    },
    {
      id: "reset",
      category: "session",
      label: "Start Fresh Session",
      value: "reset context",
      hint: "[Enter to clear working context]",
      action: () => {
        onResetSession();
        setActionFeedback("Context reset. Fresh session created.");
      },
    },
  ];

  useInput((input, key) => {
    if (key.escape) {
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

  const boxWidth = Math.min(width - 4, 76);

  const categories: Array<{
    key: "providers" | "execution" | "session";
    title: string;
  }> = [
    { key: "providers", title: "▰ AI PROVIDERS & AUTHENTICATION" },
    { key: "execution", title: "▰ EXECUTION & MODEL RUNTIME" },
    { key: "session", title: "▰ SESSION & CONTEXT" },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.secondary}
      paddingX={1}
      paddingY={1}
      width={boxWidth}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={theme.secondary}>
          MORPHEUS SETTINGS
        </Text>
        <Text color={theme.muted}>
          [↑/↓ navigate · Enter toggle/select · Esc close]
        </Text>
      </Box>

      {categories.map((cat) => {
        const catItems = items.filter((it) => it.category === cat.key);
        if (catItems.length === 0) return null;

        return (
          <Box key={cat.key} flexDirection="column" marginBottom={1}>
            <Text bold color={theme.accent}>
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

                  <Box flexDirection="row">
                    <Text color={valColor} bold={isOnline}>
                      [{item.value}]
                    </Text>
                    {isSelected && (
                      <Text color={theme.muted}> {item.hint}</Text>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        );
      })}

      {actionFeedback && (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.accentBright} italic>
            {actionFeedback}
          </Text>
        </Box>
      )}
    </Box>
  );
}
