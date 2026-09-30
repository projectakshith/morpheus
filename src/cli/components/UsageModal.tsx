import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";
import { truncateCells } from "../utils/cells.js";
import type { Thread, FileEditRecord } from "../types.js";
import { PROVIDERS, providerLabel, type ProviderKey } from "../providers.js";
import { sessionStats, formatWorkTime, usageTotals } from "../stats.js";
import { listSessions, sessionTokenTotal, type SessionSummary } from "../../core/session.js";
import {
  Modal,
  Split,
  Section,
  RowList,
  Lines,
  ListRow,
  KeyValue,
  Callout,
  Blank,
  Meter,
  formatTokens,
} from "./ui/kit.js";

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
    id: "local/qwen3:14b",
    name: "local/qwen3:14b",
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
    id: "cloud/nvidia/nemotron-3.5-lightning:free",
    name: "cloud/nvidia/nemotron-3.5-lightning:free",
    category: "cloud",
    provider: "nvidia / openrouter",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    pricing: "$0.00 (openrouter free)",
  },
  {
    id: "cloud/nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "cloud/nvidia/nemotron-3-ultra-550b-a55b:free",
    category: "cloud",
    provider: "nvidia / openrouter",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    pricing: "$0.00 (openrouter free)",
  },
  {
    id: "cloud/qwen/qwen3.8-27b:free",
    name: "cloud/qwen/qwen3.8-27b:free",
    category: "cloud",
    provider: "openrouter cloud",
    contextLimit: "32,768 tokens",
    contextTokens: 32768,
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "32k · free",
    pricing: "$0.00 (openrouter free)",
  },
  {
    id: "cloud/deepseek/deepseek-r1:free",
    name: "cloud/deepseek/deepseek-r1:free",
    category: "cloud",
    provider: "openrouter cloud",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    pricing: "$0.00 (openrouter free)",
  },
  {
    id: "cloud/meta-llama/llama-3.3-70b-instruct:free",
    name: "cloud/meta-llama/llama-3.3-70b-instruct:free",
    category: "cloud",
    provider: "openrouter cloud",
    contextLimit: "128,000 tokens",
    contextTokens: 128000,
    costTier: "$0.00 / 100% free",
    rateLimit: "free tier",
    badge: "128k · free",
    pricing: "$0.00 (openrouter free)",
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
    badge: "1m · free",
    pricing: "$0.00 (openrouter free)",
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
  threads?: Thread[];
  fileEdits?: FileEditRecord[];
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
  threads = [],
  fileEdits = [],
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
  const [savedSessions, setSavedSessions] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    let mounted = true;
    listSessions(undefined, Number.MAX_SAFE_INTEGER).then((list) => mounted && setSavedSessions(list));
    return () => {
      mounted = false;
    };
  }, []);

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
        const res = await fetch(`${rootBase}/v1/auth/status`, {
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            providers?: Array<{
              provider: string;
              authenticated: boolean;
              details?: Record<string, any>;
            }>;
          };
          if (Array.isArray(data.providers) && isMounted) {
            for (const p of data.providers) {
              if (p.provider === "openrouter" && p.details) {
                const used = p.details.usage ? `$${Number(p.details.usage).toFixed(6)}` : "$0.00";
                const lim = p.details.limit ? `$${Number(p.details.limit).toFixed(2)}` : "$1.00";
                setOpenRouterUsage(`${used} / ${lim}`);
              } else if (p.provider === "claude" && p.authenticated && p.details) {
                setClaudeStatus({
                  fiveHour: p.details.fiveHourUsedPercent,
                  weekly: p.details.weeklyUsedPercent,
                  resetsAt: p.details.fiveHourResetsAt,
                  subscriptionType: p.details.subscriptionType,
                });
              } else if (p.provider === "codex" && p.authenticated && p.details) {
                setCodexStatus({
                  fiveHour: p.details.fiveHourUsedPercent,
                  weekly: p.details.weeklyUsedPercent,
                  resetsAt: p.details.fiveHourResetsAt,
                  resetCredits: p.details.availableResetCredits,
                  planType: p.details.planType,
                });
              }
            }
          }
        }
      } catch {}
    };
    fetchUsage();
    return () => {
      isMounted = false;
    };
  }, [baseURL]);

  const tokensOf = (m: ModelUsageSpec) => usage?.byModel?.[m.id]?.totalTokens ?? 0;

  const ordered = useMemo(
    () =>
      PROVIDERS.flatMap((p) =>
        MODEL_USAGE_CATALOG.filter((m) => m.category === p.key).sort((a, b) => tokensOf(b) - tokensOf(a))
      ),
    [usage]
  );
  const stats = useMemo(() => sessionStats(threads, fileEdits), [threads, fileEdits]);

  useEffect(() => {
    const idx = ordered.findIndex((m) => m.id === currentModel || (m.id === "flash" && currentModel.includes("flash")));
    if (idx >= 0) setSelectedIndex(idx);
  }, []);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }
    if (input === "m" || key.return) {
      onOpenModelSelector?.();
      return;
    }
    const move = key.upArrow || input === "k" ? -1 : key.downArrow || input === "j" ? 1 : 0;
    if (move !== 0) setSelectedIndex((prev) => (prev + move + ordered.length) % ordered.length);
  });

  const selectedModel = ordered[selectedIndex] ?? ordered[0];
  const isActive = (m: ModelUsageSpec) => m.id === currentModel || (m.id === "flash" && currentModel.includes("flash"));
  const activeSpec = ordered.find(isActive);

  const totalTokens = sessionTokenTotal(usage);
  const totals = savedSessions ? usageTotals(savedSessions, { id: sessionId, totalTokens }) : null;
  const peakContext = usage?.peakContextTokens ?? 0;
  const contextLimit = usage?.contextLimit ?? 128_000;
  const maxModelTokens = Math.max(1, ...ordered.map(tokensOf));
  const providerTokens = (key: ProviderKey) =>
    ordered.filter((m) => m.category === key).reduce((n, m) => n + tokensOf(m), 0);
  const share = (n: number) => (totalTokens > 0 ? `${Math.round((n / totalTokens) * 100)}%` : "0%");

  const quotaLines = (category: ModelUsageSpec["category"]): QuotaLine[] => {
    if (category === "codex") {
      if (!codexStatus) return [{ label: "quota", text: "checking…" }];
      return [
        { label: "5h window", pct: percent(codexStatus.fiveHour), text: codexStatus.resetsAt ? `resets ${codexStatus.resetsAt}` : "" },
        { label: "weekly", pct: percent(codexStatus.weekly), text: "" },
        ...(codexStatus.resetCredits ? [{ label: "reset credits", text: String(codexStatus.resetCredits) }] : []),
      ];
    }
    if (category === "claude") {
      if (!claudeStatus) return [{ label: "quota", text: "checking…" }];
      const lines: QuotaLine[] = [];
      if (claudeStatus.fiveHour) lines.push({ label: "5h window", pct: percent(claudeStatus.fiveHour), text: claudeStatus.resetsAt ? `resets ${claudeStatus.resetsAt}` : "" });
      if (claudeStatus.weekly) lines.push({ label: "weekly", pct: percent(claudeStatus.weekly), text: "" });
      return lines.length > 0 ? lines : [{ label: "quota", text: `${claudeStatus.subscriptionType ?? "pro"} plan · usage not reported` }];
    }
    if (category === "cloud") return [{ label: "openrouter", text: openRouterUsage ?? "free models" }];
    if (category === "local") return [{ label: "quota", text: "none · runs on this machine" }];
    return [{ label: "quota", text: "free tier" }];
  };

  return (
    <Modal
      title="usage"
      width={width}
      height={height}
      hints={[
        { keys: "↑↓", label: "move" },
        { keys: "enter", label: "switch model" },
        { keys: "esc", label: "close" },
      ]}
    >
      {({ width: w, height: h }) => {
        const colGap = 3;
        const colW = Math.max(16, Math.floor((w - colGap * 2) / 3));
        const activeQuota = activeSpec ? quotaLines(activeSpec.category) : [];
        const perTurn = stats.turns > 0 ? Math.round(totalTokens / stats.turns) : 0;
        return (
          <>
            <Box height={1} flexShrink={0}>
              <Text wrap="truncate-end">
                <Text bold color={theme.accentBright}>{formatTokens(totalTokens)}</Text>
                <Text color={theme.muted}> this session</Text>
                <Text color={theme.border}>{"   ·   "}</Text>
                <Text bold color={theme.text}>{totals ? formatTokens(totals.today) : "…"}</Text>
                <Text color={theme.muted}> today</Text>
                <Text color={theme.border}>{"   ·   "}</Text>
                <Text bold color={theme.text}>{totals ? formatTokens(totals.allTime) : "…"}</Text>
                <Text color={theme.muted}>{totals ? ` all time across ${totals.sessions} session${totals.sessions === 1 ? "" : "s"}` : " all time"}</Text>
              </Text>
            </Box>
            <Box height={1} flexShrink={0} />
            <Box flexDirection="row" height={5} flexShrink={0}>
              <Box flexDirection="column" width={colW} marginRight={colGap}>
                <Lines height={5}>
                  <Section label="tokens" width={colW} />
                  <Text wrap="truncate-end">
                    <Text bold color={theme.accentBright}>{formatTokens(totalTokens)}</Text>
                    <Text color={theme.muted}>{`  ${formatTokens(usage?.promptTokens)} in · ${formatTokens(usage?.completionTokens)} out`}</Text>
                  </Text>
                  <KeyValue k="per turn" v={`${formatTokens(perTurn)} avg`} width={colW} keyWidth={11} />
                  <Meter value={peakContext} max={contextLimit} width={colW} label={`${formatTokens(peakContext)}/${formatTokens(contextLimit)} ctx`} />
                </Lines>
              </Box>
              <Box flexDirection="column" width={colW} marginRight={colGap}>
                <Lines height={5}>
                  <Section label="activity" width={colW} />
                  <KeyValue k="turns" v={`${stats.turns} · ${formatWorkTime(stats.workMs)} working`} width={colW} keyWidth={11} />
                  <KeyValue
                    k="tool calls"
                    v={`${stats.toolCalls}${stats.failedCalls ? ` · ${stats.failedCalls} failed` : ""}`}
                    color={stats.failedCalls ? theme.warning : undefined}
                    width={colW}
                    keyWidth={11}
                  />
                  <Text wrap="truncate-end">
                    <Text color={theme.muted}>{"changes    "}</Text>
                    <Text color={theme.text}>{`${stats.filesChanged} file${stats.filesChanged === 1 ? "" : "s"}  `}</Text>
                    <Text color={theme.diffAdd}>{`+${stats.linesAdded} `}</Text>
                    <Text color={theme.diffRemove}>{`−${stats.linesRemoved}`}</Text>
                  </Text>
                </Lines>
              </Box>
              <Box flexDirection="column" width={colW}>
                <Lines height={5}>
                  <Section label={activeSpec ? `${providerLabel(activeSpec.category)} quota` : "quota"} width={colW} />
                  {activeQuota.slice(0, 3).map((q) => (
                    <QuotaRow line={q} width={colW} />
                  ))}
                </Lines>
              </Box>
            </Box>
            <Box height={1} flexShrink={0} />
            <Split
              width={w}
              height={Math.max(3, h - 8)}
              left={(lw, lh) => (
                <RowList
                  height={lh}
                  rows={ordered.flatMap((m, idx) => {
                    const tokens = tokensOf(m);
                    const prev = ordered[idx - 1];
                    const header =
                      !prev || prev.category !== m.category
                        ? [
                            ...(prev ? [{ key: `gap_${m.category}`, node: <Blank /> }] : []),
                            {
                              key: `sec_${m.category}`,
                              node: (
                                <Section
                                  label={providerLabel(m.category)}
                                  detail={providerTokens(m.category) ? formatTokens(providerTokens(m.category)) : undefined}
                                  width={lw}
                                />
                              ),
                            },
                          ]
                        : [];
                    return [
                      ...header,
                      {
                        key: m.id,
                        focus: idx === selectedIndex,
                        node: (
                          <ListRow
                            label={m.id.replace(`${m.category}/`, "")}
                            value={tokens > 0 ? `${formatTokens(tokens)} ${bar(tokens, maxModelTokens, 6)}` : isActive(m) ? "active" : ""}
                            valueColor={tokens > 0 || isActive(m) ? theme.accentBright : theme.muted}
                            icon={isActive(m) ? "●" : " "}
                            iconColor={theme.accentBright}
                            dim={tokens === 0 && !isActive(m)}
                            selected={idx === selectedIndex}
                            width={lw}
                          />
                        ),
                      },
                    ];
                  })}
                />
              )}
              right={(rw, rh) => {
                const modelUsage = usage?.byModel?.[selectedModel.id];
                const turns = stats.turnsByModel[selectedModel.id] ?? 0;
                return (
                  <Lines height={rh}>
                    <Text bold color={theme.text}>
                      {truncateCells(selectedModel.id, rw)}
                    </Text>
                    <Text color={theme.muted}>{truncateCells(selectedModel.provider, rw)}</Text>
                    <Blank />
                    <KeyValue
                      k="tokens"
                      v={modelUsage ? `${formatTokens(modelUsage.totalTokens)} · ${share(modelUsage.totalTokens)} of session` : "not used this session"}
                      color={modelUsage ? theme.accentBright : theme.muted}
                      width={rw}
                    />
                    {modelUsage ? (
                      <KeyValue k="in / out" v={`${formatTokens(modelUsage.promptTokens)} / ${formatTokens(modelUsage.completionTokens)}`} width={rw} />
                    ) : null}
                    {turns > 0 ? <KeyValue k="turns" v={String(turns)} width={rw} /> : null}
                    <KeyValue k="context" v={selectedModel.contextLimit} width={rw} />
                    <KeyValue k="pricing" v={selectedModel.pricing} width={rw} />
                    <Blank />
                    {quotaLines(selectedModel.category).map((q) => (
                      <QuotaRow line={q} width={rw} />
                    ))}
                    <Blank />
                    <Callout
                      text={isActive(selectedModel) ? "this is the current model" : "enter opens the model picker"}
                      tone={isActive(selectedModel) ? "muted" : "accent"}
                      width={rw}
                    />
                  </Lines>
                );
              }}
            />
          </>
        );
      }}
    </Modal>
  );
}

interface QuotaLine {
  label: string;
  pct?: number;
  text: string;
}

function percent(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function bar(value: number, max: number, width: number): string {
  const filled = Math.max(1, Math.round((value / max) * width));
  return "━".repeat(filled) + " ".repeat(width - filled);
}

function QuotaRow({ line, width }: { line: QuotaLine; width: number }) {
  const key = line.label.padEnd(12).slice(0, 12);
  if (line.pct === undefined) {
    return <KeyValue k={line.label} v={line.text} width={width} keyWidth={12} />;
  }
  const suffix = `${Math.round(line.pct)}%${line.text ? `  ${line.text}` : ""}`;
  return (
    <Text wrap="truncate-end">
      <Text color={theme.muted}>{key}</Text>
      <Meter value={line.pct} max={100} width={Math.max(8, width - 12)} barWidth={Math.max(6, Math.min(20, width - 12 - 24))} label={suffix} />
    </Text>
  );
}
