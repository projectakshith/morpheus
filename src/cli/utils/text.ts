/* Text formatting and word wrapping utilities for CLI output */

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Strips all ANSI escape codes from string.
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

/**
 * Calculates visible character length of string in terminal cells.
 */
export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Extracts active ANSI style codes from text.
 * When a line wraps, these active styles should be carried over to the next line.
 */
function extractActiveAnsi(text: string): string {
  const matches = text.match(ANSI_REGEX);
  if (!matches) return "";

  let activeCodes: string[] = [];
  for (const code of matches) {
    if (code === "\x1b[0m") {
      activeCodes = [];
    } else if (code === "\x1b[39m") {
      activeCodes = activeCodes.filter((c) => !c.match(/^\x1b\[(3[0-7]|9[0-7]|38)/));
    } else if (code === "\x1b[49m") {
      activeCodes = activeCodes.filter((c) => !c.match(/^\x1b\[(4[0-7]|10[0-7]|48)/));
    } else if (code === "\x1b[22m") {
      activeCodes = activeCodes.filter((c) => c !== "\x1b[1m" && c !== "\x1b[2m");
    } else if (code === "\x1b[23m") {
      activeCodes = activeCodes.filter((c) => c !== "\x1b[3m");
    } else if (code === "\x1b[24m") {
      activeCodes = activeCodes.filter((c) => c !== "\x1b[4m");
    } else {
      activeCodes.push(code);
    }
  }
  return activeCodes.join("");
}

/**
 * Determines appropriate hanging indent for wrapped lines.
 */
function getHangingIndent(firstLine: string): string {
  const clean = stripAnsi(firstLine);
  const bulletTagMatch = clean.match(/^(\s*[•◇\-*+]\s+(?:\[[^\]]+\]\s+)?)/);
  if (bulletTagMatch) {
    return " ".repeat(bulletTagMatch[1].length);
  }
  const numTagMatch = clean.match(/^(\s*\d+\.\s+(?:\[[^\]]+\]\s+)?)/);
  if (numTagMatch) {
    return " ".repeat(numTagMatch[1].length);
  }
  if (/^\s*│\s*/.test(clean)) {
    return "  │ ";
  }
  if (/^\s*\[[^\]]+\]\s+/.test(clean)) {
    const match = clean.match(/^(\s*\[[^\]]+\]\s+)/);
    return " ".repeat(match ? match[1].length : 4);
  }
  const leadingSpace = clean.match(/^(\s+)/);
  if (leadingSpace) {
    return leadingSpace[1];
  }
  return "";
}

/**
 * ANSI-aware word wrapping with automatic hanging indentation for structured CLI text.
 */
export function wrapLine(text: string, maxWidth: number, customIndent?: string): string[] {
  if (visibleLength(text) <= maxWidth) return [text];

  const hangingIndent = customIndent !== undefined ? customIndent : getHangingIndent(text);
  const hangingIndentVisLen = visibleLength(hangingIndent);

  const leadingMatch = text.match(/^(\s+)/);
  const leading = leadingMatch ? leadingMatch[1] : "";
  const trimmedText = text.slice(leading.length);

  const words = trimmedText.split(" ");
  const lines: string[] = [];
  let current = leading;
  let currentVisLen = visibleLength(leading);
  let isFirstWordOnLine = true;

  for (const word of words) {
    const wordVisLen = visibleLength(word);

    if (isFirstWordOnLine) {
      current += word;
      currentVisLen += wordVisLen;
      isFirstWordOnLine = false;
    } else if (currentVisLen + 1 + wordVisLen <= maxWidth) {
      current += " " + word;
      currentVisLen += 1 + wordVisLen;
    } else {
      const activeAnsi = extractActiveAnsi(current);
      if (activeAnsi) {
        lines.push(current + "\x1b[0m");
        current = hangingIndent + activeAnsi + word;
      } else {
        lines.push(current);
        current = hangingIndent + word;
      }
      currentVisLen = hangingIndentVisLen + wordVisLen;
      isFirstWordOnLine = false;
    }
  }

  if (current && current !== leading) {
    lines.push(current);
  }

  return lines;
}
