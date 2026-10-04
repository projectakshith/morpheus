import React from "react";
import { Text } from "ink";
import type { Thread, ThreadStep, FileEditRecord, RightLine } from "../../types";
import { theme } from "../../theme";
import { highlightCode } from "../../highlight";
import { cellWidth, truncateCells, truncateCellsStart, wrapCells } from "../../../display/cells";
import { describeStep, relativePath, shortSymbol, type CardModel, type QuietItem, type SeraphBody, type SeraphHit } from "../../../display/describeStep";

const BODY_LIMITS = { diff: 10, code: 6, text: 6, seraph: 24 } as const;
const STRIP_MAX_LINES = 2;
const VERB_WIDTH = 6;

export interface ActivityOptions {
  threads: Thread[];
  edits: FileEditRecord[];
  width: number;
  toggledIds?: Set<string>;
  openedTurnIds?: Set<string>;
  cwd?: string;
  now?: number;
}

interface Seg {
  text: string;
  color?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
}

interface RowMeta {
  toolId?: string;
  threadId?: string;
  editFilePath?: string;
}

function row(id: string, segs: Seg[], width: number, meta: RowMeta = {}, fillBg?: string): RightLine {
  const fitted: Seg[] = [];
  let used = 0;
  for (const seg of segs) {
    const room = width - used;
    if (room <= 0) break;
    const w = cellWidth(seg.text);
    if (w <= room) {
      fitted.push(seg);
      used += w;
    } else {
      fitted.push({ ...seg, text: truncateCells(seg.text, room) });
      used += cellWidth(truncateCells(seg.text, room));
      break;
    }
  }
  const pad = Math.max(0, width - used);
  return {
    id,
    ...meta,
    node: (
      <Text backgroundColor={theme.bg} wrap="truncate-end">
        {fitted.map((seg, i) => (
          <Text
            key={i}
            color={seg.color}
            backgroundColor={seg.bg}
            bold={seg.bold}
            italic={seg.italic}
            dimColor={seg.dim}
          >
            {seg.text}
          </Text>
        ))}
        {pad > 0 ? <Text backgroundColor={fillBg}>{" ".repeat(pad)}</Text> : null}
      </Text>
    ),
  };
}

function blank(id: string, width: number): RightLine {
  return row(id, [], width);
}

function verbColor(verb: string, failed: boolean): string {
  if (failed) return theme.error;
  switch (verb) {
    case "edit":
      return theme.accentBright;
    case "write":
      return theme.diffAdd;
    case "run":
      return theme.warning;
    case "fetch":
      return theme.diffHunk;
    case "seraph":
      return theme.accentBright;
    default:
      return theme.secondary;
  }
}

function statusSegs(card: CardModel): Seg[] {
  if (card.running) return [{ text: card.status, color: theme.accent, italic: true }];
  if (card.verb === "edit" && !card.failed && card.added !== undefined) {
    return [
      { text: `+${card.added}`, color: theme.diffAdd, bold: true },
      { text: " " },
      { text: `−${card.removed ?? 0}`, color: theme.diffRemove, bold: true },
    ];
  }
  if (!card.status) return [];
  return [{ text: card.status, color: card.failed ? theme.error : theme.muted }];
}

function segsWidth(segs: Seg[]): number {
  return segs.reduce((w, s) => w + cellWidth(s.text), 0);
}

function fitTarget(card: CardModel, room: number): string {
  if (room <= 0) return "";
  return card.targetIsPath ? truncateCellsStart(card.target, room) : truncateCells(card.target, room);
}

interface BodyRow {
  segs: Seg[];
  bg?: string;
}

function diffBody(card: CardModel, inner: number): BodyRow[] {
  if (card.body.type !== "diff") return [];
  const { rows, lang } = card.body;
  const gutter = Math.max(...rows.map((r) => String(r.lineNo ?? "").length), 1);
  return rows.map((r) => {
    if (r.kind === "gap") {
      return { segs: [{ text: `${" ".repeat(gutter)}   ⋯`, color: theme.muted }] };
    }
    const num = String(r.lineNo ?? "").padStart(gutter);
    const marker = r.kind === "add" ? "+" : r.kind === "del" ? "−" : " ";
    const markerColor = r.kind === "add" ? theme.diffAdd : r.kind === "del" ? theme.diffRemove : theme.muted;
    const bg = r.kind === "add" ? theme.bgDiffAdd : r.kind === "del" ? theme.bgDiffRemove : undefined;
    const codeRoom = Math.max(0, inner - gutter - 3);
    const code =
      r.kind === "del"
        ? { text: truncateCells(r.text, codeRoom), color: theme.diffRemove }
        : { text: truncateCells(highlightCode(r.text, lang), codeRoom) };
    return {
      bg,
      segs: [
        { text: num, color: theme.muted, bg },
        { text: ` ${marker} `, color: markerColor, bold: r.kind !== "ctx", bg },
        { ...code, bg },
      ],
    };
  });
}

