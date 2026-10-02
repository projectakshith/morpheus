import React from "react";
import { render } from "ink";
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { App } from "./components/App";
import { parseCLIArgs } from "./args";
import { closeMcpConnections } from "../tools/mcp";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load project-specific .env from current working directory
dotenv.config();

// 2. Load global user .env if present (~/.morpheus/.env)
const userEnv = path.join(os.homedir(), ".morpheus", ".env");
if (fs.existsSync(userEnv)) {
  dotenv.config({ path: userEnv });
}

// 3. Fallback to package repository .env
const repoEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(repoEnv)) {
  dotenv.config({ path: repoEnv });
}

/* Auto-spawns Neo background proxy router if not yet running */
async function ensureNeoDaemon(baseURL: string): Promise<void> {
  if (!baseURL.includes("8787") && !baseURL.includes("127.0.0.1:8787")) {
    return;
  }

  const healthUrl = baseURL.endsWith("/v1")
    ? baseURL.replace(/\/v1$/, "/health")
    : `${baseURL}/health`;

  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(300) });
    if (res.ok) return;
  } catch {
    /* Neo not responding, attempt to launch daemon */
  }

  const candidateDirs = [
    path.resolve(process.cwd(), "../neo"),
    path.resolve(process.cwd(), "Developer/neo"),
    path.join(os.homedir(), "Developer", "neo"),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "package.json"))) {
      try {
        const neoProc = spawn("npm", ["start"], {
          cwd: dir,
          detached: true,
          stdio: "ignore",
        });
        neoProc.unref();

        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 100));
          try {
            const check = await fetch(healthUrl, {
              signal: AbortSignal.timeout(200),
            });
            if (check.ok) return;
          } catch {}
        }
      } catch {
        /* Fallthrough */
      }
    }
  }
}

export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCLIArgs(args);
  const isVerbose = parsed.isVerbose;
  const isLocal = parsed.isLocal;
  let model = parsed.model;
  let baseURL = parsed.baseURL;
  const initialTask = parsed.task;

  if (isLocal) {
    baseURL = baseURL || "http://localhost:11434/v1";
    if (!model) {
      model = process.env.MORPHEUS_LOCAL_MODEL || "qwen2.5-coder:7b";
    }
  } else {
    baseURL = baseURL || process.env.MORPHEUS_BASE_URL || "http://127.0.0.1:8787/v1";
    if (!model) {
      model = process.env.MORPHEUS_MODEL || "flash";
    }
    await ensureNeoDaemon(baseURL);
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      model,
      isLocal,
      baseURL,
      isVerbose,
      initialTask,
      maxSteps: parsed.maxSteps,
      resumeSessionId: parsed.resumeSessionId,
    }),
    { alternateScreen: true }
  );

  await waitUntilExit();
  await closeMcpConnections();
}
