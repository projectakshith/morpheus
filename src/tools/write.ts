import fs from "node:fs/promises";
import path from "node:path";
import { resolvePath } from "../utils/filesystem.js";
import type { ToolResult } from "../core/types.js";

export interface WriteFileParams {
  filePath: string;
  content: string;
}

export async function writeFile(
  params: WriteFileParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  const fullPath = resolvePath(params.filePath, cwd);
  const dir = path.dirname(fullPath);

  // Auto-create missing parent directories
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, params.content, "utf-8");

  const lineCount = params.content.split("\n").length;
  const bytes = Buffer.byteLength(params.content, "utf-8");

  return {
    output: `Successfully wrote ${bytes} bytes (${lineCount} lines) to ${params.filePath}`,
  };
}
