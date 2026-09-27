import fs from "node:fs/promises";
import path from "node:path";
import { resolvePathWithFallbacks, exists } from "../utils/filesystem";
import type { ToolResult } from "../core/types";

export interface OutlineParams {
  filePath: string;
}

interface OutlineSymbol {
  lineNum: number;
  symbol: string;
}

export function extractCodeOutline(content: string, ext: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const symbols: OutlineSymbol[] = [];

  const isPython = ext === ".py";
  const isGo = ext === ".go";
  const isRust = ext === ".rs";
  const isJsTs = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }

    if (isPython) {
      if (/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/.test(trimmed)) {
        const match = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        if (match) {
          const isAsync = trimmed.startsWith("async ");
          const args = match[2].trim() ? match[2].trim().slice(0, 40) : "";
          symbols.push({ lineNum, symbol: `${isAsync ? "async " : ""}def ${match[1]}(${args})` });
        }
      } else if (/^class\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^class\s+([a-zA-Z0-9_]+(?:\([^)]*\))?)/);
        if (match) {
          symbols.push({ lineNum, symbol: `class ${match[1]}` });
        }
      } else if (/^@(?:app|router)\.(get|post|put|delete|patch)\(([^)]*)\)/.test(trimmed)) {
        const match = trimmed.match(/^@(?:app|router)\.(get|post|put|delete|patch)\(([^)]*)\)/);
        if (match) {
          symbols.push({ lineNum, symbol: `@app.${match[1]}(${match[2].trim()})` });
        }
      }
    } else if (isGo) {
      if (/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/.test(trimmed)) {
        const match = trimmed.match(/^func\s+(?:\(([^)]+)\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        if (match) {
          const receiver = match[1] ? `(${match[1]}) ` : "";
          const args = match[3].trim() ? match[3].trim().slice(0, 35) : "";
          symbols.push({ lineNum, symbol: `func ${receiver}${match[2]}(${args})` });
        }
      } else if (/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/.test(trimmed)) {
        const match = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
        if (match) {
          symbols.push({ lineNum, symbol: `type ${match[1]} ${match[2]}` });
        }
      }
    } else if (isRust) {
      if (/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/.test(trimmed)) {
        const match = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        if (match) {
          const isPub = trimmed.startsWith("pub ");
          const isAsync = trimmed.includes("async fn");
          const args = match[2].trim() ? match[2].trim().slice(0, 35) : "";
          symbols.push({ lineNum, symbol: `${isPub ? "pub " : ""}${isAsync ? "async " : ""}fn ${match[1]}(${args})` });
        }
      } else if (/^(?:pub\s+)?(struct|enum|trait|impl)\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^(?:pub\s+)?(struct|enum|trait|impl)\s+([a-zA-Z0-9_]+)/);
        if (match) {
          symbols.push({ lineNum, symbol: `${match[1]} ${match[2]}` });
        }
      }
    } else if (isJsTs) {
      if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/.test(trimmed)) {
        const match = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        if (match) {
          const isExport = trimmed.startsWith("export");
          const args = match[2].trim() ? match[2].trim().slice(0, 35) : "";
          symbols.push({ lineNum, symbol: `${isExport ? "export " : ""}function ${match[1]}(${args})` });
        }
      } else if (/^(?:export\s+)?(?:default\s+)?class\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^(?:export\s+)?(?:default\s+)?class\s+([a-zA-Z0-9_]+)/);
        if (match) {
          const isExport = trimmed.startsWith("export");
          symbols.push({ lineNum, symbol: `${isExport ? "export " : ""}class ${match[1]}` });
        }
      } else if (/^(?:export\s+)?(?:type|interface)\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^(?:export\s+)?(type|interface)\s+([a-zA-Z0-9_]+)/);
        if (match) {
          const isExport = trimmed.startsWith("export");
          symbols.push({ lineNum, symbol: `${isExport ? "export " : ""}${match[1]} ${match[2]}` });
        }
      } else if (/^(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|:)/.test(trimmed)) {
        const match = trimmed.match(/^(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)/);
        if (match) {
          const isExport = trimmed.startsWith("export");
          const args = match[2].trim() ? match[2].trim().slice(0, 35) : "";
          symbols.push({ lineNum, symbol: `${isExport ? "export " : ""}const ${match[1]} = (${args}) =>` });
        }
      }
    } else if (ext === ".md") {
      if (/^#{1,4}\s+/.test(trimmed)) {
        symbols.push({ lineNum, symbol: trimmed });
      }
    }
  }

  return symbols;
}

export async function outlineCode(
  params: OutlineParams,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  if (!params.filePath) {
    throw new Error("Missing required parameter: filePath");
  }

  const targetPath = await resolvePathWithFallbacks(params.filePath, cwd);
  if (!(await exists(targetPath))) {
    throw new Error(`File not found: ${params.filePath}`);
  }

  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${params.filePath}. Use list_dir instead.`);
  }

  const content = await fs.readFile(targetPath, "utf-8");
  const ext = path.extname(targetPath).toLowerCase();
  const totalLines = content.split("\n").length;
  const symbols = extractCodeOutline(content, ext);

  if (symbols.length === 0) {
    return {
      output: `${params.filePath} (${totalLines} lines): No top-level functions, classes, or types identified. Use read_file to inspect raw contents.`,
    };
  }

  const maxSymbols = 50;
  const displaySymbols = symbols.slice(0, maxSymbols);
  const formattedLines = displaySymbols.map(
    (s) => `  ${String(s.lineNum).padStart(4, " ")}: ${s.symbol}`
  );

  if (symbols.length > maxSymbols) {
    formattedLines.push(`  ... [${symbols.length - maxSymbols} more symbols omitted]`);
  }

  const output = [
    `${params.filePath} (${totalLines} lines, ${symbols.length} symbols):`,
    ...formattedLines,
  ].join("\n");

  return { output };
}
