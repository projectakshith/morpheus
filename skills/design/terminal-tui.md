---
name: terminal-tui
category: design
description: Guidelines for building responsive, zero-jitter terminal user interfaces with Ink/React
triggers: ["tui", "ink", "terminal ui", "cli ui", "layout jitter", "ansi"]
---

# Terminal TUI Design Skill

## Zero-Jitter & Viewport Principles
1. **Fixed Layout Budget**: In Ink/React, dynamic height calculation per keystroke causes severe screen flicker. Always allocate a fixed height for popups and lists (e.g. constant 7 rows) and use an internal scrolling sliding window.
2. **Ghost Text & In-Place Prefill**: Render suggestion ghost-text directly following the cursor inline using dim foreground colors (`theme.muted`), rather than moving the cursor block.
3. **Graceful Overflow**: When terminal columns or rows shrink, truncate gracefully (`text.slice(0, maxWidth - 1) + "…"`) instead of allowing wrapping lines to push the viewport down.
4. **Clean Color Hierarchy**: Primary accent (brand), muted (hints/borders), warning/error (alerts). Avoid loud or mismatched colors.
