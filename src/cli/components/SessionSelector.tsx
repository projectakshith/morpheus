/*
 * SessionSelector: Interactive modal to browse, resume, and manage sessions via arrow keys.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { listSessions, deleteSession, type SessionSummary } from "../../core/session.js";
import { theme } from "../theme.js";

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

export interface SessionSelectorProps {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClose: () => void;
  width?: number;
}

export function SessionSelector({
  currentSessionId,
  onSelectSession,
  onNewSession,
  onClose,
  width = 72,
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadList = async () => {
    try {
      const list = await listSessions(process.cwd(), 15);
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  /* Total selectable items: Option 0 is "+ Start Fresh Session", Option 1..N are sessions */
  const totalItems = 1 + sessions.length;

  useInput((input, key) => {
    if (key.escape) {
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
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      return;
    }

    if (input === "n" || input === "N") {
      onNewSession();
      return;
    }

    if (input === "d" || input === "D") {
      if (selectedIndex > 0) {
        const item = sessions[selectedIndex - 1];
        if (item) {
          deleteSession(item.id).then(() => {
            loadList();
            setSelectedIndex((prev) => Math.max(0, prev - 1));
          });
        }
      }
    }
  });

  const boxWidth = Math.min(width - 4, 76);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      paddingY={1}
      width={boxWidth}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={theme.accentBright}>
          RESUME SESSION
        </Text>
        <Text color={theme.muted}>
          [↑/↓ navigate · Enter select · D delete · Esc close]
        </Text>
      </Box>

      {/* Item 0: New Session */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        marginBottom={1}
      >
        <Box flexDirection="row">
          <Text color={selectedIndex === 0 ? theme.accentBright : theme.muted}>
            {selectedIndex === 0 ? "▶ " : "  "}
          </Text>
          <Text
            bold={selectedIndex === 0}
            color={selectedIndex === 0 ? theme.accentBright : theme.secondary}
          >
            + Start Fresh Session
          </Text>
        </Box>
        <Text color={theme.muted}>[clears working context]</Text>
      </Box>

      {isLoading ? (
        <Box paddingLeft={1}>
          <Text color={theme.muted}>Loading recent sessions...</Text>
        </Box>
      ) : sessions.length === 0 ? (
        <Box paddingLeft={1}>
          <Text color={theme.muted}>No previous saved sessions found in this repository.</Text>
        </Box>
      ) : (
        sessions.map((s, idx) => {
          const itemIdx = idx + 1;
          const isHighlighted = itemIdx === selectedIndex;
          const isCurrent = s.id === currentSessionId;
          const age = formatAge(s.updatedAt);

          const maxTitleLen = Math.max(16, boxWidth - 36);
          const safeTitle =
            s.title.length > maxTitleLen ? `${s.title.slice(0, maxTitleLen - 1)}…` : s.title;

          return (
            <Box
              key={s.id}
              flexDirection="row"
              justifyContent="space-between"
              paddingLeft={1}
            >
              <Box flexDirection="row">
                <Text color={isHighlighted ? theme.accentBright : theme.muted}>
                  {isHighlighted ? "▶ " : "  "}
                </Text>
                <Text
                  bold={isHighlighted}
                  color={isHighlighted ? theme.accentBright : isCurrent ? theme.secondary : undefined}
                >
                  {isCurrent ? "● " : "○ "}
                  {safeTitle}
                </Text>
                {isCurrent && (
                  <Text color={theme.accentBright} bold>
                    {" "}[CURRENT]
                  </Text>
                )}
              </Box>
              <Box flexDirection="row">
                <Text color={theme.muted}>
                  {s.turnCount} turns · {age}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
