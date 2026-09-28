import type { ReactNode } from "react";

export type AppStatus = "idle" | "running" | "error" | "aborted";

export interface ThreadStep {
  id: string;
  type: "thinking" | "tool";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  startTime?: number;
  durationMs?: number;
  outputSummary?: string;
  outputPreview?: string[];
  output?: string;
  isOutputExpanded?: boolean;
}

export interface Thread {
  id: string;
  index: number;
  prompt: string;
  response: string;
  isStreaming?: boolean;
  steps: ThreadStep[];
  isExpanded: boolean;
  status: "running" | "completed" | "aborted" | "error" | "queued";
  stepCount: number;
  startTime: number;
  durationMs?: number;
}

export interface AppProps {
  model: string;
  isLocal?: boolean;
  baseURL?: string;
  isVerbose?: boolean;
  initialTask?: string;
  maxSteps?: number;
  resumeSessionId?: string | boolean;
}

export interface FeedLine {
  id: string;
  threadId: string;
  stepId?: string;
  node: ReactNode;
}

export interface FileEditRecord {
  filePath: string;
  type: "edit" | "write";
  diffLines: string[];
  linesAdded: number;
  linesRemoved: number;
  timestamp: number;
}

export interface ToolStepRecord {
  id: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  startTime?: number;
  durationMs?: number;
  outputSummary?: string;
  outputPreview?: string[];
  output?: string;
}

export interface RightLine {
  id: string;
  toolId?: string;
  threadId?: string;
  editFilePath?: string;
  node: ReactNode;
}

export interface DiffColumnProps {
  width: number;
  height: number;
  lines: RightLine[];
}

