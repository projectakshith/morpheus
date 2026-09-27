import pc from "picocolors";
import { theme } from "./theme";
import { MarkdownFormatter } from "./format";
import type { TokenUsage } from "../core/types";

export class UI {
  private lastWasStream = false;
  private lineBuffer = "";
  private formatter = new MarkdownFormatter();
  private verbose = false;
  private isThinking = false;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = Boolean(options.verbose);
  }

  banner(version: string) {
    console.log();
    console.log(theme.brightGreen(" ◬ MORPHEUS ") + theme.dim(`v${version}`));
    console.log(theme.dim("   Agentic Coding Harness"));
    if (this.verbose) {
      console.log(theme.dim("   [Verbose mode active - full tool streams enabled]"));
    }
    console.log();
  }

  streamChunk(chunk: string) {
    if (this.isThinking) {
      console.log();
      this.isThinking = false;
    }
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const outputLines = this.formatter.processLine(line);
      for (const out of outputLines) {
        console.log(out);
      }
    }
    this.lastWasStream = true;
  }

  flushStream() {
    if (this.lineBuffer.length > 0) {
      const outputLines = this.formatter.processLine(this.lineBuffer);
      for (const out of outputLines) {
        console.log(out);
      }
      this.lineBuffer = "";
    }

    const remaining = this.formatter.flush();
    for (const out of remaining) {
      console.log(out);
    }
  }

  startStep(step: number) {
    this.flushStream();
    if (this.isThinking) {
      console.log();
      this.isThinking = false;
    }
    if (this.lastWasStream) {
      console.log();
      this.lastWasStream = false;
    }
    if (step > 1) {
      console.log(pc.dim(`\n── Step ${step} ──────────────────────────────────────────────\n`));
    }
  }

  streamReasoning(chunk: string) {
    this.isThinking = true;
    process.stdout.write(pc.dim(chunk));
    this.lastWasStream = true;
  }

  startTool(name: string, args: Record<string, unknown>) {
    this.flushStream();
    if (this.isThinking) {
      console.log();
      this.isThinking = false;
    }

    if (this.lastWasStream) {
      console.log();
      this.lastWasStream = false;
    }

    console.log(`  ${pc.cyan("⚙")} ${pc.bold("[Operator]")} Calling ${pc.cyan(name)}`);
    const entries = Object.entries(args);
    if (entries.length > 0) {
      for (const [key, val] of entries) {
        const valStr = typeof val === "string" ? val : JSON.stringify(val);
        console.log(`    ${pc.dim("↳")} ${pc.dim(key)}: ${pc.yellow(valStr.length > 120 ? valStr.slice(0, 120) + "..." : valStr)}`);
      }
    }
  }

  finishTool(name: string, output: string, isError = false) {
    const rawLines = output.trim().split("\n");
    const lines = rawLines.filter((l) => l.trim().length > 0);

    if (isError) {
      const errLimit = this.verbose ? 100 : 25;
      const errLines = lines.slice(0, errLimit);
      for (const line of errLines) {
        console.log(`    ${pc.red("│")} ${pc.red(line.slice(0, 200))}`);
      }
      if (lines.length > errLimit) {
        console.log(`    ${pc.red("│")} ${pc.dim(`... (${lines.length - errLimit} more error lines)`)}`);
      }
      console.log(`    ${pc.red("✖")} ${pc.red("Execution failed")}\n`);
      return;
    }

    const isDiff = lines.some((l) => l.startsWith("@@") || l.startsWith("---") || l.startsWith("+++"));
    const maxLines = this.verbose ? 300 : isDiff ? 12 : 4;
    const preview = lines.slice(0, maxLines);

    if (lines.length > 0) {
      for (const line of preview) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          console.log(`    ${pc.green("│")} ${pc.green(line.slice(0, 160))}`);
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          console.log(`    ${pc.red("│")} ${pc.red(line.slice(0, 160))}`);
        } else if (line.startsWith("@@")) {
          console.log(`    ${pc.cyan("│")} ${pc.cyan(line.slice(0, 160))}`);
        } else {
          console.log(`    ${pc.dim("│")} ${pc.dim(line.slice(0, 160))}`);
        }
      }
      if (lines.length > maxLines) {
        console.log(`    ${pc.dim("│")} ${pc.dim(`... (${lines.length - maxLines} more lines)`)}`);
      }
    }

    const summary = `${lines.length} lines output`;
    console.log(`    ${pc.green("✔")} ${pc.dim(summary)}\n`);
  }

  showUsage(usage: TokenUsage) {
    if (usage.totalTokens === 0) return;
    const inStr = pc.cyan(`${usage.promptTokens.toLocaleString()} in`);
    const outStr = pc.cyan(`${usage.completionTokens.toLocaleString()} out`);
    const totalStr = pc.dim(`(${usage.totalTokens.toLocaleString()} total API roundtrips)`);
    console.log(`\n  ${pc.dim("⚡ Tokens:")} ${inStr} ${pc.dim("·")} ${outStr} ${totalStr}`);
  }

  showLog(logPath: string) {
    console.log(`  ${pc.dim("📜 Session log:")} ${pc.cyan(logPath)}`);
  }

  stopped(reason = "Esc") {
    this.flushStream();
    console.log(`\n  ${pc.yellow("⚠")} ${pc.yellow(`Run stopped by user (${reason})`)}`);
  }

  error(message: string) {
    console.error(`\n${theme.errorBadge("ERROR")} ${theme.red(message)}\n`);
  }
}
