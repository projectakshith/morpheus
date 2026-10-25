import type { ProgramId, SubagentRole } from "./types";
import { getProgram } from "./registry";

export type ProgramRunStatus = "running" | "completed" | "failed";

export interface ProgramRunRecord {
  runId: string;
  programId: ProgramId;
  callsign: string;
  icon: string;
  role: SubagentRole;
  model: string;
  task: string;
  status: ProgramRunStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
  outputPreview?: string;
  error?: string;
}

export interface ProgramAggregateStats {
  programId: ProgramId;
  callsign: string;
  icon: string;
  role: SubagentRole;
  totalRuns: number;
  activeRuns: number;
  totalTokens: number;
  totalDurationMs: number;
  lastActive?: number;
}

class ProgramTelemetryStore {
  private runs: ProgramRunRecord[] = [];
  private readonly maxRuns = 100;

  public recordStart(input: {
    runId: string;
    programId: ProgramId;
    role: SubagentRole;
    model: string;
    task: string;
  }): ProgramRunRecord {
    const prog = getProgram(input.programId);
    const record: ProgramRunRecord = {
      runId: input.runId,
      programId: input.programId,
      callsign: prog?.callsign ?? input.programId,
      icon: prog?.icon ?? "◈",
      role: input.role,
      model: input.model,
      task: input.task,
      status: "running",
      startedAt: Date.now(),
    };

    this.runs.unshift(record);
    if (this.runs.length > this.maxRuns) {
      this.runs.pop();
    }
    return record;
  }

  public recordFinish(
    runId: string,
    result: {
      tokensUsed?: number;
      status?: "completed" | "failed";
      outputPreview?: string;
      error?: string;
    }
  ): ProgramRunRecord | undefined {
    const record = this.runs.find((r) => r.runId === runId);
    if (!record) return undefined;

    const completedAt = Date.now();
    record.completedAt = completedAt;
    record.durationMs = completedAt - record.startedAt;
    record.status = result.error ? "failed" : result.status ?? "completed";
    record.tokensUsed = result.tokensUsed ?? 0;
    if (result.outputPreview) {
      record.outputPreview = result.outputPreview.slice(0, 300);
    }
    if (result.error) {
      record.error = result.error;
    }
    return record;
  }

  public getRuns(): ProgramRunRecord[] {
    return [...this.runs];
  }

  public getActiveRuns(): ProgramRunRecord[] {
    return this.runs.filter((r) => r.status === "running");
  }

  public getStats(): Record<ProgramId, ProgramAggregateStats> {
    const stats: Partial<Record<ProgramId, ProgramAggregateStats>> = {};

    for (const record of this.runs) {
      if (!stats[record.programId]) {
        stats[record.programId] = {
          programId: record.programId,
          callsign: record.callsign,
          icon: record.icon,
          role: record.role,
          totalRuns: 0,
          activeRuns: 0,
          totalTokens: 0,
          totalDurationMs: 0,
        };
      }
      const s = stats[record.programId]!;
      s.totalRuns++;
      if (record.status === "running") {
        s.activeRuns++;
      }
      s.totalTokens += record.tokensUsed ?? 0;
      s.totalDurationMs += record.durationMs ?? 0;
      if (!s.lastActive || record.startedAt > s.lastActive) {
        s.lastActive = record.startedAt;
      }
    }

    return stats as Record<ProgramId, ProgramAggregateStats>;
  }

  public clear(): void {
    this.runs = [];
  }
}

export const programTelemetry = new ProgramTelemetryStore();
