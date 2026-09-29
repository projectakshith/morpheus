/*
 * Lexer-based terminal syntax highlighter for source code blocks in Morpheus.
 * Fast, ANSI-safe tokenization for TypeScript, JavaScript, Python, Rust, Go, Bash, and JSON.
 */

import picocolors from "picocolors";
const pc = picocolors.createColors(true);

const JS_TS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "import", "export", "from", "as",
  "class", "interface", "type", "enum", "extends", "implements", "if", "else",
  "switch", "case", "default", "for", "while", "do", "break", "continue", "try",
  "catch", "finally", "throw", "new", "typeof", "instanceof", "void", "async",
  "await", "yield", "this", "super", "constructor", "get", "set", "of", "in",
]);

const PYTHON_KEYWORDS = new Set([
  "def", "class", "import", "from", "as", "return", "if", "elif", "else",
  "while", "for", "in", "try", "except", "finally", "raise", "with", "pass",
  "lambda", "yield", "assert", "async", "await", "global", "nonlocal", "del",
]);

const RUST_GO_KEYWORDS = new Set([
  "fn", "pub", "struct", "enum", "impl", "trait", "match", "use", "mod",
  "crate", "where", "mut", "func", "package", "go", "defer", "chan", "select",
]);

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "case", "esac", "for", "while", "do",
  "done", "in", "function", "return", "exit", "echo", "cd", "export", "source",
]);

const LITERAL_CONSTANTS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "True", "False", "None", "nil", "Ok", "Err", "Some",
]);

const PRIMITIVE_TYPES = new Set([
  "string", "number", "boolean", "any", "unknown", "never", "object", "symbol", "bigint",
  "void", "str", "int", "float", "bool", "dict", "list", "tuple", "set",
  "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "f32", "f64", "usize", "isize",
]);

/**
 * Highlights a single line of source code with ANSI terminal colors.
 */
export function highlightCode(line: string, lang?: string): string {
  if (!line || !line.trim()) return line;

  const normalizedLang = (lang || "").toLowerCase().trim();

  // Handle whole-line comments fast
  const trimmed = line.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("--")
  ) {
    return pc.dim(pc.gray(line));
  }

  // Token extraction maps to preserve strings and inline comments
  const placeholders = new Map<string, string>();
  let phCounter = 0;

  const addPlaceholder = (val: string, colorFn: (s: string) => string): string => {
    const key = `\x00__TK${phCounter++}__\x00`;
    placeholders.set(key, colorFn(val));
    return key;
  };

  let working = line;

  // Extract end-of-line comments
  working = working.replace(/(\/\/.*$|#.*$)/, (match) =>
    addPlaceholder(match, (c) => pc.dim(pc.gray(c)))
  );

  // Extract double-quoted strings
  working = working.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    addPlaceholder(match, (s) => pc.green(s))
  );

  // Extract single-quoted strings
  working = working.replace(/'(?:[^'\\]|\\.)*'/g, (match) =>
    addPlaceholder(match, (s) => pc.green(s))
  );

  // Extract backtick template strings
  working = working.replace(/`(?:[^`\\]|\\.)*`/g, (match) =>
    addPlaceholder(match, (s) => pc.green(s))
  );

  // Function calls: word followed immediately by open parenthesis
  working = working.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g,
    (_, fnName) => {
      if (
        JS_TS_KEYWORDS.has(fnName) ||
        PYTHON_KEYWORDS.has(fnName) ||
        RUST_GO_KEYWORDS.has(fnName) ||
        BASH_KEYWORDS.has(fnName)
      ) {
        return pc.bold(pc.cyan(fnName));
      }
      return pc.cyan(fnName);
    }
  );

  // Words / Identifiers
  working = working.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (match) => {
    // Keywords
    if (
      JS_TS_KEYWORDS.has(match) ||
      PYTHON_KEYWORDS.has(match) ||
      RUST_GO_KEYWORDS.has(match) ||
      BASH_KEYWORDS.has(match)
    ) {
      return pc.bold(pc.magenta(match));
    }

    // Literals
    if (LITERAL_CONSTANTS.has(match)) {
      return pc.yellow(match);
    }

    // Primitive types
    if (PRIMITIVE_TYPES.has(match)) {
      return pc.blue(match);
    }

    // Custom Types / Classes (PascalCase)
    if (/^[A-Z][a-zA-Z0-9_$]*$/.test(match)) {
      return pc.yellow(match);
    }

    return match;
  });

  // Numbers (hex, float, int)
  working = working.replace(/\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g, (match) =>
    pc.yellow(match)
  );

  // Operators
  working = working.replace(/(=>|===|!==|==|!=|<=|>=|&&|\|\||[?:+\-*/%&|^~!=<>])/g, (op) =>
    pc.dim(op)
  );

  // Restore placeholders (strings and comments)
  for (const [key, replacement] of placeholders.entries()) {
    working = working.replace(key, replacement);
  }

  return working;
}
