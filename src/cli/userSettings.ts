import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SubagentRole } from "../core/types.js";

export type SubagentModelMap = Partial<Record<SubagentRole, string>>;

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
