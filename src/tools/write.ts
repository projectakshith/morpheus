import fs from "node:fs/promises";
import path from "node:path";
import { resolvePath, resolvePathWithFallbacks, exists } from "../utils/filesystem";
import type { ToolResult } from "../core/types";

export interface WriteFileParams {
  filePath: string;
  content: string;
}

export async function writeFile(
  params: WriteFileParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  let fullPath = resolvePath(params.filePath, cwd);
  if (!(await exists(fullPath))) {
    const fallback = await resolvePathWithFallbacks(params.filePath, cwd);
    if (await exists(fallback)) {
      fullPath = fallback;
    }
  }
  const dir = path.dirname(fullPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, params.content, "utf-8");

  const lineCount = params.content.split("\n").length;
  const bytes = Buffer.byteLength(params.content, "utf-8");

  return {
    output: `Successfully wrote ${bytes} bytes (${lineCount} lines) to ${params.filePath}`,
  };
}
