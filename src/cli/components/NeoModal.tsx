import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";

export interface NeoModalProps {
  baseURL?: string;
  currentModel: string;
  width?: number;
  height?: number;
  usage?: TokenUsage;
  onOpenModelSelector?: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
}

interface ProviderInfo {
  provider: string;
  name: string;
  authenticated: boolean;
  identity?: string;
  expiry?: string;
  details?: Record<string, unknown>;
  error?: string;
}

interface NeoHealth {
  status: string;
  service?: string;
  role?: string;
  version?: string;
}

export function NeoModal({
  baseURL = "http://127.0.0.1:8787/v1",
  currentModel,
  width = 80,
  height = 24,
  usage,
  onOpenModelSelector,
  onOpenSettings,
  onClose,
}: NeoModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [health, setHealth] = useState<NeoHealth | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rootBase = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;

  const fetchStatus = async () => {
    setIsLoading(true);
    const start = performance.now();
    try {
      const healthRes = await fetch(`${rootBase}/health`, { signal: AbortSignal.timeout(1500) });
      const latency = Math.round(performance.now() - start);

      if (healthRes.ok) {
        const hData = (await healthRes.json()) as NeoHealth;
        setIsOnline(true);
        setLatencyMs(latency);
        setHealth(hData);

        try {
          const authRes = await fetch(`${rootBase}/v1/auth/status`, { signal: AbortSignal.timeout(1500) });
          if (authRes.ok) {
            const authData = (await authRes.json()) as { providers?: ProviderInfo[] };
            if (Array.isArray(authData.providers)) {
              setProviders(authData.providers);
            }
          }
        } catch {
          // Keep health status even if auth probe fails
        }
        setFeedback(`Ping: ${latency}ms at ${new Date().toLocaleTimeString()}`);
      } else {
        setIsOnline(false);
        setLatencyMs(null);
        setHealth(null);
        setFeedback(`Router returned HTTP ${healthRes.status}`);
      }
    } catch {
      setIsOnline(false);
      setLatencyMs(null);
      setHealth(null);
      setFeedback("Neo unreachable on port 8787");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [baseURL]);

  const actions = [
    {
      id: "refresh",
      label: "ping / probe port 8787",
      value: "probe",
      hint: "[enter or 'r']",
      run: () => fetchStatus(),
    },
    {
      id: "model",
      label: "switch active model",
      value: currentModel,
      hint: "[enter or 'm']",
      run: () => onOpenModelSelector?.(),
    },
    {
      id: "settings",
      label: "open full settings",
      value: "settings",
      hint: "[enter or 's']",
      run: () => onOpenSettings?.(),
    },
    {
      id: "close",
      label: "return to morpheus",
      value: "exit",
      hint: "[enter or esc]",
      run: () => onClose(),
    },
  ];

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }

    if (input === "r" || input === "R") {
      fetchStatus();
      return;
    }

    if (input === "m" || input === "M") {
      onOpenModelSelector?.();
      return;
    }

    if (input === "s" || input === "S") {
      onOpenSettings?.();
      return;
    }

    if (key.return) {
      actions[selectedIndex]?.run();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : actions.length - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < actions.length - 1 ? prev + 1 : 0));
      return;
    }
  });

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(52, Math.max(38, Math.floor(totalContentWidth * 0.46)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 4);

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
            morpheus · neo proxy router
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.text}>{rootBase}</Text>
        </Box>
        <Text color={theme.muted}>
          [r refresh · m model · s settings · esc close]
        </Text>
      </Box>

      {/* Main Two-Column Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Router Status & Actions */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          <Box marginBottom={1}>
            <Text bold color={theme.secondary}>
              router health & config
            </Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>connection status</Text>
              <Text
                bold
                color={
                  isLoading
                    ? theme.secondary
                    : isOnline
                    ? theme.accentBright
                    : theme.error
                }
              >
                {isLoading ? "[checking...]" : isOnline ? `[online · ${latencyMs ?? 0}ms]` : "[offline]"}
              </Text>
            </Box>

            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>router role</Text>
              <Text color={theme.text}>
                {health?.role ? health.role.toLowerCase() : "universal proxy"}
              </Text>
            </Box>

            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>router version</Text>
              <Text color={theme.text}>v{health?.version || "0.1.0"}</Text>
            </Box>

            <Box flexDirection="row" justifyContent="space-between">
              <Text color={theme.muted}>active model</Text>
              <Text bold color={theme.accentBright}>{currentModel}</Text>
            </Box>

            {usage && (
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>active tokens</Text>
                <Text color={theme.secondary}>{usage.totalTokens?.toLocaleString() ?? 0} tokens</Text>
              </Box>
            )}
          </Box>

          {/* Router Commands */}
          <Box marginBottom={1}>
            <Text bold color={theme.secondary}>
              router commands
            </Text>
          </Box>
          {actions.map((act, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box
                key={act.id}
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
                    {act.label}
                  </Text>
                </Box>
                <Text color={isSelected ? theme.accentBright : theme.secondary}>
                  [{act.value}]
                </Text>
              </Box>
            );
          })}

          {!isOnline && (
            <Box
              flexDirection="column"
              borderStyle="single"
              borderColor={theme.error}
              paddingX={1}
              marginTop={1}
            >
              <Text bold color={theme.error}>
                ⚠ neo offline
              </Text>
              <Text color={theme.accentBright}>
                cd ~/Developer/neo && npm run dev
              </Text>
            </Box>
          )}
        </Box>

        {/* Vertical Divider */}
        <Box width={1} height={bodyHeight} flexDirection="column" overflow="hidden" marginX={1}>
          {Array.from({ length: bodyHeight }).map((_, i) => (
            <Box key={`div_${i}`} height={1}>
              <Text color={theme.border}>│</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Active Provider Adapters */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              active provider adapters
            </Text>
          </Box>

          {isOnline ? (
            <Box flexDirection="column">
              {providers.length > 0 ? (
                providers.map((p) => {
                  let detailText = p.identity || "";
                  if (p.provider === "antigravity" && p.expiry) {
                    try {
                      const diff = new Date(p.expiry).getTime() - Date.now();
                      if (diff > 0) {
                        const mins = Math.round(diff / 60000);
                        detailText = `${p.identity} (${mins}m remaining)`;
                      }
                    } catch {}
                  } else if (p.provider === "local" && Array.isArray(p.details?.models)) {
                    detailText = `${p.details.models.length} local models: ${(p.details.models as string[]).join(", ")}`;
                  } else if (p.provider === "codex") {
                    const fiveH = p.details?.fiveHourUsedPercent ? ` · 5h: ${p.details.fiveHourUsedPercent}` : "";
                    const week = p.details?.weeklyUsedPercent ? ` · 7d: ${p.details.weeklyUsedPercent}` : "";
                    detailText = `${p.identity}${fiveH}${week}`;
                  } else if (p.provider === "openrouter") {
                    const usageVal = p.details?.usage ? `$${Number(p.details.usage).toFixed(6)}` : "$0.00";
                    detailText = `${p.identity} · usage: ${usageVal}`;
                  }

                  return (
                    <Box
                      key={p.provider}
                      flexDirection="column"
                      borderStyle="single"
                      borderColor={p.authenticated ? theme.border : theme.error}
                      paddingX={1}
                      marginBottom={1}
                    >
                      <Box flexDirection="row" justifyContent="space-between">
                        <Text bold color={theme.secondary}>
                          {p.name.toLowerCase()}
                        </Text>
                        <Text
                          bold
                          color={p.authenticated ? theme.accentBright : theme.error}
                        >
                          {p.authenticated ? "[online]" : "[inactive]"}
                        </Text>
                      </Box>
                      {detailText ? (
                        <Text color={theme.muted}>{detailText.toLowerCase()}</Text>
                      ) : null}
                    </Box>
                  );
                })
              ) : (
                <Box>
                  <Text color={theme.muted}>probing active adapters...</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={theme.muted}>
                neo router offline on port 8787.
              </Text>
              <Text color={theme.text}>
                morpheus will route directly or use local fallbacks.
              </Text>
            </Box>
          )}

          {feedback && (
            <Box marginTop={1} borderStyle="single" borderColor={theme.accent} paddingX={1}>
              <Text color={theme.accentBright} bold>
                {feedback.toLowerCase()}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom Status / Key Hints */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginTop={1} overflow="hidden">
        <Text color={theme.muted}>
          [r ping · m switch model · s settings · esc return]
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
