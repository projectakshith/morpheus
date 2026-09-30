import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const CONSTRUCT_DIR = path.join(os.homedir(), ".morpheus", "construct");
export const MAX_LINES = 2000;
export const MAX_BYTES = 32 * 1024;

export interface TruncationResult {
  content: string;
  truncated: boolean;
  outputPath?: string;
}

/**
 * Ensures tool output does not exceed token bounds.
 * If exceeded, writes the full output to The Construct (~/.morpheus/construct/)
 * and returns a preview with a pointer to the full file.
 */
export async function truncateOutput(
  text: string,
  options: { maxLines?: number; maxBytes?: number } = {}
): Promise<TruncationResult> {
  const maxLines = options.maxLines ?? MAX_LINES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  const lines = text.split("\n");
  const totalBytes = Buffer.byteLength(text, "utf-8");

  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return { content: text, truncated: false };
  }

  const headBudget = Math.floor(maxBytes * 0.4);
  const tailBudget = maxBytes - headBudget;
  const headLines: string[] = [];
  const tailLines: string[] = [];
  let headBytes = 0;
  let tailBytes = 0;
  let headEnd = -1;
  let tailStart = lines.length;

  for (let i = 0; i < lines.length && headLines.length < Math.ceil(maxLines * 0.4); i++) {
    const lineBytes = Buffer.byteLength(lines[i], "utf-8") + 1;
    if (headBytes + lineBytes > headBudget) break;
    headLines.push(lines[i]);
    headBytes += lineBytes;
    headEnd = i;
  }

  for (
    let i = lines.length - 1;
    i > headEnd && headLines.length + tailLines.length < maxLines;
    i--
  ) {
    const lineBytes = Buffer.byteLength(lines[i], "utf-8") + 1;
    if (tailBytes + lineBytes > tailBudget) break;
    tailLines.unshift(lines[i]);
    tailBytes += lineBytes;
    tailStart = i;
  }

  const omittedLines = Math.max(0, tailStart - headEnd - 1);
  const omittedBytes = Math.max(0, totalBytes - headBytes - tailBytes);
  const marker = `... [${omittedLines} lines, ${omittedBytes} bytes omitted] ...`;
  const previewLines = [...headLines, marker, ...tailLines];

  await fs.mkdir(CONSTRUCT_DIR, { recursive: true });
  const filename = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.log`;
  const fullPath = path.join(CONSTRUCT_DIR, filename);
  await fs.writeFile(fullPath, text, "utf-8");

  const preview = previewLines.join("\n");
  const hint = `Captured output saved to: ${fullPath}\nUse grep or read_file with offset/limit to inspect sections.`;

  return {
    content: `${preview}\n\n... [TRUNCATED] ...\n\n${hint}`,
    truncated: true,
    outputPath: fullPath,
  };
}