function codeBody(card: CardModel, inner: number): BodyRow[] {
  if (card.body.type !== "code") return [];
  const { lines, lang } = card.body;
  const gutter = String(lines.length).length;
  return lines.map((line, i) => ({
    segs: [
      { text: String(i + 1).padStart(gutter), color: theme.muted },
      { text: "  " },
      { text: truncateCells(highlightCode(line, lang), Math.max(0, inner - gutter - 2)) },
    ],
  }));
}

const SCAN_TRAIL = "░▒▓█▓▒░";
const VIEW_LABELS: Record<string, string> = {
  lexical: "α lex",
  semantic: "β sem",
  structural: "γ struct",
  graph: "δ graph",
  evolution: "ε evo",
};

function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

function commitColor(commit: string, commits: string[]): string {
  const palette = [theme.diffHunk, theme.warning, theme.accentBright, theme.diffRemove];
  return palette[Math.max(0, commits.indexOf(commit)) % palette.length];
}

function meter(fraction: number, cells: number, fill = "█", empty = "░"): Seg[] {
  const filled = Math.max(0, Math.min(cells, Math.round(fraction * cells)));
  return [
    { text: fill.repeat(filled), color: theme.accentBright },
    { text: empty.repeat(cells - filled), color: theme.border },
  ];
}

function seraphScan(inner: number, now: number): BodyRow[] {
  const label = "◌ seraph scanning index ";
  const lane = Math.max(8, inner - label.length);
  const pos = Math.floor(now / 70) % (lane + SCAN_TRAIL.length);
  const cells = Array.from({ length: lane }, (_, i) => {
    const offset = i - (pos - SCAN_TRAIL.length);
    return offset >= 0 && offset < SCAN_TRAIL.length ? SCAN_TRAIL[offset] : "·";
  }).join("");
  return [
    {
      segs: [
        { text: label, color: theme.accent, italic: true },
        { text: cells, color: theme.accentBright },
      ],
    },
  ];
}

function seraphIndexRows(card: CardModel, inner: number): BodyRow[] {
  if (card.body.type !== "seraph" || !card.body.index) return [];
  const { commit, parsedFiles, reusedChunks, totalChunks, ms } = card.body.index;
  const rows: BodyRow[] = [];
  const time = ms === undefined ? "" : ms < 1000 ? ` · ${Math.round(ms)}ms` : ` · ${(ms / 1000).toFixed(1)}s`;
  rows.push({
    segs: [
      { text: "⬡ ", color: theme.accent },
      { text: shortCommit(commit), color: theme.warning, bold: true },
      { text: ` · ${totalChunks} chunks · parsed ${parsedFiles} file${parsedFiles === 1 ? "" : "s"}${time}`, color: theme.muted },
    ],
  });
  if (totalChunks > 0) {
    const ratio = reusedChunks / totalChunks;
    const label = "  reuse ";
    const pct = ` ${Math.round(ratio * 100)}%`;
    const cells = Math.max(6, Math.min(28, inner - label.length - pct.length));
    rows.push({ segs: [{ text: label, color: theme.muted }, ...meter(ratio, cells, "▰", "▱"), { text: pct, color: theme.accentBright, bold: true }] });
  }
  return rows;
}

