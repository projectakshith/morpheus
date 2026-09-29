---
name: presentations
category: documents
description: Creating presentation slide decks via Marp Markdown, Reveal.js, or python-pptx
triggers: ["presentation", "slides", "deck", "ppt", "powerpoint", "marp", "pitch deck"]
---

# Presentations Skill

## Structural Guidelines
1. **One Idea Per Slide**: Never overcrowd a slide. Title + 3-4 bullet takeaways or a single clear focal graphic.
2. **Visual Hierarchy**: Strong contrasting title, concise subtitle, scannable data points.
3. **Marp Markdown Format**: Use standard Marp frontmatter and slide delimiters (`---`):
   ```markdown
   ---
   marp: true
   theme: default
   paginate: true
   ---
   # Presentation Title
   ### Subtitle or Presenter
   ---
   ## Key Takeaways
   - Point 1: Clear, punchy takeaway
   - Point 2: Quantifiable metrics
   ```
4. **Programmatic PPTX Generation**: For native `.pptx` files, generate Python scripts using `python-pptx` with explicit slide layout indices, text box margins, and custom color palettes.
