export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ChatMessage {
  role: MessageRole;
  content: string | any;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  isError?: boolean;
}

export type CoreMessage = ChatMessage;

export interface ToolResult<TMetadata = Record<string, unknown>> {
  output: string;
  metadata?: TMetadata;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (args: Record<string, any>, cwd?: string) => Promise<ToolResult | string>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  peakContextTokens?: number;
  contextLimit?: number;
}

export interface Finding {
  topic: string;
  takeaway: string;
}

export interface Skill {
  name: string;
  category: string;
  description: string;
  triggers: string[];
  content: string;
  path: string;
}

export interface Rule {
  name: string;
  description?: string;
  content: string;
  path: string;
}

export interface AgentContext {
  cwd: string;
  isGit: boolean;
  branch?: string;
  gitStatus?: string;
  platform: string;
  date: string;
  repoMap?: string;
  siblings?: string[];
  findings?: Finding[];
  skills?: Skill[];
  rules?: Rule[];
  activeSkills?: Skill[];
}

export interface AgentOptions {
  cwd?: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  isLocal?: boolean;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  findings?: Finding[];
  onStepStart?: (stepNumber: number) => void;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>, callId?: string) => void;
  onToolResult?: (toolName: string, result: ToolResult, callId?: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  verbose?: boolean;
}

export interface AgentRunResult {
  text: string;
  steps: number;
  messages: ChatMessage[];
  usage: TokenUsage;
  findings?: Finding[];
  aborted?: boolean;
  logPath?: string;
}
