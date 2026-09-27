import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { Finding } from "../../core/types";

export interface FileEditRecord {
  filePath: string;
  type: "edit" | "write";
  diffLines: string[];
  linesAdded: number;
  linesRemoved: number;
  timestamp: number;
}

export interface ToolStepRecord {
  id: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  outputSummary?: string;
  outputPreview?: string[];
  output?: string;
}

export interface DiffColumnProps {
  width: number;
  height?: number | string;
  edits: FileEditRecord[];
  findings: Finding[];
  branch?: string;
  gitStatus?: string;
  activeToolStep?: ToolStepRecord | null;
  toolSteps?: ToolStepRecord[];
}

function formatToolArgs(name?: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  if (name === "read_file" && typeof args.filePath === "string") {
    const range = args.offset ? `:${args.offset}` : "";
    return `${args.filePath}${range}`;
  }
  if ((name === "edit_file" || name === "write_file") && typeof args.filePath === "string") {
    return args.filePath;
  }
  if (name === "bash" && typeof args.command === "string") {
    return args.command;
  }
  if ((name === "grep_code" || name === "grepCode") && typeof args.pattern === "string") {
    const targetPath = typeof args.path === "string" ? ` in ${args.path}` : "";
    return `"${args.pattern}"${targetPath}`;
  }
  if ((name === "list_dir" || name === "listDir") && typeof args.dirPath === "string") {
    return args.dirPath;
  }
  if ((name === "outline_code" || name === "outlineCode") && typeof args.filePath === "string") {
    return args.filePath;
  }
  if (name === "http_request" && typeof args.url === "string") {
    const method = typeof args.method === "string" ? `${args.method.toUpperCase()} ` : "";
    return `${method}${args.url}`;
  }
  if (name === "record_finding" && typeof args.topic === "string") {
    return args.topic;
  }
  const primary =
    args.filePath ?? args.command ?? args.url ?? args.dirPath ?? args.pattern ?? args.topic;
  if (typeof primary === "string") return primary;
  try {
    const str = JSON.stringify(args);
    return str.length > 40 ? `${str.slice(0, 37)}...` : str;
  } catch {
    return "";
  }
}

export function DiffColumn({
  width,
  height,
  edits,
  findings,
  branch,
  gitStatus,
  activeToolStep,
  toolSteps = [],
}: DiffColumnProps) {
  const contentWidth = Math.max(16, width - 3);
  const latestEdit = edits.length > 0 ? edits[edits.length - 1] : undefined;
  const completedTools = toolSteps.filter((s) => !s.isRunning);
  const recentCompleted = completedTools.slice(-4);

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
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color="white">
          TOOL CALLS
        </Text>
        <Text color="gray">
          {toolSteps.length} {toolSteps.length === 1 ? "call" : "calls"} · {edits.length} {edits.length === 1 ? "file" : "files"}
        </Text>
      </Box>

      {activeToolStep && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text color="yellow" bold>
              ACTIVE TOOL
            </Text>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          </Box>
          <Box marginTop={0}>
            <Text color="white" bold>
              {activeToolStep.name}
            </Text>
            <Text color="cyan"> {formatToolArgs(activeToolStep.name, activeToolStep.args)}</Text>
          </Box>
        </Box>
      )}

      {recentCompleted.length > 0 ? (
        <Box flexDirection="column" marginTop={activeToolStep ? 0 : 1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between" marginBottom={1}>
            <Text color="white" bold>
              HISTORY
            </Text>
            <Text color="gray">{completedTools.length}</Text>
          </Box>
          {recentCompleted.map((step) => {
            const argStr = formatToolArgs(step.name, step.args);
            const lines = step.outputPreview || (step.output ? step.output.trim().split("\n").slice(0, 3) : []);
            return (
              <Box key={step.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={step.isError ? "red" : "green"}>
                    {step.isError ? "✖ " : "✔ "}
                  </Text>
                  <Text color="white" bold>
                    {step.name}
                  </Text>
                  {argStr ? <Text color="cyan"> {argStr}</Text> : null}
                  {step.outputSummary ? <Text color="gray"> · {step.outputSummary}</Text> : null}
                </Box>
                {lines.slice(0, 2).map((l, lIdx) => (
                  <Text key={lIdx} color="gray" wrap="truncate-end">
                    {"  "}│ {l.length > contentWidth - 6 ? `${l.slice(0, contentWidth - 7)}…` : l}
                  </Text>
                ))}
              </Box>
            );
          })}
        </Box>
      ) : !activeToolStep ? (
        <Box flexDirection="column" marginY={1}>
          <Text color="gray">no tool calls yet</Text>
          <Text color="gray">tool executions &amp; diffs</Text>
          <Text color="gray">will stream here in real time</Text>
        </Box>
      ) : null}

      {edits.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text color="white" bold>
              MODIFIED FILES
            </Text>
            <Text color="gray">{edits.length}</Text>
          </Box>
          {edits.slice(-3).map((edit, idx) => (
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
      )}

      {latestEdit && latestEdit.diffLines.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text color="cyan" bold>
              diff · {latestEdit.filePath.split("/").pop()}
            </Text>
            <Text color="gray">{latestEdit.type}</Text>
          </Box>
          <Box flexDirection="column" marginTop={0}>
            {latestEdit.diffLines.slice(0, 8).map((line, idx) => {
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
          </Box>
        </Box>
      )}

      {findings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">{"─".repeat(contentWidth)}</Text>
          <Box justifyContent="space-between">
            <Text bold color="white">
              FINDINGS
            </Text>
            <Text color="cyan">{findings.length}</Text>
          </Box>
          <Box flexDirection="column" marginTop={0}>
            {findings.slice(-2).map((f, idx) => (
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

      {branch && (
        <Box flexDirection="column" marginTop={0}>
          <Text color="gray">{"─".repeat(Math.max(10, contentWidth - 2))}</Text>
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
