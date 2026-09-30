import fs from "node:fs/promises";
import path from "node:path";
import { resolvePath, resolvePathWithFallbacks, exists } from "../utils/filesystem";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface WriteFileParams {
  filePath: string;
  content: string;
}

export async function writeFile(
  params: WriteFileParams,
  cwd: string = process.cwd(),
  allowFallback = true
): Promise<ToolResult> {
  let fullPath = resolvePath(params.filePath, cwd);
  if (allowFallback && !(await exists(fullPath))) {
    const fallback = await resolvePathWithFallbacks(params.filePath, cwd);
    if (await exists(fallback)) {
      fullPath = fallback;
    }
  }
  const dir = path.dirname(fullPath);
  const previousContent = (await exists(fullPath)) ? await fs.readFile(fullPath, "utf-8") : undefined;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, params.content, "utf-8");

  const lineCount = params.content.split("\n").length;
  const bytes = Buffer.byteLength(params.content, "utf-8");

  return {
    output: `Successfully wrote ${bytes} bytes (${lineCount} lines) to ${params.filePath}`,
    metadata: { changed: previousContent !== params.content },
  };
}

export function createWriteTool(cwd: string = process.cwd(), allowFallback = true): ToolDefinition {
  return {
    name: "write_file",
    description:
      "Create a new file or completely overwrite an existing file. Automatically creates any missing parent directories.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to create or overwrite",
        },
        content: {
          type: "string",
          description: "Full content to write into the file",
        },
      },
      required: ["filePath", "content"],
    },
    execute: async (params: Record<string, any>) => {
      try {
        return await writeFile(params as unknown as WriteFileParams, cwd, allowFallback);
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}
