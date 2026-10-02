import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { Skill, Rule } from "./types";
import { similarity } from "../utils/levenshtein";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  }

  return results;
}

export function loadSkills(cwd: string = process.cwd()): Skill[] {
  const skillsMap = new Map<string, Skill>();

  const builtinCandidates = [
    path.resolve(__dirname, "../../skills"),
    path.resolve(__dirname, "../../../skills"),
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
      }
    }
  }

  return Array.from(skillsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function loadRules(cwd: string = process.cwd()): Rule[] {
  const rulesMap = new Map<string, Rule>();

  const builtinCandidates = [
    path.resolve(__dirname, "../../rules"),
    path.resolve(__dirname, "../../../rules"),
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
      }
    }
  }

  return Array.from(rulesMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function matchSkills(prompt: string, skills: Skill[]): Skill[] {
  if (!prompt || !skills.length) return [];
  const normalized = prompt.toLowerCase();
  const words = normalized.split(/[^a-z0-9_-]+/).filter(Boolean);

  return skills.filter((skill) => {
    return skill.triggers.some((trigger) => {
      const t = trigger.toLowerCase().trim();
      if (!t) return false;
      if (t.includes(" ")) {
        return normalized.includes(t);
      }
      const regex = new RegExp(`\\b${t}(s|ed|ing)?\\b`, "i");
      if (regex.test(normalized)) return true;

      if (t.length >= 4) {
        return words.some((w) => w.length >= 3 && similarity(w, t) >= 0.8);
      }
      return false;
    });
  });
}

export function formatSkillsManifest(skills: Skill[]): string {
  if (!skills.length) return "";
  const lines = skills.map(
    (s) => `- [${s.category}] ${s.name}: ${s.description}`
  );
  return ["<skills>", ...lines, "</skills>"].join("\n");
}

export function formatActiveSkills(skills: Skill[]): string {
  if (!skills.length) return "";
  const blocks = skills.map((s) => {
    return `### Skill: ${s.name} (${s.category})\n${s.content}`;
  });
  return ["<active_skills>", ...blocks, "</active_skills>"].join("\n\n");
}

export function formatRules(rules: Rule[]): string {
  if (!rules.length) return "";
  const blocks = rules.map((r) => r.content);
  return ["<rules>", ...blocks, "</rules>"].join("\n\n");
}
