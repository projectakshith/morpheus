import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from "../core/types";

export interface OperatorConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  defaultHeaders?: Record<string, string>;
  isLocal?: boolean;
  numCtx?: number;
}

export interface StreamEvent {
  type: "text" | "reasoning" | "tool_call" | "usage" | "finish";
  text?: string;
  reasoning?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ChatStreamOptions {
  messages: ChatMessage[];
  tools?: Record<string, ToolDefinition> | ToolDefinition[];
  system?: string;
  abortSignal?: AbortSignal;
}

interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

/* Transforms internal chat messages into OpenAI-compatible payload format. */
export function formatMessagesForPayload(
  messages: ChatMessage[],
  system?: string
): Record<string, unknown>[] {
  const rawMessages: Record<string, unknown>[] = [];

  if (system) {
    rawMessages.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "system") {
      rawMessages.push({ role: "system", content: msg.content });
    } else if (msg.role === "user") {
      rawMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const item: Record<string, unknown> = {
        role: "assistant",
        content: msg.content || null,
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        item.tool_calls = msg.tool_calls;
      }
      rawMessages.push(item);
    } else if (msg.role === "tool") {
      const strContent =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      rawMessages.push({
        role: "tool",
        tool_call_id: msg.tool_call_id || "call_default",
        name: msg.name,
        content: strContent,
      });
    }
  }

  return rawMessages;
}

/* Formats registered tools into OpenAI function call definition specs. */
export function formatToolsForPayload(
  tools?: Record<string, ToolDefinition> | ToolDefinition[]
): Record<string, unknown>[] | undefined {
  if (!tools) return undefined;
  const toolList = Array.isArray(tools) ? tools : Object.values(tools);
  if (toolList.length === 0) return undefined;

  return toolList.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/* Flushes all accumulated streaming tool calls into discrete stream events. */
export function flushAccumulatedToolCalls(
  toolCallsByIndex: Map<number, AccumulatedToolCall>
): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const [_, tc] of toolCallsByIndex.entries()) {
    events.push({
      type: "tool_call",
      toolCall: {
        id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
        type: "function",
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      },
    });
  }
  toolCallsByIndex.clear();
  return events;
}

export class Operator {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private defaultHeaders: Record<string, string>;
  private isLocal: boolean;
  private numCtx: number;

  constructor(config: OperatorConfig = {}) {
    /* Differentiate Neo router proxy on port 8787 from local Ollama */
    const isNeo = Boolean(
      (config.baseURL && config.baseURL.includes("8787")) ||
        (process.env.MORPHEUS_BASE_URL && process.env.MORPHEUS_BASE_URL.includes("8787"))
    );

    const isLocalConfig =
      !isNeo &&
      (Boolean(config.isLocal) ||
        process.env.MORPHEUS_LOCAL === "true" ||
        Boolean(
          config.baseURL &&
            (config.baseURL.includes("11434") ||
              (config.baseURL.includes("localhost") && !config.baseURL.includes("8787")))
        ) ||
        Boolean(
          process.env.MORPHEUS_BASE_URL &&
            (process.env.MORPHEUS_BASE_URL.includes("11434") ||
              (process.env.MORPHEUS_BASE_URL.includes("localhost") && !process.env.MORPHEUS_BASE_URL.includes("8787")))
        ));

    this.isLocal = isLocalConfig;

    if (this.isLocal) {
      this.baseURL =
        config.baseURL ||
        process.env.MORPHEUS_BASE_URL ||
        "http://localhost:11434/v1";

      this.apiKey =
        config.apiKey ||
        process.env.MORPHEUS_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "ollama";

      this.model =
        config.model ||
        process.env.MORPHEUS_LOCAL_MODEL ||
        "qwen2.5-coder:7b";

      this.numCtx =
        config.numCtx ||
        (process.env.MORPHEUS_NUM_CTX ? parseInt(process.env.MORPHEUS_NUM_CTX, 10) : 32768);
    } else {
      this.baseURL =
        config.baseURL ||
        process.env.MORPHEUS_BASE_URL ||
        "http://127.0.0.1:8787/v1";

      this.apiKey =
        config.apiKey ||
        process.env.MORPHEUS_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "neo";

      this.model =
        config.model ||
        process.env.MORPHEUS_MODEL ||
        "flash";

      this.numCtx =
        config.numCtx ||
        (process.env.MORPHEUS_NUM_CTX ? parseInt(process.env.MORPHEUS_NUM_CTX, 10) : 128000);
    }

    this.defaultHeaders = config.defaultHeaders || {};
  }

  getModel(): string {
    return this.model;
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  getIsLocal(): boolean {
    return this.isLocal;
  }

  getNumCtx(): number {
    return this.numCtx;
  }

  /* Computes safe token threshold before context overflow, reserving generation headroom */
  getContextSafetyLimit(): number {
    const completionReserve = Math.min(8192, Math.floor(this.numCtx * 0.15));
    return Math.max(4096, this.numCtx - completionReserve);
  }

  async *chatStream(options: ChatStreamOptions): AsyncGenerator<StreamEvent> {
    const rawMessages = formatMessagesForPayload(options.messages, options.system);

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: rawMessages,
      stream: true,
      max_tokens: 8192,
      stream_options: { include_usage: true },
    };

    if (this.isLocal || this.baseURL.includes("localhost") || this.baseURL.includes("127.0.0.1")) {
      payload.options = {
        num_ctx: this.numCtx,
      };
    }

    const formattedTools = formatToolsForPayload(options.tools);
    if (formattedTools) {
      payload.tools = formattedTools;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/morpheus",
        "X-Title": "Morpheus",
        ...this.defaultHeaders,
      },
      body: JSON.stringify(payload),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Operator HTTP ${response.status}] ${errorText}`);
    }

    if (!response.body) {
      throw new Error("[Operator] Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const toolCallsByIndex = new Map<number, AccumulatedToolCall>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
              yield event;
            }
            yield { type: "finish", finishReason: "stop" };
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          /* Surface upstream errors rather than silently skipping them */
          if (parsed.error) {
            const errorMsg =
              typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message || JSON.stringify(parsed.error);
            throw new Error(`[Upstream Error] ${errorMsg}`);
          }

          if (parsed.usage) {
            yield {
              type: "usage",
              usage: {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
              },
            };
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta) {
            if (delta.content) {
              yield { type: "text", text: delta.content };
            }

            const reasoningDelta = delta.reasoning || delta.reasoning_content;
            if (reasoningDelta) {
              yield { type: "reasoning", reasoning: reasoningDelta };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsByIndex.has(idx)) {
                  toolCallsByIndex.set(idx, { id: "", name: "", arguments: "" });
                }
                const current = toolCallsByIndex.get(idx)!;
                if (tc.id) current.id = tc.id;
                if (tc.function?.name) current.name += tc.function.name;
                if (tc.function?.arguments) current.arguments += tc.function.arguments;
              }
            }
          }

          if (choice.finish_reason === "tool_calls" || choice.finish_reason === "function_call") {
            for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
              yield event;
            }
            yield { type: "finish", finishReason: choice.finish_reason };
          }
        }
      }

      if (toolCallsByIndex.size > 0) {
        for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
          yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
