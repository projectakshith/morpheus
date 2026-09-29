import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseFrontmatter,
  loadSkills,
  loadRules,
  matchSkills,
  formatSkillsManifest,
  formatActiveSkills,
  formatRules,
} from "../src/core/skills";
import { createSkillTool } from "../src/tools/skill";

describe("Skills & Rules Engine", () => {
  it("parses YAML frontmatter accurately", () => {
    const raw = `---
name: test-skill
category: dev
description: A test skill
triggers: ["test", "verify", "check"]
---

# Title
Body content here.`;

    const { attributes, body } = parseFrontmatter(raw);
    assert.strictEqual(attributes.name, "test-skill");
    assert.strictEqual(attributes.category, "dev");
    assert.strictEqual(attributes.description, "A test skill");
    assert.deepStrictEqual(attributes.triggers, ["test", "verify", "check"]);
    assert.strictEqual(body, "# Title\nBody content here.");
  });

  it("loads all built-in rules cleanly", () => {
    const rules = loadRules(process.cwd());
    assert.ok(rules.length >= 3, `Expected at least 3 rules, found ${rules.length}`);
    const names = rules.map((r) => r.name);
    assert.ok(names.includes("clean-code"), "Should include clean-code rule");
    assert.ok(names.includes("git"), "Should include git rule");
    assert.ok(names.includes("safety"), "Should include safety rule");
  });

  it("loads all built-in skills across all categories", () => {
    const skills = loadSkills(process.cwd());
    assert.ok(skills.length >= 10, `Expected at least 10 skills, found ${skills.length}`);

    const categories = new Set(skills.map((s) => s.category));
    assert.ok(categories.has("dev"), "Should include dev category");
    assert.ok(categories.has("design"), "Should include design category");
    assert.ok(categories.has("documents"), "Should include documents category");
    assert.ok(categories.has("devops"), "Should include devops category");
    assert.ok(categories.has("research"), "Should include research category");
    assert.ok(categories.has("automation"), "Should include automation category");

    const names = skills.map((s) => s.name);
    assert.ok(names.includes("git-workflow"));
    assert.ok(names.includes("debugging"));
    assert.ok(names.includes("terminal-tui"));
    assert.ok(names.includes("presentations"));
    assert.ok(names.includes("docker"));
    assert.ok(names.includes("codebase-audit"));
    assert.ok(names.includes("cli-scripts"));
  });

  it("matches skills against prompt triggers", () => {
    const skills = loadSkills(process.cwd());

    const debugMatch = matchSkills("can you help me debug this crash in the tests?", skills);
    const debugNames = debugMatch.map((s) => s.name);
    assert.ok(debugNames.includes("debugging"));
    assert.ok(debugNames.includes("testing"));

    const dockerMatch = matchSkills("we need to create a docker container for deploy", skills);
    const dockerNames = dockerMatch.map((s) => s.name);
    assert.ok(dockerNames.includes("docker"));

    const slideMatch = matchSkills("generate a presentation deck with 5 slides", skills);
    const slideNames = slideMatch.map((s) => s.name);
    assert.ok(slideNames.includes("presentations"));
  });

  it("formats token-efficient skills manifest", () => {
    const skills = loadSkills(process.cwd());
    const manifest = formatSkillsManifest(skills);

    assert.ok(manifest.startsWith("<skills>"));
    assert.ok(manifest.endsWith("</skills>"));
    assert.ok(manifest.includes("- [dev] debugging:"));
    assert.ok(manifest.includes("- [design] terminal-tui:"));
    // Manifest should be compact (~ under 2000 chars for all 16 skills)
    assert.ok(manifest.length < 2500, `Manifest too large: ${manifest.length} chars`);
  });

  it("formats active skills and rules blocks", () => {
    const skills = loadSkills(process.cwd());
    const active = skills.filter((s) => s.name === "git-workflow");
    const formatted = formatActiveSkills(active);

    assert.ok(formatted.startsWith("<active_skills>"));
    assert.ok(formatted.endsWith("</active_skills>"));
    assert.ok(formatted.includes("### Skill: git-workflow (dev)"));

    const rules = loadRules(process.cwd());
    const rulesFormatted = formatRules(rules);
    assert.ok(rulesFormatted.startsWith("<rules>"));
    assert.ok(rulesFormatted.endsWith("</rules>"));
    assert.ok(rulesFormatted.includes("# Clean Code Rules"));
  });

  it("load_skill tool fetches skill content on demand", async () => {
    const skills = loadSkills(process.cwd());
    let activatedSkill: any = null;
    const tool = createSkillTool(skills, (s) => {
      activatedSkill = s;
    });

    const res = await tool.execute({ name: "debugging" });
    const output = typeof res === "string" ? res : res.output;
    assert.ok(output.includes("Loaded skill \"debugging\""));
    assert.ok(output.includes("Root Cause Isolation"));
    assert.strictEqual(activatedSkill?.name, "debugging");

    const failRes = await tool.execute({ name: "non-existent-skill" });
    const failOutput = typeof failRes === "string" ? failRes : failRes.output;
    assert.ok(failOutput.includes("Error: Skill \"non-existent-skill\" not found"));
  });

  it("workspace skills override built-in skills with identical names", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "morpheus-test-"));
    const wsSkillsDir = path.join(tempDir, ".morpheus", "skills", "dev");
    fs.mkdirSync(wsSkillsDir, { recursive: true });

    const overrideFile = path.join(wsSkillsDir, "debugging.md");
    fs.writeFileSync(
      overrideFile,
      `---
name: debugging
category: dev
description: Custom workspace debugging rules
triggers: ["debug"]
---
Custom Workspace Debugging Instructions`
    );

    try {
      const skills = loadSkills(tempDir);
      const debuggingSkill = skills.find((s) => s.name === "debugging");
      assert.ok(debuggingSkill);
      assert.strictEqual(debuggingSkill.description, "Custom workspace debugging rules");
      assert.strictEqual(debuggingSkill.content, "Custom Workspace Debugging Instructions");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
