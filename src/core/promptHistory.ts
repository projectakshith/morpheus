import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_ENTRIES = 500;

function historyPath(): string {
  return path.join(os.homedir(), ".morpheus", "history.json");
}

export function trimHistory(entries: string[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    const text = entry.trim();
    if (!text || out[out.length - 1] === text) continue;
    out.push(text);
  }
  return out.slice(-MAX_ENTRIES);
}

export function loadPromptHistory(filePath = historyPath()): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? trimHistory(parsed.filter((e): e is string => typeof e === "string")) : [];
  } catch {
    return [];
  }
}

export function savePromptHistory(entries: string[], filePath = historyPath()): void {
  try {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmpPath, `${JSON.stringify(trimHistory(entries), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  } catch {
  }
}