function seraphHitRows(hit: SeraphHit, rank: number, inner: number, commits: string[], showCommit: boolean, expanded: boolean, ranked = true): BodyRow[] {
  const glyph = rank === 1 ? "◈" : "◇";
  const name = hit.symbol || hit.path.split("/").pop() || hit.path;
  const scoreText = ` ${hit.relevance.toFixed(2)}`;
  const barCells = !ranked ? 0 : inner >= 48 ? 10 : inner >= 36 ? 6 : 0;
  const rankText = `${glyph} ${rank} `;
  const right = barCells ? barCells + scoreText.length : 0;
  const nameRoom = Math.max(4, inner - cellWidth(rankText) - right - 1);
  const shownName = truncateCells(name, nameRoom);
  const gap = Math.max(1, inner - cellWidth(rankText) - cellWidth(shownName) - right);
  const rows: BodyRow[] = [
    {
      segs: [
        { text: rankText, color: rank === 1 ? theme.accentBright : theme.accent, bold: rank === 1 },
        { text: shownName, color: theme.text, bold: true },
        { text: " ".repeat(gap) },
        ...(barCells ? meter(hit.relevance, barCells) : []),
        ...(barCells ? [{ text: scoreText, color: rank === 1 ? theme.accentBright : theme.muted }] : []),
      ],
    },
  ];
  const location = `${hit.path}:${hit.startLine}-${hit.endLine}`;
  const tag = showCommit && hit.commit ? ` @${shortCommit(hit.commit)}` : "";
  const others = hit.versions.length - 1;
  const spread = others > 0 ? ` +${others} version${others === 1 ? "" : "s"} same code` : "";
  rows.push({
    segs: [
      { text: "    " },
      { text: truncateCellsStart(location, Math.max(4, inner - 4 - tag.length - spread.length)), color: theme.diffHunk },
      ...(tag ? [{ text: tag, color: commitColor(hit.commit, commits), bold: true }] : []),
      ...(spread ? [{ text: spread, color: theme.muted, italic: true }] : []),
    ],
  });
  if (expanded) {
    const gutter = String(hit.startLine + hit.preview.length).length;
    hit.preview.forEach((line, i) => {
      rows.push({
        bg: theme.bgCode,
        segs: [
          { text: "    " },
          { text: String(hit.startLine + i).padStart(gutter), color: theme.muted, bg: theme.bgCode },
          { text: " ┃ ", color: theme.border, bg: theme.bgCode },
          { text: truncateCells(highlightCode(line, hit.lang), Math.max(0, inner - 7 - gutter)), bg: theme.bgCode },
        ],
      });
    });
    const views = Object.entries(hit.views).filter(([, v]) => v > 0);
    if (views.length > 1) {
      const segs: Seg[] = [{ text: "    " }];
      for (const [view, value] of views) {
        segs.push({ text: `${VIEW_LABELS[view] ?? view} `, color: theme.muted }, ...meter(value, 4, "▮", "▯"), { text: "  " });
      }
      rows.push({ segs });
    }
  }
  return rows;
}

const CHANGE_GLYPH: Record<string, string> = { added: "+", modified: "~", renamed: "↷", moved: "⇢", deleted: "−" };

function changeColor(change: string): string {
  if (change === "added") return theme.diffAdd;
  if (change === "deleted") return theme.diffRemove;
  if (change === "renamed" || change === "moved") return theme.warning;
  return theme.diffHunk;
}

function seraphDepsRows(body: SeraphBody, inner: number): BodyRow[] {
  const deps = body.deps;
  if (!deps) return [];
  const rows: BodyRow[] = [
    {
      segs: [
        { text: "◈ ", color: theme.accentBright },
        { text: truncateCells(shortSymbol(deps.root), Math.max(4, inner - 20)), color: theme.text, bold: true },
        { text: `  ${deps.direction === "in" ? "callers" : deps.direction === "both" ? "both ways" : "calls out"}`, color: theme.muted },
      ],
    },
  ];
  if (deps.chains.length === 0) {
    rows.push({ segs: [{ text: "  ◌ no dependencies found", color: theme.muted, italic: true }] });
    return rows;
  }
  for (const chain of deps.chains) {
    const segs: Seg[] = [{ text: "  " }];
    chain.steps.forEach((step, i) => {
      segs.push({ text: i === 0 ? "└ " : " → ", color: theme.border });
      segs.push({ text: `${step.kind} `, color: theme.muted });
      segs.push({ text: shortSymbol(step.symbol), color: i === chain.steps.length - 1 ? theme.diffHunk : theme.secondary });
    });
    const last = chain.steps[chain.steps.length - 1]?.symbol ?? "";
    const file = last.includes("::") ? last.slice(0, last.lastIndexOf("::")) : last;
    const used = segsWidth(segs);
    if (file && used + file.length + 2 < inner) segs.push({ text: `  ${file}`, color: theme.border });
    rows.push({ segs });
  }
  return rows;
}

