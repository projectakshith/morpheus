import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readFile } from "../src/tools/read";
import { writeFile } from "../src/tools/write";
import { editFile } from "../src/tools/edit";
import { executeBash } from "../src/tools/bash";
import { truncateOutput } from "../src/tools/construct";
import { listDir } from "../src/tools/list";
import { grepCode } from "../src/tools/grep";
import { recordFinding, createFindingTool } from "../src/tools/finding";

test("Tools: write_file and read_file", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-test-"));
  const targetFile = path.join(tmpDir, "sub", "test.txt");

  await t.test("write_file creates nested dirs and writes content", async () => {
    const res = await writeFile({
      filePath: targetFile,
      content: "line one\nline two\nline three",
    });
    assert.match(res.output, /Successfully wrote/);
    assert.equal(res.metadata?.changed, true);
    const repeated = await writeFile({ filePath: targetFile, content: "line one\nline two\nline three" });
    assert.equal(repeated.metadata?.changed, false, "same-content overwrites are not workspace progress");
  });

  await t.test("read_file returns numbered lines", async () => {
    const res = await readFile({ filePath: targetFile });
    assert.match(res.output, /1: line one/);
    assert.match(res.output, /2: line two/);
    assert.match(res.output, /3: line three/);
  });

  await t.test("read_file fuzzy suggests closest file on miss", async () => {
    await assert.rejects(
      async () => {
        await readFile({ filePath: path.join(tmpDir, "sub", "tst.txt") });
      },
      /Did you mean one of these/
    );
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("Tools: edit_file with exact match and fuzzy fallback", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-edit-"));
  const targetFile = path.join(tmpDir, "code.ts");

  await fs.writeFile(
    targetFile,
    "function hello() {\n  const greeting = 'hi';\n  return greeting;\n}\n",
    "utf-8"
  );

  await t.test("exact string replacement", async () => {
    const res = await editFile({
      filePath: targetFile,
      oldString: "const greeting = 'hi';",
      newString: "const greeting = 'hello world';",
    });
    assert.match(res.output, /Successfully applied edits/);

    const updated = await fs.readFile(targetFile, "utf-8");
    assert.match(updated, /const greeting = 'hello world';/);
  });

  await t.test("fuzzy anchor fallback with whitespace drift", async () => {
    const res = await editFile({
      filePath: targetFile,
      oldString: "  return greeting;",
      newString: "  return greeting.toUpperCase();",
    });
    assert.match(res.output, /Successfully applied edits/);

    const updated = await fs.readFile(targetFile, "utf-8");
    assert.match(updated, /return greeting.toUpperCase\(\);/);
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("Tools: construct truncation spillover", async () => {
  const longOutput = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
  const res = await truncateOutput(longOutput, { maxLines: 50 });

  assert.equal(res.truncated, true);
  assert.match(res.content, /\[TRUNCATED\]/);
  assert.match(res.content, /model has not seen this content/);
  assert.ok(res.outputPath);

  const diskContent = await fs.readFile(res.outputPath, "utf-8");
  assert.equal(diskContent.split("\n").length, 3000);
});

test("Tool output limits can be set per tool", async () => {
  const output = "x".repeat(20 * 1024);
  const grep = await truncateOutput(output, { toolName: "grep_code" });
  const read = await truncateOutput(output, { toolName: "read_file" });
  assert.equal(grep.truncated, true);
  assert.equal(read.truncated, false);
});

test("Tools: bash execution", async () => {
  const res = await executeBash({ command: "echo 'morpheus test'" });
  assert.equal(res.output.trim(), "morpheus test");
});

test("Tools: listDir tree traversal", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-list-"));
  await fs.mkdir(path.join(tmpDir, "src", "nested"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "export const a = 1;");
  await fs.writeFile(path.join(tmpDir, "src", "nested", "child.ts"), "export const b = 2;");
  await fs.mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "node_modules", "pkg", "index.js"), "module.exports = {}");

  await t.test("lists directory tree up to maxDepth and excludes node_modules", async () => {
    const res = await listDir({ dirPath: tmpDir, depth: 3 }, tmpDir);
    assert.match(res.output, /src\//);
    assert.match(res.output, /index\.ts/);
    assert.match(res.output, /nested\//);
    assert.match(res.output, /child\.ts/);
    assert.equal(res.output.includes("node_modules"), false);
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("Tools: grepCode search", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-grep-"));
  await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "sub", "auth.ts"), "export function verifySessionToken(token: string) {\n  return token === 'secret';\n}\n");
  await fs.writeFile(path.join(tmpDir, "sub", "other.ts"), "export function other() {}\n");

  await t.test("finds matching lines with line numbers", async () => {
    const res = await grepCode({ pattern: "verifySessionToken", searchPath: tmpDir }, tmpDir);
    assert.match(res.output, /auth\.ts/);
    assert.match(res.output, /1: export function verifySessionToken/);
  });

  await t.test("returns no matches message when not found", async () => {
    const res = await grepCode({ pattern: "nonExistentSymbolXYZ", searchPath: tmpDir }, tmpDir);
    assert.match(res.output, /No matches found/);
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("Tools: record_finding", async (t) => {
  const findings: { topic: string; takeaway: string }[] = [];
  const tool = createFindingTool((f) => findings.push(f));

  await t.test("records valid finding", async () => {
    const res = await tool.execute({ topic: "auth", takeaway: "uses JWT tokens in Authorization header" });
    assert.match(String(res), /Recorded finding \[auth\]/);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].topic, "auth");
    assert.equal(findings[0].takeaway, "uses JWT tokens in Authorization header");
  });

  await t.test("rejects missing topic or takeaway", async () => {
    const res = await tool.execute({ topic: "", takeaway: "test" });
    assert.match(String(res), /Error: Both 'topic' and 'takeaway' are required/);
  });
});
