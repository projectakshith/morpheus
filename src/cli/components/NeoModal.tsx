import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { TokenUsage } from "../../core/types.js";
import { cellWidth, truncateCells } from "../utils/cells.js";
import {
  Modal,
  Split,
  Section,
  Lines,
  ListRow,
  KeyValue,
  StatusValue,
  Blank,
  fit,
  formatTokens,
  statusStyle,
  type Status,
} from "./ui/kit.js";

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
      const healthRes = await fetch(`${rootBase}/health`, { signal: AbortSignal.timeout(3000) });
      const latency = Math.round(performance.now() - start);

      if (healthRes.ok) {
        const hData = (await healthRes.json()) as NeoHealth;
        setIsOnline(true);
        setLatencyMs(latency);
        setHealth(hData);

        try {
          const authRes = await fetch(`${rootBase}/v1/auth/status`, { signal: AbortSignal.timeout(6000) });
          if (authRes.ok) {
            const authData = (await authRes.json()) as { providers?: ProviderInfo[] };
            if (Array.isArray(authData.providers)) {
              setProviders(authData.providers);
            }
          }
        } catch {
          // Keep health status even if auth probe fails
        }
        setFeedback(`checked at ${new Date().toLocaleTimeString()}`);
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
      label: "refresh status",
      key: "r",
      run: () => fetchStatus(),
    },
    {
      id: "model",
      label: "switch model",
      key: "m",
      run: () => onOpenModelSelector?.(),
    },
    {
      id: "settings",
      label: "open settings",
      key: "s",
      run: () => onOpenSettings?.(),
    },
    {
      id: "close",
      label: "back to morpheus",
      key: "esc",
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

  const routerStatus: Status = isLoading && !health ? "checking" : isOnline ? "online" : "offline";

  return (
    <Modal
      title="neo router"
      context={rootBase.replace(/^https?:\/\//, "")}
      width={width}
      height={height}
      aside={
        <Text color={statusStyle(routerStatus).color}>
          {statusStyle(routerStatus).dot} {isOnline && latencyMs !== null ? `online · ${latencyMs}ms` : statusStyle(routerStatus).label}
        </Text>
      }
      hints={[
        { keys: "↑↓", label: "move" },
        { keys: "enter", label: "run" },
        { keys: "r", label: "refresh" },
        { keys: "m", label: "model" },
        { keys: "s", label: "settings" },
        { keys: "esc", label: "close" },
      ]}
    >
      {({ width: w, height: h }) => (
        <Split
          width={w}
          height={h}
          ratio={0.42}
          left={(lw, lh) => (
            <Lines height={lh}>
              <Section label="router" width={lw} />
              <StatusValue status={routerStatus} detail={isOnline && latencyMs !== null ? `${latencyMs}ms` : undefined} width={lw} />
              <KeyValue k="version" v={health?.version ?? "—"} width={lw} />
              <KeyValue k="role" v={health?.role?.toLowerCase() ?? "—"} width={lw} />
              <KeyValue k="model" v={currentModel} width={lw} />
              <KeyValue k="session" v={`${formatTokens(usage?.totalTokens)} tokens`} width={lw} />
              <Blank />
              <Section label="actions" width={lw} />
              {actions.map((a, idx) => (
                <ListRow
                  label={a.label}
                  value={a.key}
                  selected={idx === selectedIndex}
                  width={lw}
                />
              ))}
              {feedback ? <Blank /> : null}
              {feedback ? <Text color={theme.muted}>{truncateCells(feedback, lw)}</Text> : null}
            </Lines>
          )}
          right={(rw, rh) => (
            <Lines height={rh}>
              <Section label={`providers ${providers.filter((p) => p.authenticated).length}/${providers.length}`} width={rw} />
              {providers.length === 0 ? (
                <Text color={theme.muted}>{isLoading ? "checking providers…" : isOnline ? "no providers reported" : "router is offline"}</Text>
              ) : null}
              {providers.flatMap((p) => {
                const st = statusStyle(p.authenticated ? "online" : "needs-login");
                const detail = providerDetail(p);
                return [
                  <Text wrap="truncate-end">
                    <Text color={st.color}>{`${st.dot} `}</Text>
                    <Text color={theme.text} bold>
                      {fit(p.name.toLowerCase(), Math.max(0, rw - 2 - cellWidth(st.label)))}
                    </Text>
                    <Text color={st.color}>{st.label}</Text>
                  </Text>,
                  <Text color={theme.muted}>{`  ${truncateCells(detail || (p.error ?? ""), Math.max(0, rw - 2))}`}</Text>,
                ];
              })}
            </Lines>
          )}
        />
      )}
    </Modal>
  );
}

function providerDetail(p: ProviderInfo): string {
  const d = p.details ?? {};
  const parts: string[] = [];
  if (p.provider === "codex") {
    if (d.fiveHourUsedPercent) parts.push(`5h ${d.fiveHourUsedPercent}`);
    if (d.weeklyUsedPercent) parts.push(`week ${d.weeklyUsedPercent}`);
    if (d.planType) parts.push(String(d.planType));
  } else if (p.provider === "claude") {
    if (d.subscriptionType) parts.push(`${d.subscriptionType} plan`);
    if (d.organization) parts.push(String(d.organization).toLowerCase());
  } else if (p.provider === "antigravity") {
    if (p.expiry) {
      const mins = Math.round((new Date(p.expiry).getTime() - Date.now()) / 60_000);
      if (Number.isFinite(mins)) parts.push(mins > 0 ? `token expires in ${mins}m` : "token expired");
    }
    if (d.service) parts.push(String(d.service));
  } else if (p.provider === "openrouter") {
    const used = typeof d.usage === "number" ? `$${d.usage < 0.01 ? d.usage.toFixed(4) : d.usage.toFixed(2)}` : "";
    const limit = typeof d.limit === "number" ? ` of $${d.limit.toFixed(2)}` : "";
    if (used) parts.push(`${used}${limit} used`);
    if (d.isFreeTier) parts.push("free tier");
  } else if (p.provider === "local" && Array.isArray(d.models)) {
    parts.push((d.models as string[]).join(", "));
  }
  if (parts.length === 0 && p.identity) parts.push(p.identity);
  return parts.join(" · ");
}