function seraphCompareRows(body: SeraphBody, inner: number): BodyRow[] {
  const cmp = body.compare;
  if (!cmp) return [];
  const rows: BodyRow[] = [];
  const head: Seg[] = [
    { text: "⬡ ", color: theme.accent },
    { text: shortCommit(cmp.from), color: theme.warning, bold: true },
    { text: " → ", color: theme.muted },
    { text: shortCommit(cmp.to), color: theme.diffHunk, bold: true },
    { text: "   " },
  ];
  for (const kind of ["added", "modified", "renamed", "moved", "deleted"]) {
    const n = cmp.summary[kind] ?? 0;
    if (n > 0) head.push({ text: `${CHANGE_GLYPH[kind]}${n} ${kind}  `, color: changeColor(kind), bold: true });
  }
  rows.push({ segs: head });
  if (cmp.depsAdded || cmp.depsRemoved) {
    rows.push({ segs: [{ text: `  dependencies  `, color: theme.muted }, { text: `+${cmp.depsAdded}`, color: theme.diffAdd, bold: true }, { text: " " }, { text: `−${cmp.depsRemoved}`, color: theme.diffRemove, bold: true }] });
  }
  rows.push({ segs: [] });
  for (const c of cmp.changes.slice(0, 10)) {
    const where = `${c.path}:${c.line}`;
    const name = shortSymbol(c.symbol);
    const room = Math.max(4, inner - 4 - cellWidth(name) - 2);
    rows.push({
      segs: [
        { text: ` ${CHANGE_GLYPH[c.change] ?? "·"} `, color: changeColor(c.change), bold: true },
        { text: name, color: theme.text, bold: true },
        { text: "  " },
        { text: truncateCellsStart(where, room), color: theme.border },
      ],
    });
  }
  if (cmp.changes.length > 10) rows.push({ segs: [{ text: `   … ${cmp.changes.length - 10} more`, color: theme.muted, italic: true }] });
  if (cmp.commitSubjects.length) {
    rows.push({ segs: [] });
    for (const c of cmp.commitSubjects.slice(0, 4)) {
      rows.push({ segs: [{ text: `  ${shortCommit(c.sha)} `, color: theme.warning }, { text: truncateCells(c.subject, Math.max(4, inner - 11)), color: theme.secondary }] });
    }
  }
  return rows;
}

function seraphBodyRows(card: CardModel, inner: number): BodyRow[] {
  if (card.body.type !== "seraph") return [];
  const body = card.body;
  if (body.mode === "deps") return seraphDepsRows(body, inner);
  if (body.mode === "compare") return seraphCompareRows(body, inner);
  const rows = seraphIndexRows(card, inner);
  if (body.mode === "index") return rows;
  if (body.mode === "history" && body.commits.length > 1) {
    const segs: Seg[] = [{ text: "  across ", color: theme.muted }];
    body.commits.forEach((commit, i) => {
      if (i > 0) segs.push({ text: " ", color: theme.muted });
      segs.push({ text: shortCommit(commit), color: commitColor(commit, body.commits), bold: true });
    });
    rows.push({ segs });
  }
  if (body.hits.length === 0) {
    rows.push({ segs: [{ text: "◌ no matching code", color: theme.muted, italic: true }] });
    return rows;
  }
  if (rows.length > 0) rows.push({ segs: [] });
  const showCommit = body.mode !== "search" && body.mode !== "symbol";
  body.hits.forEach((hit, i) => {
    rows.push(...seraphHitRows(hit, i + 1, inner, body.commits, showCommit, i === 0 || (body.mode === "history" && i < 3), body.mode !== "symbol"));
  });
  return rows;
}

function textBody(card: CardModel, inner: number): BodyRow[] {
  if (card.body.type !== "text") return [];
  if (card.body.lines.length === 0) {
    return [{ segs: [{ text: "(no output)", color: theme.muted, italic: true }] }];
  }
  return card.body.lines.flatMap((line) =>
    wrapCells(line.text, inner).map((part) => ({
      segs: [{ text: part, color: line.error ? theme.error : theme.secondary }],
    }))
  );
}

