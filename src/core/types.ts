import type { CoreMessage } from "ai";

export interface ToolResult<TMetadata = Record<string, unknown>> {
  output: string;
  metadata?: TMetadata;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentContext {
  cwd: string;
  isGit: boolean;
  branch?: string;
  gitStatus?: string;
  platform: string;
  date: string;
  repoMap?: string;
}

export interface AgentOptions {
  cwd?: string;
  model?: string;
  apiKey?: string;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
  onUsage?: (usage: TokenUsage) => void;
  verbose?: boolean;
}

export interface AgentRunResult {
  text: string;
  steps: number;
  messages: CoreMessage[];
  usage: TokenUsage;
  aborted?: boolean;
  logPath?: string;
}
