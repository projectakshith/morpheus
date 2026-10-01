import type { UplinkElement, UplinkPage } from "./types";

/**
 * Decodes common HTML entities into plain text.
 */
export function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(Number(dec));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

/**
 * Resolves a potential relative or protocol-relative URL against a base URL.
 */
export function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/**
 * Strips raw HTML tags from a string to count text length.
 */
function getPlainTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().length;
}

/**
 * Extracts the primary content body from raw HTML using score-based heuristics.
 * Identifies <article>, <main>, or content containers, falling back gracefully to body.
 */
export function extractMainContentContainer(html: string): string {
  // 1. Strip non-content / boilerplate tags
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // 2. Strip cookie banners, tracking popups, and privacy overlays
  cleaned = cleaned.replace(
    /<(?:div|section|aside|footer)[^>]*?(?:class|id)=["'][^"']*(?:cookie|consent|privacy-banner|optanon|gdpr|modal-backdrop)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside|footer)>/gi,
    ""
  );

  // 3. Candidate container checks (most specific first)
  const candidatePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<[a-z0-9]+[^>]*?role=["']main["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i,
    /<[a-z0-9]+[^>]*?id=["'](?:main-content|content|main|article|documentation|docs-content|bodyContent|mainbar)["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i,
    /<[a-z0-9]+[^>]*?class=["'][^"']*(?:markdown-body|doc-content|main-content|article-body|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i,
  ];

  for (const pattern of candidatePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const textLen = getPlainTextLength(match[1]);
      if (textLen >= 120) {
        return match[1];
      }
    }
  }

  // 4. Fallback to body or cleaned document, pruning navigation and footers
  let bodyContent = cleaned;
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    bodyContent = bodyMatch[1];
  }

  // Strip navigation and footer from body if substantial text remains
  const withoutNavFooter = bodyContent
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  if (getPlainTextLength(withoutNavFooter) >= 100) {
    return withoutNavFooter;
  }

  return bodyContent;
}

/**
 * Universal, high-performance HTML to Semantic Agent Markdown parser.
 * Works universally across doc sites, wikis, blogs, SPAs, and GitHub without token waste.
 */
export function parseHtmlToAgentMarkdown(
  html: string,
  baseUrl: string,
  statusCode: number = 200
): UplinkPage {
  const elements = new Map<number, UplinkElement>();
  let refIdCounter = 0;

  // Check if input is already raw Markdown (e.g. from servers supporting Accept: text/markdown)
  const isAlreadyMarkdown =
    (html.startsWith("---") && html.includes("\n---")) ||
    (!/<(?:html|body|div|p)\b/i.test(html) && /^#+\s+/m.test(html));

  if (isAlreadyMarkdown) {
    let title = "Document";
    const fmTitle = html.match(/^title:\s*["']?([^"'\n]+)/m);
    const h1Title = html.match(/^#\s+(.+)$/m);
    if (fmTitle) title = fmTitle[1].trim();
    else if (h1Title) title = h1Title[1].trim();

    const body = html.replace(/^---[\s\S]*?---\s*\n?/, "").trim();
    const rawLines = body.split("\n");
    const outline: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (/^#{1,3}\s+/.test(trimmed)) {
        outline.push(trimmed);
      }
    }

    const outlineSection =
      outline.length > 0
        ? `### Document Outline\n${outline.slice(0, 15).map((h) => `- ${h}`).join("\n")}${
            outline.length > 15 ? `\n... (${outline.length - 15} more sections)` : ""
          }\n────────────────────────────────────────────────────────────────\n`
        : "";

    return {
      url: baseUrl,
      title,
      content: outlineSection + body,
      elements,
      outline,
      status: statusCode,
      timestamp: Date.now(),
    };
  }

  // 1. Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "Untitled Page";

  // 2. Extract primary content area (strips sidebar navs, cookie banners, tracking)
  let contentHtml = extractMainContentContainer(html);

  // 3. Process interactive elements inside primary content
  // Replace <a> links
  contentHtml = contentHtml.replace(
    /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi,
    (_match, attrs, innerText) => {
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
      const rawText = decodeHtmlEntities(innerText.replace(/<[^>]+>/g, "").trim());
      const rawHref = hrefMatch ? hrefMatch[1].trim() : "";

      if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("#")) {
        return rawText;
      }

      const fullUrl = resolveUrl(rawHref, baseUrl);
      const text = rawText || fullUrl;
      refIdCounter++;
      const currentRef = refIdCounter;

      elements.set(currentRef, {
        id: currentRef,
        tag: "a",
        text,
        href: fullUrl,
      });

      return ` [${currentRef}] [${text}](${fullUrl}) `;
    }
  );

  // Replace <button>
  contentHtml = contentHtml.replace(
    /<button\s*([^>]*?)>([\s\S]*?)<\/button>/gi,
    (_match, _attrs, innerText) => {
      const text = decodeHtmlEntities(innerText.replace(/<[^>]+>/g, "").trim());
      if (!text) return "";
      refIdCounter++;
      const currentRef = refIdCounter;

      elements.set(currentRef, {
        id: currentRef,
        tag: "button",
        text,
      });

      return ` [${currentRef}] [Button: ${text}] `;
    }
  );

  // Replace <input>
  contentHtml = contentHtml.replace(/<input\s+([^>]*?)\/?>/gi, (_match, attrs) => {
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const placeholderMatch = attrs.match(/placeholder=["']([^"']+)["']/i);
    const valueMatch = attrs.match(/value=["']([^"']+)["']/i);

    const type = typeMatch ? typeMatch[1].toLowerCase() : "text";
    if (type === "hidden") return "";

    const placeholder = placeholderMatch ? decodeHtmlEntities(placeholderMatch[1]) : "";
    const name = nameMatch ? nameMatch[1] : "";
    const value = valueMatch ? decodeHtmlEntities(valueMatch[1]) : "";

    refIdCounter++;
    const currentRef = refIdCounter;
    const label = placeholder || value || name || type;

    elements.set(currentRef, {
      id: currentRef,
      tag: "input",
      text: label,
      type,
      name,
      placeholder,
      value,
    });

    return ` [${currentRef}] [Input: ${label}] `;
  });

  // 4. Convert structural block elements
  // Protect code blocks and inline code from subsequent tag stripping (<[^>]+>)
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  contentHtml = contentHtml.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_match, code) => {
      const withoutHighlightSpans = code.replace(/<\/?span\b[^>]*>/gi, "");
      const cleanedCode = decodeHtmlEntities(withoutHighlightSpans.trim());
      const idx = codeBlocks.length;
      codeBlocks.push(`\n\`\`\`\n${cleanedCode}\n\`\`\`\n`);
      return `\n\n%%UPLINK_CODE_BLOCK_${idx}%%\n\n`;
    }
  );

  contentHtml = contentHtml.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_match, code) => {
      const withoutHighlightSpans = code.replace(/<\/?span\b[^>]*>/gi, "");
      const cleanedCode = decodeHtmlEntities(withoutHighlightSpans.trim());
      const idx = codeBlocks.length;
      codeBlocks.push(`\n\`\`\`\n${cleanedCode}\n\`\`\`\n`);
      return `\n\n%%UPLINK_CODE_BLOCK_${idx}%%\n\n`;
    }
  );

  contentHtml = contentHtml.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_match, code) => {
      const withoutHighlightSpans = code.replace(/<\/?span\b[^>]*>/gi, "");
      const cleanedCode = decodeHtmlEntities(withoutHighlightSpans.trim());
      const idx = inlineCodes.length;
      inlineCodes.push(` \`${cleanedCode}\` `);
      return `%%UPLINK_INLINE_CODE_${idx}%%`;
    }
  );

  // Headings
  contentHtml = contentHtml.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  contentHtml = contentHtml.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  contentHtml = contentHtml.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  contentHtml = contentHtml.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n#### $1\n\n");

  // Paragraphs & breaks
  contentHtml = contentHtml.replace(/<p[^>]*>/gi, "\n\n");
  contentHtml = contentHtml.replace(/<\/p>/gi, "\n");
  contentHtml = contentHtml.replace(/<br\s*\/?>/gi, "\n");
  contentHtml = contentHtml.replace(/<hr\s*\/?>/gi, "\n---\n");

  // Lists
  contentHtml = contentHtml.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n* $1");
  contentHtml = contentHtml.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

  // Tables
  contentHtml = contentHtml.replace(/<tr[^>]*>/gi, "\n| ");
  contentHtml = contentHtml.replace(/<\/tr>/gi, " |");
  contentHtml = contentHtml.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, "$1 | ");
  contentHtml = contentHtml.replace(/<\/?table[^>]*>/gi, "\n");

  // Blockquotes
  contentHtml = contentHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n");

  // 5. Strip all remaining HTML tags
  contentHtml = contentHtml.replace(/<[^>]+>/g, "");

  // 6. Restore code blocks and inline code
  contentHtml = contentHtml.replace(
    /%%UPLINK_CODE_BLOCK_(\d+)%%/g,
    (_match, id) => codeBlocks[Number(id)] ?? ""
  );
  contentHtml = contentHtml.replace(
    /%%UPLINK_INLINE_CODE_(\d+)%%/g,
    (_match, id) => inlineCodes[Number(id)] ?? ""
  );

  // 7. Decode entities and format whitespace
  contentHtml = decodeHtmlEntities(contentHtml);

  // Clean lines: collapse whitespace per line and limit blank lines
  const rawLines = contentHtml.split("\n").map((line) => line.trim());
  const condensed: string[] = [];
  const outline: string[] = [];
  let blankCount = 0;

  for (const line of rawLines) {
    if (!line) {
      blankCount++;
      if (blankCount <= 2) {
        condensed.push("");
      }
    } else {
      blankCount = 0;
      condensed.push(line);

      // Collect headings for high-level document outline
      if (/^#{1,3}\s+/.test(line)) {
        outline.push(line);
      }
    }
  }

  // Prepend document outline if multiple headings exist
  let finalContent = condensed.join("\n").trim();
  if (outline.length >= 3) {
    const outlineHeader = [
      "### Document Outline",
      ...outline.slice(0, 15).map((h) => `- ${h}`),
      outline.length > 15 ? `... (${outline.length - 15} more sections)` : "",
      "────────────────────────────────────────────────────────────────",
      "",
    ]
      .filter(Boolean)
      .join("\n");
    finalContent = `${outlineHeader}\n${finalContent}`;
  }

  return {
    url: baseUrl,
    title,
    content: finalContent || "(empty page or non-text content)",
    elements,
    outline,
    status: statusCode,
    timestamp: Date.now(),
  };
}
