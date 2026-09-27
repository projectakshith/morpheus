import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MarkdownFormatter } from "../format";

export interface MessageCardProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/* Minimalist message card formatting with full ANSI markdown rendering */
export function MessageCard({ role, content, isStreaming = false }: MessageCardProps) {
  if (!content.trim() && !isStreaming) {
    return null;
  }

  const isUser = role === "user";

  /* Process assistant markdown into rich ANSI terminal lines */
  const formattedLines = useMemo(() => {
    if (isUser) {
      return content.split("\n");
    }
    const formatter = new MarkdownFormatter();
    const result: string[] = [];
    const rawLines = content.split("\n");
    for (const rawLine of rawLines) {
      result.push(...formatter.processLine(rawLine));
    }
    result.push(...formatter.flush());
    return result;
  }, [content, isUser]);

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={isUser ? "white" : "greenBright"} bold>
          {isUser ? "▲ you" : "▲ morpheus"}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginTop={0}>
        {formattedLines.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
