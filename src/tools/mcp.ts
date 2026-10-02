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
  /* Cua only: "all" exposes every driver tool; an array replaces the default core set. */
  tools?: string[] | "all";
};

type McpConfig = { mcpServers?: Record<string, McpServerConfig> };
type McpImage = { mimeType: string; data: string };

/* The driver ships ~58 tools (~23k prompt tokens); these cover desktop and browser-window control. */
const CUA_CORE_TOOLS = [
  "list_apps",
  "list_windows",
  "get_window_state",
  "launch_app",
  "bring_to_front",
  "invoke_menu",
  "click",
  "double_click",
  "right_click",
  "drag",
  "type_text",
  "press_key",
  "hotkey",
  "set_value",
  "scroll",
  "clipboard_write",
  "zoom",
  "get_desktop_state",
];

/* Morpheus owns sessions and targets, so these never reach the model. */
const CUA_HIDDEN_PARAMS = new Set([
  "session",
  "target",
  "capture_mode",
  "debug_image_out",
  "screenshot_out_file",
  "webkit_inspector_port",
]);

const MAX_TOOL_DESCRIPTION_CHARS = 900;
const MAX_PARAM_DESCRIPTION_CHARS = 260;
const MAX_STRUCTURED_SUFFIX_CHARS = 2000;
const MAX_WINDOW_ELEMENTS = 150;
const ACTIONABLE_ROLES = /^AX(TextField|TextArea|SearchField|ComboBox|Button|Link|CheckBox|RadioButton|PopUpButton|MenuButton|MenuItem|Slider|Tab|Cell|Row|DisclosureTriangle|Incrementor)$/;
const MEANINGFUL_ACTIONS = /^AX(Press|Confirm|Pick|Open|Increment|Decrement|Raise)$/;

const CUA_GUIDANCE: Record<string, string> = {
  get_window_state: "Morpheus: returns a screenshot plus a compact list of actionable elements. Pass `query` to filter elements by text. Prefer acting on an element_token from the latest call; tokens go stale after the next snapshot of the same window.",
  click: "Morpheus: pass pid + window_id with an element_token, or with x/y screenshot pixels (each element line in get_window_state ends with its @x,y center). If an accessibility press is a no-op, Morpheus retries it as a pixel click. Verify the effect with a fresh state.",
  type_text: "Morpheus: pass pid + window_id. For web content, also pass x/y of the field so it is focused and typed in one call. If background delivery drops characters, Morpheus automatically retries the remainder in foreground mode. Press Return with press_key.",
  press_key: "Morpheus: pass pid + window_id. Verify focus-sensitive effects with a fresh state.",
  hotkey: "Morpheus: pass pid + window_id. Browser shortcuts: cmd+l focuses the address bar, cmd+t opens a tab, cmd+f finds in page.",
};

