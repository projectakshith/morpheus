---
name: spreadsheets
category: documents
description: Building clean Excel spreadsheets (.xlsx) and CSV models with formulas and formatting
triggers: ["excel", "xlsx", "spreadsheet", "csv", "sheet", "financial model"]
---

# Spreadsheets Skill

## Best Practices
1. **Header Formatting**: Bold headers with subtle background fill (e.g. soft gray or brand color) and text wrap enabled.
2. **Data Alignment**: Text left-aligned; Numbers/Currency/Percentages right-aligned; Status/IDs centered.
3. **Formulas Over Hardcoding**: Use Excel formulas (`SUM`, `AVERAGE`, `VLOOKUP`/`XLOOKUP`, `IF`) for calculated fields.
4. **Programmatic Generation**: Generate via Python (`openpyxl` / `pandas`) or Node (`xlsx` / `exceljs`):
   - Auto-fit column widths so text is never truncated (`###`).
   - Freeze the top header row for large tables.
