import React from "react";
import { render } from "ink";
import dotenv from "dotenv";
import { App } from "./components/App";
import { parseCLIArgs } from "./args";

dotenv.config();

/* Launches Morpheus interactive TUI or executes one-shot task with Ink rendering */
export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCLIArgs(args);
  const isVerbose = parsed.isVerbose;
  const isLocal = parsed.isLocal;
  let model = parsed.model;
  const baseURL = parsed.baseURL;
  const initialTask = parsed.task;

  if (isLocal && !model) {
    model = process.env.MORPHEUS_LOCAL_MODEL || "qwen2.5-coder:7b";
  } else if (!model) {
    model =
      process.env.MORPHEUS_MODEL ||
      process.env.OPENROUTER_MODEL ||
      "stealth/space-bunny-alpha";
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      model,
      isLocal,
      baseURL,
      isVerbose,
      initialTask,
      maxSteps: parsed.maxSteps,
    })
  );

  await waitUntilExit();
}
