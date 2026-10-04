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
  cloud?: boolean;
}

export function Header({ version, model, branch, gitStatus, width: customWidth, cloud = false }: HeaderProps) {
  const width = customWidth ?? Math.max(40, process.stdout.columns ? process.stdout.columns - 2 : 76);

  const brand = `▰ morpheus v${version}`;
  const gitInfo = branch ? ` │ ◈ ${branch}${gitStatus ? ` [${gitStatus}]` : ""}` : "";
  const cloudTag = cloud ? "capped cloud · " : "";
  const modelTag = `[ ${glyphs.chip} ${cloudTag}${model} ]`;

  const leftLen = brand.length + gitInfo.length;
  const rightLen = modelTag.length;
  const padBetween = Math.max(1, width - leftLen - rightLen - 1);

  return (
    <Box flexDirection="column" width={width} height={2} overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accentBright} bold>
            ▰ morpheus
          </Text>
          <Text color={theme.muted}> v{version}</Text>
          {branch ? (
            <Text>
              <Text color={theme.border}> │ </Text>
              <Text color={theme.secondary}>◈ {branch}</Text>
              {gitStatus ? (
                <Text color={gitStatus !== "clean" ? theme.accentBright : theme.muted}>
                  {` [${gitStatus}]`}
                </Text>
              ) : null}
            </Text>
          ) : null}
          {" ".repeat(padBetween)}
          <Text color={theme.border}>[ </Text>
          <Text color={theme.accent}>{glyphs.chip} </Text>
          {cloud ? <Text color={theme.accentBright}>{cloudTag}</Text> : null}
          <Text color={theme.secondary} bold>{model}</Text>
          <Text color={theme.border}> ]</Text>
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
