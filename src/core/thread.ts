export interface ThreadStep {
  id: string;
  type: "thinking" | "tool" | "note";
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
  model?: string;
}

export interface FileEditRecord {
  filePath: string;
  type: "edit" | "write";
  diffLines: string[];
  linesAdded: number;
  linesRemoved: number;
  timestamp: number;
}
