import React from "react";
import { render } from "ink";
import { App } from "./components/App";
import { parseCLIArgs } from "./args";
import { closeMcpConnections } from "../tools/mcp";
import { loadEnv, resolveEndpoint, ensureNeoDaemon } from "../runtime";

loadEnv();

export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCLIArgs(args);
  const isVerbose = parsed.isVerbose;
  const isLocal = parsed.isLocal;
  const initialTask = parsed.task;

  const { model, baseURL } = resolveEndpoint({ isLocal, model: parsed.model, baseURL: parsed.baseURL });
  if (!isLocal) await ensureNeoDaemon(baseURL);

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
