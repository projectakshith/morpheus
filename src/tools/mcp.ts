import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { ToolDefinition, ToolParameterSchema } from "../core/types";

type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
};

type McpConfig = { mcpServers?: Record<string, McpServerConfig> };

function toolName(server: string, name: string): string {
  const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcp_${safe(server)}_${safe(name)}`;
}

function asSchema(value: unknown): ToolDefinition["parameters"] {
  if (!value || typeof value !== "object") return { type: "object", properties: {} };
  const schema = value as Record<string, unknown>;
  const properties = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, ToolParameterSchema>
    : {};
  return {
    type: "object",
    properties,
    ...(Array.isArray(schema.required) ? { required: schema.required.filter((item): item is string => typeof item === "string") } : {}),
  };
}

function formatResult(result: any): string {
  const content = Array.isArray(result?.content) ? result.content : [];
  const parts = content.map((item: any) => {
    if (item?.type === "text") return String(item.text ?? "");
    if (item?.type === "image") return `[MCP image: ${item.mimeType ?? "image"}; image data omitted]`;
    if (item?.type === "resource") return JSON.stringify(item.resource ?? item);
    return JSON.stringify(item);
  }).filter(Boolean);
  return parts.join("\n") || (result?.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : "(MCP tool returned no content)");
}

export async function createMcpTools(): Promise<{ tools: Record<string, ToolDefinition>; close: () => Promise<void> }> {
  const configPath = path.join(os.homedir(), ".morpheus", "config.json");
  let config: McpConfig = {};
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as McpConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { tools: {}, close: async () => undefined };
    }
  }

  const tools: Record<string, ToolDefinition> = {};
  const clients: Client[] = [];
  const statuses: string[] = [];

  for (const [serverName, server] of Object.entries(config.mcpServers ?? {})) {
    if (server.disabled) continue;
    if (!server || typeof server.command !== "string" || !server.command.trim()) {
      statuses.push(`${serverName}: skipped (missing command)`);
      continue;
    }
    const client = new Client({ name: "morpheus", version: "0.1.0" });
    const inheritedEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    const transport = new StdioClientTransport({
      command: server.command,
      args: Array.isArray(server.args) ? server.args : [],
      cwd: server.cwd,
      env: server.env ? { ...inheritedEnv, ...server.env } : inheritedEnv,
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      clients.push(client);
      const listed = await client.listTools();
      let added = 0;
      for (const remote of listed.tools) {
        const name = toolName(serverName, remote.name);
        if (tools[name]) {
          statuses.push(`${serverName}: skipped duplicate tool name ${remote.name}`);
          continue;
        }
        tools[name] = {
          name,
          description: `[MCP ${serverName}] ${remote.description || remote.name}`,
          parameters: asSchema(remote.inputSchema),
          execute: async (args, _cwd, signal) => {
            if (signal?.aborted) return { output: "[MCP tool cancelled before execution.]", metadata: { cancelled: true } };
            const result = await client.callTool({ name: remote.name, arguments: args });
            return { output: formatResult(result), metadata: { isError: Boolean(result.isError) } };
          },
        };
        added++;
      }
      statuses.push(`${serverName}: connected (${added} tools)`);
    } catch (error) {
      await client.close().catch(() => undefined);
      statuses.push(`${serverName}: connection failed (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    tools.mcp_status = {
      name: "mcp_status",
      description: "Show the configured MCP server connection status and tool counts for this run.",
      parameters: { type: "object", properties: {} },
      execute: async () => statuses.join("\n") || "No MCP servers are enabled.",
    };
  }

  return {
    tools,
    close: async () => {
      await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
    },
  };
}
