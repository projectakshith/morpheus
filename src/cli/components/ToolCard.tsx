import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface ToolCardProps {
  name: string;
  args: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  outputSummary?: string;
  outputPreview?: string[];
}

/* Minimalist tool execution card with Vercel-style vertical lines and status icons */
export function ToolCard({
  name,
  args,
  isRunning = false,
  isError = false,
  outputSummary,
  outputPreview = [],
}: ToolCardProps) {
  /* Format key arguments concisely on a single line */
  const primaryArg =
    args.filePath ?? args.command ?? args.url ?? args.dirPath ?? args.query ?? "";
  const primaryArgStr = typeof primaryArg === "string" ? primaryArg : JSON.stringify(primaryArg);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color="gray">│  </Text>
        {isRunning ? (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />{" "}
            </Text>
            <Text color="white" bold>
              {name}
            </Text>
            {primaryArgStr ? <Text color="cyan"> {primaryArgStr}</Text> : null}
          </Box>
        ) : isError ? (
          <Box>
            <Text color="red">✖ </Text>
            <Text color="white" bold>
              {name}
            </Text>
            {primaryArgStr ? <Text color="cyan"> {primaryArgStr}</Text> : null}
            {outputSummary ? <Text color="red"> · {outputSummary}</Text> : null}
          </Box>
        ) : (
          <Box>
            <Text color="green">✔ </Text>
            <Text color="white" bold>
              {name}
            </Text>
            {primaryArgStr ? <Text color="cyan"> {primaryArgStr}</Text> : null}
            {outputSummary ? <Text color="gray"> · {outputSummary}</Text> : null}
          </Box>
        )}
      </Box>

      {outputPreview.length > 0 && (
        <Box flexDirection="column" marginLeft={3}>
          {outputPreview.slice(0, 6).map((line, idx) => {
            if (line.startsWith("+") && !line.startsWith("+++")) {
              return (
                <Text key={idx} color="green">
                  {line}
                </Text>
              );
            }
            if (line.startsWith("-") && !line.startsWith("---")) {
              return (
                <Text key={idx} color="red">
                  {line}
                </Text>
              );
            }
            return (
              <Text key={idx} color="gray">
                {line}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
