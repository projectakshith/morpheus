import pc from "picocolors";

export const theme = {
  green: (text: string) => pc.green(text),
  brightGreen: (text: string) => pc.bold(pc.green(text)),
  cyan: (text: string) => pc.cyan(text),

  dim: (text: string) => pc.dim(text),
  bold: (text: string) => pc.bold(text),
  red: (text: string) => pc.red(text),
  yellow: (text: string) => pc.yellow(text),

  badge: (label: string) => pc.bgGreen(pc.black(` ${label} `)),
  toolBadge: (tool: string) => pc.bgCyan(pc.black(` ${tool} `)),
  errorBadge: (label: string) => pc.bgRed(pc.white(` ${label} `)),
};
