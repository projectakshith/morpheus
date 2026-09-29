import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { glyphs } from "../glyphs";

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

  const leftPart = `${glyphs.prompt} MORPHEUS v${version}${branch ? ` · ${glyphs.gitBranch} ${branch} (${gitStatus || "clean"})` : ""}`;
  const padBetween = Math.max(1, width - leftPart.length - model.length - 2);

  return (
    <Box flexDirection="column" width={width} height={2} overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accent} bold>
            {glyphs.prompt} MORPHEUS
          </Text>
          <Text color={theme.muted}> v{version}</Text>
          {branch ? (
            <Text>
              <Text color={theme.muted}> · </Text>
              <Text color={theme.secondary}>{glyphs.gitBranch} {branch}</Text>
              <Text color={gitStatus && gitStatus !== "clean" ? theme.accent : theme.muted}>
                {` (${gitStatus || "clean"})`}
              </Text>
            </Text>
          ) : null}
          {" ".repeat(padBetween)}
          <Text color={theme.secondary}>{glyphs.chip} {model}</Text>
        </Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text backgroundColor={theme.bg} color={theme.border}>
          {"─".repeat(width)}
        </Text>
      </Box>
    </Box>
  );
}
