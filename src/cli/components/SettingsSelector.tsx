import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { SubagentRole, TokenUsage } from "../../core/types.js";
import type { SubagentModelMap } from "../userSettings.js";
import {
  Modal,
  Split,
  Section,
  Blank,
  ListRow,
  KeyValue,
  StatusValue,
  Callout,
  RowList,
  Lines,
  wrapWords,
  formatTokens,
  statusStyle,
  type Status,
} from "./ui/kit.js";

export interface SettingsSelectorProps {
  currentModel: string;
  onOpenModelSelector: () => void;
  onOpenWorkerModelSelector?: (role: SubagentRole) => void;
  subagentModels?: SubagentModelMap;
  workerModelSaveError?: boolean;
  onOpenSessionSelector: () => void;
  onOpenNeoModal?: () => void;
  onOpenUsageModal?: () => void;
  onResetSession: () => void;
  onClose: () => void;
  baseURL?: string;
  width?: number;
  height?: number;
  maxSteps?: number;
  onUpdateMaxSteps?: (steps: number | undefined) => void;
  sessionId?: string;
  sessionTitle?: string;
  usage?: TokenUsage;
}

type SectionKey = "providers" | "runtime" | "session";

interface SettingItem {
  id: string;
  section: SectionKey;
  label: string;
  value: string;
  status?: Status;
  heading: string;
  description: string;
  details: Array<{ k: string; v: string; color?: string }>;
  cta: string;
  ctaTone?: "accent" | "warning" | "danger" | "muted";
  action: () => void;
}

const SECTIONS: Array<{ key: SectionKey; title: string }> = [
  { key: "providers", title: "providers" },
  { key: "runtime", title: "runtime" },
  { key: "session", title: "session" },
];

const STATUS_TIMEOUT_MS = 4000;
const STEP_BUDGETS: Array<number | undefined> = [undefined, 15, 25, 50, 100];

type ProviderId = "neo" | "claude" | "codex" | "antigravity" | "openrouter" | "local";

