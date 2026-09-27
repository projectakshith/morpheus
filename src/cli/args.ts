export interface ParsedCLIArgs {
  isVerbose: boolean;
  isLocal: boolean;
  model?: string;
  baseURL?: string;
  task: string;
}

export function parseCLIArgs(args: string[] = process.argv.slice(2)): ParsedCLIArgs {
  let isVerbose = false;
  let isLocal = false;
  let model: string | undefined;
  let baseURL: string | undefined;
  const remainingArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-v" || arg === "--verbose") {
      isVerbose = true;
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
    } else {
      remainingArgs.push(arg);
    }
  }

  return {
    isVerbose,
    isLocal,
    model,
    baseURL,
    task: remainingArgs.join(" ").trim(),
  };
}