function cardLines(card: CardModel, width: number, open: boolean, meta: RowMeta, now: number = Date.now()): RightLine[] {
  const id = `card_${card.stepId}`;
  const verb = card.verb.padEnd(Math.min(VERB_WIDTH, Math.max(card.verb.length, 5)));
  const vColor = verbColor(card.verb, card.failed);
  const status = statusSegs(card);
  const statusW = segsWidth(status);

  if (!open) {
    const marker = card.failed ? "✕ " : card.running ? "◌ " : "▸ ";
    const targetRoom = width - 2 - cellWidth(verb) - 1 - (statusW ? statusW + 2 : 0);
    const target = fitTarget(card, targetRoom);
    const gap = Math.max(1, width - 2 - cellWidth(verb) - 1 - cellWidth(target) - statusW);
    return [
      row(
        `${id}_folded`,
        [
          { text: marker, color: card.failed ? theme.error : theme.border },
          { text: verb, color: vColor },
          { text: " " },
          { text: target, color: theme.muted },
          { text: " ".repeat(gap) },
          ...status,
        ],
        width,
        meta
      ),
    ];
  }

  const border = card.failed ? theme.error : card.running ? theme.accent : theme.border;
  const inner = Math.max(1, width - 4);

  const fixed = 2 + cellWidth(verb) + 1 + (statusW ? 1 + statusW : 0) + 2 + 1;
  const target = fitTarget(card, width - fixed - 1);
  const fill = Math.max(1, width - fixed - cellWidth(target));
  const header = row(
    `${id}_top`,
    [
      { text: "╭ ", color: border },
      { text: verb, color: vColor, bold: true },
      { text: " " },
      { text: target, color: theme.text, bold: true },
      { text: " " + "─".repeat(fill), color: border },
      ...(statusW ? [{ text: " " }, ...status] : []),
      { text: " ╮", color: border },
    ],
    width,
    meta
  );

  let body: BodyRow[] = [];
  let limit: number = BODY_LIMITS.text;
  let keepTail = false;
  switch (card.body.type) {
    case "diff":
      body = diffBody(card, inner);
      limit = BODY_LIMITS.diff;
      break;
    case "code":
      body = codeBody(card, inner);
      limit = BODY_LIMITS.code;
      break;
    case "text":
      body = textBody(card, inner);
      keepTail = card.body.keep === "tail";
      break;
    case "seraph":
      body = seraphBodyRows(card, inner);
      limit = BODY_LIMITS.seraph;
      break;
    case "none":
      body = card.running
        ? card.verb === "seraph"
          ? seraphScan(inner, now)
          : [{ segs: [{ text: "⋯", color: theme.muted }] }]
        : [];
  }

  const hidden = Math.max(0, body.length - limit);
  const shown = hidden === 0 ? body : keepTail ? body.slice(-limit) : body.slice(0, limit);
  const lines: RightLine[] = [header];

  if (hidden > 0 && keepTail) {
    const note = `⋯ ${hidden} earlier line${hidden === 1 ? "" : "s"}`;
    lines.push(bodyRow(`${id}_earlier`, { segs: [{ text: note, color: theme.muted, italic: true }] }, width, border, meta));
  }

  const bodyMeta: RowMeta = card.filePath ? { editFilePath: card.filePath } : meta;
  shown.forEach((b, i) => {
    lines.push(bodyRow(`${id}_b${i}`, b, width, border, bodyMeta));
  });

  const more = hidden > 0 && !keepTail ? `${hidden} more line${hidden === 1 ? "" : "s"}` : "";
  const openHint = card.filePath ? "click for full diff" : "";
  const moreNote = more || openHint ? ` ${[more, openHint].filter(Boolean).join(" · ")} ` : "";
  const footerFill = Math.max(0, width - 2 - 1 - cellWidth(moreNote));
  lines.push(
    row(
      `${id}_bottom`,
      [
        { text: "╰─", color: border },
        { text: moreNote, color: theme.muted, italic: true },
        { text: "─".repeat(footerFill), color: border },
        { text: "╯", color: border },
      ],
      width,
      bodyMeta
    )
  );
  return lines;
}

function bodyRow(id: string, b: BodyRow, width: number, border: string, meta: RowMeta): RightLine {
  const inner = Math.max(1, width - 4);
  const used = Math.min(inner, segsWidth(b.segs));
  return row(
    id,
    [
      { text: "│ ", color: border },
      ...b.segs,
      { text: " ".repeat(Math.max(0, inner - used)), bg: b.bg },
      { text: " │", color: border },
    ],
    width,
    meta
  );
}