export function SettingsSelector({
  currentModel,
  onOpenWorkerModelSelector,
  subagentModels = {},
  workerModelSaveError = false,
  onOpenModelSelector,
  onOpenSessionSelector,
  onOpenNeoModal,
  onOpenUsageModal,
  onResetSession,
  onClose,
  baseURL = "http://127.0.0.1:8787/v1",
  width = 80,
  height = 24,
  maxSteps,
  onUpdateMaxSteps,
  sessionId = "active",
  sessionTitle,
  usage,
}: SettingsSelectorProps) {
  const [statuses, setStatuses] = useState<Record<ProviderId, Status>>({
    neo: "checking",
    claude: "checking",
    codex: "checking",
    antigravity: "checking",
    openrouter: "checking",
    local: "checking",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const rootBase = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const next: Record<ProviderId, Status> = {
        neo: "offline",
        claude: "offline",
        codex: "offline",
        antigravity: "offline",
        openrouter: "offline",
        local: "offline",
      };
      try {
        const res = await fetch(`${rootBase}/v1/auth/status`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
        if (res.ok) {
          next.neo = "online";
          const data = (await res.json()) as { providers?: Array<{ provider: string; authenticated: boolean }> };
          for (const p of data.providers ?? []) {
            if (p.provider in next) next[p.provider as ProviderId] = p.authenticated ? "online" : "needs-login";
          }
        }
      } catch {
      }
      if (mounted) setStatuses(next);
    })();
    return () => {
      mounted = false;
    };
  }, [rootBase]);

  const provider = (
    id: ProviderId,
    label: string,
    heading: string,
    description: string,
    details: SettingItem["details"],
    fix: string
  ): SettingItem => {
    const status = statuses[id];
    const s = statusStyle(status);
    return {
      id,
      section: "providers",
      label,
      value: s.label,
      status,
      heading,
      description,
      details,
      cta: status === "online" ? "connected" : fix,
      ctaTone: status === "online" ? "muted" : "warning",
      action: () => setFeedback(status === "online" ? `${label} is connected.` : fix),
    };
  };

  const budgetLabel = maxSteps === undefined ? "auto" : `${maxSteps} steps`;
  const nextBudget = STEP_BUDGETS[(STEP_BUDGETS.indexOf(maxSteps) + 1) % STEP_BUDGETS.length];

  const items: SettingItem[] = [
    {
      ...provider(
        "neo",
        "neo router",
        "Neo router",
        "Local proxy every model request goes through. It holds your provider logins.",
        [
          { k: "endpoint", v: rootBase },
          { k: "port", v: "8787" },
        ],
        "start it with `cd ~/Developer/neo && npm run dev`"
      ),
      cta: onOpenNeoModal ? "enter opens the router inspector" : "enter checks the router",
      ctaTone: "accent",
      action: () => (onOpenNeoModal ? onOpenNeoModal() : setFeedback(statuses.neo === "online" ? "router is online." : "router is offline.")),
    },
    provider("claude", "claude", "Claude", "Anthropic models through your Claude Pro login.", [{ k: "login", v: "claude pro · keychain" }], "run `claude auth login`"),
    provider("codex", "codex", "Codex", "OpenAI models through your ChatGPT Plus login.", [{ k: "login", v: "~/.codex/auth.json" }], "run `codex login`"),
    provider("antigravity", "antigravity", "Antigravity", "Google models through Cloud Code OAuth.", [{ k: "login", v: "oauth 2.0 (pkce)" }], "run `/login antigravity`"),
    provider("openrouter", "openrouter", "OpenRouter", "Hosted open models billed to your OpenRouter key.", [{ k: "login", v: "api key in neo" }], "run `/login openrouter <key>`"),
    provider("local", "local ollama", "Local Ollama", "On-device models; free and private, slower on big tasks.", [{ k: "endpoint", v: "127.0.0.1:11434" }], "start it with `ollama serve`"),
    {
      id: "model",
      section: "runtime",
      label: "model",
      value: currentModel,
      heading: "Model",
      description: "The model the agent uses for every step of a task.",
      details: [
        { k: "current", v: currentModel, color: theme.accentBright },
        { k: "routed via", v: "neo router" },
      ],
      cta: "enter opens the model catalog",
      action: onOpenModelSelector,
    },
    ...(["explore", "review", "implement"] as const).map((role) => ({
      id: `worker-${role}`,
      section: "runtime" as const,
      label: `${role} worker`,
      value: subagentModels[role] ?? "inherit main",
      heading: `${role[0].toUpperCase()}${role.slice(1)} worker model`,
      description: role === "implement"
        ? "Model used for scoped implementation work. The worker can edit only its assigned files."
        : role === "review"
          ? "Model used for read only review tasks delegated by the main agent."
          : "Model used for read only codebase research delegated by the main agent.",
      details: [
        { k: "assigned", v: subagentModels[role] ?? `inherits ${currentModel}`, color: theme.accentBright },
        { k: "fallback", v: "main model" },
      ],
      cta: onOpenWorkerModelSelector ? "enter chooses a model · press 0 in the catalog to inherit main" : "worker routing",
      ctaTone: "accent" as const,
      action: () => onOpenWorkerModelSelector?.(role),
    })),
    {
      id: "usage",
      section: "runtime",
      label: "usage",
      value: `${formatTokens(usage?.totalTokens)} tokens`,
      heading: "Usage",
      description: "Tokens spent in this session across every model.",
      details: [
        { k: "total", v: `${formatTokens(usage?.totalTokens)} tokens` },
        { k: "in / out", v: `${formatTokens(usage?.promptTokens)} / ${formatTokens(usage?.completionTokens)}` },
        { k: "peak context", v: `${formatTokens(usage?.peakContextTokens)} of ${formatTokens(usage?.contextLimit ?? 128_000)}` },
      ],
      cta: onOpenUsageModal ? "enter opens the usage dashboard" : "",
      action: () => onOpenUsageModal?.(),
    },
    {
      id: "steps",
      section: "runtime",
      label: "step budget",
      value: budgetLabel,
      heading: "Step budget",
      description:
        maxSteps === undefined
          ? "Automatic: starts at 25 steps and extends while the agent is making progress."
          : `Fixed: the agent stops after ${maxSteps} steps, even mid-task.`,
      details: [
        { k: "current", v: budgetLabel, color: theme.accentBright },
        { k: "next", v: nextBudget === undefined ? "auto" : `${nextBudget} steps` },
      ],
      cta: onUpdateMaxSteps ? "enter cycles auto → 15 → 25 → 50 → 100" : "set with --max-steps when launching",
      ctaTone: onUpdateMaxSteps ? "accent" : "muted",
      action: () => onUpdateMaxSteps?.(nextBudget),
    },
    {
      id: "sessions",
      section: "session",
      label: "sessions",
      value: sessionTitle && sessionTitle !== "New Session" ? sessionTitle : "new session",
      heading: "Sessions",
      description: "Conversations are saved automatically and can be resumed later.",
      details: [
        { k: "current", v: sessionTitle || "New Session" },
        { k: "id", v: sessionId },
      ],
      cta: "enter browses saved sessions",
      action: onOpenSessionSelector,
    },
    {
      id: "reset",
      section: "session",
      label: "start fresh",
      value: "",
      heading: "Start fresh",
      description: "Saves this session and starts a new one with an empty context.",
      details: [],
      cta: confirmReset ? "press enter again to start fresh" : "enter to start a new session",
      ctaTone: confirmReset ? "danger" : "warning",
      action: () => {
        if (confirmReset) onResetSession();
        else setConfirmReset(true);
      },
    },
  ];

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }
    if (key.return) {
      items[selectedIndex]?.action();
      return;
    }
    const move = key.upArrow || input === "k" ? -1 : key.downArrow || input === "j" ? 1 : 0;
    if (move !== 0) {
      setSelectedIndex((prev) => (prev + move + items.length) % items.length);
      setFeedback(null);
      setConfirmReset(false);
    }
  });

  const selected = items[selectedIndex] ?? items[0];
  const neo = statusStyle(statuses.neo);

  return (
    <Modal
      title="settings"
      context={`router ${rootBase.replace(/^https?:\/\//, "")}`}
      width={width}
      height={height}
      aside={
        <Text color={neo.color}>
          {neo.dot} {statuses.neo === "online" ? "router online" : neo.label}
        </Text>
      }
      hints={[
        { keys: "↑↓", label: "move" },
        { keys: "enter", label: "open" },
        { keys: "esc", label: "close" },
      ]}
    >
      {({ width: w, height: h }) => (
        <Split
          width={w}
          height={h}
          left={(lw) => (
            <RowList
              height={h}
              rows={SECTIONS.flatMap((section, si) => [
                ...(si > 0 ? [{ key: `gap_${section.key}`, node: <Blank /> }] : []),
                { key: `sec_${section.key}`, node: <Section label={section.title} width={lw} /> },
                ...items
                  .filter((it) => it.section === section.key)
                  .map((it) => {
                    const s = it.status ? statusStyle(it.status) : undefined;
                    return {
                      key: it.id,
                      focus: it.id === selected.id,
                      node: (
                        <ListRow
                          label={it.label}
                          value={it.value}
                          valueColor={s?.color}
                          icon={s?.dot}
                          iconColor={s?.color}
                          selected={it.id === selected.id}
                          width={lw}
                        />
                      ),
                    };
                  }),
              ])}
            />
          )}
          right={(rw, rh) => (
            <Lines height={rh}>
              <Text bold color={theme.text}>
                {selected.heading}
              </Text>
              {wrapWords(selected.description, rw).map((line) => (
                <Text color={theme.muted}>{line}</Text>
              ))}
              <Blank />
              {selected.status ? <StatusValue status={selected.status} width={rw} /> : null}
              {selected.details.map((d) => (
                <KeyValue k={d.k} v={d.v} color={d.color} width={rw} />
              ))}
              {selected.cta ? <Blank /> : null}
              {selected.cta ? <Callout text={selected.cta} tone={selected.ctaTone} width={rw} /> : null}
              {feedback ? <Blank /> : null}
              {feedback
                ? wrapWords(feedback, rw).map((line) => <Text color={theme.secondary}>{line}</Text>)
                : null}
              {workerModelSaveError ? <Text color={theme.error}>could not save worker models to ~/.morpheus/config.json</Text> : null}
            </Lines>
          )}
        />
      )}
    </Modal>
  );
}
