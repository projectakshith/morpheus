import { truncateOutput } from "./construct";
import type { ToolResult } from "../core/types";
import { formatError } from "../utils/errors";

export interface HttpRequestParams {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Executes a native HTTP request using Node 22 global fetch.
 * Returns formatted status code, response headers, and response body.
 */
export async function executeHttpRequest(
  params: HttpRequestParams
): Promise<ToolResult> {
  const { url, method = "GET", headers = {}, body, timeoutMs = 15000 } = params;

  if (!url || typeof url !== "string") {
    throw new Error("URL is required and must be a valid HTTP/HTTPS string");
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid URL '${url}'. Must start with http:// or https://`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json, text/plain, */*",
        ...headers,
      },
      signal: controller.signal,
    };

    if (body && method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD") {
      fetchOptions.body = body;
      if (!headers["Content-Type"] && !headers["content-type"]) {
        try {
          JSON.parse(body);
          (fetchOptions.headers as Record<string, string>)["Content-Type"] =
            "application/json";
        } catch {
          (fetchOptions.headers as Record<string, string>)["Content-Type"] =
            "text/plain";
        }
      }
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timer);

    const statusLine = `HTTP/${response.status} ${response.statusText}`;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const rawBody = await response.text();
    let formattedBody = rawBody;

    try {
      const parsedJson = JSON.parse(rawBody);
      formattedBody = JSON.stringify(parsedJson, null, 2);
    } catch {
      /* Not JSON, preserve text format */
    }

    const outputLines = [
      `Status: ${statusLine}`,
      `Headers: ${JSON.stringify(responseHeaders, null, 2)}`,
      "",
      "Body:",
      formattedBody || "(empty body)",
    ];

    const result = await truncateOutput(outputLines.join("\n"));
    return {
      output: result.content,
      metadata: {
        status: response.status,
        statusText: response.statusText,
        isError: !response.ok,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`HTTP request timed out after ${timeoutMs}ms: ${url}`);
    }
    const message = formatError(err);
    const cause = err instanceof Error && "cause" in err ? formatError((err as any).cause) : "";
    const combined = `${message} ${cause}`.toLowerCase();
    if (combined.includes("econnrefused")) {
      throw new Error(
        `Connection refused to ${url}. Make sure the target server is running.`
      );
    }
    throw new Error(`HTTP request failed: ${message}`);
  }
}
