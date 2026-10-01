---
name: uplink
category: research
description: External web search and interactive documentation browsing via Uplink
triggers: ["search", "web", "browse", "lookup", "docs", "documentation", "api", "reference", "error", "google", "uplink", "find", "check", "online", "release", "latest"]
---

# Uplink Web Recon Skill

When external documentation, library releases, API signatures, or bug fixes are needed:

1. **Scout First with `uplink_search`**:
   - Query exact keywords, library version, and error message.
   - Example: `uplink_search(query: "nextjs 15 cookies async await migration")`.
   - Inspect the returned ranked results and snippet summaries.

2. **Dive Deep with `uplink_browse`**:
   - If a snippet is insufficient or you need the complete documentation, navigate to the target URL:
     `uplink_browse(action: "navigate", url: "<target_url>")`.
   - Read the structured semantic markdown and check interactive element tags `[1]`, `[2]`, etc.
   - Click deeper links using `uplink_browse(action: "click", ref: 3)`.
   - For long pages, scroll through subsequent sections using `uplink_browse(action: "scroll", direction: "down")`.

3. **Synthesis**:
   - Apply verified facts to the local codebase.
   - Never guess an unfamiliar API or parameter type when Uplink can verify it in seconds.
