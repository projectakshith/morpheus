import { truncateOutput } from "./construct";
import type { ToolDefinition, ToolResult } from "../core/types";
import { formatError } from "../utils/errors";
import {
  executeUplinkSearch,
  formatSearchResults,
  UplinkSession,
  type UplinkBrowseParams,
  type UplinkSearchParams,
} from "../uplink/index";

/**
 * Creates the stateless Uplink web search tool.
 */
export function createUplinkSearchTool(): ToolDefinition {
  return {
    name: "uplink_search",
    description:
      "Search the web for up-to-date documentation, API signatures, release notes, or error fixes. Returns ranked results with URLs and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query keywords",
        },
        count: {
          type: "number",
          description: "Max number of results (defaults to 5, max 10)",
        },
      },
      required: ["query"],
    },
    execute: async (params: Record<string, any>, _cwd?: string, signal?: AbortSignal) => {
      try {
        const { query, count } = params as UplinkSearchParams;
        const res = await executeUplinkSearch(query, count, signal);
        const formatted = formatSearchResults(res);
        const truncated = await truncateOutput(formatted, { toolName: "uplink_search" });

        return {
          output: truncated.content,
          metadata: {
            query: res.query,
            provider: res.provider,
            resultCount: res.results.length,
          },
        };
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}

/**
 * Creates the stateful Uplink interactive agent browser tool.
 */
export function createUplinkBrowseTool(session?: UplinkSession): ToolDefinition {
  const activeSession = session ?? new UplinkSession();

  return {
    name: "uplink_browse",
    description:
      "Interactive agent browser to navigate to web pages, read documentation, click links by [ref], and scroll through long pages without token bloat.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate", "click", "scroll", "find", "back", "forward", "snapshot"],
          description:
            "Action to perform: 'navigate' (open URL), 'click' (click link/element by [ref]), 'scroll' (scroll page), 'find' (search & jump to heading/keyword on page), 'back'/'forward' (history), 'snapshot' (view current page)",
        },
        url: {
          type: "string",
          description: "Target URL (required for action='navigate')",
        },
        ref: {
          type: "number",
          description: "Indexed element number [1, 2, ...] to click (required for action='click')",
        },
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Scroll direction (for action='scroll', default 'down')",
        },
        lines: {
          type: "number",
          description: "Number of lines to scroll (optional)",
        },
        query: {
          type: "string",
          description: "Keyword or section heading to jump directly to inside the page (for action='find')",
        },
      },
      required: ["action"],
    },
    execute: async (params: Record<string, any>, _cwd?: string, signal?: AbortSignal) => {
      try {
        const { action, url, ref, direction, lines, query } = params as UplinkBrowseParams;
        let resultText = "";

        switch (action) {
          case "navigate": {
            if (!url) return "Error: 'url' parameter is required for action='navigate'";
            resultText = await activeSession.navigate(url, signal);
            break;
          }
          case "click": {
            if (ref === undefined || typeof ref !== "number") {
              return "Error: numeric 'ref' parameter is required for action='click'";
            }
            resultText = await activeSession.click(ref, signal);
            break;
          }
          case "scroll": {
            resultText = activeSession.scroll(direction || "down", lines);
            break;
          }
          case "find": {
            if (!query) return "Error: 'query' parameter is required for action='find'";
            resultText = activeSession.find(query);
            break;
          }
          case "back": {
            resultText = await activeSession.back(signal);
            break;
          }
          case "forward": {
            resultText = await activeSession.forward(signal);
            break;
          }
          case "snapshot": {
            resultText = activeSession.renderView();
            break;
          }
          default:
            return `Error: Unknown action '${action}'. Valid actions: navigate, click, scroll, find, back, forward, snapshot.`;
        }

        const truncated = await truncateOutput(resultText, { toolName: "uplink_browse" });
        return {
          output: truncated.content,
          metadata: {
            action,
            currentUrl: activeSession.currentUrl,
          },
        };
      } catch (err: unknown) {
        return `Error: ${formatError(err)}`;
      }
    },
  };
}

/**
 * Bundle helper to create both Uplink tools sharing a session.
 */
export function createUplinkTools(session?: UplinkSession): {
  uplink_search: ToolDefinition;
  uplink_browse: ToolDefinition;
} {
  const browserSession = session ?? new UplinkSession();
  return {
    uplink_search: createUplinkSearchTool(),
    uplink_browse: createUplinkBrowseTool(browserSession),
  };
}
