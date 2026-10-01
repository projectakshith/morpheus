import fs from "node:fs";
import { execFile } from "node:child_process";

export interface FetchPageResult {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
  renderedWith?: "http" | "chromium";
}

export interface UplinkDriver {
  fetchPage(url: string, signal?: AbortSignal, timeoutMs?: number): Promise<FetchPageResult>;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/**
 * Discovers a local Chromium-based browser binary (Brave, Chrome, Arc, or system Chromium).
 */
export function findChromiumBinary(): string | undefined {
  const candidates = [
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

/**
 * Executes a headless Chromium browser instance to hydrate client-side SPAs (React/Vue/Next).
 */
export function renderWithChromium(
  binaryPath: string,
  url: string,
  timeoutMs: number = 15000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Chromium render timed out after ${timeoutMs}ms for ${url}`));
    }, timeoutMs);

    execFile(
      binaryPath,
      ["--headless", "--disable-gpu", "--dump-dom", url],
      { maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(stdout || "");
        }
      }
    );
  });
}

/**
 * Checks if the HTML is an un-hydrated single-page application shell.
 */
function isClientSpaShell(html: string): boolean {
  const isMinimalText = html.replace(/<[^>]+>/g, "").trim().length < 200;
  const hasSpaMarkers =
    /<div id="(root|__next|app)">\s*<\/div>/i.test(html) ||
    /<app-root>\s*<\/app-root>/i.test(html) ||
    /enable javascript/i.test(html);

  return isMinimalText && hasSpaMarkers;
}

/**
 * Hybrid UplinkDriver: Ultra-fast HTTP fetch by default, automatically escalating
 * to headless Chromium when client-side JavaScript hydration is detected.
 */
export class HttpDriver implements UplinkDriver {
  private userAgent: string;
  private chromiumPath?: string;

  constructor(userAgent: string = DEFAULT_USER_AGENT) {
    this.userAgent = userAgent;
    this.chromiumPath = findChromiumBinary();
  }

  async fetchPage(
    url: string,
    signal?: AbortSignal,
    timeoutMs: number = 15000
  ): Promise<FetchPageResult> {
    if (!url || typeof url !== "string") {
      throw new Error("URL is required and must be a valid string");
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        throw new Error("Request cancelled by agent");
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/markdown,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);

      const contentType = response.headers.get("content-type") || "text/html";
      let rawText = await response.text();
      let renderedWith: "http" | "chromium" = "http";

      // If page is an empty client-side SPA shell and Chromium is available, hydrate with Chromium
      if (isClientSpaShell(rawText) && this.chromiumPath) {
        try {
          const hydratedDom = await renderWithChromium(this.chromiumPath, url, timeoutMs);
          if (hydratedDom && hydratedDom.length > rawText.length) {
            rawText = hydratedDom;
            renderedWith = "chromium";
          }
        } catch {
          // Gracefully retain original HTML on failure
        }
      }

      return {
        html: rawText,
        finalUrl: response.url || url,
        status: response.status,
        contentType,
        renderedWith,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (timedOut) {
        throw new Error(`Uplink request timed out after ${timeoutMs}ms for ${url}`);
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Uplink request aborted");
      }
      throw err;
    }
  }
}
