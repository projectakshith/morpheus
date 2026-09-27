import React from "react";
import { Box, Text } from "ink";
import type { Finding } from "../../core/types";

export interface FileEditRecord {
  filePath: string;
  type: "edit" | "write";
  diffLines: string[];
  linesAdded: number;
  linesRemoved: number;
  timestamp: number;
}

export interface DiffColumnProps {
  width: number;
  height?: number | string;
  edits: FileEditRecord[];
  findings: Finding[];
  branch?: string;
  gitStatus?: string;
}

/* Minimalist Vercel-style sidebar inspector for live code diffs and pinned findings */
export function DiffColumn({
  width,
  height,
  edits,
  findings,
  branch,
  gitStatus,
}: DiffColumnProps) {
  const contentWidth = Math.max(20, width - 3);
  const latestEdit = edits.length > 0 ? edits[edits.length - 1] : undefined;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height ?? "100%"}
      overflow="hidden"
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="gray"
      paddingLeft={1}
    >
      {/* Header banner */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">
          INSPECTOR
        </Text>
        <Text color="gray">
          {edits.length} {edits.length === 1 ? "file" : "files"}
        </Text>
      </Box>

      {/* Modified files summary */}
      {edits.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {edits.slice(-5).map((edit, idx) => (
            <Box key={idx} justifyContent="space-between">
              <Box>
                <Text color={edit.type === "edit" ? "yellow" : "greenBright"}>
                  {edit.type === "edit" ? "M " : "+ "}
                </Text>
                <Text color="white" wrap="truncate-end">
                  {edit.filePath.length > contentWidth - 12
                    ? "..." + edit.filePath.slice(-(contentWidth - 15))
                    : edit.filePath}
                </Text>
              </Box>
              <Text color="gray">
                <Text color="green">+{edit.linesAdded}</Text>{" "}
                <Text color="red">-{edit.linesRemoved}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          <Text color="gray">no file changes yet</Text>
          <Text color="gray">edits &amp; diffs will stream</Text>
          <Text color="gray">here in real time</Text>
        </Box>
      )}

      {/* Active diff viewer */}
      {latestEdit && latestEdit.diffLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text color="cyan" bold>
              diff · {latestEdit.filePath.split("/").pop()}
            </Text>
            <Text color="gray">{latestEdit.type}</Text>
          </Box>
          <Box flexDirection="column" marginTop={0}>
            {latestEdit.diffLines.slice(0, 15).map((line, idx) => {
              if (line.startsWith("+") && !line.startsWith("+++")) {
                return (
                  <Text key={idx} color="green" wrap="truncate-end">
                    {line}
                  </Text>
                );
              }
              if (line.startsWith("-") && !line.startsWith("---")) {
                return (
                  <Text key={idx} color="red" wrap="truncate-end">
                    {line}
                  </Text>
                );
              }
              if (line.startsWith("@@")) {
                return (
                  <Text key={idx} color="cyan" wrap="truncate-end">
                    {line}
                  </Text>
                );
              }
              return (
                <Text key={idx} color="gray" wrap="truncate-end">
                  {line}
                </Text>
              );
            })}
            {latestEdit.diffLines.length > 15 && (
              <Text color="gray">
                ... [{latestEdit.diffLines.length - 15} more lines]
              </Text>
            )}
          </Box>
        </Box>
      )}

      {/* Pinned findings section */}
      {findings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text bold color="white">
              FINDINGS
            </Text>
            <Text color="cyan">{findings.length}</Text>
          </Box>
          <Box flexDirection="column" marginTop={0}>
            {findings.slice(-3).map((f, idx) => (
              <Box key={idx} flexDirection="column" marginY={0}>
                <Text color="white" bold>
                  ● {f.topic}
                </Text>
                <Text color="gray" wrap="truncate-end">
                  {f.takeaway}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Git branch metadata */}
      {branch && (
        <Box marginTop={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text color="gray">git: {branch}</Text>
            <Text color={gitStatus && gitStatus !== "clean" ? "yellow" : "gray"}>
              {gitStatus || "clean"}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
