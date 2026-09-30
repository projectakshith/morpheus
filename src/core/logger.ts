import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TokenUsage } from "./types";

export const LOGS_DIR = path.join(os.homedir(), ".morpheus", "logs");

export class SessionLogger {
  private logPath: string = "";
  private latestPath: string = "";
  private startTime: number = Date.now();
  private buffer: string[] = [];

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = Math.random().toString(36).slice(2, 8);
    this.logPath = path.join(LOGS_DIR, `session_${timestamp}_${id}.log`);
    this.latestPath = path.join(LOGS_DIR, "latest.log");
  }

  getLogPath(): string {
    return this.logPath;
  }

  getLatestPath(): string {
    return this.latestPath;
  }

  async init(task: string, cwd: string, model: string, tokenBudget?: number) {
    try {
      await fs.mkdir(LOGS_DIR, { recursive: true });
      this.startTime = Date.now();
      const header = [
        "============================================================",
        `MORPHEUS SESSION LOG - ${new Date().toISOString()}`,
        `CWD: ${cwd}`,
        `Model: ${model}`,
        ...(tokenBudget ? [`Token Budget: ${tokenBudget.toLocaleString()} total`] : []),
        `Task: ${task}`,
        "============================================================",
        "",
      ].join("\n");
      this.buffer.push(header);
      await this.flush();
    } catch {
    }
  }

  async logStep(step: number) {
    this.buffer.push(`\n[STEP ${step}] ----------------------------------------`);
    await this.flush();
  }

  async logToolCall(step: number, name: string, args: Record<string, unknown>) {
    const serializedArgs = JSON.stringify(args, null, 2);
    this.buffer.push(`[TOOL CALL] ${name}\nArguments:\n${serializedArgs}`);
    await this.flush();
  }

  async logToolResult(step: number, name: string, output: string, isError: boolean) {
    const status = isError ? "FAILED" : "SUCCESS";
    this.buffer.push(`[TOOL RESULT] ${name} (${status})\nOutput:\n${output}\n`);
    await this.flush();
  }

  async logUsage(
    step: number,
    promptTokens: number,
    completionTokens: number,
    details: { reported?: boolean; cachedInputTokens?: number; cacheCreationInputTokens?: number; reasoningTokens?: number } = {}
  ) {
    const breakdown = [
      details.cachedInputTokens ? `${details.cachedInputTokens.toLocaleString()} cached` : "",
      details.cacheCreationInputTokens ? `${details.cacheCreationInputTokens.toLocaleString()} cache-write` : "",
      details.reasoningTokens ? `${details.reasoningTokens.toLocaleString()} reasoning` : "",
      details.reported === false ? "provider usage unavailable" : "",
    ].filter(Boolean).join(" | ");
    this.buffer.push(`[USAGE] Step ${step}: ${promptTokens.toLocaleString()} in | ${completionTokens.toLocaleString()} out${breakdown ? ` | ${breakdown}` : ""}`);
    await this.flush();
  }

  async logToolTiming(step: number, name: string, durationMs: number, outputBytes: number) {
    this.buffer.push(`[TOOL METRIC] Step ${step}: ${name} ${durationMs}ms, ${outputBytes} output bytes`);
    await this.flush();
  }

  async logStopReason(reason: string) {
    this.buffer.push(`[TURN OUTCOME] ${reason}`);
    await this.flush();
  }

  async logAssistantResponse(text: string) {
    this.buffer.push(`\n[ASSISTANT RESPONSE]\n${text}\n`);
    await this.flush();
  }

  async logFinish(usage: TokenUsage, aborted = false) {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const summary = [
      "",
      "============================================================",
      `SESSION COMPLETED in ${duration}s (Aborted: ${aborted})`,
      `Token Usage: ${usage.promptTokens.toLocaleString()} in | ${usage.completionTokens.toLocaleString()} out | ${usage.totalTokens.toLocaleString()} total` +
        (usage.peakContextTokens
          ? ` | Peak Context: ${usage.peakContextTokens.toLocaleString()}/${usage.contextLimit ? usage.contextLimit.toLocaleString() : "?"}`
          : ""),
      "============================================================",
      "",
    ].join("\n");
    this.buffer.push(summary);
    await this.flush();

    /* Atomically update latest.log once at session finish to avoid quadratic disk read/writes */
    try {
      await fs.copyFile(this.logPath, this.latestPath);
    } catch {
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const content = this.buffer.join("\n") + "\n";
    this.buffer = [];
    try {
      await fs.appendFile(this.logPath, content, "utf-8");
    } catch {
    }
  }
}
