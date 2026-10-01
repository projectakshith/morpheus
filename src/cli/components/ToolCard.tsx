import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { glyphs } from "../glyphs";

export interface ToolCardProps {
  name: string;
  args: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  outputSummary?: string;
  outputPreview?: string[];
}

function getToolIcon(toolName: string): string {
  switch (toolName) {
    case "bash":
      return glyphs.bash;
    case "read_file":
      return glyphs.file;
    case "edit_file":
    case "write_file":
      return glyphs.fileEdit;
    case "list_dir":
      return glyphs.folder;
    case "grep_code":
      return glyphs.search;
    case "outline_code":
      return glyphs.outline;
    case "http_request":
      return glyphs.network;
    case "uplink_search":
      return glyphs.search;
    case "uplink_browse":
      return glyphs.network;
    case "record_finding":
      return glyphs.brain;
    case "load_skill":
      return glyphs.skill;
    default:
      return glyphs.chip;
  }
}

export function ToolCard({
  name,
  args,
  isRunning = false,
  isError = false,
  outputSummary,
  outputPreview = [],
}: ToolCardProps) {
  const primaryArg =
    args.filePath ??
    args.command ??
    args.url ??
    args.dirPath ??
    args.query ??
    (args.action
      ? `${args.action}${args.url ? ` ${args.url}` : args.ref ? ` [${args.ref}]` : ""}`
      : "");
  const primaryArgStr = typeof primaryArg === "string" ? primaryArg : JSON.stringify(primaryArg);
  const icon = getToolIcon(name);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color="gray">│  </Text>
        {isRunning ? (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />{" "}
            </Text>
            <Text color="yellow">{icon} </Text>
            <Text color="white" bold>
              {name}
            </Text>
            {primaryArgStr ? <Text color="cyan"> {primaryArgStr}</Text> : null}
          </Box>
        ) : isError ? (
          <Box>
            <Text color="red">{glyphs.error} </Text>
            <Text color="red">{icon} </Text>
            <Text color="white" bold>
              {name}
            </Text>
            {primaryArgStr ? <Text color="cyan"> {primaryArgStr}</Text> : null}
            {outputSummary ? <Text color="red"> · {outputSummary}</Text> : null}
          </Box>
        ) : (
          <Box>
            <Text color="green">{glyphs.success} </Text>
            <Text color="blue">{icon} </Text>
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
