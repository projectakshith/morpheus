import type { ReactNode } from "react";

export type AppStatus = "idle" | "running" | "error" | "aborted";

export type { ThreadStep, Thread, FileEditRecord } from "../core/thread";

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

import type { TokenUsage } from "../core/types";

export interface ColumnStatusInfo {
  status: "idle" | "running" | "aborted" | "error";
  stepCount: number;
  maxSteps?: number;
  usage?: TokenUsage;
  elapsedSeconds: number;
  queueCount?: number;
}

export interface DiffColumnProps {
  width: number;
  height: number;
  lines: RightLine[];
  statusInfo?: ColumnStatusInfo;
}
