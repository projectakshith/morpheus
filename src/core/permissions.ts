import fs from "node:fs/promises";
import path from "node:path";

export interface PermissionRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

export type PermissionDecision = "allow" | "deny";

const DESTRUCTIVE_SHELL = [
  /\brm\b/i,
  /\bgit\s+(?:reset|clean|checkout\s+--|restore\s+--worktree|push|branch\s+-D)\b/i,
  /\b(?:sudo|doas|launchctl|systemctl|shutdown|reboot|killall|pkill)\b/i,
  /\b(?:mkfs|diskutil|dd)\b/i,
  /\bchmod\b.*\b(?:777|666)\b/i,
  /\b(?:curl|wget)\b[^|\n]*\|\s*(?:bash|sh)\b/i,
  /\bfind\b[^\n]*-delete\b/i,
  /\b(?:npm|pnpm|yarn)\s+publish\b/i,
  /\b(?:docker|podman)\s+push\b/i,
  /\bkubectl\s+(?:delete|apply|replace)\b/i,
  /\bterraform\s+(?:apply|destroy)\b/i,
  /\bgh\s+release\s+(?:create|delete|upload)\b/i,
  /\b(?:DROP|TRUNCATE)\s+(?:DATABASE|TABLE|SCHEMA)\b/i,
];

const FILE_WRITE_TOOLS = new Set(["write_file", "edit_file"]);
const FILE_READ_TOOLS = new Set(["read_file", "list_dir", "grep_code", "outline_code"]);
const MCP_MUTATING_ACTION = /(?:^|_)(?:create|write|edit|update|delete|remove|send|post|submit|publish|deploy|merge|close|archive|invite|transfer|purchase|pay|charge|cancel|revoke|execute|run|mark|star|react|label|set|enable|disable|start|stop|move|copy|rename|pin|unpin|assign|save)(?:_|$)/i;

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Classifies effects that exceed routine project work and should wait for the user. */
export async function permissionReason(
  tool: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<string | null> {
  if (tool === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    if (DESTRUCTIVE_SHELL.some((pattern) => pattern.test(command))) {
      return "This command can delete data, alter system state, or make high-impact changes outside the project; approval is required.";
    }
  }

  if (tool === "http_request") {
    return String(args.method ?? "GET").toUpperCase() === "GET"
      ? null
      : "This request can change data on an external service.";
  }

  if (tool.startsWith("mcp_") && !tool.startsWith("mcp_cua_") && MCP_MUTATING_ACTION.test(tool)) {
    return "This connected tool can change external data.";
  }

  // Reading and searching are routine agent work, even when the user asks about
  // a sibling repo or a file outside the current working directory. Keep the
  // workspace boundary for writes, where an accidental path matters more.
  if (FILE_WRITE_TOOLS.has(tool) || FILE_READ_TOOLS.has(tool)) {
    const requestedPath = args.filePath ?? args.dirPath ?? args.searchPath ?? args.path;
    const filePath = typeof requestedPath === "string" ? requestedPath : "";
    if (filePath) {
      const target = path.resolve(cwd, filePath);
      if (FILE_WRITE_TOOLS.has(tool) && !isWithin(path.resolve(cwd), target)) {
        return "This edit targets a path outside the active project.";
      }
      let existing = target;
      while (true) {
        try {
          const canonical = await fs.realpath(existing);
          if (FILE_WRITE_TOOLS.has(tool) && !isWithin(await fs.realpath(cwd), canonical)) {
            return "This path resolves through a symbolic link to a location outside the active project.";
          }
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            return "Morpheus could not verify the target path safely.";
          }
          const parent = path.dirname(existing);
          if (parent === existing) return "Morpheus could not verify the target path safely.";
          existing = parent;
        }
      }
    }
  }

  return null;
}
