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
  maxRetries?: number;
  retryBaseDelayMs?: number;
  promptCacheKey?: string;
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
  maxTokens?: number;
  promptCacheKey?: string;
}

interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function resolveContextSize(configured: number | undefined, fallback: number): number {
  const fromEnv = process.env.MORPHEUS_NUM_CTX
    ? Number(process.env.MORPHEUS_NUM_CTX)
    : undefined;
  const candidate = configured ?? fromEnv;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : fallback;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
/* ECONNREFUSED is left out so a stopped proxy fails fast instead of backing off. */
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const MAX_RETRY_DELAY_MS = 30_000;

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name === "AbortError") return false;
  const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
  return typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code);
}

export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortError = () => new DOMException("The operation was aborted.", "AbortError");
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private promptCacheKey?: string;

  constructor(config: OperatorConfig = {}) {
    this.maxRetries = Math.max(0, config.maxRetries ?? 3);
    this.retryBaseDelayMs = Math.max(0, config.retryBaseDelayMs ?? 1000);
    this.promptCacheKey = config.promptCacheKey;

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

      this.numCtx = resolveContextSize(config.numCtx, 32768);
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

      this.numCtx = resolveContextSize(config.numCtx, 128000);
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
    return Math.max(1, this.numCtx - this.getCompletionTokenLimit());
  }

  getCompletionTokenLimit(): number {
    return Math.max(1, Math.min(8192, Math.floor(this.numCtx * 0.15)));
  }

    /* Only the request is retried; once streaming starts, events have already reached the caller. */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const signal = init.signal ?? undefined;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err: unknown) {
        if (attempt >= this.maxRetries || signal?.aborted || !isRetryableNetworkError(err)) throw err;
        await abortableSleep(this.backoffDelay(attempt), signal);
        continue;
      }

      if (response.ok || attempt >= this.maxRetries || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }

      const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
      if (retryAfter !== undefined && retryAfter > MAX_RETRY_DELAY_MS) return response;

      await response.body?.cancel().catch(() => {});
      await abortableSleep(retryAfter ?? this.backoffDelay(attempt), signal);
    }
  }

  private backoffDelay(attempt: number): number {
    const base = this.retryBaseDelayMs * 2 ** attempt;
    return Math.min(MAX_RETRY_DELAY_MS, base * (0.75 + Math.random() * 0.5));
  }

  async *chatStream(options: ChatStreamOptions): AsyncGenerator<StreamEvent> {
    const rawMessages = formatMessagesForPayload(options.messages, options.system);

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: rawMessages,
      stream: true,
      max_tokens: Math.min(options.maxTokens ?? Infinity, this.getCompletionTokenLimit()),
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
    const promptCacheKey = options.promptCacheKey ?? this.promptCacheKey;
    const isNeoProxy = /(?:localhost|127\.0\.0\.1):8787(?:\/|$)/.test(this.baseURL);
    if (promptCacheKey && isNeoProxy) payload.prompt_cache_key = promptCacheKey;

    const response = await this.fetchWithRetry(`${this.baseURL}/chat/completions`, {
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
    let lastFinishReason: string | undefined;
    let usageSeen = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        if (done) {
          buffer += decoder.decode();
          if (buffer && !buffer.endsWith("\n")) buffer += "\n";
        }
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            if (!usageSeen) yield { type: "usage", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, reported: false } };
            if (lastFinishReason === "length") {
              toolCallsByIndex.clear();
            } else {
              for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
                yield event;
              }
            }
            if (!lastFinishReason) yield { type: "finish", finishReason: "stop" };
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
            usageSeen = true;
            yield {
              type: "usage",
              usage: {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
                reported:
                  parsed.usage.reported !== false &&
                  (typeof parsed.usage.prompt_tokens === "number" || typeof parsed.usage.completion_tokens === "number"),
                cachedInputTokens:
                  parsed.usage.cached_input_tokens ?? parsed.usage.prompt_tokens_details?.cached_tokens,
                cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
                reasoningTokens:
                  parsed.usage.reasoning_tokens ?? parsed.usage.completion_tokens_details?.reasoning_tokens,
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

          if (choice.finish_reason) {
            lastFinishReason = choice.finish_reason;
          }

          if (choice.finish_reason === "tool_calls" || choice.finish_reason === "function_call") {
            for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
              yield event;
            }
          }
          if (choice.finish_reason) {
            yield { type: "finish", finishReason: choice.finish_reason };
          }
        }

        if (done) break;
      }

      if (toolCallsByIndex.size > 0) {
        if (lastFinishReason === "length") {
          toolCallsByIndex.clear();
        } else {
          for (const event of flushAccumulatedToolCalls(toolCallsByIndex)) {
            yield event;
          }
        }
      }
      if (!usageSeen) yield { type: "usage", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, reported: false } };
    } finally {
      reader.releaseLock();
    }
  }
}
