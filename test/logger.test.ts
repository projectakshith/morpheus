import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SessionLogger } from "../src/core/logger";
import { isToolError } from "../src/utils/errors";

test("isToolError safeguards against false positives", async (t) => {
  await t.test("does not flag normal code containing 'error' as failure", () => {
    const normalCode = "export interface Options {\n  errorLinesToPreserve?: number;\n}\nconst isError = false;";
    assert.equal(isToolError(normalCode), false);
  });

  await t.test("does not flag normal code containing 'failed' as failure", () => {
    const codeWithFailed = "function check() {\n  return status === 'failed';\n}";
    assert.equal(isToolError(codeWithFailed), false);
  });

  await t.test("flags outputs starting with Error:", () => {
    assert.equal(isToolError("Error: File not found: src/foo.ts"), true);
  });

  await t.test("flags outputs starting with Command exited with code > 0", () => {
    assert.equal(isToolError("Command exited with code 1\ncat: missing operand"), true);
    assert.equal(isToolError("Command exited with code 127\nnot found"), true);
  });

  await t.test("does not flag Command exited with code 0", () => {
    assert.equal(isToolError("Command exited with code 0\nsuccess"), false);
  });

  await t.test("respects explicit boolean metadata when provided", () => {
    assert.equal(isToolError("any text", true), true);
    assert.equal(isToolError("Error: something", false), false);
  });
});

test("SessionLogger records complete session history", async () => {
  const logger = new SessionLogger();
  await logger.init("test task", "/test/cwd", "test-model");
  await logger.logStep(1);
  await logger.logToolCall(1, "read_file", { filePath: "src/index.ts" });
  await logger.logToolResult(1, "read_file", "console.log('hello');", false);
  await logger.logAssistantResponse("task finished");
  await logger.logFinish({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

  const logPath = logger.getLogPath();
  const latestPath = logger.getLatestPath();

  const sessionContent = await fs.readFile(logPath, "utf-8");
  const latestContent = await fs.readFile(latestPath, "utf-8");

  assert.match(sessionContent, /MORPHEUS SESSION LOG/);
  assert.match(sessionContent, /Task: test task/);
  assert.match(sessionContent, /\[TOOL CALL\] read_file/);
  assert.match(sessionContent, /\[TOOL RESULT\] read_file \(SUCCESS\)/);
  assert.match(sessionContent, /Token Usage: 100 in \| 50 out \| 150 total/);
  assert.equal(sessionContent, latestContent);
});
