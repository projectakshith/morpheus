import React from "react";
import path from "node:path";
import { Text } from "ink";
import { CyberPulse } from "../CyberPulse.js";
import type { Finding } from "../../../core/types.js";
import type { Thread, FileEditRecord, RightLine } from "../../types.js";
import { theme, getToolBadge } from "../../theme.js";

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
  const bg = theme.bg;
  const cwd = process.cwd();

  const totalTools = threads.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.type === "tool").length,
    0
  );

  const tCount = String(totalTools);
  const tHdrLeft = "[ ▰ TOOLS ]";
  const tHdrRight = `[ ${tCount} ]`;
  const tPadHdr = Math.max(0, contentWidth - tHdrLeft.length - tHdrRight.length);

  lines.push({
    id: "tools_hdr",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.border}>[ </Text>
        <Text color={theme.accentBright} bold>
          ▰ TOOLS
        </Text>
        <Text color={theme.border}> ]</Text>
        {" ".repeat(Math.max(1, tPadHdr))}
        <Text color={theme.border}>[ </Text>
        <Text color={theme.secondary} bold>{tCount}</Text>
        <Text color={theme.border}> ]</Text>
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
    threads.forEach((thread, tIdx) => {
      const toolSteps = thread.steps.filter((s) => s.type === "tool");
      if (toolSteps.length === 0) return;

      const isLatestTurn = tIdx === threads.length - 1;
      const isThreadCollapsed =
        collapsedThreadIds.has(thread.id) ||
        (!isLatestTurn && !collapsedThreadIds.has(`expand_${thread.id}`));
      const thArrow = isThreadCollapsed ? "▶" : "▼";
      const thPfx = `  ${thArrow} turn #${thread.index} (${toolSteps.length})`;
      const thPad = Math.max(0, contentWidth - thPfx.length);

      lines.push({
        id: `th_hdr_${thread.id}`,
        threadId: thread.id,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.secondary} bold>
              {thPfx}
            </Text>
            {" ".repeat(thPad)}
          </Text>
        ),
      });

      if (!isThreadCollapsed) {
        toolSteps.forEach((step) => {
          const isExpanded = expandedToolIds.has(step.id);
          const badge = getToolBadge(step.name);
          const toolArg = cleanToolArg(step.name, step.args, cwd);

          const durStr = step.isRunning
            ? (step.startTime ? `${Math.floor((Date.now() - step.startTime) / 1000)}s` : "")
            : step.durationMs
            ? `${(step.durationMs / 1000).toFixed(1)}s`
            : "";

          const expandHint = isExpanded ? "[-]" : "[+]";
          const statusIcon = step.isError ? "✖" : "✔";
          const statusColor = step.isError ? theme.error : theme.accentBright;

          const visTextLen =
            2 +
            (step.isRunning ? 5 : 2) +
            badge.label.length + 3 +
            (toolArg ? 1 + toolArg.length : 0) +
            (durStr ? 1 + durStr.length : 0) +
            1 + expandHint.length;
          const pad = Math.max(0, contentWidth - visTextLen);

          lines.push({
            id: `tool_${step.id}`,
            toolId: step.id,
            node: (
              <Text backgroundColor={bg} wrap="truncate-end">
                {"  "}
                {step.isRunning ? (
                  <CyberPulse />
                ) : (
                  <Text color={statusColor}>{statusIcon} </Text>
                )}
                <Text color={theme.border}>[</Text>
                <Text color={badge.color} bold>
                  {badge.label}
                </Text>
                <Text color={theme.border}>] </Text>
                <Text color={step.isError ? theme.error : theme.text} bold>
                  {toolArg || step.name || "tool"}
                </Text>
                {" ".repeat(pad)}
                {durStr ? <Text color={theme.muted}>{durStr} </Text> : null}
                <Text color={theme.secondary}>{expandHint}</Text>
              </Text>
            ),
          });

          if (isExpanded) {
            if (step.args && Object.keys(step.args).length > 0) {
              const argLines = JSON.stringify(step.args, null, 2).split("\n").slice(0, 8);
              argLines.forEach((aLine, aIdx) => {
                const visLen = 6 + aLine.length;
                const padArg = Math.max(0, contentWidth - visLen);
                lines.push({
                  id: `tool_${step.id}_arg_${aIdx}`,
                  toolId: step.id,
                  node: (
                    <Text backgroundColor={bg} wrap="truncate-end">
                      <Text color={theme.border}>  │ </Text>
                      <Text color={theme.muted}>in </Text>
                      <Text color={theme.secondary}>{aLine}</Text>
                      {" ".repeat(padArg)}
                    </Text>
                  ),
                });
              });
            }

            if (step.outputPreview && step.outputPreview.length > 0) {
              step.outputPreview.slice(0, 6).forEach((oLine, oIdx) => {
                const visLen = 4 + oLine.length;
                const padOut = Math.max(0, contentWidth - visLen);
                lines.push({
                  id: `tool_${step.id}_out_${oIdx}`,
                  toolId: step.id,
                  node: (
                    <Text backgroundColor={bg} wrap="truncate-end">
                      <Text color={theme.border}>  │ </Text>
                      <Text color={step.isError ? theme.error : theme.text}>{oLine}</Text>
                      {" ".repeat(padOut)}
                    </Text>
                  ),
                });
              });
            } else if (step.outputSummary) {
              const visLen = 4 + step.outputSummary.length;
              const padSum = Math.max(0, contentWidth - visLen);
              lines.push({
                id: `tool_${step.id}_summary`,
                toolId: step.id,
                node: (
                  <Text backgroundColor={bg} wrap="truncate-end">
                    <Text color={theme.border}>  └ </Text>
                    <Text color={theme.muted} italic>
                      {step.outputSummary}
                    </Text>
                    {" ".repeat(padSum)}
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
        {"──" + "─".repeat(Math.max(0, contentWidth - 2))}
      </Text>
    ),
  });

  // Consolidate edits per unique file path to eliminate duplication fatigue
  interface ConsolidatedEdit {
    filePath: string;
    relPath: string;
    linesAdded: number;
    linesRemoved: number;
    diffLines: string[];
    count: number;
  }

  const consolidatedMap = new Map<string, ConsolidatedEdit>();
  edits.forEach((edit) => {
    const existing = consolidatedMap.get(edit.filePath);
    const relPath = toRel(edit.filePath, cwd);
    if (!existing) {
      consolidatedMap.set(edit.filePath, {
        filePath: edit.filePath,
        relPath,
        linesAdded: edit.linesAdded,
        linesRemoved: edit.linesRemoved,
        diffLines: edit.diffLines ? [...edit.diffLines] : [],
        count: 1,
      });
    } else {
      existing.linesAdded += edit.linesAdded;
      existing.linesRemoved += edit.linesRemoved;
      existing.count += 1;
      if (edit.diffLines && edit.diffLines.length > 0) {
        existing.diffLines = edit.diffLines;
      }
    }
  });

  const consolidatedEdits = Array.from(consolidatedMap.values());

  const eLeft = "[ ▰ FILES CHANGED ]";
  const eCount = String(consolidatedEdits.length);
  const eRight = `[ ${eCount} ]`;
  const ePad = Math.max(0, contentWidth - eLeft.length - eRight.length);

  lines.push({
    id: "edits_hdr",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.border}>[ </Text>
        <Text color={theme.secondary} bold>
          ▰ FILES CHANGED
        </Text>
        <Text color={theme.border}> ]</Text>
        {" ".repeat(Math.max(1, ePad))}
        <Text color={theme.border}>[ </Text>
        <Text color={theme.accentBright} bold>{eCount}</Text>
        <Text color={theme.border}> ]</Text>
      </Text>
    ),
  });

  if (consolidatedEdits.length === 0) {
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
    consolidatedEdits.forEach((edit) => {
      const isExpanded = expandedFileEdits.has(edit.filePath);
      const expandIcon = isExpanded ? "[-]" : "[view]";
      const statsStr = `+${edit.linesAdded} -${edit.linesRemoved} ${expandIcon}`;
      const availPath = Math.max(0, contentWidth - 6 - statsStr.length);
      const trimmedPath =
        edit.relPath.length > availPath ? `${edit.relPath.slice(0, Math.max(0, availPath - 1))}…` : edit.relPath;
      const pad = Math.max(0, contentWidth - 4 - trimmedPath.length - statsStr.length);

      lines.push({
        id: `edit_${edit.filePath}`,
        editFilePath: edit.filePath,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.accent}>  ◈ </Text>
            <Text color={theme.text} bold>
              {trimmedPath}
            </Text>
            {" ".repeat(pad)}
            <Text color={theme.diffAdd} bold>+{edit.linesAdded} </Text>
            <Text color={theme.diffRemove} bold>-{edit.linesRemoved} </Text>
            <Text color={theme.accent}>{expandIcon}</Text>
          </Text>
        ),
      });

      if (isExpanded && edit.diffLines && edit.diffLines.length > 0) {
        edit.diffLines.slice(0, 5).forEach((dLine, dIdx) => {
          const isAdd = dLine.startsWith("+");
          const isRem = dLine.startsWith("-");
          const col = isAdd ? theme.diffAdd : isRem ? theme.diffRemove : theme.muted;
          const padDiff = Math.max(0, contentWidth - 4 - dLine.length);
          lines.push({
            id: `diff_${edit.filePath}_${dIdx}`,
            editFilePath: edit.filePath,
            node: (
              <Text backgroundColor={bg} wrap="truncate-end">
                <Text color={theme.border}>  │ </Text>
                <Text color={col} bold={isAdd || isRem}>{dLine}</Text>
                {" ".repeat(padDiff)}
              </Text>
            ),
          });
        });

        lines.push({
          id: `diff_${edit.filePath}_hint`,
          editFilePath: edit.filePath,
          node: (
            <Text backgroundColor={bg} wrap="truncate-end">
              <Text color={theme.border}>  └ </Text>
              <Text color={theme.muted} italic>
                [type /diff to inspect full diff]
              </Text>
              {" ".repeat(Math.max(0, contentWidth - 36))}
            </Text>
          ),
        });
      }
    });
  }

  if (findings.length > 0) {
    lines.push({
      id: "findings_div",
      node: (
        <Text backgroundColor={bg} color={theme.border}>
          {"──" + "─".repeat(Math.max(0, contentWidth - 2))}
        </Text>
      ),
    });

    const fLeft = "[ ▰ FINDINGS ]";
    const fCount = String(findings.length);
    const fRight = `[ ${fCount} ]`;
    const fPad = Math.max(0, contentWidth - fLeft.length - fRight.length);
    lines.push({
      id: "findings_hdr",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.border}>[ </Text>
          <Text color={theme.secondary} bold>
            ▰ FINDINGS
          </Text>
          <Text color={theme.border}> ]</Text>
          {" ".repeat(Math.max(1, fPad))}
          <Text color={theme.border}>[ </Text>
          <Text color={theme.accentBright} bold>{fCount}</Text>
          <Text color={theme.border}> ]</Text>
        </Text>
      ),
    });

    findings.slice(-3).forEach((f, idx) => {
      const availTopic = Math.max(0, contentWidth - 5);
      const topicTrimmed =
        f.topic.length > availTopic ? `${f.topic.slice(0, Math.max(0, availTopic - 1))}…` : f.topic;
      const itemPad = Math.max(0, contentWidth - 4 - topicTrimmed.length);

      lines.push({
        id: `finding_${idx}`,
        node: (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={theme.accentBright}>  ✦ </Text>
            <Text color={theme.text} bold>{topicTrimmed}</Text>
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
          {"──" + "─".repeat(Math.max(0, contentWidth - 2))}
        </Text>
      ),
    });

    const bTrimmed = branch.length > 18 ? `${branch.slice(0, 15)}…` : branch;
    const statStr = ` [${gitStatus || "clean"}]`;
    const gitVisLen = 4 + bTrimmed.length + statStr.length;
    const gitPad = Math.max(0, contentWidth - gitVisLen);

    lines.push({
      id: "git_info",
      node: (
        <Text backgroundColor={bg} wrap="truncate-end">
          <Text color={theme.accent}>  ◈ </Text>
          <Text color={theme.secondary} bold>{bTrimmed}</Text>
          <Text color={gitStatus && gitStatus !== "clean" ? theme.accentBright : theme.muted}>
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
        {"──" + "─".repeat(Math.max(0, contentWidth - 2))}
      </Text>
    ),
  });

  const logHint = "~/.morpheus/logs [type /log]";
  const logAvail = Math.max(0, contentWidth - 5);
  const logTrimmed = logHint.length > logAvail ? `${logHint.slice(0, Math.max(0, logAvail - 1))}…` : logHint;
  const lPad = Math.max(0, contentWidth - 4 - logTrimmed.length);
  lines.push({
    id: "log_info",
    node: (
      <Text backgroundColor={bg} wrap="truncate-end">
        <Text color={theme.border}>  ≡ </Text>
        <Text color={theme.muted}>{logTrimmed}</Text>
        {" ".repeat(lPad)}
      </Text>
    ),
  });

  return lines;
}
