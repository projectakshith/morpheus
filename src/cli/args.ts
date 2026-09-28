/*
 * CLI argument parser: extracts model, flags, step limits, session resumption, and initial tasks.
 */

export interface ParsedCLIArgs {
  isVerbose: boolean;
  isLocal: boolean;
  isNeo: boolean;
  model?: string;
  baseURL?: string;
  maxSteps?: number;
  resumeSessionId?: string | boolean;
  task: string;
}

export function parseCLIArgs(args: string[] = process.argv.slice(2)): ParsedCLIArgs {
  let isVerbose = false;
  let isLocal = false;
  let isNeo = false;
  let model: string | undefined;
  let baseURL: string | undefined;
  let maxSteps: number | undefined;
  let resumeSessionId: string | boolean | undefined;
  const remainingArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-v" || arg === "--verbose") {
      isVerbose = true;
    } else if (arg === "--neo") {
      isNeo = true;
      baseURL = baseURL || "http://127.0.0.1:8787/v1";
    } else if (arg === "--local" || arg === "--ollama") {
      isLocal = true;
    } else if (arg === "-m" || arg === "--model") {
      if (i + 1 < args.length) {
        model = args[++i];
      }
    } else if (arg === "--base-url") {
      if (i + 1 < args.length) {
        baseURL = args[++i];
      }
    } else if (arg === "-s" || arg === "--max-steps") {
      if (i + 1 < args.length) {
        const parsedNum = parseInt(args[++i], 10);
        if (!isNaN(parsedNum) && parsedNum > 0) {
          maxSteps = parsedNum;
        }
      }
    } else if (arg === "-r" || arg === "--resume") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        resumeSessionId = args[++i];
      } else {
        resumeSessionId = true;
      }
    } else if (arg === "--session") {
      if (i + 1 < args.length) {
        resumeSessionId = args[++i];
      }
    } else {
      remainingArgs.push(arg);
    }
  }

  return {
    isVerbose,
    isLocal,
    isNeo,
    model,
    baseURL,
    maxSteps,
    resumeSessionId,
    task: remainingArgs.join(" ").trim(),
  };
}
