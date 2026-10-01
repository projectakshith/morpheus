import { HttpDriver, type UplinkDriver } from "./engine";
import { parseHtmlToAgentMarkdown } from "./parser";
import type { UplinkPage } from "./types";

export interface UplinkSessionOptions {
  driver?: UplinkDriver;
  windowLines?: number;
}

export class UplinkSession {
  private driver: UplinkDriver;
  private history: string[] = [];
  private historyIndex: number = -1;
  private activePage?: UplinkPage;
  private scrollOffset: number = 0;
  private windowLines: number;

  constructor(options: UplinkSessionOptions = {}) {
    this.driver = options.driver ?? new HttpDriver();
    this.windowLines = options.windowLines ?? 400;
  }

  get currentUrl(): string | undefined {
    return this.activePage?.url;
  }

  get currentPage(): UplinkPage | undefined {
    return this.activePage;
  }

  get historyList(): readonly string[] {
    return this.history;
  }

  /**
   * Navigates to a new URL, parses the HTML into structured agent markdown,
   * resets the scroll offset, and adds to history.
   */
  async navigate(url: string, signal?: AbortSignal): Promise<string> {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("Cannot navigate to empty URL");
    }

    const { html, finalUrl, status } = await this.driver.fetchPage(trimmed, signal);
    const parsedPage = parseHtmlToAgentMarkdown(html, finalUrl, status);

    this.activePage = parsedPage;
    this.scrollOffset = 0;

    // Manage history stack
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(finalUrl);
    this.historyIndex = this.history.length - 1;

    return this.renderView();
  }

  /**
   * Interacts with an indexed element reference (e.g. click a link [1]).
   */
  async click(ref: number, signal?: AbortSignal): Promise<string> {
    if (!this.activePage) {
      throw new Error("No active browser page. Use action='navigate' with a URL first.");
    }

    const element = this.activePage.elements.get(ref);
    if (!element) {
      const maxRef = this.activePage.elements.size;
      throw new Error(
        `Invalid reference [${ref}]. Active page has elements [1] to [${maxRef}]. Use snapshot to see available elements.`
      );
    }

    if (element.tag === "a" && element.href) {
      return await this.navigate(element.href, signal);
    }

    if (element.tag === "button") {
      return `Clicked button [${ref}] "${element.text}". (Static inspection mode: for dynamic form submission, verify backend endpoint or navigate to target URL).`;
    }

    return `Element [${ref}] is a ${element.tag} (${element.text}).`;
  }

  /**
   * Scrolls the viewport up or down within the current page.
   */
  scroll(direction: "up" | "down" = "down", lines?: number): string {
    if (!this.activePage) {
      throw new Error("No active browser page to scroll. Navigate to a URL first.");
    }

    const delta = lines ?? this.windowLines;
    const allLines = this.activePage.content.split("\n");
    const totalLines = allLines.length;

    if (direction === "down") {
      if (this.scrollOffset + this.windowLines >= totalLines) {
        return `Reached bottom of page (${totalLines} total lines).\n\n${this.renderView()}`;
      }
      this.scrollOffset = Math.min(this.scrollOffset + delta, Math.max(0, totalLines - this.windowLines));
    } else {
      if (this.scrollOffset <= 0) {
        return `Reached top of page.\n\n${this.renderView()}`;
      }
      this.scrollOffset = Math.max(0, this.scrollOffset - delta);
    }

    return this.renderView();
  }

  /**
   * Searches the active page for a keyword or heading and jumps the viewport directly to it.
   */
  find(query: string): string {
    if (!this.activePage) {
      throw new Error("No active browser page to search. Navigate to a URL first.");
    }

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      throw new Error("Search query inside page cannot be empty.");
    }

    const allLines = this.activePage.content.split("\n");
    let matchIdx = -1;

    // Pass 1: Prioritize matching headings
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (/^#{1,4}\s+/.test(line) && line.toLowerCase().includes(trimmed)) {
        matchIdx = i;
        break;
      }
    }

    // Pass 2: Any matching line
    if (matchIdx === -1) {
      for (let i = 0; i < allLines.length; i++) {
        if (allLines[i].toLowerCase().includes(trimmed)) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx === -1) {
      return `No matches found for "${query}" on this page.\n\n${this.renderView()}`;
    }

    // Jump scroll offset to 2 lines before match for context
    this.scrollOffset = Math.max(0, matchIdx - 2);
    return `[Jumped to match for "${query}" at line ${matchIdx + 1}]\n\n${this.renderView()}`;
  }

  /**
   * Navigates back in browser history.
   */
  async back(signal?: AbortSignal): Promise<string> {
    if (this.historyIndex <= 0) {
      return "Cannot go back: at beginning of browser history.";
    }

    this.historyIndex--;
    const previousUrl = this.history[this.historyIndex];
    return await this.navigate(previousUrl, signal);
  }

  /**
   * Navigates forward in browser history.
   */
  async forward(signal?: AbortSignal): Promise<string> {
    if (this.historyIndex >= this.history.length - 1) {
      return "Cannot go forward: at latest page in browser history.";
    }

    this.historyIndex++;
    const nextUrl = this.history[this.historyIndex];
    return await this.navigate(nextUrl, signal);
  }

  /**
   * Renders the current view of the page window with status bar.
   */
  renderView(): string {
    if (!this.activePage) {
      return "Browser is empty. Use action='navigate' with a URL to begin.";
    }

    const allLines = this.activePage.content.split("\n");
    const totalLines = allLines.length;
    const startLine = this.scrollOffset;
    const endLine = Math.min(this.scrollOffset + this.windowLines, totalLines);
    const windowSlice = allLines.slice(startLine, endLine).join("\n");

    const header = [
      `[UPLINK BROWSER] ${this.activePage.url} · HTTP ${this.activePage.status}`,
      `Title: ${this.activePage.title}`,
      `Showing lines ${startLine + 1}-${endLine} of ${totalLines} · Elements: [1]-[${this.activePage.elements.size}]`,
      totalLines > endLine ? `[Tip: use action='scroll', direction='down' to read next lines]` : `[End of page]`,
      "────────────────────────────────────────────────────────────────",
    ].join("\n");

    return `${header}\n\n${windowSlice}`;
  }
}
