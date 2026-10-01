import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHtmlToAgentMarkdown,
  decodeHtmlEntities,
  resolveUrl,
  extractMainContentContainer,
} from "../src/uplink/parser";
import { UplinkSession } from "../src/uplink/session";
import { formatSearchResults } from "../src/uplink/search";
import { createUplinkSearchTool, createUplinkBrowseTool } from "../src/tools/uplink";
import { findChromiumBinary, type UplinkDriver, type FetchPageResult } from "../src/uplink/engine";

class MockUplinkDriver implements UplinkDriver {
  private pages: Map<string, string>;

  constructor(pages: Record<string, string> = {}) {
    this.pages = new Map(Object.entries(pages));
  }

  setPage(url: string, html: string) {
    this.pages.set(url, html);
  }

  async fetchPage(url: string): Promise<FetchPageResult> {
    const html = this.pages.get(url);
    if (!html) {
      throw new Error(`404 Not Found: ${url}`);
    }
    return {
      html,
      finalUrl: url,
      status: 200,
      contentType: "text/html",
    };
  }
}

test("Uplink Parser: HTML entity decoding", () => {
  assert.equal(
    decodeHtmlEntities("&quot;hello&quot; &amp; &apos;world&apos; &lt;div&gt; &#39;test&#39;"),
    '"hello" & \'world\' <div> \'test\''
  );
});

test("Uplink Parser: relative URL resolution", () => {
  assert.equal(
    resolveUrl("/docs/api", "https://example.com/start"),
    "https://example.com/docs/api"
  );
  assert.equal(
    resolveUrl("guide", "https://example.com/docs/"),
    "https://example.com/docs/guide"
  );
  assert.equal(
    resolveUrl("https://other.com/page", "https://example.com"),
    "https://other.com/page"
  );
});

test("Uplink Parser: Universal Main Content Extraction (Pruning Navigation & Boilerplate)", () => {
  const sampleWithHugeNav = `
    <!DOCTYPE html>
    <html>
      <head><title>Documentation</title></head>
      <body>
        <nav>
          <ul>
            <li><a href="/link1">Sidebar Link 1</a></li>
            <li><a href="/link2">Sidebar Link 2</a></li>
            <li><a href="/link3">Sidebar Link 3</a></li>
          </ul>
        </nav>
        <main>
          <h1>Actual Article Title</h1>
          <p>This is the essential documentation content that the agent actually needs to read without token waste.</p>
          <a href="/inner-link">Target Resource</a>
        </main>
        <footer>
          <p>Copyright 2026</p>
          <a href="/privacy">Privacy Policy</a>
        </footer>
      </body>
    </html>
  `;

  const page = parseHtmlToAgentMarkdown(sampleWithHugeNav, "https://docs.local");

  // Verify navigation and footer were pruned from main content
  assert.ok(!page.content.includes("Sidebar Link 1"));
  assert.ok(!page.content.includes("Privacy Policy"));
  assert.ok(page.content.includes("# Actual Article Title"));
  assert.ok(page.content.includes("This is the essential documentation content"));

  // Only the link inside <main> was indexed!
  assert.equal(page.elements.size, 1);
  const el = page.elements.get(1);
  assert.equal(el?.href, "https://docs.local/inner-link");
});