interface StripGroup {
  verb: string;
  targets: string[];
  running: boolean;
  items: QuietItem[];
}

function groupQuiet(items: QuietItem[]): StripGroup[] {
  const groups: StripGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.verb === item.verb && item.verb !== "search") {
      last.targets.push(item.target);
      last.items.push(item);
      last.running ||= item.running;
    } else {
      groups.push({ verb: item.verb, targets: [item.target], running: item.running, items: [item] });
    }
  }
  return groups;
}

function stripLines(items: QuietItem[], width: number, open: boolean, meta: RowMeta, idBase: string): RightLine[] {
  if (open) {
    return items.map((item, i) => {
      const verb = item.verb.padEnd(8);
      const result = item.running ? "…" : item.result;
      const targetRoom = width - 2 - verb.length - (result ? cellWidth(result) + 2 : 0);
      const target = truncateCells(item.target, targetRoom);
      const gap = Math.max(1, width - 2 - verb.length - cellWidth(target) - cellWidth(result));
      return row(
        `${idBase}_d${i}`,
        [
          { text: "  " },
          { text: verb, color: theme.muted },
          { text: target, color: theme.secondary },
          { text: " ".repeat(gap) },
          { text: result, color: theme.muted },
        ],
        width,
        meta
      );
    });
  }

  const groups = groupQuiet(items);
  const units = groups.map((g) => {
    const search = g.verb === "search" && g.items[0]?.result ? ` ${g.items[0].result.split(" · ")[0]}` : "";
    return [
      { text: g.verb, color: theme.muted },
      { text: " " },
      { text: g.targets.join(", ") + search, color: theme.secondary },
      ...(g.running ? [{ text: " …", color: theme.accent }] : []),
    ] as Seg[];
  });

  const room = width - 2;
  const packed: Seg[][] = [[]];
  let lineW = 0;
  for (const unit of units) {
    const unitW = segsWidth(unit);
    const sepW = lineW > 0 ? 3 : 0;
    if (lineW > 0 && lineW + sepW + unitW > room) {
      packed.push([]);
      lineW = 0;
    }
    const current = packed[packed.length - 1];
    if (lineW > 0) {
      current.push({ text: " · ", color: theme.border });
      lineW += 3;
    }
    current.push(...unit);
    lineW += unitW;
  }

  let lines = packed;
  if (packed.length > STRIP_MAX_LINES) {
    const remaining = packed.slice(STRIP_MAX_LINES - 1).reduce((n, segs) => n + segs.filter((s) => s.color === theme.muted).length, 0);
    lines = packed.slice(0, STRIP_MAX_LINES - 1);
    lines.push([{ text: `+ ${remaining} more · click to list`, color: theme.muted, italic: true }]);
  }

  return lines.map((segs, i) => row(`${idBase}_${i}`, [{ text: "  " }, ...segs], width, meta));
}

type Block = { type: "strip"; id: string; items: QuietItem[] } | { type: "card"; id: string; card: CardModel };

function toBlocks(steps: ThreadStep[], cwd: string, now: number): Block[] {
  const blocks: Block[] = [];
  for (const step of steps) {
    if (step.type !== "tool") continue;
    const model = describeStep(step, cwd, now);
    if (model.kind === "card") {
      blocks.push({ type: "card", id: step.id, card: model.card });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === "strip") last.items.push(model.item);
    else blocks.push({ type: "strip", id: step.id, items: [model.item] });
  }
  return blocks;
}

function renderBlock(block: Block, open: boolean, width: number, now: number = Date.now()): RightLine[] {
  const meta: RowMeta = { toolId: block.id };
  if (block.type === "strip") return stripLines(block.items, width, open, meta, `strip_${block.id}`);
  return cardLines(block.card, width, open, meta, now);
}

function promptExcerpt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim();
}

function turnStats(steps: ThreadStep[]): { calls: number; failed: number } {
  const tools = steps.filter((s) => s.type === "tool");
  return { calls: tools.length, failed: tools.filter((s) => s.isError).length };
}