function toolName(server: string, name: string): string {
  const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcp_${safe(server)}_${safe(name)}`;
}

function isCuaServer(serverName: string, server: McpServerConfig): boolean {
  return /cua/i.test(serverName) || /cua-driver/i.test(server.command);
}

function trimDescription(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf(". ") + 1);
  return `${(cut > max * 0.5 ? head.slice(0, cut) : head).trimEnd()} …`;
}

function trimSchemaDescriptions(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(trimSchemaDescriptions);
  if (!schema || typeof schema !== "object") return schema;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    output[key] = key === "description" && typeof value === "string"
      ? trimDescription(value, MAX_PARAM_DESCRIPTION_CHARS)
      : trimSchemaDescriptions(value);
  }
  return output;
}

function asSchema(value: unknown, isCua = false): ToolDefinition["parameters"] {
  if (!value || typeof value !== "object") return { type: "object", properties: {} };
  const schema = value as Record<string, unknown>;
  let properties = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, ToolParameterSchema>
    : {};
  if (isCua) {
    properties = Object.fromEntries(
      Object.entries(properties).filter(([key]) => !CUA_HIDDEN_PARAMS.has(key))
    ) as Record<string, ToolParameterSchema>;
    properties = trimSchemaDescriptions(properties) as Record<string, ToolParameterSchema>;
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string" && item in properties)
    : undefined;
  return {
    type: "object",
    properties,
    ...(required && required.length > 0 ? { required } : {}),
  };
}

function toolDescription(isCua: boolean, name: string, description?: string): string {
  const base = description || name;
  if (!isCua) return base;
  const trimmed = trimDescription(base, MAX_TOOL_DESCRIPTION_CHARS);
  const guidance = CUA_GUIDANCE[name];
  return guidance ? `${trimmed}\n\n${guidance}` : trimmed;
}

function isMenuBarElement(element: any, byIndex: Map<number, any>): boolean {
  let current = element;
  for (let hops = 0; current && hops < 30; hops++) {
    if (/^AXMenuBar(Item)?$/.test(String(current.role ?? ""))) return true;
    current = typeof current.parent_index === "number" ? byIndex.get(current.parent_index) : undefined;
  }
  return false;
}

/* Screenshot-pixel centers from recent snapshots, keyed by element_token, for pixel fallback. */
const elementPixelCenters = new Map<string, { x: number; y: number; pid: number; windowId: number }>();

function pixelCenter(frame: any, state: Record<string, any>): { x: number; y: number } | undefined {
  const bounds = state.window_bounds;
  if (!frame || !bounds?.width || !bounds?.height || !state.screenshot_width || !state.screenshot_height) return undefined;
  const w = Number(frame.w ?? frame.width) || 0;
  const h = Number(frame.h ?? frame.height) || 0;
  const x = Math.round((Number(frame.x) + w / 2 - Number(bounds.x)) * state.screenshot_width / bounds.width);
  const y = Math.round((Number(frame.y) + h / 2 - Number(bounds.y)) * state.screenshot_height / bounds.height);
  if (x < 0 || y < 0 || x > state.screenshot_width || y > state.screenshot_height) return undefined;
  return { x, y };
}

function oneLine(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatCuaWindowState(state: Record<string, any>): string {
  const all: any[] = Array.isArray(state.elements) ? state.elements.filter((e: any) => e && typeof e === "object") : [];
  const byIndex = new Map<number, any>();
  for (const element of all) if (typeof element.element_index === "number") byIndex.set(element.element_index, element);
  const actionable = all.filter((element) => {
    if (element.enabled === false) return false;
    if (isMenuBarElement(element, byIndex)) return false;
    const unlabeled = !oneLine(element.label ?? element.title ?? element.description, 1) && !oneLine(element.value, 1);
    if (unlabeled && /^AX(Window|Row|Cell|Group)$/.test(String(element.role ?? ""))) return false;
    const actions = Array.isArray(element.actions) ? element.actions.map(String) : [];
    return ACTIONABLE_ROLES.test(String(element.role ?? "")) || actions.some((action: string) => MEANINGFUL_ACTIONS.test(action));
  });
  const shown = actionable.slice(0, MAX_WINDOW_ELEMENTS);
  if (elementPixelCenters.size > 3000) elementPixelCenters.clear();
  const lines = shown.map((element) => {
    const label = oneLine(element.label ?? element.title ?? element.description, 80);
    const value = element.value === undefined || element.value === null || element.value === "" ? "" : ` value="${oneLine(element.value, 60)}"`;
    const center = pixelCenter(element.frame, state);
    if (center && typeof element.element_token === "string") {
      elementPixelCenters.set(element.element_token, { ...center, pid: Number(state.pid), windowId: Number(state.window_id) });
    }
    const selected = element.selected ? " selected" : "";
    return `${element.element_token ?? element.element_index} ${String(element.role ?? "?").replace(/^AX/, "")} "${label}"${value}${selected}${center ? ` @${center.x},${center.y}` : " (off-screen)"}`;
  });
  const header = {
    pid: state.pid,
    window_id: state.window_id,
    app: state.app_name,
    title: state.window_title,
    screenshot: state.screenshot_width ? `${state.screenshot_width}x${state.screenshot_height}` : undefined,
    scale: state.screenshot_scale,
    capture_id: state.capture_id,
    degraded: state.degraded_reason,
  };
  return [
    `Cua window state ${JSON.stringify(header)}`,
    `Actionable elements (token role "label" @x,y = center in screenshot pixels, usable as click x/y; menu bar omitted, use invoke_menu): ${shown.length}${actionable.length > shown.length ? ` of ${actionable.length}; pass query to narrow` : ""}`,
    ...lines,
    ...(state._note ? [`Note: ${oneLine(state._note, 300)}`] : []),
  ].join("\n");
}

function compactCuaValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested data omitted]";
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0, 600)}…` : value;
  if (Array.isArray(value)) {
    const visible = value.slice(0, 40).map((item) => compactCuaValue(item, depth + 1));
    if (value.length > visible.length) visible.push(`[${value.length - visible.length} more entries omitted]`);
    return visible;
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(tree_markdown|screenshot|screenshot_data|image|image_data|.*base64)$/i.test(key)) continue;
    if (child === null || child === undefined) continue;
    output[key] = compactCuaValue(child, depth + 1);
  }
  return output;
}

