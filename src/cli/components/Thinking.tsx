import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface ThinkingProps {
  content: string;
  isStreaming?: boolean;
  isExpanded?: boolean;
  durationMs?: number;
}

/* Collapsible reasoning block with subtle monochrome borders and status indicator */
export function Thinking({
  content,
  isStreaming = false,
  isExpanded = false,
  durationMs = 0,
}: ThinkingProps) {
  if (!content.trim() && !isStreaming) {
    return null;
  }

  const seconds = (durationMs / 1000).toFixed(1);
  const lines = content.trim().split("\n");

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color="gray">│  </Text>
        {isStreaming ? (
          <Text color="yellow">
            <Spinner type="dots" /> thinking ({seconds}s)...
          </Text>
        ) : (
          <Text color="gray">
            <Text color="gray">●</Text> thinking ({seconds}s) ·{" "}
            <Text color="gray">{isExpanded ? "[tab to collapse]" : "[tab to expand]"}</Text>
          </Text>
        )}
      </Box>

      {isExpanded && lines.length > 0 && (
        <Box flexDirection="column" marginLeft={3} marginTop={0} marginBottom={1}>
          <Text color="gray">┌ thinking</Text>
          {lines.slice(-30).map((line, idx) => (
            <Text key={idx} color="gray">
              │ {line}
            </Text>
          ))}
          {lines.length > 30 && (
            <Text color="gray">│ ... [{lines.length - 30} earlier lines hidden]</Text>
          )}
          <Text color="gray">└</Text>
        </Box>
      )}
    </Box>
  );
}
