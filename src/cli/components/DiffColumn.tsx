/*
 * DiffColumn: Right side panel displaying active tools, diffs, findings, and status.
 */

import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord } from "../types.js";
import { buildRightLines } from "./diff/buildRightLines.js";

export type { RightLine, DiffColumnProps, FileEditRecord, ToolStepRecord };
export { buildRightLines };

export function DiffColumn({ width, height, lines }: DiffColumnProps) {
  const visible = lines.slice(0, height);
  const padCount = Math.max(0, height - visible.length);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor={theme.border}
      paddingLeft={0}
    >
      {visible.map((line) => (
        <Box key={line.id} height={1} overflow="hidden">
          {line.node}
        </Box>
      ))}
      {Array.from({ length: padCount }).map((_, idx) => (
        <Box key={`pad_${idx}`} height={1} overflow="hidden">
          <Text backgroundColor={theme.bgColumn}>
            {" ".repeat(Math.max(16, width - 1))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
