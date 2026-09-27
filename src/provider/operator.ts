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

export class Operator {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private defaultHeaders: Record<string, string>;
  private isLocal: boolean;
  private numCtx: number;

  constructor(config: OperatorConfig = {}) {
    const isLocalConfig =
      Boolean(config.isLocal) ||
      process.env.MORPHEUS_LOCAL === "true" ||
      Boolean(
        config.baseURL &&
          (config.baseURL.includes("localhost") || config.baseURL.includes("127.0.0.1"))
      ) ||
      Boolean(
        process.env.MORPHEUS_BASE_URL &&
          (process.env.MORPHEUS_BASE_URL.includes("localhost") ||
            process.env.MORPHEUS_BASE_URL.includes("127.0.0.1"))
      );

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
        (process.env.MORPHEUS_NUM_CTX ? parseInt(process.env.MORPHEUS_NUM_CTX, 10) : 12288);
    } else {
      this.baseURL =
        config.baseURL ||
        (process.env.OPENROUTER_API_KEY
          ? "https://openrouter.ai/api/v1"
          : process.env.GROQ_API_KEY
          ? "https://api.groq.com/openai/v1"
          : "https://openrouter.ai/api/v1");

      this.apiKey =
        config.apiKey ||
        process.env.OPENROUTER_API_KEY ||
        process.env.GROQ_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "";

      this.model =
        config.model ||
        process.env.MORPHEUS_MODEL ||
        process.env.OPENROUTER_MODEL ||
        "stealth/space-bunny-alpha";

      this.numCtx =
        config.numCtx ||
        (process.env.MORPHEUS_NUM_CTX ? parseInt(process.env.MORPHEUS_NUM_CTX, 10) : 32768);
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

  async *chatStream(options: ChatStreamOptions): AsyncGenerator<StreamEvent> {
    const rawMessages: Record<string, unknown>[] = [];

    if (options.system) {
      rawMessages.push({ role: "system", content: options.system });
    }

    for (const msg of options.messages) {
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

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: rawMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (this.isLocal || this.baseURL.includes("localhost") || this.baseURL.includes("127.0.0.1")) {
      payload.options = {
        num_ctx: this.numCtx,
      };
    }

    if (options.tools) {
      const toolList = Array.isArray(options.tools)
        ? options.tools
        : Object.values(options.tools);

      if (toolList.length > 0) {
        payload.tools = toolList.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }
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
            for (const [_, tc] of toolCallsByIndex.entries()) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                },
              };
            }
            toolCallsByIndex.clear();
            yield { type: "finish", finishReason: "stop" };
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
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
            for (const [_, tc] of toolCallsByIndex.entries()) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                },
              };
            }
            toolCallsByIndex.clear();
            yield { type: "finish", finishReason: choice.finish_reason };
          }
        }
      }

      if (toolCallsByIndex.size > 0) {
        for (const [_, tc] of toolCallsByIndex.entries()) {
          yield {
            type: "tool_call",
            toolCall: {
              id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
              type: "function",
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            },
          };
        }
        toolCallsByIndex.clear();
      }
    } finally {
      reader.releaseLock();
    }
  }
}
