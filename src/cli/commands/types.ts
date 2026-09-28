import type React from "react";
import type { Thread } from "../types.js";

export interface CommandContext {
  taskText: string;
  baseURL: string;
  currentModel: string;
  setCurrentModel: (model: string) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  setThreads: React.Dispatch<React.SetStateAction<Thread[]>>;
  setPromptHistory: React.Dispatch<React.SetStateAction<string[]>>;
  threadsCount: number;
}

export interface CommandHandler {
  readonly name: string;
  readonly description: string;
  readonly aliases?: string[];

  matches(trimmed: string): boolean;
  execute(trimmed: string, ctx: CommandContext): Promise<boolean>;
}
