import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MarkdownFormatter } from "../src/cli/format.js";

describe("MarkdownFormatter", () => {
  it("strips raw backticks and applies cyan styling to inline code", () => {
    const formatter = new MarkdownFormatter();
    const result = formatter.formatInline("Use `npm run dev` to start.");
    assert.ok(!result.includes("`npm run dev`"), "Raw backticks should not remain");
    assert.ok(result.includes("npm run dev"), "Code text should remain");
  });

  it("formats bold text and strips raw asterisks", () => {
    const formatter = new MarkdownFormatter();
    const result = formatter.formatInline("This is **important** information.");
    assert.ok(!result.includes("**"), "Raw double asterisks should not remain");
    assert.ok(result.includes("important"), "Bold text should remain");
  });

  it("handles combined bold and inline code like **1. `morpheus`**", () => {
    const formatter = new MarkdownFormatter();
    const result = formatter.formatSingleLine("**1. `morpheus`** (current working directory)");
    assert.ok(result !== null);
    assert.ok(!result.includes("**"), "Raw double asterisks should not remain");
    assert.ok(!result.includes("`"), "Raw backticks should not remain");
    assert.ok(result.includes("1. "), "Number should remain");
    assert.ok(result.includes("morpheus"), "Project name should remain");
  });

  it("formats unordered bullet points", () => {
    const formatter = new MarkdownFormatter();
    const result = formatter.formatSingleLine("- First item");
    assert.ok(result !== null);
    assert.ok(result.includes("• First item"), "Bullet symbol should replace dash");
  });

  it("formats standard numbered lists", () => {
    const formatter = new MarkdownFormatter();
    const result = formatter.formatSingleLine("1. Step one");
    assert.ok(result !== null);
    assert.ok(result.includes("1."), "Number prefix should remain");
    assert.ok(result.includes("Step one"), "Item content should remain");
  });

  it("formats fenced code blocks", () => {
    const formatter = new MarkdownFormatter();
    const header = formatter.formatSingleLine("```typescript");
    assert.ok(header !== null && header.includes("typescript"), "Language should be in block header");
    assert.ok(header.includes("┌"), "Top corner should be present");

    const code = formatter.formatSingleLine("const answer = 42;");
    assert.ok(code !== null && code.includes("│"), "Code line should have gutter");
    assert.ok(code.includes("const answer = 42;"), "Code line content should be preserved");

    const footer = formatter.formatSingleLine("```");
    assert.ok(footer !== null && footer.includes("└"), "Bottom corner should be present");
  });

  it("formats headers cleanly", () => {
    const formatter = new MarkdownFormatter();
    const h1 = formatter.formatSingleLine("# Title");
    assert.ok(h1 !== null && h1.includes("Title"));
    assert.ok(!h1.startsWith("#"));

    const h2 = formatter.formatSingleLine("## Section");
    assert.ok(h2 !== null && h2.includes("Section"));
    assert.ok(!h2.startsWith("##"));
  });

  it("renders markdown tables with proper Unicode borders and aligned columns", () => {
    const formatter = new MarkdownFormatter();
    const tableLines = [
      "| Entry | Type | Last modified |",
      "|---|---|---|",
      "| morpheus/ | directory (current project) | Sep 27 13:50 |",
      "| ratio-d/ | directory | Sep 26 13:15 |",
    ];

    const rendered = formatter.renderTable(tableLines);
    assert.ok(rendered.length >= 4, "Should produce top border, header, separator, data rows, bottom border");
    assert.ok(rendered[0].includes("┌"), "Top border should have ┌");
    assert.ok(rendered[0].includes("┬"), "Top border should have ┬");
    assert.ok(rendered[0].includes("┐"), "Top border should have ┐");
    assert.ok(rendered.some(l => l.includes("├") && l.includes("┼") && l.includes("┤")), "Should have middle separator");
    assert.ok(rendered[rendered.length - 1].includes("└") && rendered[rendered.length - 1].includes("┘"), "Bottom border should have └ and ┘");
    assert.ok(rendered.some(l => l.includes("morpheus/")), "Content should be present");
  });

  it("buffers streaming table lines and flushes complete table", () => {
    const formatter = new MarkdownFormatter();
    const step1 = formatter.processLine("| A | B |");
    assert.deepEqual(step1, [], "Table lines should be buffered while streaming");

    const step2 = formatter.processLine("|---|---|");
    assert.deepEqual(step2, [], "Separator should be buffered");

    const step3 = formatter.processLine("| 1 | 2 |");
    assert.deepEqual(step3, [], "Data row should be buffered");

    // Next non-table line triggers table output
    const step4 = formatter.processLine("Done with table.");
    assert.ok(step4.length > 1, "Should output rendered table followed by normal line");
    assert.ok(step4.some(l => l.includes("┌")), "Should include rendered table");
    assert.ok(step4[step4.length - 1].includes("Done with table."), "Should include trailing line");
  });
});
