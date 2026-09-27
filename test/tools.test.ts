import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readFile } from "../src/tools/read.js";
import { writeFile } from "../src/tools/write.js";
import { editFile } from "../src/tools/edit.js";
import { executeBash } from "../src/tools/bash.js";
import { truncateOutput } from "../src/tools/construct.js";

test("Tools: write_file and read_file", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-test-"));
  const targetFile = path.join(tmpDir, "sub", "test.txt");

  await t.test("write_file creates nested dirs and writes content", async () => {
    const res = await writeFile({
      filePath: targetFile,
      content: "line one\nline two\nline three",
    });
    assert.match(res.output, /Successfully wrote/);
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
    // Slightly altered indentation in oldString to test fuzzy recovery
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
  assert.ok(res.outputPath);

  // Verify full file was written to disk
  const diskContent = await fs.readFile(res.outputPath, "utf-8");
  assert.equal(diskContent.split("\n").length, 3000);
});

test("Tools: bash execution", async () => {
  const res = await executeBash({ command: "echo 'morpheus test'" });
  assert.equal(res.output.trim(), "morpheus test");
});
