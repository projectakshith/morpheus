import type { ToolDefinition } from "../core/types";
import { readFile, type ReadFileParams } from "./read";
import { writeFile, type WriteFileParams } from "./write";
import { editFile, type EditFileParams } from "./edit";
import { executeBash, type BashParams } from "./bash";
import { listDir, type ListDirParams } from "./list";
import { grepCode, type GrepParams } from "./grep";
import { outlineCode, type OutlineParams } from "./outline";
import { formatError } from "../utils/errors";

export function createTools(
  cwd: string = process.cwd(),
  onRecordFinding?: (finding: { topic: string; takeaway: string }) => void
): Record<string, ToolDefinition> {
  return {
    read_file: {
      name: "read_file",
      description: "Read contents of a file or directory from the filesystem with 1-indexed line numbers.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative or absolute path to the file/directory" },
          offset: { type: "number", description: "Line number to start reading from (defaults to 1)" },
          limit: { type: "number", description: "Maximum number of lines to return (defaults to 2000)" },
        },
        required: ["filePath"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await readFile(params as unknown as ReadFileParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    write_file: {
      name: "write_file",
      description: "Create a new file or completely overwrite an existing file. Automatically creates any missing parent directories.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the file to create or overwrite" },
          content: { type: "string", description: "Full content to write into the file" },
        },
        required: ["filePath", "content"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await writeFile(params as unknown as WriteFileParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    edit_file: {
      name: "edit_file",
      description: "Perform exact string replacement in an existing file. Must have read the file before editing.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the file to edit" },
          oldString: { type: "string", description: "The exact text to replace" },
          newString: { type: "string", description: "The new text to replace it with" },
          replaceAll: { type: "boolean", description: "Replace all occurrences (defaults to false)" },
        },
        required: ["filePath", "oldString", "newString"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await editFile(params as unknown as EditFileParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    bash: {
      name: "bash",
      description: "Execute a terminal command in the host environment. Use this for git, builds, package managers, and tests.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command line string to run" },
          timeoutMs: { type: "number", description: "Timeout in milliseconds (defaults to 60000)" },
        },
        required: ["command"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await executeBash(params as unknown as BashParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    list_dir: {
      name: "list_dir",
      description: "List files and directories in a tree hierarchy up to a specified depth. Automatically ignores .git, node_modules, build directories, and dotfiles. Much faster and cleaner than running bash ls/find.",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "Path to directory to list (defaults to current directory)" },
          depth: { type: "number", description: "Maximum directory depth to traverse (1 to 4, defaults to 2)" },
        },
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await listDir(params as unknown as ListDirParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    grep_code: {
      name: "grep_code",
      description: "Fast code search across files in a directory or file. Automatically skips node_modules, build dirs, lockfiles, and git directories. Returns line numbers and snippets with matching lines. Far more token-efficient than bash grep.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search query or regular expression to match" },
          searchPath: { type: "string", description: "Path to file or directory to search (defaults to current directory)" },
          caseSensitive: { type: "boolean", description: "Whether search is case-sensitive (defaults to false)" },
          maxMatches: { type: "number", description: "Maximum total matches to return (defaults to 20)" },
          includeDocs: { type: "boolean", description: "Whether to include markdown documentation files (.md, .txt) in search results (defaults to false)" },
        },
        required: ["pattern"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await grepCode(params as unknown as GrepParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    outline_code: {
      name: "outline_code",
      description: "Extract high-level structure (classes, functions, types, and route definitions) with exact line numbers from a file. Far more token-efficient than reading full files.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the code file to outline" },
        },
        required: ["filePath"],
      },
      execute: async (params: Record<string, any>) => {
        try {
          const result = await outlineCode(params as unknown as OutlineParams, cwd);
          return result;
        } catch (err: unknown) {
          return `Error: ${formatError(err)}`;
        }
      },
    },

    record_finding: {
      name: "record_finding",
      description: "Save an essential fact, auth flow, or architectural insight into persistent session memory. Once recorded, raw tool outputs can be safely compacted without losing your knowledge.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Short subject label (e.g. 'web-login', 'session-cookie', 'go-cli-hmac')" },
          takeaway: { type: "string", description: "Direct 1-2 sentence core fact with file paths and symbol names" },
        },
        required: ["topic", "takeaway"],
      },
      execute: async (params: Record<string, any>) => {
        const topic = String(params.topic || "").trim();
        const takeaway = String(params.takeaway || "").trim();
        if (!topic || !takeaway) {
          return "Error: Both 'topic' and 'takeaway' are required.";
        }
        onRecordFinding?.({ topic, takeaway });
        return `Recorded finding [${topic}]: ${takeaway}`;
      },
    },
  };
}
