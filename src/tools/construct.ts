import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const CONSTRUCT_DIR = path.join(os.homedir(), ".morpheus", "construct");
export const MAX_LINES = 2000;
export const MAX_BYTES = 50 * 1024;

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

  const previewLines: string[] = [];
  let currentBytes = 0;

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const lineBytes = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0);
    if (currentBytes + lineBytes > maxBytes) {
      break;
    }
    previewLines.push(lines[i]);
    currentBytes += lineBytes;
  }

  await fs.mkdir(CONSTRUCT_DIR, { recursive: true });
  const filename = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.log`;
  const fullPath = path.join(CONSTRUCT_DIR, filename);
  await fs.writeFile(fullPath, text, "utf-8");

  const removedLines = lines.length - previewLines.length;
  const preview = previewLines.join("\n");
  const hint = `The output was truncated (${removedLines} lines cut). Full output saved to: ${fullPath}\nUse grep or read_file with offset/limit to inspect sections.`;

  return {
    content: `${preview}\n\n... [TRUNCATED] ...\n\n${hint}`,
    truncated: true,
    outputPath: fullPath,
  };
}
