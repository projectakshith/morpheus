import { tool } from "ai";
import { z } from "zod";
import { readFile } from "./read";
import { writeFile } from "./write";
import { editFile } from "./edit";
import { executeBash } from "./bash";
import { formatError } from "../utils/errors";

export function createTools(cwd: string = process.cwd()) {
  return {
    read_file: tool({
      description:
        "Read contents of a file or directory from the filesystem. Results include 1-indexed line numbers. For large files, use offset and limit to paginate.",
      parameters: z.object({
        filePath: z.string().describe("Relative or absolute path to the file/directory"),
        offset: z.number().int().describe("Line number to start reading from (1 for beginning)"),
        limit: z.number().int().describe("Maximum number of lines to return (defaults to 2000)"),
      }),
      execute: async (params) => {
        try {
          const result = await readFile(params, cwd);
          return result.output;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    }),

    write_file: tool({
      description:
        "Create a new file or completely overwrite an existing file. Automatically creates any missing parent directories.",
      parameters: z.object({
        filePath: z.string().describe("Path to the file to create or overwrite"),
        content: z.string().describe("Full content to write into the file"),
      }),
      execute: async (params) => {
        try {
          const result = await writeFile(params, cwd);
          return result.output;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    }),

    edit_file: tool({
      description:
        "Perform exact string replacement in an existing file. Must have read the file before editing. Fails if oldString is not unique unless replaceAll is true.",
      parameters: z.object({
        filePath: z.string().describe("Path to the file to edit"),
        oldString: z.string().describe("The exact text to replace"),
        newString: z.string().describe("The new text to replace it with"),
        replaceAll: z.boolean().describe("Replace all occurrences (pass false for unique match)"),
      }),
      execute: async (params) => {
        try {
          const result = await editFile(params, cwd);
          return result.output;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    }),

    bash: tool({
      description:
        "Execute a terminal command in the host environment. Use this for git, package management, test runners, and builds. Avoid running interactive commands.",
      parameters: z.object({
        command: z.string().describe("The bash command line string to run"),
        timeoutMs: z.number().int().describe("Timeout in milliseconds (defaults to 60000)"),
      }),
      execute: async (params) => {
        try {
          const result = await executeBash(params, cwd);
          return result.output;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    }),
  };
}
