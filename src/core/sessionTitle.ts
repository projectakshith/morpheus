import type { Operator } from "../provider/operator";

export type TitleSource = "placeholder" | "prompt" | "generated" | "manual";

export const PLACEHOLDER_TITLE = "New Session";

const MAX_TITLE_CHARS = 48;
const MAX_TITLE_WORDS = 8;
const GENERATION_TIMEOUT_MS = 15_000;

const TRIVIAL_PROMPT =
  /^(hi+|hey+|hello+|yo+|sup|wass?up|what'?s up|ok(ay)?|k|thanks?|thx|ty|test(ing)?|uh+|hm+|lol|gm|gn)[\s!?.,]*$/i;

export function isTrivialPrompt(prompt: string): boolean {
  const text = prompt.trim();
  return !text || text.startsWith("/") || TRIVIAL_PROMPT.test(text);
}

function truncateOnWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

export function promptTitle(prompt: string): string | null {
  if (isTrivialPrompt(prompt)) return null;
  const clean = prompt
    .replace(/[#*`_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? truncateOnWord(clean, MAX_TITLE_CHARS) : null;
}

export function sanitizeGeneratedTitle(raw: string): string | null {
  const withoutThinking = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "");
  const line = withoutThinking
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;

  const title = line
    .replace(/^(session\s+)?title\s*[:\-]\s*/i, "")
    .replace(/[*_`#]/g, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/[.!?:;,\s]+$/, "")
    .trim();

  if (!title || title.split(/\s+/).length > MAX_TITLE_WORDS) return null;
  return truncateOnWord(title, MAX_TITLE_CHARS);
}

const TITLE_SYSTEM_PROMPT =
  "You name coding-assistant chat sessions. Reply with ONLY a 2-6 word title in Title Case " +
  "that says what the user is working on. No quotes, no trailing punctuation, no explanation.";

export async function generateSessionTitle(
  operator: Pick<Operator, "chatStream">,
  prompt: string,
  response: string,
  signal?: AbortSignal
): Promise<string | null> {
  const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    let text = "";
    for await (const event of operator.chatStream({
      system: TITLE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `User request:\n${prompt.slice(0, 1000)}\n\nAssistant reply (excerpt):\n${response.slice(0, 1500)}\n\nTitle:`,
        },
      ],
      maxTokens: 200,
      abortSignal: combined,
    })) {
      if (event.type === "text" && event.text) text += event.text;
    }
    return sanitizeGeneratedTitle(text);
  } catch {
    return null;
  }
}

export function displayTitle(title: string | undefined, createdAt: number): string {
  const clean = title?.trim();
  if (clean && clean !== PLACEHOLDER_TITLE && clean !== "Untitled Session" && clean !== "Resumed Session") {
    return clean;
  }
  if (!createdAt) return "Untitled session";
  const date = new Date(createdAt);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Session · ${day}, ${time}`;
}