test("Uplink Parser: Semantic Markdown and Interactive Element Indexing", () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Morpheus Docs</title>
        <script>console.log("noisy tracking script");</script>
        <style>.btn { color: red; }</style>
      </head>
      <body>
        <h1>Welcome to Morpheus</h1>
        <p>An agentic coding harness. Check out our <a href="/docs/guide">Getting Started Guide</a>.</p>
        <pre><code class="language-bash">npm install morpheus</code></pre>
        <ul>
          <li>Fast autonomous loops</li>
          <li>Token-bounded execution</li>
        </ul>
        <button type="button">Run Audit</button>
        <input type="text" name="search" placeholder="Search docs..." />
      </body>
    </html>
  `;

  const page = parseHtmlToAgentMarkdown(sampleHtml, "https://morpheus.dev");

  assert.equal(page.title, "Morpheus Docs");
  assert.ok(!page.content.includes("noisy tracking script"));
  assert.ok(!page.content.includes(".btn { color: red; }"));
  assert.ok(page.content.includes("# Welcome to Morpheus"));
  assert.ok(page.content.includes("```\nnpm install morpheus\n```"));
  assert.ok(page.content.includes("* Fast autonomous loops"));

  // Check interactive elements map
  assert.equal(page.elements.size, 3);
  const el1 = page.elements.get(1);
  assert.equal(el1?.tag, "a");
  assert.equal(el1?.href, "https://morpheus.dev/docs/guide");

  const el2 = page.elements.get(2);
  assert.equal(el2?.tag, "button");
  assert.equal(el2?.text, "Run Audit");

  const el3 = page.elements.get(3);
  assert.equal(el3?.tag, "input");
  assert.equal(el3?.placeholder, "Search docs...");
});

test("Uplink Parser: Preserves TypeScript generics, JSX, and types in code blocks", () => {
  const html = `
    <html>
      <head><title>Generics Test</title></head>
      <body>
        <main>
          <h1>API Reference</h1>
          <p>Here is an async component:</p>
          <pre><code>async function Page({ params }: { params: Promise<{ slug: string }> }) {\n  return <div className="card">{params.slug}</div>;\n}</code></pre>
          <p>Inline type: <code>Record<string, Promise<T>></code></p>
        </main>
      </body>
    </html>
  `;

  const page = parseHtmlToAgentMarkdown(html, "https://example.com/types");
  assert.ok(page.content.includes("Promise<{ slug: string }>"));
  assert.ok(page.content.includes('<div className="card">{params.slug}</div>'));
  assert.ok(page.content.includes("`Record<string, Promise<T>>`"));
});

test("Uplink Parser: Native markdown and frontmatter support", () => {
  const markdownDoc = `---
title: How to upgrade to Next.js 15
description: Guide for version 15
---

# Upgrading to Next.js 15

## Async Request APIs
Previously synchronous APIs are now async:
* cookies()
* headers()

### Code Example
\`\`\`ts
const cookieStore = await cookies();
\`\`\`
`;

  const page = parseHtmlToAgentMarkdown(markdownDoc, "https://nextjs.org/docs/v15");
  assert.equal(page.title, "How to upgrade to Next.js 15");
  assert.ok(page.outline && page.outline.length >= 2);
  assert.ok(page.content.includes("### Document Outline"));
  assert.ok(page.content.includes("const cookieStore = await cookies();"));
});

test("Uplink Session: Navigation, Element Clicking, and History", async () => {
  const mockDriver = new MockUplinkDriver({
    "https://docs.local/index": `
      <html>
        <head><title>Index</title></head>
        <body>
          <h1>Documentation</h1>
          <p>Read the <a href="/page2">Second Page</a></p>
        </body>
      </html>
    `,
    "https://docs.local/page2": `
      <html>
        <head><title>Page Two</title></head>
        <body>
          <h1>Section Two</h1>
          <p>Detailed technical instructions.</p>
        </body>
      </html>
    `,
  });

  const session = new UplinkSession({ driver: mockDriver, windowLines: 50 });

  // 1. Initial navigation
  const view1 = await session.navigate("https://docs.local/index");
  assert.ok(view1.includes("[UPLINK BROWSER] https://docs.local/index"));
  assert.ok(view1.includes("Title: Index"));
  assert.ok(view1.includes("[1] [Second Page](https://docs.local/page2)"));
  assert.equal(session.currentUrl, "https://docs.local/index");

  // 2. Click link [1] to navigate to page2
  const view2 = await session.click(1);
  assert.ok(view2.includes("[UPLINK BROWSER] https://docs.local/page2"));
  assert.ok(view2.includes("Title: Page Two"));
  assert.equal(session.currentUrl, "https://docs.local/page2");

  // 3. Back button
  const viewBack = await session.back();
  assert.ok(viewBack.includes("https://docs.local/index"));
  assert.equal(session.currentUrl, "https://docs.local/index");

  // 4. Invalid element reference handling
  await assert.rejects(
    async () => {
      await session.click(99);
    },
    /Invalid reference \[99\]/
  );
});

