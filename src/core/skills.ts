import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { Skill, Rule } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parses markdown frontmatter between `---` fences.
 */
export function parseFrontmatter(fileContent: string): {
  attributes: Record<string, any>;
  body: string;
} {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: fileContent.trim() };
  }

  const rawAttrs = match[1];
  const body = match[2].trim();
  const attributes: Record<string, any> = {};

  for (const line of rawAttrs.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    if (val.startsWith("[") && val.endsWith("]")) {
      try {
        attributes[key] = JSON.parse(val);
        continue;
      } catch {
        attributes[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        continue;
      }
    }

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    attributes[key] = val;
  }

  return { attributes, body };
}

/**
 * Recursively scans a directory for markdown files.
 */
function scanMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        results.push(...scanMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Gracefully ignore directory read errors
  }

  return results;
}

/**
 * Loads and merges skills from built-in, user-level, and workspace directories.
 * Higher precedence overrides lower precedence: workspace > user > built-in.
 */
export function loadSkills(cwd: string = process.cwd()): Skill[] {
  const skillsMap = new Map<string, Skill>();

  // Determine potential built-in skills locations
  const builtinCandidates = [
    path.resolve(__dirname, "../../skills"),
    path.resolve(process.cwd(), "skills"),
  ];
  const builtinDir = builtinCandidates.find((d) => fs.existsSync(d));

  const userDir = path.join(os.homedir(), ".morpheus", "skills");
  const workspaceDir = path.join(cwd, ".morpheus", "skills");

  const sources = [
    { dir: builtinDir, isBuiltin: true },
    { dir: userDir, isBuiltin: false },
    { dir: workspaceDir, isBuiltin: false },
  ];

  for (const source of sources) {
    if (!source.dir || !fs.existsSync(source.dir)) continue;

    const files = scanMarkdownFiles(source.dir);
    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const { attributes, body } = parseFrontmatter(raw);

        const relPath = path.relative(source.dir, filePath);
        const relParts = relPath.split(path.sep);
        const folderCategory = relParts.length > 1 ? relParts[0] : "general";

        const baseName = path.basename(filePath, ".md");
        const name = attributes.name || baseName;
        const category = attributes.category || folderCategory;
        const description = attributes.description || "";
        const triggers = Array.isArray(attributes.triggers)
          ? attributes.triggers
          : attributes.triggers
          ? [attributes.triggers]
          : [name];

        skillsMap.set(name, {
          name,
          category,
          description,
          triggers,
          content: body,
          path: filePath,
        });
      } catch {
        // Skip unparseable skill files
      }
    }
  }

  return Array.from(skillsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Loads and merges rules from built-in, user-level, and workspace directories.
 */
export function loadRules(cwd: string = process.cwd()): Rule[] {
  const rulesMap = new Map<string, Rule>();

  const builtinCandidates = [
    path.resolve(__dirname, "../../rules"),
    path.resolve(process.cwd(), "rules"),
  ];
  const builtinDir = builtinCandidates.find((d) => fs.existsSync(d));

  const userDir = path.join(os.homedir(), ".morpheus", "rules");
  const workspaceDir = path.join(cwd, ".morpheus", "rules");

  const sources = [builtinDir, userDir, workspaceDir];

  for (const sourceDir of sources) {
    if (!sourceDir || !fs.existsSync(sourceDir)) continue;

    const files = scanMarkdownFiles(sourceDir);
    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const { attributes, body } = parseFrontmatter(raw);
        const baseName = path.basename(filePath, ".md");
        const name = attributes.name || baseName;

        rulesMap.set(name, {
          name,
          description: attributes.description,
          content: body,
          path: filePath,
        });
      } catch {
        // Skip unparseable rule files
      }
    }
  }

  return Array.from(rulesMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Matches user prompt against skill triggers.
 */
export function matchSkills(prompt: string, skills: Skill[]): Skill[] {
  if (!prompt || !skills.length) return [];
  const normalized = prompt.toLowerCase();

  return skills.filter((skill) => {
    return skill.triggers.some((trigger) => {
      const t = trigger.toLowerCase().trim();
      if (!t) return false;
      // Word boundary regex for single words, or simple substring match for phrases
      if (t.includes(" ")) {
        return normalized.includes(t);
      }
      const regex = new RegExp(`\\b${t}(s|ed|ing)?\\b`, "i");
      return regex.test(normalized);
    });
  });
}

/**
 * Formats a lightweight skill manifest (~100 tokens).
 */
export function formatSkillsManifest(skills: Skill[]): string {
  if (!skills.length) return "";
  const lines = skills.map(
    (s) => `- [${s.category}] ${s.name}: ${s.description}`
  );
  return ["<skills>", ...lines, "</skills>"].join("\n");
}

/**
 * Formats active skills with full markdown instructions.
 */
export function formatActiveSkills(skills: Skill[]): string {
  if (!skills.length) return "";
  const blocks = skills.map((s) => {
    return `### Skill: ${s.name} (${s.category})\n${s.content}`;
  });
  return ["<active_skills>", ...blocks, "</active_skills>"].join("\n\n");
}

/**
 * Formats rules into a concise prompt block.
 */
export function formatRules(rules: Rule[]): string {
  if (!rules.length) return "";
  const blocks = rules.map((r) => r.content);
  return ["<rules>", ...blocks, "</rules>"].join("\n\n");
}
