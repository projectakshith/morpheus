import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import { listSessions, deleteSession, type SessionSummary } from "../../core/session.js";
import { theme } from "../theme.js";
import { displayTitle } from "../../core/sessionTitle.js";
import { truncateCells } from "../utils/cells.js";
import { PROVIDERS, providerOf, providerLabel } from "../providers.js";
import { Modal, Split, Section, RowList, Lines, ListRow, KeyValue, StatusValue, Callout, Blank, type Row } from "./ui/kit.js";

function formatAge(timestamp: number): string {
  if (!timestamp) return "unknown";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "unknown";
  const d = new Date(timestamp);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export interface SessionSelectorProps {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClose: () => void;
  width?: number;
  height?: number;
}

export function SessionSelector({
  currentSessionId,
  onSelectSession,
  onNewSession,
  onClose,
  width = 80,
  height = 24,
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadList = async () => {
    try {
      const list = await listSessions(process.cwd(), 30);
      const rank = (model: string) => PROVIDERS.findIndex((p) => p.key === providerOf(model));
      setSessions(list.sort((a, b) => rank(a.model) - rank(b.model) || b.updatedAt - a.updatedAt));
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const totalItems = 1 + sessions.length;

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }

    if (key.return) {
      if (selectedIndex === 0) {
        onNewSession();
      } else {
        const item = sessions[selectedIndex - 1];
        if (item) {
          onSelectSession(item.id);
        }
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
      setConfirmDeleteId(null);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      setConfirmDeleteId(null);
      return;
    }

    if (input === "n" || input === "N") {
      onNewSession();
      return;
    }

    if (input === "d" || input === "D") {
      const item = selectedIndex > 0 ? sessions[selectedIndex - 1] : undefined;
      if (!item || item.id === currentSessionId) return;
      if (confirmDeleteId !== item.id) {
        setConfirmDeleteId(item.id);
        return;
      }
      setConfirmDeleteId(null);
      deleteSession(item.id).then(() => {
        loadList();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      });
    }
  });

  const selectedSession = selectedIndex > 0 ? sessions[selectedIndex - 1] ?? null : null;
  const confirming = selectedSession !== null && confirmDeleteId === selectedSession.id;

  return (
    <Modal
      title="sessions"
      context={isLoading ? "loading…" : `${sessions.length} saved in this folder`}
      width={width}
      height={height}
      hints={[
        { keys: "↑↓", label: "move" },
        { keys: "enter", label: "resume" },
        { keys: "n", label: "new" },
        { keys: "d", label: confirming ? "press again to delete" : "delete" },
        { keys: "esc", label: "close" },
      ]}
    >
      {({ width: w, height: h }) => (
        <Split
          width={w}
          height={h}
          left={(lw, lh) => {
            const rows: Row[] = [
              {
                key: "new",
                focus: selectedIndex === 0,
                node: <ListRow label="+ new session" selected={selectedIndex === 0} width={lw} />,
              },
            ];
            if (isLoading) rows.push({ key: "loading", node: <Text color={theme.muted}>  loading…</Text> });
            else if (sessions.length === 0) rows.push({ key: "none", node: <Text color={theme.muted}>  no saved sessions yet</Text> });
            sessions.forEach((sess, i) => {
              const provider = providerOf(sess.model);
              const prev = sessions[i - 1];
              if (!prev || providerOf(prev.model) !== provider) {
                const count = sessions.filter((x) => providerOf(x.model) === provider).length;
                rows.push({ key: `gap_${i}`, node: <Blank /> });
                rows.push({ key: `sec_${i}`, node: <Section label={providerLabel(provider)} detail={String(count)} width={lw} /> });
              }
              const current = sess.id === currentSessionId;
              rows.push({
                key: sess.id,
                focus: selectedIndex === i + 1,
                node: (
                  <ListRow
                    label={displayTitle(sess.title, sess.createdAt)}
                    value={current ? "open" : formatAge(sess.updatedAt)}
                    valueColor={current ? theme.accentBright : theme.muted}
                    icon={current ? "●" : " "}
                    iconColor={theme.accentBright}
                    selected={selectedIndex === i + 1}
                    width={lw}
                  />
                ),
              });
            });
            return <RowList rows={rows} height={lh} />;
          }}
          right={(rw, rh) =>
            selectedSession ? (
              <Lines height={rh}>
                <Text bold color={theme.text}>
                  {truncateCells(displayTitle(selectedSession.title, selectedSession.createdAt), rw)}
                </Text>
                <Text color={theme.muted}>
                  {truncateCells(
                    `${selectedSession.turnCount} turn${selectedSession.turnCount === 1 ? "" : "s"}${selectedSession.model ? ` · ${selectedSession.model}` : ""}`,
                    rw
                  )}
                </Text>
                <Blank />
                {selectedSession.id === currentSessionId ? <StatusValue status="active" detail="open now" width={rw} /> : null}
                <KeyValue k="last active" v={`${formatAge(selectedSession.updatedAt)} · ${formatDate(selectedSession.updatedAt)}`} width={rw} />
                <KeyValue k="started" v={formatDate(selectedSession.createdAt)} width={rw} />
                <KeyValue k="id" v={selectedSession.id} width={rw} />
                <Blank />
                {selectedSession.id === currentSessionId ? (
                  <Callout text="this is the session you're in" tone="muted" width={rw} />
                ) : confirming ? (
                  <Callout text="press d again to delete it permanently" tone="danger" width={rw} />
                ) : (
                  <Callout text="enter resumes this session" width={rw} />
                )}
              </Lines>
            ) : (
              <Lines height={rh}>
                <Text bold color={theme.text}>
                  New session
                </Text>
                <Text color={theme.muted}>{truncateCells("Starts with an empty context.", rw)}</Text>
                <Text color={theme.muted}>{truncateCells("The current session stays saved.", rw)}</Text>
                <Blank />
                <Callout text="enter starts a new session" width={rw} />
              </Lines>
            )
          }
        />
      )}
    </Modal>
  );
}
