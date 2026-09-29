import picocolors from "picocolors";
const pc = picocolors.createColors(true);
import { highlightCode } from "./highlight.js";

/**
 * Terminal markdown formatter with streaming table buffering and ANSI styling.
 */
export class MarkdownFormatter {
  private inCodeBlock = false;
  private codeBlockLang = "";
  private tableBuffer: string[] = [];
  private activeListIndent: string | null = null;

  reset() {
    this.inCodeBlock = false;
    this.codeBlockLang = "";
    this.tableBuffer = [];
    this.activeListIndent = null;
  }

  /**
   * Processes an incoming line of text.
   * Returns an array of formatted lines ready to print (may be empty if buffering a table).
   */
  processLine(raw: string): string[] {
    const trimmed = raw.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      this.tableBuffer.push(trimmed);
      return [];
    }

    const output: string[] = [];

    if (this.tableBuffer.length > 0) {
      output.push(...this.renderTable(this.tableBuffer));
      this.tableBuffer = [];
    }

    const formatted = this.formatSingleLine(raw);
    if (formatted !== null) {
      output.push(formatted);
    }

    return output;
  }

  /**
   * Flushes any remaining buffered content (e.g. pending table at end of response).
   */
  flush(): string[] {
    if (this.tableBuffer.length > 0) {
      const output = this.renderTable(this.tableBuffer);
      this.tableBuffer = [];
      return output;
    }
    return [];
  }

  /**
   * Renders a buffered markdown table as an aligned Unicode box table.
   */
  renderTable(tableLines: string[]): string[] {
    const rows: string[][] = [];
    let separatorIndex = -1;

    for (const line of tableLines) {
      const trimmed = line.trim();
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        separatorIndex = rows.length - 1;
        continue;
      }
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return [];

    const numCols = Math.max(...rows.map((r) => r.length));
    const colWidths = new Array(numCols).fill(0);

    for (const r of rows) {
      for (let i = 0; i < numCols; i++) {
        const cell = r[i] || "";
        colWidths[i] = Math.max(colWidths[i], this.visibleLength(cell), 3);
      }
    }

    const output: string[] = [];

    output.push(pc.dim("  ┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐"));

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isHeader = separatorIndex >= 0 ? r <= separatorIndex : r === 0;

      const cells: string[] = [];
      for (let i = 0; i < numCols; i++) {
        const cell = row[i] || "";
        const formatted = isHeader
          ? pc.bold(this.formatInline(cell))
          : this.formatInline(cell);
        cells.push(this.padCell(formatted, colWidths[i]));
      }

      output.push(pc.dim("  │ ") + cells.join(pc.dim(" │ ")) + pc.dim(" │"));

      if (r === separatorIndex && r < rows.length - 1) {
        output.push(pc.dim("  ├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤"));
      }
    }

    output.push(pc.dim("  └" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘"));

    return output;
  }

  /**
   * Formats a single non-table line.
   */
  formatSingleLine(raw: string): string | null {
    const trimmed = raw.trim();

    if (trimmed.startsWith("```")) {
      this.activeListIndent = null;
      if (this.inCodeBlock) {
        this.inCodeBlock = false;
        this.codeBlockLang = "";
        return pc.dim("  └──────────────────────────────────────");
      } else {
        this.inCodeBlock = true;
        this.codeBlockLang = trimmed.slice(3).trim();
        const header = this.codeBlockLang ? `── ${this.codeBlockLang} ` : "───";
        const fill = "─".repeat(Math.max(5, 38 - header.length));
        return pc.dim(`  ┌${header}${fill}`);
      }
    }

    if (this.inCodeBlock) {
      const highlighted = highlightCode(raw, this.codeBlockLang);
      return `  ${pc.dim("│")} ${highlighted}`;
    }

    if (!trimmed) {
      this.activeListIndent = null;
      return "";
    }

    if (/^(?:---|===|\*\*\*|___)\s*$/.test(trimmed)) {
      this.activeListIndent = null;
      return pc.dim("  ────────────────────────────────────────");
    }

    const h1 = raw.match(/^#\s+(.+)$/);
    if (h1) {
      this.activeListIndent = null;
      return pc.bold(pc.white(`▰ ${this.formatInline(h1[1])}`));
    }

    const h2 = raw.match(/^##\s+(.+)$/);
    if (h2) {
      this.activeListIndent = null;
      return pc.bold(pc.green(`◈ ${this.formatInline(h2[1])}`));
    }

    const h3 = raw.match(/^###+\s+(.+)$/);
    if (h3) {
      this.activeListIndent = null;
      return pc.bold(pc.cyan(`◆ ${this.formatInline(h3[1])}`));
    }

    const bq = raw.match(/^>\s*(.+)$/);
    if (bq) {
      this.activeListIndent = null;
      return `  ${pc.dim("│")} ${pc.italic(this.formatInline(bq[1]))}`;
    }

    // Priority and callout badges (P0, P1, P2, CRITICAL, WARN, NOTE, FIX)
    const badge = raw.match(/^(\s*)(?:[-*+]\s+)?(?:\*\*|\[)?(P[0-3]|CRITICAL|SECURITY|WARN|WARNING|NOTE|FIX)(?:\*\*|\])?\s*[-:]\s*(.+)$/i);
    if (badge) {
      const indent = badge[1];
      const tag = badge[2].toUpperCase();
      const content = badge[3];
      let badgeStyled = "";
      if (tag === "P0" || tag === "CRITICAL" || tag === "SECURITY") {
        badgeStyled = pc.bold(pc.red(`[ ${tag} ]`));
      } else if (tag === "P1" || tag === "WARN" || tag === "WARNING") {
        badgeStyled = pc.bold(pc.yellow(`[ ${tag} ]`));
      } else if (tag === "P2" || tag === "NOTE" || tag === "FIX") {
        badgeStyled = pc.bold(pc.cyan(`[ ${tag} ]`));
      } else {
        badgeStyled = pc.bold(pc.magenta(`[ ${tag} ]`));
      }
      this.activeListIndent = (indent || "") + "    ";
      return `${indent}  ${badgeStyled} ${this.formatInline(content)}`;
    }

    const boldNum = raw.match(/^(\s*)\*\*(\d+)\.\s*(.+?)\*\*(.*)$/);
    if (boldNum) {
      const indent = boldNum[1];
      const num = boldNum[2];
      const title = boldNum[3];
      const rest = boldNum[4];
      this.activeListIndent = (indent || "") + " ".repeat(num.length + 4);
      return `${indent}  ${pc.bold(pc.white(num + "."))} ${pc.bold(this.formatInline(title))}${this.formatInline(rest)}`;
    }

    const num = raw.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (num) {
      this.activeListIndent = (num[1] || "") + " ".repeat(num[2].length + 4);
      return `${num[1]}  ${pc.bold(pc.green(num[2] + "."))} ${this.formatInline(num[3])}`;
    }

    const bullet = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      this.activeListIndent = (bullet[1] || "") + "    ";
      return `${bullet[1]}  • ${this.formatInline(bullet[2])}`;
    }

    if (this.activeListIndent && !raw.startsWith(" ")) {
      return `${this.activeListIndent}${this.formatInline(trimmed)}`;
    }

    return this.formatInline(raw);
  }

  /**
   * Formats inline markdown elements (code, bold, italic, links).
   */
  formatInline(text: string): string {
    if (!text) return "";

    let result = text;

    result = result.replace(/`([^`\n]+)`/g, (_, code) => pc.cyan(code));

    result = result.replace(/\*\*([^*\n]+)\*\*/g, (_, b) => pc.bold(b));
    result = result.replace(/__([^\n_]+)__/g, (_, b) => pc.bold(b));

    result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, i) => pc.italic(i));
    result = result.replace(/(?<!_)_([^\n_]+)_(?!_)/g, (_, i) => pc.italic(i));

    result = result.replace(/~~([^~\n]+)~~/g, (_, s) => pc.strikethrough(s));

    result = result.replace(
      /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
      (_, t, url) => `${pc.underline(pc.cyan(t))} ${pc.dim(`(${url})`)}`
    );

    return result;
  }

  /**
   * Returns visible character length by stripping ANSI escapes and markdown markup.
   */
  visibleLength(str: string): number {
    return str
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .length;
  }

  /**
   * Pads formatted text with trailing spaces to match target visible width.
   */
  padCell(formatted: string, targetWidth: number): string {
    const vLen = this.visibleLength(formatted);
    const pad = Math.max(0, targetWidth - vLen);
    return formatted + " ".repeat(pad);
  }
}
