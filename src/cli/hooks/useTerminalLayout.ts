import { useWindowSize } from "ink";

export interface TerminalLayout {
  terminalWidth: number;
  terminalHeight: number;
  isSplitLayout: boolean;
  leftWidth: number;
  rightWidth: number;
  headerHeight: number;
  statusBarHeight: number;
  inputBoxHeight: number;
  workspaceHeight: number;
  feedHeight: number;
  maxLineWidth: number;
}

export function useTerminalLayout(isThinking: boolean = false): TerminalLayout {
  const { columns, rows } = useWindowSize();

  const terminalWidth = columns || process.stdout.columns || 80;
  const terminalHeight = rows || process.stdout.rows || 24;
  const isSplitLayout = terminalWidth >= 72;
  const leftWidth = isSplitLayout ? Math.floor(terminalWidth * 0.58) : terminalWidth;
  const rightWidth = isSplitLayout ? terminalWidth - leftWidth : 0;

  const headerHeight = 2;
  const statusBarHeight = isSplitLayout ? 0 : 2;
  const inputBoxHeight = 3;
  const workspaceHeight = Math.max(4, terminalHeight - headerHeight - statusBarHeight - inputBoxHeight);
  const feedHeight = workspaceHeight;
  const maxLineWidth = Math.max(20, leftWidth - 6);

  return {
    terminalWidth,
    terminalHeight,
    isSplitLayout,
    leftWidth,
    rightWidth,
    headerHeight,
    statusBarHeight,
    inputBoxHeight,
    workspaceHeight,
    feedHeight,
    maxLineWidth,
  };
}
