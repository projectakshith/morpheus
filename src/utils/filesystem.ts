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
 * Resolves relative or absolute path against a base directory (defaults to cwd),
 * with fallbacks for parent directories and sibling workspaces.
 */
export async function resolvePathWithFallbacks(
  targetPath: string,
  baseDir: string = process.cwd()
): Promise<string> {
  const direct = resolvePath(targetPath, baseDir);
  if (await exists(direct)) {
    return direct;
  }

  const parent = path.dirname(baseDir);
  const parentFallback = path.resolve(parent, targetPath);
  if (await exists(parentFallback)) {
    return parentFallback;
  }

  /* Check sibling workspaces (e.g. ../ratio-d/<targetPath>) */
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== path.basename(baseDir)) {
        const candidate = path.resolve(parent, e.name, targetPath);
        if (await exists(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
  }

  return direct;
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