function formatCuaWindows(structured: Record<string, any>): string {
  const windows = (structured.windows as any[]).filter((window) =>
    window && (window.is_on_screen || String(window.title ?? "").trim()) &&
    !(window.bounds && window.bounds.width < 80 && window.bounds.height < 80)
  );
  const lines = windows.slice(0, 40).map((window) => {
    const b = window.bounds ?? {};
    const flags = [window.is_on_screen ? "on-screen" : "off-screen", window.on_current_space === false ? "other-space" : ""].filter(Boolean).join(",");
    return `pid=${window.pid} window_id=${window.window_id} ${window.app_name} "${oneLine(window.title, 80)}" ${Math.round(b.width ?? 0)}x${Math.round(b.height ?? 0)} ${flags}`;
  });
  const hidden = (structured.windows as any[]).length - lines.length;
  return [`Windows (${lines.length} shown${hidden > 0 ? `, ${hidden} untitled/tiny/extra omitted` : ""}):`, ...lines].join("\n");
}

function formatResult(result: any, remoteName?: string, isCua = false): { text: string; images: McpImage[] } {
  const content = Array.isArray(result?.content) ? result.content : [];
  const images: McpImage[] = [];
  const parts = content.map((item: any) => {
    if (item?.type === "text") return String(item.text ?? "");
    if (item?.type === "image") {
      const mimeType = typeof item.mimeType === "string" ? item.mimeType : "";
      const data = typeof item.data === "string" ? item.data : "";
      if (/^image\/(png|jpeg|webp|gif)$/i.test(mimeType) && data.length <= 7_000_000) {
        images.push({ mimeType, data });
        return `[Image attached for visual inspection: ${mimeType}]`;
      }
      return `[MCP image omitted: unsupported format or image exceeds size limit]`;
    }
    if (item?.type === "resource") return JSON.stringify(item.resource ?? item);
    return JSON.stringify(item);
  }).filter(Boolean);
  const structured = result?.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)
    ? result.structuredContent as Record<string, any>
    : undefined;
  const rawText = parts.join("\n");
  let text = rawText || (structured ? JSON.stringify(structured, null, 2) : "(MCP tool returned no content)");
  if (!isCua || !structured) return { text, images };

  if (remoteName === "get_window_state") {
    const imageNote = images.length > 0 ? "[Screenshot attached]\n" : "";
    text = `${imageNote}${formatCuaWindowState(structured)}`;
  } else if (remoteName === "list_windows" && Array.isArray(structured.windows)) {
    text = formatCuaWindows(structured);
  } else if (remoteName === "list_apps" && Array.isArray(structured.apps)) {
    const running = structured.apps.filter((app: any) => app?.running);
    text = [
      `Running apps (${running.length}; ${structured.apps.length - running.length} installed apps not running can be started with launch_app by name or bundle_id):`,
      ...running.map((app: any) => `pid=${app.pid} ${app.name} [${app.bundle_id}]${app.active ? " active" : ""}`),
    ].join("\n");
  } else if (remoteName === "get_desktop_state") {
    const capture = compactCuaValue({
      capture_id: structured.capture_id,
      display_id: structured.display_id,
      screenshot_scale: structured.screenshot_scale,
      screenshot_width: structured.screenshot_width,
      screenshot_height: structured.screenshot_height,
    });
    text = `${rawText}\nCua capture: ${JSON.stringify(capture)}`;
  } else {
    const compact = JSON.stringify(compactCuaValue(structured));
    if (!rawText || compact.length <= MAX_STRUCTURED_SUFFIX_CHARS) {
      text = rawText ? `${rawText}\nCua result: ${compact}` : `Cua result: ${compact}`;
    }
  }
  return { text, images };
}

