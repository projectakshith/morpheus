import test from "node:test";
import assert from "node:assert/strict";
import { tryExtractTextToolCall, tryExtractTextToolCalls } from "../src/utils/toolExtraction";
import type { ToolDefinition } from "../src/core/types";

const mockTools: Record<string, ToolDefinition> = {
  list_dir: {
    name: "list_dir",
    description: "List directory contents",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ output: "mock" }),
  },
  read_file: {
    name: "read_file",
    description: "Read a file",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ output: "mock" }),
  },
  grep_code: {
    name: "grep_code",
    description: "Search code",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ output: "mock" }),
  },
  record_finding: {
    name: "record_finding",
    description: "Record finding",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ output: "mock" }),
  },
};

test("tryExtractTextToolCall parses markdown codeblock tool call", () => {
  const text = "Sure thing, checking the directory structure for you:\n\n```json\n{\"name\": \"list_dir\", \"arguments\": {\"dirPath\": \".\"}}\n```";
  const result = tryExtractTextToolCall(text, mockTools);

  assert.ok(result);
  assert.equal(result.toolCall.function.name, "list_dir");
  assert.equal(JSON.parse(result.toolCall.function.arguments).dirPath, ".");
  assert.match(result.remainingText, /Sure thing, checking the directory structure/);
});

test("tryExtractTextToolCall parses raw JSON tool call", () => {
  const text = "{\"name\": \"read_file\", \"arguments\": {\"filePath\": \"package.json\"}}";
  const result = tryExtractTextToolCall(text, mockTools);

  assert.ok(result);
  assert.equal(result.toolCall.function.name, "read_file");
  assert.equal(JSON.parse(result.toolCall.function.arguments).filePath, "package.json");
});

test("tryExtractTextToolCall returns null for standard text without tool calls", () => {
  const text = "Here is the summary of how authentication works in the repository.";
  const result = tryExtractTextToolCall(text, mockTools);

  assert.equal(result, null);
});

test("tryExtractTextToolCalls extracts multiple tool_name newline format calls (local model pattern)", () => {
  const text = `to get a sense of how auth is handled, i will check files.

record_finding
{"topic": "auth-flow", "takeaway": "encryption is handled in utils"}

list_dir
{"depth": 2, "dirPath": "../ratio-d"}

grep_code
{"pattern": "auth|session", "searchPath": "../ratio-d"}`;

  const result = tryExtractTextToolCalls(text, mockTools);

  assert.equal(result.toolCalls.length, 3);
  assert.equal(result.toolCalls[0].function.name, "record_finding");
  assert.equal(JSON.parse(result.toolCalls[0].function.arguments).topic, "auth-flow");
  assert.equal(result.toolCalls[1].function.name, "list_dir");
  assert.equal(JSON.parse(result.toolCalls[1].function.arguments).dirPath, "../ratio-d");
  assert.equal(result.toolCalls[2].function.name, "grep_code");
  assert.equal(JSON.parse(result.toolCalls[2].function.arguments).pattern, "auth|session");
  assert.match(result.remainingText, /to get a sense of how auth is handled/);
});

test("tryExtractTextToolCalls parses Ollama XML tool_call tag", () => {
  const text = "<tool_call>\n{\"name\": \"list_dir\", \"arguments\": {\"dirPath\": \"./src\"}}\n</tool_call>";
  const result = tryExtractTextToolCalls(text, mockTools);

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].function.name, "list_dir");
  assert.equal(JSON.parse(result.toolCalls[0].function.arguments).dirPath, "./src");
  assert.equal(result.remainingText, "");
});

test("tryExtractTextToolCalls parses tool_name({ ... }) JS syntax inside or outside codeblocks", () => {
  const text = `Let's check the directory structure:

\`\`\`
list_dir({depth: 2, dirPath: '../ratio-d'})
\`\`\`

Now searching:

grep_code({pattern: 'auth', searchPath: '../ratio-d'})`;

  const result = tryExtractTextToolCalls(text, mockTools);

  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].function.name, "list_dir");
  assert.equal(JSON.parse(result.toolCalls[0].function.arguments).dirPath, "../ratio-d");
  assert.equal(result.toolCalls[1].function.name, "grep_code");
  assert.equal(JSON.parse(result.toolCalls[1].function.arguments).pattern, "auth");
  assert.match(result.remainingText, /Let's check the directory structure/);
});

test("tryExtractTextToolCalls parses tool_name { ... } same-line call", () => {
  const text = `Sure thing! Let's list the contents of the backend directory.

list_dir {"dirPath": "backend"}`;

  const result = tryExtractTextToolCalls(text, mockTools);

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].function.name, "list_dir");
  assert.equal(JSON.parse(result.toolCalls[0].function.arguments).dirPath, "backend");
  assert.match(result.remainingText, /Sure thing! Let's list the contents/);
});
