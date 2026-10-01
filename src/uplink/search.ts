import { decodeHtmlEntities } from "./parser";
import type { UplinkSearchResult, UplinkSearchResponse } from "./types";

/**
 * Searches via Tavily Search API if TAVILY_API_KEY is configured.
 */
async function searchWithTavily(
  query: string,
  count: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<UplinkSearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: count,
      search_depth: "basic",
      include_answer: false,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (data.results ?? []).map((item) => ({
    title: item.title || "Untitled",
    url: item.url || "",
    snippet: item.content || "",
  }));
}

/**
 * Searches via Brave Search API if BRAVE_SEARCH_API_KEY is configured.
 */
async function searchWithBrave(
  query: string,
  count: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<UplinkSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brave Search API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
  };

  return (data.web?.results ?? []).map((item) => ({
    title: item.title || "Untitled",
    url: item.url || "",
    snippet: item.description || "",
  }));
}

/**
 * Zero-config fallback: DuckDuckGo HTML search scraper.
 */
async function searchWithDuckDuckGo(
  query: string,
  count: number,
  signal?: AbortSignal
): Promise<UplinkSearchResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned status ${response.status}`);
  }

  const html = await response.text();
  const results: UplinkSearchResult[] = [];

  // Match result blocks in DuckDuckGo HTML
  const resultRegex =
    /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>/gi;
  const linkTitleRegex =
    /<a[^>]*class="[^"]*result__url[^"]*"[^>]*>[\s\S]*?<\/a>[\s\S]*?<a[^>]*class="[^"]*result__title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  // Generic fallback block parsing
  const blocks = html.split(/class="[^"]*result\s+results_links/i).slice(1);

  for (const block of blocks) {
    if (results.length >= count) break;

    const titleMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

    const hrefMatch = block.match(/href="([^"]*uddg=([^"&]+)[^"]*)"/i) || block.match(/href="([^"]+)"/i);
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i);

    let targetUrl = "";
    if (hrefMatch) {
      if (hrefMatch[2]) {
        try {
          targetUrl = decodeURIComponent(hrefMatch[2]);
        } catch {
          targetUrl = hrefMatch[1];
        }
      } else {
        targetUrl = hrefMatch[1];
      }
    }

    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[2].replace(/<[^>]+>/g, "").trim())
      : "Result";
    const snippet = snippetMatch
      ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, "").trim())
      : "";

    if (targetUrl && /^https?:\/\//i.test(targetUrl) && !targetUrl.includes("duckduckgo.com")) {
      results.push({
        title: title || targetUrl,
        url: targetUrl,
        snippet,
      });
    }
  }

  return results;
}

/**
 * Zero-config fallback 2: Jina Search endpoint (returns clean markdown).
 */
async function searchWithJina(
  query: string,
  count: number,
  signal?: AbortSignal
): Promise<UplinkSearchResult[]> {
  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/plain",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Jina Search returned status ${response.status}`);
  }

  const text = await response.text();
  const results: UplinkSearchResult[] = [];

  // Parse markdown link patterns like [Title](URL)\nSnippet
  const blocks = text.split(/\n(?=\[Title:|\d+\. \[|### )/g);
  for (const block of blocks) {
    if (results.length >= count) break;
    const urlMatch = block.match(/https?:\/\/[^\s\)\"\'\>]+/i);
    const titleMatch = block.match(/\[(.*?)\]/);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      const title = titleMatch ? titleMatch[1].trim() : targetUrl;
      const snippet = block
        .replace(/https?:\/\/[^\s\)\"\'\>]+/gi, "")
        .replace(/\[.*?\]/g, "")
        .replace(/[#*_`]/g, "")
        .trim()
        .slice(0, 300);

      results.push({
        title,
        url: targetUrl,
        snippet,
      });
    }
  }

  return results;
}

/**
 * Executes an Uplink web search with automatic multi-provider fallback.
 */
export async function executeUplinkSearch(
  query: string,
  count: number = 5,
  signal?: AbortSignal
): Promise<UplinkSearchResponse> {
  const sanitizedQuery = query.trim();
  if (!sanitizedQuery) {
    throw new Error("Search query cannot be empty");
  }

  const boundedCount = Math.max(1, Math.min(count, 10));

  // Provider hierarchy:
  // 1. Tavily (if TAVILY_API_KEY configured)
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const results = await searchWithTavily(sanitizedQuery, boundedCount, tavilyKey, signal);
      if (results.length > 0) {
        return { query: sanitizedQuery, provider: "tavily", results };
      }
    } catch {
      // Fallback to next provider
    }
  }

  // 2. Brave Search (if BRAVE_SEARCH_API_KEY configured)
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    try {
      const results = await searchWithBrave(sanitizedQuery, boundedCount, braveKey, signal);
      if (results.length > 0) {
        return { query: sanitizedQuery, provider: "brave", results };
      }
    } catch {
      // Fallback to next provider
    }
  }

  // 3. Zero-config Fallback: DuckDuckGo
  try {
    const results = await searchWithDuckDuckGo(sanitizedQuery, boundedCount, signal);
    if (results.length > 0) {
      return { query: sanitizedQuery, provider: "duckduckgo", results };
    }
  } catch {
    // Try Jina
  }

  // 4. Zero-config Fallback 2: Jina
  try {
    const results = await searchWithJina(sanitizedQuery, boundedCount, signal);
    if (results.length > 0) {
      return { query: sanitizedQuery, provider: "jina", results };
    }
  } catch (err: unknown) {
    throw new Error(
      `All Uplink search providers failed. Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY in your .env for dedicated capacity.`
    );
  }

  return {
    query: sanitizedQuery,
    provider: "duckduckgo",
    results: [],
  };
}

/**
 * Formats Uplink search results into token-dense, clean markdown with interactive numbers.
 */
export function formatSearchResults(response: UplinkSearchResponse): string {
  if (response.results.length === 0) {
    return `No search results found for "${response.query}". Try alternative search terms.`;
  }

  const lines = [
    `## Uplink Search: "${response.query}" (${response.provider})`,
    `Found ${response.results.length} results. Use \`uplink_browse\` with \`url\` to visit any result:\n`,
  ];

  response.results.forEach((item, index) => {
    lines.push(`### ${index + 1}. [${item.title}](${item.url})`);
    if (item.snippet) {
      lines.push(`${item.snippet}\n`);
    }
  });

  return lines.join("\n");
}
