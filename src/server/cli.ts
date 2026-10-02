/*
 * `morpheus serve`: boots the headless daemon. Deliberately avoids importing the Ink TUI.
 */

import os from "node:os";
import { parseArgs } from "node:util";
import pc from "picocolors";
import { loadEnv, resolveEndpoint, ensureNeoDaemon } from "../runtime.js";
import { closeMcpConnections } from "../tools/mcp.js";
import { loadSubagentModels } from "../cli/userSettings.js";
import { Operator } from "../provider/operator.js";
import { generateSessionTitle } from "../core/sessionTitle.js";
import { startDaemon } from "./daemon.js";
import { loadOrCreateDaemonConfig, daemonConfigPath } from "./config.js";

const DEFAULT_PORT = 7878;

const USAGE = `usage: morpheus serve [options]

  --host <addr>       interface to bind (default 127.0.0.1; use 0.0.0.0 or a tailscale IP for other devices)
  --port <n>          port (default ${DEFAULT_PORT})
  -m, --model <id>    default model for new sessions
  --base-url <url>    model endpoint (default: neo proxy)
  --local             use ollama
  -s, --max-steps <n> step limit per turn
  --rotate-token      issue a new auth token, disconnecting paired devices
  -v, --verbose       stream raw agent deltas to the daemon log`;

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => Boolean(a && a.family === "IPv4" && !a.internal))
    .map((a) => a.address);
}

export async function runServe(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: String(DEFAULT_PORT) },
      model: { type: "string", short: "m" },
      "base-url": { type: "string" },
      local: { type: "boolean", default: false },
      "max-steps": { type: "string", short: "s" },
      "rotate-token": { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  loadEnv();
  const isLocal = values.local;
  const { model, baseURL } = resolveEndpoint({ isLocal, model: values.model, baseURL: values["base-url"] });
  if (!isLocal) await ensureNeoDaemon(baseURL);

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid --port: ${values.port}`);
  const maxSteps = values["max-steps"] ? Number(values["max-steps"]) : undefined;
  const { token } = loadOrCreateDaemonConfig({ rotate: values["rotate-token"] });

  const daemon = await startDaemon({
    host: values.host,
    port,
    token,
    cwd: process.cwd(),
    model,
    hostDeps: {
      baseURL,
      isLocal,
      maxSteps: maxSteps && maxSteps > 0 ? maxSteps : undefined,
      verbose: values.verbose,
      subagentModels: () => loadSubagentModels(),
      generateTitle: (titleModel, prompt, response) =>
        generateSessionTitle(new Operator({ model: titleModel, baseURL, isLocal }), prompt, response),
    },
  });

  const reachable =
    values.host === "0.0.0.0" ? lanAddresses().map((ip) => `ws://${ip}:${daemon.port}`) : [daemon.url];
  console.log(`${pc.green("●")} ${pc.bold("morpheus daemon")} ${pc.dim(`· ${model} · ${process.cwd()}`)}`);
  for (const url of reachable) console.log(`  ${pc.cyan(url)}`);
  console.log(`  token ${pc.dim(`(${daemonConfigPath()})`)}: ${token}`);
  if (values.host === "127.0.0.1" || values.host === "localhost") {
    console.log(pc.dim("  local only. bind --host 0.0.0.0 or your tailscale IP to reach it from your phone."));
  }

  let closing = false;
  const shutdown = async () => {
    if (closing) process.exit(1);
    closing = true;
    console.log(pc.dim("\nshutting down…"));
    await daemon.close();
    await closeMcpConnections();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
