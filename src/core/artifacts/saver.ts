import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const REPORTS_DIR = path.join(os.homedir(), ".morpheus", "reports");
export const CHECKPOINTS_DIR = path.join(os.homedir(), ".morpheus", "checkpoints");

export interface SavedArtifact {
  filename: string;
  globalPath: string;
  workspacePath?: string;
}

export async function saveWorkflowArtifact(
  cwd: string,
  filename: string,
  content: string,
  archetype?: string
): Promise<SavedArtifact> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = archetype ? `${archetype}_` : "";
  const globalFilename = `${prefix}${timestamp}_${filename}`;
  const globalPath = path.join(REPORTS_DIR, globalFilename);

  await fs.writeFile(globalPath, content, "utf8");

  let workspacePath: string | undefined;
  try {
    const wsTarget = path.join(cwd, filename);
    await fs.writeFile(wsTarget, content, "utf8");
    workspacePath = wsTarget;
  } catch {
    // If workspace is read-only or outside cwd, global copy is preserved.
  }

  return {
    filename,
    globalPath,
    workspacePath,
  };
}

export async function saveCompactionCheckpoint(
  sessionId: string | undefined,
  summaryText: string
): Promise<string> {
  await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sid = sessionId ? `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}_` : "";
  const filename = `checkpoint_${sid}${timestamp}.md`;
  const fullPath = path.join(CHECKPOINTS_DIR, filename);

  const header = [
    "# Morpheus Context Compaction Checkpoint",
    `Timestamp: ${new Date().toISOString()}`,
    ...(sessionId ? [`Session ID: ${sessionId}`] : []),
    "",
    "---",
    "",
  ].join("\n");

  await fs.writeFile(fullPath, `${header}${summaryText}\n`, "utf8");
  return fullPath;
}
