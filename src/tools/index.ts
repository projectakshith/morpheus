import path from "node:path";
import fs from "node:fs/promises";
import type { ToolDefinition, Skill, Finding } from "../core/types";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";
import { createEditTool } from "./edit";
import { createBashTool } from "./bash";
import { createListTool } from "./list";
import { createGrepTool } from "./grep";
import { createOutlineTool } from "./outline";
import { createHttpTool, createSecurityHttpTool } from "./http";
import { createFindingTool } from "./finding";
import { createSkillTool } from "./skill";
import { createSecurityReconTool } from "./security";
import { createSecurityStateTool } from "../core/securityState";
import type { SecurityState } from "../core/securityState";
import { getSecuritySession } from "../core/securitySession";
import {
  createUplinkSearchTool,
  createUplinkBrowseTool,
  createUplinkTools,
} from "./uplink";

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createListTool,
  createGrepTool,
  createOutlineTool,
  createHttpTool,
  createSecurityHttpTool,
  createFindingTool,
  createSkillTool,
  createSecurityReconTool,
  createSecurityStateTool,
  createUplinkSearchTool,
  createUplinkBrowseTool,
  createUplinkTools,
};

export function createTools(
  cwd: string = process.cwd(),
  onRecordFinding?: (finding: Finding) => void,
  skills?: Skill[],
  onActivateSkill?: (skill: Skill) => void,
  options: {
    delegateTool?: ToolDefinition;
    access?: "readOnly" | "scopedWrite";
    allowedWritePaths?: string[];
    readOutputBudgetBytes?: () => number;
    onSecurityState?: (state: SecurityState) => void;
  } = {}
): Record<string, ToolDefinition> {
  const uplink = createUplinkTools();
  const tools: Record<string, ToolDefinition> = {
    read_file: createReadTool(cwd, options.readOutputBudgetBytes),
    write_file: createWriteTool(cwd, options.access !== "scopedWrite"),
    edit_file: createEditTool(cwd, options.access !== "scopedWrite"),
    bash: createBashTool(cwd),
    list_dir: createListTool(cwd),
    grep_code: createGrepTool(cwd),
    outline_code: createOutlineTool(cwd),
    record_finding: createFindingTool(onRecordFinding),
    http_request: createHttpTool(),
    uplink_search: uplink.uplink_search,
    uplink_browse: uplink.uplink_browse,
  };

  if (skills && skills.length > 0) {
    tools.load_skill = createSkillTool(skills, onActivateSkill);
  }

  if (getSecuritySession().active) {
    delete tools.bash;
    delete tools.http_request;
    delete tools.uplink_browse;
    tools.http_probe = createSecurityHttpTool();
    tools.security_recon = createSecurityReconTool();
    tools.security_state = createSecurityStateTool(options.onSecurityState);
  }

  if (options.access === "readOnly") {
    delete tools.write_file;
    delete tools.edit_file;
    delete tools.bash;
    delete tools.http_request;
  } else if (options.access === "scopedWrite") {
    delete tools.bash;
    delete tools.http_request;
    delete tools.uplink_browse;
    const allowed = new Set((options.allowedWritePaths ?? []).map((file) => path.resolve(cwd, file)));
    for (const name of ["write_file", "edit_file"]) {
      const tool = tools[name];
      if (!tool) continue;
      const execute = tool.execute;
      tools[name] = {
        ...tool,
        description: `${tool.description} Only these files may be changed: ${[...allowed].map((file) => path.relative(cwd, file)).join(", ")}.`,
        execute: async (args, toolCwd, signal) => {
          const target = typeof args.filePath === "string" ? path.resolve(cwd, args.filePath) : "";
          if (!allowed.has(target)) return `Error: worker may not modify '${String(args.filePath ?? "")}'.`;
          let current = path.resolve(cwd);
          for (const component of path.relative(current, target).split(path.sep)) {
            current = path.join(current, component);
            try {
              if ((await fs.lstat(current)).isSymbolicLink()) {
                return `Error: worker may not modify a path that traverses a symbolic link: '${String(args.filePath)}'.`;
              }
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
              return `Error: cannot verify worker write path '${String(args.filePath)}'.`;
            }
          }
          return execute(args, toolCwd, signal);
        },
      };
    }
  }

  if (options.delegateTool) tools.delegate_tasks = options.delegateTool;

  return tools;
}
