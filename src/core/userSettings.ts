import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PermissionMode, SubagentRole } from "./types";

export type SubagentModelMap = Partial<Record<SubagentRole, string>>;

export function loadPreferredModel(filePath = settingsPath()): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { preferredModel?: unknown };
    return typeof parsed.preferredModel === "string" && parsed.preferredModel.trim()
      ? parsed.preferredModel.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function savePreferredModel(model: string, filePath = settingsPath()): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) existing = value as Record<string, unknown>;
  } catch {
    // A missing or malformed config should not prevent saving this setting.
  }
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(tmpPath, `${JSON.stringify({ ...existing, preferredModel: model }, null, 2)}\n`, "utf8");
  await fsp.chmod(tmpPath, 0o600);
  await fsp.rename(tmpPath, filePath);
}

export function loadPermissionMode(filePath = settingsPath()): PermissionMode {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { permissionMode?: unknown };
    return parsed.permissionMode === "fullAccess" ? "fullAccess" : "guarded";
  } catch {
    return "guarded";
  }
}

export async function savePermissionMode(mode: PermissionMode, filePath = settingsPath()): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) existing = value as Record<string, unknown>;
  } catch {
    // A missing or malformed config should not prevent saving this setting.
  }
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(tmpPath, `${JSON.stringify({ ...existing, permissionMode: mode }, null, 2)}\n`, "utf8");
  await fsp.chmod(tmpPath, 0o600);
  await fsp.rename(tmpPath, filePath);
}

function settingsPath(): string {
  return path.join(os.homedir(), ".morpheus", "config.json");
}

export function loadSubagentModels(filePath = settingsPath()): SubagentModelMap {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { subagentModels?: Record<string, unknown> };
    const models: SubagentModelMap = {};
    for (const role of ["explore", "review", "implement"] as const) {
      const model = parsed.subagentModels?.[role];
      if (typeof model === "string" && model.trim()) models[role] = model;
    }
    return models;
  } catch {
    return {};
  }
}

export async function saveSubagentModels(models: SubagentModelMap, filePath = settingsPath()): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) existing = value as Record<string, unknown>;
  } catch {
    // A missing or malformed config should not prevent saving worker choices.
  }
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(tmpPath, `${JSON.stringify({ ...existing, subagentModels: models }, null, 2)}\n`, "utf8");
  await fsp.rename(tmpPath, filePath);
}
