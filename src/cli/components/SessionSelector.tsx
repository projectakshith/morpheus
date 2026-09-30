import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { listSessions, deleteSession, type SessionSummary } from "../../core/session.js";
import { theme } from "../theme.js";
import { displayTitle } from "../../core/sessionTitle.js";

function fitText(text: string, max: number): string {
  if (max <= 1) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

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

  const loadList = async () => {
    try {
      const list = await listSessions(process.cwd(), 30);
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

  const totalContentWidth = Math.max(40, width - 6);
  const leftWidth = Math.min(52, Math.max(38, Math.floor(totalContentWidth * 0.48)));
  const rightWidth = Math.max(30, totalContentWidth - leftWidth - 3);
  const bodyHeight = Math.max(10, height - 4);

  const selectedSession = selectedIndex > 0 ? sessions[selectedIndex - 1] : null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
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
            morpheus · session explorer
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.text}>active: {currentSessionId.slice(0, 16)}</Text>
        </Box>
        <Text color={theme.muted}>
          [↑/↓ move · enter resume · n new · d delete · esc close]
        </Text>
      </Box>

      {/* Main Two-Column Layout */}
      <Box flexDirection="row" width={totalContentWidth} height={bodyHeight} overflow="hidden">
        {/* Left Column: Sessions List */}
        <Box flexDirection="column" width={leftWidth} height={bodyHeight} overflow="hidden">
          <Box marginBottom={1}>
            <Text bold color={theme.secondary}>
              saved sessions ({sessions.length})
            </Text>
          </Box>

          {/* Option 0: Start Fresh */}
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
                + fresh session
              </Text>
            </Box>
            <Text color={theme.muted}>[new context]</Text>
          </Box>

          {/* Sessions List */}
          {isLoading ? (
            <Box paddingLeft={1}>
              <Text color={theme.muted}>loading sessions...</Text>
            </Box>
          ) : sessions.length === 0 ? (
            <Box paddingLeft={1}>
              <Text color={theme.muted}>no previous sessions found.</Text>
            </Box>
          ) : (
            sessions.slice(0, Math.max(5, bodyHeight - 4)).map((s, idx) => {
              const isSelected = selectedIndex === idx + 1;
              const isCurrent = s.id === currentSessionId;
              const age = formatAge(s.updatedAt);
              /* Row = padding + marker + title + gap + age [+ active tag]. */
              const titleWidth = leftWidth - 4 - age.length - (isCurrent ? 9 : 0);
              const title = fitText(displayTitle(s.title, s.createdAt), titleWidth);

              return (
                <Box
                  key={s.id}
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
                      color={
                        isSelected
                          ? theme.accentBright
                          : isCurrent
                          ? theme.secondary
                          : theme.text
                      }
                    >
                      {title}
                    </Text>
                  </Box>

                  <Box flexDirection="row">
                    <Text color={theme.muted}>{age}</Text>
                    {isCurrent && (
                      <Text color={theme.accentBright} bold>
                        {" "}[active]
                      </Text>
                    )}
                  </Box>
                </Box>
              );
            })
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

        {/* Right Column: Session Preview & Details */}
        <Box flexDirection="column" width={rightWidth} height={bodyHeight} overflow="hidden" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold color={theme.accentBright}>
              session details
            </Text>
          </Box>

          {selectedIndex === 0 ? (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>target action</Text>
                <Text bold color={theme.accentBright}>fresh session</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>scope</Text>
                <Text color={theme.text}>clear thread context and memory</Text>
              </Box>
              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.accent}>
                <Text color={theme.accentBright} bold>
                  press [enter] or [n] to create a fresh session.
                </Text>
              </Box>
            </Box>
          ) : selectedSession ? (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>session id</Text>
                <Text bold color={theme.secondary}>{selectedSession.id}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>created</Text>
                <Text color={theme.text}>{new Date(selectedSession.createdAt).toLocaleTimeString()}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>last modified</Text>
                <Text color={theme.text}>{formatAge(selectedSession.updatedAt)}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.muted}>turns recorded</Text>
                <Text bold color={theme.accentBright}>{selectedSession.turnCount} turn(s)</Text>
              </Box>
              {selectedSession.model && (
                <Box flexDirection="row" justifyContent="space-between">
                  <Text color={theme.muted}>last model</Text>
                  <Text color={theme.text}>{selectedSession.model}</Text>
                </Box>
              )}
              <Box marginTop={1} flexDirection="column">
                <Text color={theme.muted}>task title:</Text>
                <Text color={theme.text}>
                  "{fitText(displayTitle(selectedSession.title, selectedSession.createdAt), 100)}"
                </Text>
              </Box>

              <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={selectedSession.id === currentSessionId ? theme.accentBright : theme.border}>
                <Text color={selectedSession.id === currentSessionId ? theme.accentBright : theme.secondary} bold>
                  {selectedSession.id === currentSessionId
                    ? "active session"
                    : "press [enter] to resume this session."}
                </Text>
              </Box>
            </Box>
          ) : (
            <Box>
              <Text color={theme.muted}>select a session to view details.</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom Status / Key Hints */}
      <Box height={1} width={totalContentWidth} justifyContent="space-between" marginTop={1} overflow="hidden">
        <Text color={theme.muted}>
          [enter resume · n new · d delete · esc close]
        </Text>
        <Text color={theme.secondary}>
          morpheus
        </Text>
      </Box>
    </Box>
  );
}
