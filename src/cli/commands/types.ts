/*
 * Command handler interfaces and context contracts for modular slash commands.
 */

import type React from "react";
import type { Thread, FileEditRecord } from "../types.js";
import type { ChatMessage, Finding, TokenUsage } from "../../core/types.js";

export interface CommandContext {
  taskText: string;
  baseURL: string;
  currentModel: string;
  setCurrentModel: (model: string) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  setThreads: React.Dispatch<React.SetStateAction<Thread[]>>;
  setPromptHistory: React.Dispatch<React.SetStateAction<string[]>>;
  threadsCount: number;
  sessionId?: string;
  setSessionId?: (id: string) => void;
  sessionTitle?: string;
  setSessionTitle?: (title: string) => void;
  setHistory?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setFindings?: React.Dispatch<React.SetStateAction<Finding[]>>;
  setFileEdits?: React.Dispatch<React.SetStateAction<FileEditRecord[]>>;
  usage?: TokenUsage;
  loadSessionById?: (id: string) => Promise<boolean>;
  resetSession?: () => void;
  openModal?: (modal: "model" | "session" | "settings" | "diff") => void;
  closeModal?: () => void;
  abort?: () => void;
  getQueue?: () => string[];
  clearQueue?: () => void;
  isAgentRunning?: boolean;
}

export interface CommandHandler {
  readonly name: string;
  readonly description: string;
  readonly aliases?: string[];

  matches(trimmed: string): boolean;
  execute(trimmed: string, ctx: CommandContext): Promise<boolean>;
}
