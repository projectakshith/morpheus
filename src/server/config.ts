/*
 * Daemon credentials in ~/.morpheus/daemon.json (owner-only). The token gates shell access, so treat it like a password.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface DaemonConfig {
  token: string;
}

export function daemonConfigPath(): string {
  return path.join(os.homedir(), ".morpheus", "daemon.json");
}

export function loadOrCreateDaemonConfig(opts: { rotate?: boolean } = {}, filePath = daemonConfigPath()): DaemonConfig {
  if (!opts.rotate) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<DaemonConfig>;
      if (typeof parsed.token === "string" && parsed.token.length >= 32) return { token: parsed.token };
    } catch {
      /* Missing or malformed: mint a fresh token below. */
    }
  }
  const config: DaemonConfig = { token: randomBytes(24).toString("base64url") };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return config;
}