test("Uplink Session: In-Page Find / Jump", async () => {
  const longLines = Array.from({ length: 60 }, (_, i) => `Filler text line ${i + 1}`).join("\n");
  const pageWithHeadings = `
    <html>
      <head><title>Migration Guide</title></head>
      <body>
        <h1>Migration Guide</h1>
        <p>${longLines}</p>
        <h2>Breaking Changes</h2>
        <p>Here are the breaking changes to watch out for.</p>
      </body>
    </html>
  `;

  const mockDriver = new MockUplinkDriver({
    "https://guide.local/migrate": pageWithHeadings,
  });

  const session = new UplinkSession({ driver: mockDriver, windowLines: 20 });
  await session.navigate("https://guide.local/migrate");

  // Find and jump directly to "Breaking Changes"
  const jumpedView = session.find("Breaking Changes");
  assert.ok(jumpedView.includes('[Jumped to match for "Breaking Changes"'));
  assert.ok(jumpedView.includes("## Breaking Changes"));
  assert.ok(jumpedView.includes("Here are the breaking changes to watch out for."));
});

test("Uplink Session: Windowed Scrolling", async () => {
  const longLines = Array.from({ length: 150 }, (_, i) => `Paragraph line ${i + 1}`).join("\n");
  const mockDriver = new MockUplinkDriver({
    "https://long.local/read": `<html><head><title>Long</title></head><body><p>${longLines}</p></body></html>`,
  });

  const session = new UplinkSession({ driver: mockDriver, windowLines: 20 });
  const initial = await session.navigate("https://long.local/read");
  assert.ok(initial.includes("Showing lines 1-20"));

  const scrolled = session.scroll("down", 20);
  assert.ok(scrolled.includes("Showing lines 21-40"));

  const scrolledUp = session.scroll("up", 20);
  assert.ok(scrolledUp.includes("Showing lines 1-20"));
});

test("Uplink Engine: Detects installed Chromium binary", () => {
  const binary = findChromiumBinary();
  // On this Mac with Brave Browser installed, binary should be found
  assert.ok(binary);
  assert.match(binary, /Brave Browser|Google Chrome|Arc|Chromium/);
});

test("Uplink Search: Output formatting", () => {
  const formatted = formatSearchResults({
    query: "drizzle orm sqlite",
    provider: "tavily",
    results: [
      {
        title: "Drizzle ORM SQLite Documentation",
        url: "https://orm.drizzle.team/docs/get-started-sqlite",
        snippet: "Get started with SQLite in Drizzle ORM.",
      },
    ],
  });

  assert.ok(formatted.includes('## Uplink Search: "drizzle orm sqlite" (tavily)'));
  assert.ok(formatted.includes("[Drizzle ORM SQLite Documentation](https://orm.drizzle.team/docs/get-started-sqlite)"));
  assert.ok(formatted.includes("Get started with SQLite in Drizzle ORM."));
});

test("Uplink Tools: creation and parameter validation", async () => {
  const searchTool = createUplinkSearchTool();
  assert.equal(searchTool.name, "uplink_search");
  assert.ok(searchTool.parameters.properties.query);

  const browseTool = createUplinkBrowseTool();
  assert.equal(browseTool.name, "uplink_browse");
  assert.ok(browseTool.parameters.properties.action);

  // Missing URL validation on navigate action
  const errorResult = await browseTool.execute({ action: "navigate" });
  assert.ok(String(errorResult).includes("'url' parameter is required"));

  // Missing query validation on find action
  const findError = await browseTool.execute({ action: "find" });
  assert.ok(String(findError).includes("'query' parameter is required"));
});
