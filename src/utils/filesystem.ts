import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolves relative or absolute path against a base directory (defaults to cwd).
 */
export function resolvePath(targetPath: string, baseDir: string = process.cwd()): string {
  if (path.isAbsolute(targetPath)) {
    return path.normalize(targetPath);
  }
  return path.normalize(path.resolve(baseDir, targetPath));
}

/**
 * Checks if a file or directory exists without throwing.
 */
export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects whether the file uses CRLF or LF line endings.
 */
export function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Normalizes all line endings to LF.
 */
export function normalizeLineEndings(content: string): string {
  return content.replaceAll("\r\n", "\n");
}