/* Rewrites legacy pid/window_id addressing into the driver's `target` form so the two are never mixed. */
export function normalizeCuaArgs(args: Record<string, unknown>, supportsTarget: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = { ...args };
  for (const key of CUA_HIDDEN_PARAMS) if (key !== "target") delete next[key];
  if (!supportsTarget) {
    delete next.target;
    return next;
  }
  if (next.target && typeof next.target === "object") {
    delete next.pid;
    delete next.window_id;
    delete next.scope;
    return next;
  }
  delete next.target;
  if (typeof next.element_token === "string" && next.element_token) {
    delete next.window_id;
    return next;
  }
  const pid = Number(next.pid);
  const windowId = Number(next.window_id);
  if (Number.isInteger(pid) && Number.isInteger(windowId) && next.scope !== "desktop") {
    next.target = { kind: "window", pid, window_id: windowId };
    delete next.pid;
    delete next.window_id;
    delete next.scope;
  }
  return next;
}

class McpConnection {
  private client?: Client;
  private connected = false;

  constructor(private readonly server: McpServerConfig) {}

  async connect(): Promise<Client> {
    if (this.client && this.connected) return this.client;
    if (this.client) await this.client.close().catch(() => undefined);
    const client = new Client({ name: "morpheus", version: "0.1.0" });
    const inheritedEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    const transport = new StdioClientTransport({
      command: this.server.command,
      args: Array.isArray(this.server.args) ? this.server.args : [],
      cwd: this.server.cwd,
      env: this.server.env ? { ...inheritedEnv, ...this.server.env } : inheritedEnv,
      stderr: "pipe",
    });
    client.onclose = () => {
      if (this.client === client) this.connected = false;
    };
    await client.connect(transport);
    this.client = client;
    this.connected = true;
    return client;
  }

  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const client = await this.connect();
    return client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    this.connected = false;
    await this.client?.close().catch(() => undefined);
  }
}

async function callCua(
  connection: McpConnection,
  name: string,
  args: Record<string, unknown>
): Promise<{ result: any; notes: string[] }> {
  const notes: string[] = [];
  let result = await connection.call(name, args);
  const structured = result?.structuredContent as Record<string, any> | undefined;

  if (
    name === "click" &&
    structured?.effect === "suspected_noop" &&
    typeof args.element_token === "string" &&
    elementPixelCenters.has(args.element_token)
  ) {
    const center = elementPixelCenters.get(args.element_token)!;
    const retryArgs: Record<string, unknown> = {
      ...args,
      x: center.x,
      y: center.y,
      target: { kind: "window", pid: center.pid, window_id: center.windowId },
    };
    for (const key of ["element_token", "action", "pid", "window_id", "scope"]) delete retryArgs[key];
    result = await connection.call(name, retryArgs);
    notes.push(`[Morpheus] The accessibility press looked like a no-op, so it was retried as a pixel click at (${center.x}, ${center.y}).`);
  } else if (
    name === "type_text" &&
    structured?.code === "type_text_incomplete" &&
    args.delivery_mode !== "foreground" &&
    typeof args.text === "string"
  ) {
    const from = Math.max(0, Math.min(args.text.length, Number(structured.retry_from_character ?? structured.delivered_chars ?? 0) || 0));
    const retryArgs: Record<string, unknown> = { ...args, text: args.text.slice(from), delivery_mode: "foreground" };
    if (from > 0) {
      delete retryArgs.x;
      delete retryArgs.y;
    }
    result = await connection.call(name, retryArgs);
    if (result?.structuredContent?.code === "type_text_incomplete" && Number(result.structuredContent.delivered_chars) === 0) {
      notes.push("[Morpheus] Keystrokes are not reaching this app in background or foreground mode. Do not retry typing here: use a URL with a query (shell `open`), set_value on a native field, or ask the user to run `cua-driver permissions grant`.");
    }
    notes.push(`[Morpheus] Background typing delivered ${from}/${args.text.length} characters, so the remaining text was retried with delivery_mode "foreground".`);
  } else if (
    (name === "press_key" || name === "hotkey") &&
    result?.isError &&
    args.delivery_mode !== "foreground" &&
    /foreground/i.test(JSON.stringify(result?.content ?? ""))
  ) {
    result = await connection.call(name, { ...args, delivery_mode: "foreground" });
    notes.push(`[Morpheus] Background key delivery was refused, so it was retried with delivery_mode "foreground".`);
  }
  return { result, notes };
}

