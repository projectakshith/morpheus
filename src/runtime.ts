import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLOUD_BASE_URL = "https://morpheus-cloud.akshitrajesh2020.workers.dev/v1";
export const CLOUD_MODEL = "deepseek/deepseek-v4-flash";

function neoDirs(): string[] {
  return [
    path.resolve(process.cwd(), "../neo"),
    path.resolve(process.cwd(), "Developer/neo"),
    path.join(os.homedir(), "Developer", "neo"),
  ];
}

export function neoInstalled(): boolean {
  return neoDirs().some((dir) => fs.existsSync(path.join(dir, "package.json")));
}

export function isCloudEndpoint(baseURL: string | undefined): boolean {
  return Boolean(baseURL?.startsWith(CLOUD_BASE_URL));
}

export function applyCloudFallback(env: NodeJS.ProcessEnv = process.env, hasNeo: boolean = neoInstalled()): void {
  if (env.MORPHEUS_BASE_URL || hasNeo || env.MORPHEUS_CLOUD === "0") return;
  env.MORPHEUS_BASE_URL = env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : CLOUD_BASE_URL;
  env.MORPHEUS_MODEL ??= CLOUD_MODEL;
}

export function loadEnv(): void {
  dotenv.config();

  const userEnv = path.join(os.homedir(), ".morpheus", ".env");
  if (fs.existsSync(userEnv)) {
    dotenv.config({ path: userEnv });
  }

  const repoEnv = path.resolve(__dirname, "../.env");
  if (fs.existsSync(repoEnv)) {
    dotenv.config({ path: repoEnv });
  }

  applyCloudFallback();
}

export function resolveEndpoint(opts: { isLocal?: boolean; model?: string; baseURL?: string }): {
  model: string;
  baseURL: string;
} {
  if (opts.isLocal) {
    return {
      baseURL: opts.baseURL || "http://localhost:11434/v1",
      model: opts.model || process.env.MORPHEUS_LOCAL_MODEL || "qwen2.5-coder:7b",
    };
  }
  return {
    baseURL: opts.baseURL || process.env.MORPHEUS_BASE_URL || "http://127.0.0.1:8787/v1",
    model: opts.model || process.env.MORPHEUS_MODEL || "flash",
  };
}

export async function ensureNeoDaemon(baseURL: string): Promise<void> {
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
  }

  for (const dir of neoDirs()) {
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
      }
    }
  }
}
