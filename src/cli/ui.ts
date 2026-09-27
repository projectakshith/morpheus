import pc from "picocolors";
import { theme } from "./theme.js";
import { MarkdownFormatter } from "./format.js";

export class UI {
  private lastWasStream = false;
  private lineBuffer = "";
  private formatter = new MarkdownFormatter();

  banner(version: string) {
    console.log();
    console.log(theme.brightGreen(" ◬ MORPHEUS ") + theme.dim(`v${version}`));
    console.log(theme.dim("   Agentic Coding Harness"));
    console.log();
  }

  streamChunk(chunk: string) {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split("\n");
    // All elements except the last one are complete lines
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

  startTool(name: string, args: Record<string, unknown>) {
    this.flushStream();

    if (this.lastWasStream) {
      console.log();
      this.lastWasStream = false;
    }

    let detail = "";
    if (typeof args.command === "string") {
      detail = `$ ${args.command}`;
    } else if (typeof args.filePath === "string") {
      detail = args.filePath;
      if (typeof args.offset === "number" || typeof args.limit === "number") {
        detail += ` (L${args.offset ?? 1}+${args.limit ?? 2000})`;
      }
    } else {
      const raw = JSON.stringify(args);
      detail = raw.length > 80 ? `${raw.slice(0, 80)}...` : raw;
    }

    console.log(`  ${pc.cyan("⚙")} ${pc.bold("[Operator]")} ${pc.cyan(name)} ${pc.dim(detail)}`);
  }

  finishTool(name: string, output: string, isError = false) {
    const rawLines = output.trim().split("\n");
    const lines = rawLines.filter((l) => l.trim().length > 0);

    if (isError) {
      const errLines = lines.slice(0, 8);
      for (const line of errLines) {
        console.log(`    ${pc.red("│")} ${pc.red(line.slice(0, 160))}`);
      }
      console.log(`    ${pc.red("✖")} ${pc.red("Execution failed")}\n`);
      return;
    }

    const maxPreview = 8;
    const preview = lines.slice(0, maxPreview);

    if (lines.length > 0) {
      for (const line of preview) {
        console.log(`    ${pc.dim("│")} ${pc.dim(line.slice(0, 160))}`);
      }
      if (lines.length > maxPreview) {
        console.log(`    ${pc.dim("│")} ${pc.dim(`... (${lines.length - maxPreview} more lines)`)}`);
      }
    }

    const summary = lines.length > maxPreview
      ? `${lines.length} lines output`
      : "done";

    console.log(`    ${pc.green("✔")} ${pc.dim(summary)}\n`);
  }

  error(message: string) {
    console.error(`\n${theme.errorBadge("ERROR")} ${theme.red(message)}\n`);
  }
}