function turnSummary(thread: Thread, width: number, open: boolean): RightLine {
  const { calls, failed } = turnStats(thread.steps);
  const tail = ` · ${calls} call${calls === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;
  const head = `${open ? "▾" : "▸"} turn ${thread.index} · `;
  const excerpt = truncateCells(promptExcerpt(thread.prompt), Math.max(4, width - cellWidth(head) - cellWidth(tail)));
  return row(
    `turn_${thread.id}`,
    [
      { text: head, color: theme.muted },
      { text: excerpt, color: theme.secondary },
      { text: tail, color: failed ? theme.error : theme.muted },
    ],
    width,
    { threadId: thread.id }
  );
}

function changesLine(edits: FileEditRecord[], width: number, cwd: string): RightLine | null {
  if (edits.length === 0) return null;
  const byFile = new Map<string, { added: number; removed: number }>();
  for (const e of edits) {
    const cur = byFile.get(e.filePath) ?? { added: 0, removed: 0 };
    cur.added += e.linesAdded;
    cur.removed += e.linesRemoved;
    byFile.set(e.filePath, cur);
  }
  let added = 0;
  let removed = 0;
  for (const v of byFile.values()) {
    added += v.added;
    removed += v.removed;
  }
  const files = byFile.size;
  const label = files === 1 ? relativePath(edits[edits.length - 1].filePath, cwd) : `${files} files changed`;
  const cta = "review ›";
  const stats: Seg[] = [
    { text: `+${added}`, color: theme.diffAdd, bold: true },
    { text: " " },
    { text: `−${removed}`, color: theme.diffRemove, bold: true },
  ];
  const labelRoom = width - 4 - segsWidth(stats) - 2 - cta.length - 1;
  const shownLabel = files === 1 ? truncateCellsStart(label, labelRoom) : truncateCells(label, labelRoom);
  const gap = Math.max(1, width - 4 - cellWidth(shownLabel) - 2 - segsWidth(stats) - cta.length);
  return row(
    "changes_summary",
    [
      { text: "  ◇ ", color: theme.accent },
      { text: shownLabel, color: theme.text, bold: true },
      { text: "  " },
      ...stats,
      { text: " ".repeat(gap) },
      { text: cta, color: theme.accent },
    ],
    width,
    { editFilePath: edits[edits.length - 1].filePath }
  );
}

function focusedCardId(steps: ThreadStep[], blocks: Block[]): string | undefined {
  const running = steps.filter((s) => s.type === "tool" && s.isRunning);
  if (running.length > 0) {
    const cardIds = new Set(blocks.filter((b) => b.type === "card").map((b) => b.id));
    return running.map((s) => s.id).reverse().find((id) => cardIds.has(id));
  }
  return [...blocks].reverse().find((b) => b.type === "card")?.id;
}

export function buildActivityLines({
  threads,
  edits,
  width,
  toggledIds = new Set(),
  openedTurnIds = new Set(),
  cwd = process.cwd(),
  now = Date.now(),
}: ActivityOptions): RightLine[] {
  const lines: RightLine[] = [];
  const withTools = threads.filter((t) => t.steps.some((s) => s.type === "tool"));
  const flip = (id: string, byDefault: boolean) => (toggledIds.has(id) ? !byDefault : byDefault);

  if (withTools.length === 0) {
    lines.push(blank("empty_0", width));
    lines.push(row("empty_1", [{ text: "  no tool calls yet", color: theme.muted }], width));
    lines.push(
      row("empty_2", [{ text: "  reads, edits and commands show up here", color: theme.border, italic: true }], width)
    );
    return lines;
  }

  const latest = threads[threads.length - 1];
  const earlier = withTools.filter((t) => t !== latest);

  for (const thread of earlier) {
    const open = openedTurnIds.has(thread.id);
    lines.push(turnSummary(thread, width, open));
    if (open) {
      for (const block of toBlocks(thread.steps, cwd, now)) {
        lines.push(...renderBlock(block, flip(block.id, false), width, now));
      }
    }
  }

  const footer = changesLine(edits, width, cwd);
  const latestBlocks = latest.steps.some((s) => s.type === "tool") ? toBlocks(latest.steps, cwd, now) : [];

  if (latestBlocks.length > 0) {
    if (earlier.length > 0) {
      lines.push(blank("latest_gap", width));
      lines.push(turnSummary(latest, width, true));
    }

    const openCard = focusedCardId(latest.steps, latestBlocks);

    for (const block of latestBlocks) {
      const byDefault = block.type === "card" && block.id === openCard;
      lines.push(...renderBlock(block, flip(block.id, byDefault), width, now));
    }
  }

  if (footer) {
    lines.push(blank("changes_gap", width));
    lines.push(footer);
  }
  return lines;
}
