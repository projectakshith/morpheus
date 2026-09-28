import React from "react";
import path from "node:path";
import { Text } from "ink";
import Spinner from "ink-spinner";
import type { Finding } from "../../../core/types.js";
import type { Thread, FileEditRecord, RightLine } from "../../types.js";
import { theme } from "../../theme.js";

function toRel(filePath: string, cwd: string): string {
  if (path.isAbsolute(filePath)) {
    const rel = path.relative(cwd, filePath);
    return rel.startsWith("..") ? filePath : rel;
  }
  return filePath;
}

function cleanToolArg(name?: string, args?: Record<string, unknown>, cwd: string = process.cwd()): string {
  if (!args || Object.keys(args).length === 0) return "";

  if (name === "read_file" && typeof args.filePath === "string") {
    const relPath = toRel(args.filePath, cwd);
    const range = args.offset ? `:${args.offset}` : "";
    return `${relPath}${range}`;
  }
  if ((name === "edit_file" || name === "write_file") && typeof args.filePath === "string") {
    return toRel(args.filePath, cwd);
  }
  if (name === "bash" && typeof args.command === "string") {
    let cmd = args.command.trim();
    if (cmd.startsWith(`cd ${cwd} && `)) {
      cmd = cmd.slice(`cd ${cwd} && `.length);
    } else if (cmd.startsWith(`cd "${cwd}" && `)) {
      cmd = cmd.slice(`cd "${cwd}" && `.length);
    }
    return cmd;
  }
  if ((name === "grep_code" || name === "grepCode") && typeof args.pattern === "string") {
    const target = typeof args.path === "string" ? ` in ${toRel(args.path, cwd)}` : "";
    return `"${args.pattern}"${target}`;
  }
  if ((name === "list_dir" || name === "listDir") && typeof args.dirPath === "string") {
    return toRel(args.dirPath, cwd);
  }
  if ((name === "outline_code" || name === "outlineCode") && typeof args.filePath === "string") {
    return toRel(args.filePath, cwd);
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
  if (typeof primary === "string") return toRel(primary, cwd);

  try {
    const str = JSON.stringify(args);
    return str.length > 25 ? `${str.slice(0, 22)}...` : str;
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
  collapsedThreadIds: Set<string> = new Set(),
  expandedFileEdits: Set<string> = new Set(),
  contentWidth: number = 36
): RightLine[] {
  const lines: RightLine[] = [];
  const bg = theme.bgColumn;
  const cwd = process.cwd();

  const totalTools = threads.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.type === "tool").length,
    0
  );

  const tCount = String(totalTools);
  const tHdrLeft = "  TOOL CALLS";
  const tPadHdr = Math.max(0, contentWidth - tHdrLeft.length - tCount.length);

  lines.push({
    id: "tools_hdr",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.secondary} bold>
          {tHdrLeft}
        </Text>
        {" ".repeat(Math.max(1, tPadHdr))}
        <Text color={theme.accentBright}>{tCount}</Text>
      </Text>
    ),
  });

  if (totalTools === 0) {
    const emptyPfx = "  ○ ";
    const emptyMsg = "no tool activity yet";
    const pad = Math.max(0, contentWidth - emptyPfx.length - emptyMsg.length);
    lines.push({
      id: "tools_empty",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.muted}>{emptyPfx}</Text>
          <Text color={theme.muted} italic>
            {emptyMsg}
          </Text>
          {" ".repeat(pad)}
        </Text>
      ),
    });
  } else {
    threads.forEach((thread) => {
      const toolSteps = thread.steps.filter((s) => s.type === "tool");
      if (toolSteps.length === 0) return;

      const isThreadCollapsed = collapsedThreadIds.has(thread.id);
      const thArrow = isThreadCollapsed ? "▶" : "▼";
      const thPfx = `  ${thArrow} turn #${thread.index} (${toolSteps.length})`;
      const thPad = Math.max(0, contentWidth - thPfx.length);

      lines.push({
        id: `th_hdr_${thread.id}`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.muted} bold>
              {thPfx}
            </Text>
            {" ".repeat(thPad)}
          </Text>
        ),
      });

      if (!isThreadCollapsed) {
        toolSteps.forEach((step, sIdx) => {
          const isExpanded = expandedToolIds.has(step.id);
          const icon = step.isRunning ? "◌" : step.isError ? "✖" : "✔";
          const iconColor = step.isRunning
            ? theme.accentBright
            : step.isError
            ? theme.error
            : theme.secondary;

          const toolName = step.name || "tool";
          const toolArg = cleanToolArg(step.name, step.args, cwd);

          const durStr = step.isRunning
            ? (step.startTime ? `${Math.floor((Date.now() - step.startTime) / 1000)}s` : "")
            : step.durationMs
            ? `${(step.durationMs / 1000).toFixed(1)}s`
            : "";

          const expandHint = isExpanded ? " [-]" : " [+]";
          const pfx = "    " + icon + " " + toolName;
          const leftLen = pfx.length + (toolArg ? 1 + toolArg.length : 0);
          const rightLen = (durStr ? 1 + durStr.length : 0) + expandHint.length;
          const availSpace = Math.max(0, contentWidth - leftLen - rightLen);

          lines.push({
            id: `tool_${step.id}`,
            toolId: step.id,
            node: (
              <Text backgroundColor={bg} wrap="truncate-end">
                <Text color={theme.border}>    </Text>
                {step.isRunning ? (
                  <Text color={iconColor}>
                    <Spinner type="dots" />{" "}
                  </Text>
                ) : (
                  <Text color={iconColor}>{icon} </Text>
                )}
                <Text color={step.isError ? theme.error : theme.text} bold>
                  {toolName}
                </Text>
                {toolArg ? (
                  <Text color={theme.muted}> {toolArg}</Text>
                ) : null}
                {" ".repeat(availSpace)}
                {durStr ? <Text color={theme.muted}>{durStr} </Text> : null}
                <Text color={theme.secondary}>{expandHint}</Text>
              </Text>
            ),
          });

          if (isExpanded) {
            if (step.args && Object.keys(step.args).length > 0) {
              const argLines = JSON.stringify(step.args, null, 2).split("\n").slice(0, 8);
              argLines.forEach((aLine, aIdx) => {
                const pad = Math.max(0, contentWidth - 6 - aLine.length);
                lines.push({
                  id: `tool_${step.id}_arg_${aIdx}`,
                  toolId: step.id,
                  node: (
                    <Text backgroundColor={bg} wrap="truncate-end">
                      <Text color={theme.border}>      </Text>
                      <Text color={theme.secondary}>{aLine}</Text>
                      {" ".repeat(pad)}
                    </Text>
                  ),
                });
              });
            }

            if (step.outputPreview && step.outputPreview.length > 0) {
              step.outputPreview.slice(0, 6).forEach((oLine, oIdx) => {
                const pad = Math.max(0, contentWidth - 6 - oLine.length);
                lines.push({
                  id: `tool_${step.id}_out_${oIdx}`,
                  toolId: step.id,
                  node: (
                    <Text backgroundColor={bg} wrap="truncate-end">
                      <Text color={theme.border}>      </Text>
                      <Text color={step.isError ? theme.error : theme.muted}>{oLine}</Text>
                      {" ".repeat(pad)}
                    </Text>
                  ),
                });
              });
            } else if (step.outputSummary) {
              const pad = Math.max(0, contentWidth - 6 - step.outputSummary.length);
              lines.push({
                id: `tool_${step.id}_summary`,
                toolId: step.id,
                node: (
                  <Text backgroundColor={bg} wrap="truncate-end">
                    <Text color={theme.border}>      </Text>
                    <Text color={theme.muted} italic>{step.outputSummary}</Text>
                    {" ".repeat(pad)}
                  </Text>
                ),
              });
            }
          }
        });
      }
    });
  }

  lines.push({
    id: "div_edits",
    node: (
      <Text backgroundColor={bg} color={theme.border}>
        {"  " + "─".repeat(Math.max(0, contentWidth - 2))}
      </Text>
    ),
  });

  const eLeft = "  FILES CHANGED";
  const eCount = String(edits.length);
  const ePad = Math.max(0, contentWidth - eLeft.length - eCount.length);

  lines.push({
    id: "edits_hdr",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.secondary} bold>
          {eLeft}
        </Text>
        {" ".repeat(Math.max(1, ePad))}
        <Text color={theme.accentBright}>{eCount}</Text>
      </Text>
    ),
  });

  if (edits.length === 0) {
    const emptyPfx = "  ○ ";
    const emptyMsg = "no file modifications";
    const pad = Math.max(0, contentWidth - emptyPfx.length - emptyMsg.length);
    lines.push({
      id: "edits_empty",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.muted}>{emptyPfx}</Text>
          <Text color={theme.muted} italic>
            {emptyMsg}
          </Text>
          {" ".repeat(pad)}
        </Text>
      ),
    });
  } else {
    edits.forEach((edit) => {
      const isExpanded = expandedFileEdits.has(edit.filePath);
      const relPath = toRel(edit.filePath, cwd);
      const expandIcon = isExpanded ? "[-]" : "[+]";
      const statsStr = `+${edit.linesAdded} -${edit.linesRemoved} ${expandIcon}`;
      const availPath = Math.max(0, contentWidth - 6 - statsStr.length);
      const trimmedPath =
        relPath.length > availPath ? `${relPath.slice(0, Math.max(0, availPath - 1))}…` : relPath;
      const pad = Math.max(0, contentWidth - 6 - trimmedPath.length - statsStr.length);

      lines.push({
        id: `edit_${edit.filePath}`,
        editFilePath: edit.filePath,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.secondary}>  • </Text>
            <Text color={theme.text} bold>
              {trimmedPath}
            </Text>
            {" ".repeat(pad)}
            <Text color={theme.secondary}>+{edit.linesAdded} </Text>
            <Text color={theme.error}>-{edit.linesRemoved} </Text>
            <Text color={theme.muted}>{expandIcon}</Text>
          </Text>
        ),
      });

      if (isExpanded && edit.diffLines && edit.diffLines.length > 0) {
        edit.diffLines.slice(0, 10).forEach((dLine, dIdx) => {
          const isAdd = dLine.startsWith("+");
          const isRem = dLine.startsWith("-");
          const col = isAdd ? theme.secondary : isRem ? theme.error : theme.muted;
          const pad = Math.max(0, contentWidth - 6 - dLine.length);
          lines.push({
            id: `diff_${edit.filePath}_${dIdx}`,
            editFilePath: edit.filePath,
            node: (
              <Text backgroundColor={bg} wrap="truncate-end">
                <Text color={theme.border}>      </Text>
                <Text color={col}>{dLine}</Text>
                {" ".repeat(pad)}
              </Text>
            ),
          });
        });
      }
    });
  }

  if (findings.length > 0) {
    lines.push({
      id: "findings_div",
      node: (
        <Text backgroundColor={bg} color={theme.border}>
          {"  " + "─".repeat(Math.max(0, contentWidth - 2))}
        </Text>
      ),
    });

    const fLeft = "  FINDINGS";
    const fCount = String(findings.length);
    const fPad = Math.max(0, contentWidth - fLeft.length - fCount.length);
    lines.push({
      id: "findings_hdr",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.secondary} bold>
            {fLeft}
          </Text>
          {" ".repeat(Math.max(1, fPad))}
          <Text color={theme.accentBright}>{fCount}</Text>
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
          {"  " + "─".repeat(Math.max(0, contentWidth - 2))}
        </Text>
      ),
    });

    const gitPfx = "  git: ";
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

  lines.push({
    id: "log_div",
    node: (
      <Text backgroundColor={bg} color={theme.border}>
        {"  " + "─".repeat(Math.max(0, contentWidth - 2))}
      </Text>
    ),
  });

  const logPfx = "  logs: ";
  const logHint = "~/.morpheus/logs (type /log)";
  const logAvail = Math.max(0, contentWidth - logPfx.length);
  const logTrimmed = logHint.length > logAvail ? `${logHint.slice(0, Math.max(0, logAvail - 1))}…` : logHint;
  const lPad = Math.max(0, contentWidth - logPfx.length - logTrimmed.length);
  lines.push({
    id: "log_info",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.muted}>{logPfx}</Text>
        <Text color={theme.secondary}>{logTrimmed}</Text>
        {" ".repeat(lPad)}
      </Text>
    ),
  });

  return lines;
}
