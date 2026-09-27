import React from "react";
import { Box, Text } from "ink";

export interface HeaderProps {
  version: string;
  model: string;
  branch?: string;
  gitStatus?: string;
  cwd?: string;
  width?: number;
}

export function Header({ version, model, branch, gitStatus, width: customWidth }: HeaderProps) {
  const width = customWidth ?? Math.max(40, process.stdout.columns ? process.stdout.columns - 2 : 76);

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Box>
          <Text color="greenBright" bold>
            ▲ MORPHEUS
          </Text>
          <Text color="gray"> v{version}</Text>
          {branch && (
            <Text color="gray">
              {" "}· <Text color="white">{branch}</Text>
              {gitStatus && gitStatus !== "clean" ? (
                <Text color="yellow"> ({gitStatus})</Text>
              ) : (
                <Text color="gray"> (clean)</Text>
              )}
            </Text>
          )}
        </Box>
        <Box>
          <Text color="gray">{model}</Text>
        </Box>
      </Box>
      <Text color="gray">{"─".repeat(width)}</Text>
    </Box>
  );
}
