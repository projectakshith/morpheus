import type { ToolDefinition } from "../core/types";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";
import { createEditTool } from "./edit";
import { createBashTool } from "./bash";
import { createListTool } from "./list";
import { createGrepTool } from "./grep";
import { createOutlineTool } from "./outline";
import { createHttpTool } from "./http";
import { createFindingTool } from "./finding";

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createListTool,
  createGrepTool,
  createOutlineTool,
  createHttpTool,
  createFindingTool,
};

export function createTools(
  cwd: string = process.cwd(),
  onRecordFinding?: (finding: { topic: string; takeaway: string }) => void
): Record<string, ToolDefinition> {
  return {
    read_file: createReadTool(cwd),
    write_file: createWriteTool(cwd),
    edit_file: createEditTool(cwd),
    bash: createBashTool(cwd),
    list_dir: createListTool(cwd),
    grep_code: createGrepTool(cwd),
    outline_code: createOutlineTool(cwd),
    record_finding: createFindingTool(onRecordFinding),
    http_request: createHttpTool(),
  };
}
