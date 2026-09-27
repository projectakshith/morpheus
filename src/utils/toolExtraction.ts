import type { ToolCall, ToolDefinition } from "../core/types";

export interface ExtractedToolCalls {
  toolCalls: ToolCall[];
  remainingText: string;
}

/**
 * Parses a JavaScript object string (with unquoted keys or single quotes) into an object.
 */
function parseLooseJsonObject(str: string): Record<string, unknown> {
  const trimmed = str.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
  }

  try {
    const normalized = trimmed
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(normalized);
  } catch {
  }

  return {};
}

/**
 * Helper to extract a balanced JSON/object literal starting at `{` index.
 */
function extractBalancedJsonObject(
  text: string,
  startIndex: number
): { jsonStr: string; endIndex: number } | null {
  let depth = 0;
  let inString = false;
  let quoteChar = "";
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && !inString) {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === quoteChar && inString && !escape) {
      inString = false;
      quoteChar = "";
      continue;
    }
    if (!inString) {
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return {
            jsonStr: text.slice(startIndex, i + 1),
            endIndex: i + 1,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts tool calls from model output text.
 * Supports:
 * 1. <tool_call> JSON </tool_call> (Ollama / Qwen template tags)
 * 2. tool_name({ ... }) (Coder model function call syntax, with or without code blocks)
 * 3. ```json { ... } ``` (Markdown code blocks)
 * 4. <tool_name>\n{ ... } (Model emitting tool name line followed by JSON args)
 * 5. Raw JSON { "name": "...", "arguments": ... }
 */
export function tryExtractTextToolCalls(
  text: string,
  tools: Record<string, ToolDefinition>
): ExtractedToolCalls {
  if (!text || typeof text !== "string") {
    return { toolCalls: [], remainingText: "" };
  }

  const validTools = new Set(Object.keys(tools));
  const toolCalls: ToolCall[] = [];
  let remaining = text;

  /* 1. Extract <tool_call> ... </tool_call> XML blocks */
  const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const xmlMatches = Array.from(remaining.matchAll(xmlRegex));
  for (const xmlMatch of xmlMatches) {
    const fullMatch = xmlMatch[0];
    const inner = xmlMatch[1].trim();
    try {
      const parsed = JSON.parse(inner);
      const name = parsed.name || parsed.tool || parsed.function;
      if (typeof name === "string" && validTools.has(name)) {
        const rawArgs = parsed.arguments ?? parsed.parameters ?? {};
        const argsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: { name, arguments: argsStr },
        });
        remaining = remaining.replace(fullMatch, "");
      }
    } catch {
    }
  }

  /* 2. Extract tool_name({ ... }) call syntax (inside or outside codeblocks) */
  const fnCallRegex = /(?:```[a-zA-Z0-9_-]*\s*)?([a-zA-Z0-9_-]+)\s*\(\s*(\{[\s\S]*?\})\s*\)(?:\s*```)?/g;
  const fnMatches = Array.from(remaining.matchAll(fnCallRegex));
  for (const fnMatch of fnMatches) {
    const fullMatch = fnMatch[0];
    const name = fnMatch[1];
    const argsBlock = fnMatch[2];
    if (validTools.has(name)) {
      const parsed = parseLooseJsonObject(argsBlock);
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 9)}`,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(parsed),
        },
      });
      remaining = remaining.replace(fullMatch, "");
    }
  }

  /* 3. Extract markdown code blocks ```json { ... } ``` */
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  const codeMatches = Array.from(remaining.matchAll(codeBlockRegex));
  for (const codeMatch of codeMatches) {
    const fullMatch = codeMatch[0];
    const inner = codeMatch[1].trim();
    try {
      const parsed = JSON.parse(inner);
      const name = parsed.name || parsed.tool || parsed.function;
      if (typeof name === "string" && validTools.has(name)) {
        const rawArgs = parsed.arguments ?? parsed.parameters ?? {};
        const argsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: { name, arguments: argsStr },
        });
        remaining = remaining.replace(fullMatch, "");
      }
    } catch {
    }
  }

  /* 4. Extract <tool_name> { ... } (same-line) or <tool_name>\n{ ... } format (common in local models) */
  const lines = remaining.split("\n");
  let lineIdx = 0;
  while (lineIdx < lines.length) {
    const rawLine = lines[lineIdx].trim();
    
    /* Check same-line call: tool_name { ... } */
    const sameLineMatch = /^([a-zA-Z0-9_-]+)\s+(\{[\s\S]*)$/.exec(rawLine);
    if (sameLineMatch && validTools.has(sameLineMatch[1])) {
      const toolName = sameLineMatch[1];
      const jsonStrCandidate = rawLine.slice(toolName.length).trim();
      const balanced = extractBalancedJsonObject(jsonStrCandidate, 0);
      if (balanced) {
        const parsedArgs = parseLooseJsonObject(balanced.jsonStr);
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(parsedArgs),
          },
        });
        lines.splice(lineIdx, 1);
        continue;
      }
    }

    if (validTools.has(rawLine)) {
      const toolName = rawLine;
      let nextIdx = lineIdx + 1;
      while (nextIdx < lines.length && !lines[nextIdx].trim()) {
        nextIdx++;
      }

      if (nextIdx < lines.length && lines[nextIdx].trim().startsWith("{")) {
        const remainingJoined = lines.slice(nextIdx).join("\n");
        const jsonStart = remainingJoined.indexOf("{");
        const balanced = extractBalancedJsonObject(remainingJoined, jsonStart);

        if (balanced) {
          const parsedArgs = parseLooseJsonObject(balanced.jsonStr);
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 9)}`,
            type: "function",
            function: {
              name: toolName,
              arguments: JSON.stringify(parsedArgs),
            },
          });

          const consumedLines = balanced.jsonStr.split("\n").length;
          lines.splice(lineIdx, (nextIdx - lineIdx) + consumedLines);
          continue;
        }
      }
    }
    lineIdx++;
  }
  remaining = lines.join("\n");

  /* 5. Extract raw JSON objects { "name": "...", "arguments": ... } */
  let searchIdx = 0;
  while (searchIdx < remaining.length) {
    const nextBrace = remaining.indexOf("{", searchIdx);
    if (nextBrace === -1) break;

    const balanced = extractBalancedJsonObject(remaining, nextBrace);
    if (!balanced) {
      searchIdx = nextBrace + 1;
      continue;
    }

    try {
      const parsed = JSON.parse(balanced.jsonStr);
      const name = parsed.name || parsed.tool || parsed.function;
      if (typeof name === "string" && validTools.has(name)) {
        const rawArgs = parsed.arguments ?? parsed.parameters ?? {};
        const argsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: { name, arguments: argsStr },
        });
        remaining =
          remaining.slice(0, nextBrace) +
          remaining.slice(balanced.endIndex);
        searchIdx = nextBrace;
        continue;
      }
    } catch {
    }

    searchIdx = nextBrace + 1;
  }

  return {
    toolCalls,
    remainingText: remaining.trim(),
  };
}

/**
 * Backwards-compatible single tool extractor.
 */
export function tryExtractTextToolCall(
  text: string,
  tools: Record<string, ToolDefinition>
): { toolCall: ToolCall; remainingText: string } | null {
  const result = tryExtractTextToolCalls(text, tools);
  if (result.toolCalls.length === 0) return null;
  return {
    toolCall: result.toolCalls[0],
    remainingText: result.remainingText,
  };
}
