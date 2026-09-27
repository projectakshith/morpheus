import { spinner } from "@clack/prompts";
import { theme } from "./theme.js";

export class UI {
  private currentSpinner: ReturnType<typeof spinner> | null = null;

  banner(version: string) {
    console.log();
    console.log(theme.brightGreen(" ◬ MORPHEUS ") + theme.dim(`v${version}`));
    console.log(theme.dim("   Agentic Coding Harness"));
    console.log();
  }

  startTool(name: string, detail?: string) {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }
    const message = detail
      ? `${theme.cyan(name)} ${theme.dim(detail)}`
      : theme.cyan(name);

    this.currentSpinner = spinner();
    this.currentSpinner.start(`[Operator] ${message}`);
  }

  finishTool(success = true) {
    if (this.currentSpinner) {
      if (success) {
        this.currentSpinner.stop(theme.dim("[Operator] done"));
      } else {
        this.currentSpinner.stop(theme.red("[Operator] failed"));
      }
      this.currentSpinner = null;
    }
  }

  error(message: string) {
    console.error(`\n${theme.errorBadge("ERROR")} ${theme.red(message)}\n`);
  }
}
