import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface ProviderConfig {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

/**
 * Resolves the appropriate LanguageModel based on model ID or environment variables.
 * Automatically handles OpenRouter, Groq, NVIDIA NIM, Anthropic, Google Gemini, and OpenAI.
 */
export function resolveModel(config: ProviderConfig = {}): {
  model: LanguageModel;
  modelId: string;
  provider: string;
} {
  const modelId =
    config.model ||
    process.env.MORPHEUS_MODEL ||
    (process.env.OPENROUTER_API_KEY ? "stealth/space-bunny-alpha" : "claude-3-7-sonnet-latest");

  if (
    process.env.OPENROUTER_API_KEY &&
    (modelId.startsWith("stealth/") || !process.env.GROQ_API_KEY)
  ) {
    const openrouter = createOpenAI({
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      baseURL: config.baseURL || "https://openrouter.ai/api/v1",
    });
    return {
      model: openrouter(modelId),
      modelId,
      provider: "openrouter",
    };
  }

  if (process.env.GROQ_API_KEY && !modelId.startsWith("stealth/")) {
    const groq = createOpenAI({
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
      baseURL: config.baseURL || process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });
    return {
      model: groq(modelId),
      modelId,
      provider: "groq",
    };
  }

  if (process.env.NVIDIA_API_KEY || modelId.startsWith("deepseek-ai/") || modelId.startsWith("nvidia/")) {
    const nvidia = createOpenAI({
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      baseURL: config.baseURL || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    });
    return {
      model: nvidia(modelId),
      modelId,
      provider: "nvidia",
    };
  }

  if (modelId.startsWith("claude") || process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    return {
      model: anthropic(modelId.startsWith("claude") ? modelId : "claude-3-7-sonnet-latest"),
      modelId,
      provider: "anthropic",
    };
  }

  if (modelId.startsWith("gemini") || process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey || process.env.GEMINI_API_KEY,
    });
    return {
      model: google(modelId.startsWith("gemini") ? modelId : "gemini-2.5-pro"),
      modelId,
      provider: "google",
    };
  }

  const openai = createOpenAI({
    apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    baseURL: config.baseURL,
  });

  return {
    model: openai(modelId),
    modelId,
    provider: "openai",
  };
}
