import type { CoreMessage } from "ai";

export interface ToolResult<TMetadata = Record<string, unknown>> {
  output: string;
  metadata?: TMetadata;
}

export interface AgentContext {
  cwd: string;
  isGit: boolean;
  branch?: string;
  gitStatus?: string;
  platform: string;
  date: string;
}

export interface AgentOptions {
  cwd?: string;
  model?: string;
  apiKey?: string;
  maxSteps?: number;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}

export interface AgentRunResult {
  text: string;
  steps: number;
  messages: CoreMessage[];
}
