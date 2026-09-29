---
name: word-docs
category: documents
description: Generating structured Word documents (.docx), technical specifications, and executive briefs
triggers: ["word", "docx", "document", "spec", "whitepaper", "rfc", "brief"]
---

# Word Docs & Technical Specifications Skill

## Document Structure
1. **Title & Metadata**: Title, Author/Team, Version, Status (Draft/Review/Approved), Date.
2. **Executive Summary**: 1-2 paragraphs highlighting problem, solution, and impact.
3. **Structured Headings**: H1 (Major Sections), H2 (Subsections), H3 (Details).
4. **Programmatic Generation**: To generate `.docx` files, use Python (`python-docx`) or Node (`docx` package):
   - Set consistent body font (e.g. Calibri, Inter, Arial) and size (11pt body, 1.15 line spacing).
   - Style tables with distinct header rows and light borders.
   - Use callout callout boxes / shaded panels for warnings or key notes.
