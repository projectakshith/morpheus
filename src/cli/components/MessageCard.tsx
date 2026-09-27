import React from "react";
import { Box, Text } from "ink";

export interface MessageCardProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/* Minimalist message card formatting for dialogue turns */
export function MessageCard({ role, content, isStreaming = false }: MessageCardProps) {
  if (!content.trim() && !isStreaming) {
    return null;
  }

  const isUser = role === "user";
  const lines = content.split("\n");

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={isUser ? "white" : "greenBright"} bold>
          {isUser ? "▲ you" : "▲ morpheus"}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginTop={0}>
        {lines.map((line, idx) => {
          /* Format bullet points with subtle dimmed bullets */
          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const body = line.trim().slice(2);
            return (
              <Box key={idx}>
                <Text color="gray">  · </Text>
                <Text color="white">{body}</Text>
              </Box>
            );
          }

          /* Format markdown headers with bold high-contrast white */
          if (line.trim().startsWith("#")) {
            const headerText = line.trim().replace(/^#+\s*/, "");
            return (
              <Box key={idx} marginTop={1} marginBottom={0}>
                <Text color="white" bold>
                  {headerText}
                </Text>
              </Box>
            );
          }

          return (
            <Text key={idx} color="white">
              {line}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