type McpRegistry = {
  key: string;
  tools: Record<string, ToolDefinition>;
  connections: McpConnection[];
  hasFailures: boolean;
};

let persistentRegistry: McpRegistry | undefined;

async function readMcpConfig(): Promise<McpConfig | undefined> {
  const configPath = path.join(os.homedir(), ".morpheus", "config.json");
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as McpConfig;
    return {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return undefined;
  }
}

async function buildRegistry(config: McpConfig, key: string): Promise<McpRegistry> {
  const tools: Record<string, ToolDefinition> = {};
  const connections: McpConnection[] = [];
  const statuses: string[] = [];

  for (const [serverName, server] of Object.entries(config.mcpServers ?? {})) {
    if (!server || server.disabled) continue;
    if (typeof server.command !== "string" || !server.command.trim()) {
      statuses.push(`${serverName}: skipped (missing command)`);
      continue;
    }
    const connection = new McpConnection(server);
    try {
      const client = await connection.connect();
      connections.push(connection);
      const listed = await client.listTools();
      const isCua = isCuaServer(serverName, server);
      const allowed = !isCua || server.tools === "all"
        ? undefined
        : new Set(Array.isArray(server.tools) ? server.tools : CUA_CORE_TOOLS);
      let added = 0;
      for (const remote of listed.tools) {
        if (allowed && !allowed.has(remote.name)) continue;
        const name = toolName(serverName, remote.name);
        if (tools[name]) {
          statuses.push(`${serverName}: skipped duplicate tool name ${remote.name}`);
          continue;
        }
        const remoteProperties = (remote.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
        const supportsTarget = "target" in remoteProperties;
        tools[name] = {
          name,
          description: `[MCP ${serverName}] ${toolDescription(isCua, remote.name, remote.description)}`,
          parameters: asSchema(remote.inputSchema, isCua),
          execute: async (args, _cwd, signal) => {
            if (signal?.aborted) return { output: "[MCP tool cancelled before execution.]", metadata: { cancelled: true } };
            const { result, notes } = isCua
              ? await callCua(connection, remote.name, normalizeCuaArgs(args, supportsTarget))
              : { result: await connection.call(remote.name, args), notes: [] as string[] };
            const formatted = formatResult(result, remote.name, isCua);
            const output = notes.length > 0 ? `${notes.join("\n")}\n${formatted.text}` : formatted.text;
            return { output, metadata: { isError: Boolean(result?.isError), mcpImages: formatted.images } };
          },
        };
        added++;
      }
      const hidden = listed.tools.length - added;
      statuses.push(`${serverName}: connected (${added} tools${hidden > 0 ? `, ${hidden} hidden; set "tools": "all" to expose them` : ""})`);
    } catch (error) {
      await connection.close();
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

  return { key, tools, connections, hasFailures: statuses.some((status) => /failed|skipped \(missing/.test(status)) };
}

async function closeRegistry(registry: McpRegistry): Promise<void> {
  await Promise.all(registry.connections.map((connection) => connection.close()));
}

/* Closes connections kept alive by persistent createMcpTools calls. */
export async function closeMcpConnections(): Promise<void> {
  const registry = persistentRegistry;
  persistentRegistry = undefined;
  if (registry) await closeRegistry(registry);
}

/*
 * persistent: reuse server processes across runs (keeps Cua sessions and element tokens alive);
 * callers must invoke closeMcpConnections() before exiting.
 */
export async function createMcpTools(
  options: { persistent?: boolean } = {}
): Promise<{ tools: Record<string, ToolDefinition>; close: () => Promise<void> }> {
  const config = await readMcpConfig();
  if (!config) return { tools: {}, close: async () => undefined };
  const key = JSON.stringify(config.mcpServers ?? {});

  if (!options.persistent) {
    const registry = await buildRegistry(config, key);
    return { tools: registry.tools, close: () => closeRegistry(registry) };
  }

  if (persistentRegistry?.key !== key || persistentRegistry.hasFailures) {
    if (persistentRegistry) await closeRegistry(persistentRegistry);
    persistentRegistry = await buildRegistry(config, key);
  }
  return { tools: persistentRegistry.tools, close: async () => undefined };
}
