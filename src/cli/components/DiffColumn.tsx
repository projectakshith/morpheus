import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { Finding } from "../../core/types";
import type { Thread } from "./App";
import { theme } from "../theme";

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

export interface RightLine {
  id: string;
  toolId?: string;
  node: React.ReactNode;
}

export interface DiffColumnProps {
  width: number;
  height: number;
  lines: RightLine[];
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
    return str.length > 30 ? `${str.slice(0, 27)}...` : str;
  } catch {
    return "";
  }
}

export function buildRightLines(
  threads: Thread[],
  edits: FileEditRecord[],
  findings: Finding[],
  branch?: string,
  gitStatus?: string,
  expandedToolIds: Set<string> = new Set(),
  contentWidth: number = 36
): RightLine[] {
  const lines: RightLine[] = [];
  const bg = theme.bgColumn;

  const totalTools = threads.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.type === "tool").length,
    0
  );

  const hdrLeft = " TOOL CALLS ";
  const hdrRight = `${totalTools} calls · ${edits.length} files`;
  const hdrAvail = Math.max(0, contentWidth - hdrLeft.length);
  const hdrRightTrimmed =
    hdrRight.length > hdrAvail ? `${hdrRight.slice(0, Math.max(0, hdrAvail - 1))}…` : hdrRight;
  const hdrPad = Math.max(0, contentWidth - hdrLeft.length - hdrRightTrimmed.length);

  lines.push({
    id: "hdr_title",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.secondary} bold>
          {hdrLeft}
        </Text>
        <Text color={theme.muted}>{hdrRightTrimmed}</Text>
        {" ".repeat(hdrPad)}
      </Text>
    ),
  });

  lines.push({
    id: "hdr_div",
    node: (
      <Text backgroundColor={bg} color={theme.border}>
        {"─".repeat(contentWidth)}
      </Text>
    ),
  });

  let hasAnyTools = false;

  threads.forEach((thread) => {
    const toolSteps = thread.steps.filter((s) => s.type === "tool");
    if (toolSteps.length === 0 && thread.status !== "running") return;

    hasAnyTools = true;
    const pfx = ` ▲ #${thread.index} `;
    const pAvail = Math.max(0, contentWidth - pfx.length - 2);
    const pText =
      thread.prompt.length > pAvail
        ? `${thread.prompt.slice(0, Math.max(0, pAvail - 1))}…`
        : thread.prompt;
    const pPad = Math.max(0, contentWidth - pfx.length - pText.length - 2);

    lines.push({
      id: `${thread.id}_prompt_hdr`,
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.accent} bold>
            {pfx}
          </Text>
          <Text color={theme.text}>"{pText}"</Text>
          {" ".repeat(pPad)}
        </Text>
      ),
    });

    toolSteps.forEach((step) => {
      const argStr = formatToolArgs(step.name, step.args);
      const isExpanded = expandedToolIds.has(step.id);
      const toggle = step.output ? (isExpanded ? " [-]" : " [+]") : "";
      const toggleLen = toggle.length;
      const fixedLen = 3;
      const avail = Math.max(0, contentWidth - fixedLen - toggleLen);

      const name = step.name || "";
      let rest = `${argStr ? ` ${argStr}` : ""}${!isExpanded && step.outputSummary ? ` · ${step.outputSummary}` : ""}`;
      const availRest = Math.max(0, avail - name.length);
      if (rest.length > availRest) {
        rest = `${rest.slice(0, Math.max(0, availRest - 1))}…`;
      }
      const visLen = fixedLen + name.length + rest.length + toggleLen;
      const pad = Math.max(0, contentWidth - visLen);

      lines.push({
        id: `${step.id}_tool_hdr`,
        toolId: step.id,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text> </Text>
            {step.isRunning ? (
              <Text color={theme.accentBright}>
                <Spinner type="dots" />{" "}
              </Text>
            ) : step.isError ? (
              <Text color={theme.accent}>✖ </Text>
            ) : (
              <Text color={theme.success}>✔ </Text>
            )}
            <Text color={theme.text} bold>
              {name}
            </Text>
            <Text color={theme.secondary}>{rest}</Text>
            {toggle ? <Text color={theme.accent}>{toggle}</Text> : null}
            {" ".repeat(pad)}
          </Text>
        ),
      });

      if (isExpanded) {
        const rawOutput = step.output || (step.outputPreview ? step.outputPreview.join("\n") : "");
        const outLines = rawOutput
          ? rawOutput.replace(/\r\n/g, "\n").split("\n").slice(0, 10)
          : [];

        if (outLines.length === 0) {
          const emptyText = "   │ (no output returned)";
          const eTrimmed =
            emptyText.length > contentWidth ? emptyText.slice(0, contentWidth) : emptyText;
          const ePad = Math.max(0, contentWidth - eTrimmed.length);
          lines.push({
            id: `${step.id}_out_empty`,
            toolId: step.id,
            node: (
              <Text backgroundColor={bg} color={theme.muted} italic wrap="truncate-end">
                {eTrimmed}
                {" ".repeat(ePad)}
              </Text>
            ),
          });
        } else {
          outLines.forEach((oLine, oIdx) => {
            const prefix = "   │ ";
            const oAvail = Math.max(0, contentWidth - prefix.length);
            const trimmed =
              oLine.length > oAvail ? `${oLine.slice(0, Math.max(0, oAvail - 1))}…` : oLine;
            let c: string = theme.text;
            if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) c = theme.diffAdd;
            else if (trimmed.startsWith("-") && !trimmed.startsWith("---")) c = theme.diffRemove;
            else if (trimmed.startsWith("@@")) c = theme.secondary;
            else if (step.isError) c = theme.accent;

            const oPad = Math.max(0, contentWidth - prefix.length - trimmed.length);
            lines.push({
              id: `${step.id}_out_${oIdx}`,
              toolId: step.id,
              node: (
                <Text backgroundColor={bg} wrap="truncate-end">
                  <Text color={theme.border}>{prefix}</Text>
                  <Text color={c}>{trimmed}</Text>
                  {" ".repeat(oPad)}
                </Text>
              ),
            });
          });
        }

        const colText = "   └ [click to collapse]";
        const colTrimmed =
          colText.length > contentWidth ? colText.slice(0, contentWidth) : colText;
        const colPad = Math.max(0, contentWidth - colTrimmed.length);
        lines.push({
          id: `${step.id}_out_close`,
          toolId: step.id,
          node: (
            <Text backgroundColor={bg} wrap="truncate-end">
              <Text color={theme.secondary}>{colTrimmed}</Text>
              {" ".repeat(colPad)}
            </Text>
          ),
        });
      }
    });

    const dots = " ·".repeat(Math.min(8, Math.floor(contentWidth / 4)));
    const dPad = Math.max(0, contentWidth - dots.length);
    lines.push({
      id: `${thread.id}_spacer`,
      node: (
        <Text backgroundColor={bg} color={theme.border} wrap="truncate-end">
          {dots}
          {" ".repeat(dPad)}
        </Text>
      ),
    });
  });

  if (!hasAnyTools) {
    const msg1 = " no tool calls yet";
    const pad1 = Math.max(0, contentWidth - msg1.length);
    lines.push({
      id: "no_tools_1",
      node: (
        <Text backgroundColor={bg} color={theme.muted} wrap="truncate-end">
          {msg1}
          {" ".repeat(pad1)}
        </Text>
      ),
    });

    const msg2 = " tool executions stream here";
    const pad2 = Math.max(0, contentWidth - msg2.length);
    lines.push({
      id: "no_tools_2",
      node: (
        <Text backgroundColor={bg} color={theme.muted} wrap="truncate-end">
          {msg2}
          {" ".repeat(pad2)}
        </Text>
      ),
    });
  }

  if (edits.length > 0) {
    lines.push({
      id: "edits_div",
      node: (
        <Text backgroundColor={bg} color={theme.border}>
          {"─".repeat(contentWidth)}
        </Text>
      ),
    });

    const modLeft = " MODIFIED FILES ";
    const modCount = String(edits.length);
    const modPad = Math.max(0, contentWidth - modLeft.length - modCount.length);
    lines.push({
      id: "edits_hdr",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.secondary} bold>
            {modLeft}
          </Text>
          <Text color={theme.muted}>{modCount}</Text>
          {" ".repeat(modPad)}
        </Text>
      ),
    });

    edits.slice(-3).forEach((edit, idx) => {
      const tag = edit.type === "edit" ? " M " : " + ";
      const stats = ` +${edit.linesAdded} -${edit.linesRemoved}`;
      const availFile = Math.max(0, contentWidth - 3 - stats.length);
      const fShort = edit.filePath.split("/").pop() || edit.filePath;
      const fTrimmed =
        fShort.length > availFile ? `${fShort.slice(0, Math.max(0, availFile - 1))}…` : fShort;
      const ePad = Math.max(0, contentWidth - 3 - fTrimmed.length - stats.length);

      lines.push({
        id: `edit_${idx}`,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={edit.type === "edit" ? theme.accent : theme.success}>{tag}</Text>
            <Text color={theme.text}>{fTrimmed}</Text>
            <Text color={theme.diffAdd}> +{edit.linesAdded}</Text>
            <Text color={theme.diffRemove}> -{edit.linesRemoved}</Text>
            {" ".repeat(ePad)}
          </Text>
        ),
      });
    });
  }

  if (findings.length > 0) {
    lines.push({
      id: "findings_div",
      node: (
        <Text backgroundColor={bg} color={theme.border}>
          {"─".repeat(contentWidth)}
        </Text>
      ),
    });

    const fLeft = " FINDINGS ";
    const fCount = String(findings.length);
    const fPad = Math.max(0, contentWidth - fLeft.length - fCount.length);
    lines.push({
      id: "findings_hdr",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.secondary} bold>
            {fLeft}
          </Text>
          <Text color={theme.accent}>{fCount}</Text>
          {" ".repeat(fPad)}
        </Text>
      ),
    });

    findings.slice(-2).forEach((f, idx) => {
      const fPfx = "  ● ";
      const availTopic = Math.max(0, contentWidth - 4);
      const topicTrimmed =
        f.topic.length > availTopic ? `${f.topic.slice(0, Math.max(0, availTopic - 1))}…` : f.topic;
      const itemPad = Math.max(0, contentWidth - 4 - topicTrimmed.length);

      lines.push({
        id: `finding_${idx}`,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.accent} bold>
              {fPfx}
            </Text>
            <Text color={theme.text}>{topicTrimmed}</Text>
            {" ".repeat(itemPad)}
          </Text>
        ),
      });
    });
  }

  if (branch) {
    lines.push({
      id: "git_div",
      node: (
        <Text backgroundColor={bg} color={theme.border}>
          {"─".repeat(contentWidth)}
        </Text>
      ),
    });

    const gitPfx = " git: ";
    const bTrimmed = branch.length > 18 ? `${branch.slice(0, 15)}…` : branch;
    const statStr = ` (${gitStatus || "clean"})`;
    const gitVisLen = gitPfx.length + bTrimmed.length + statStr.length;
    const gitPad = Math.max(0, contentWidth - gitVisLen);

    lines.push({
      id: "git_info",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.muted}>{gitPfx}</Text>
          <Text color={theme.secondary}>{bTrimmed}</Text>
          <Text color={gitStatus && gitStatus !== "clean" ? theme.accent : theme.muted}>
            {statStr}
          </Text>
          {" ".repeat(gitPad)}
        </Text>
      ),
    });
  }

  return lines;
}

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
