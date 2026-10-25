export type RefusalKind = "none" | "hard" | "partial" | "clarify";

const CLARIFY_PATTERNS = [
  /^(?:could|can|would) you (?:clarify|confirm|provide|share|specify)\b/i,
  /\bwhich (?:target|environment|host|scope|repository|organization)\b/i,
];

const HARD_PATTERNS = [
  /\bI (?:can't|cannot|won't|will not|am unable to|am not able to)\b[^.]{0,120}\b(?:help|assist|provide|do|comply|participate|support)\b/i,
  /\b(?:against|violates?) (?:my|the|our) (?:policy|policies|guidelines|terms|usage)\b/i,
  /\bnot (?:able|allowed|permitted) to (?:assist|help|provide)\b/i,
];

const HEDGE_PATTERN = /\b(?:sorry|unfortunately|apologi[sz]e)\b/i;

const TECHNICAL_PATTERN =
  /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|HTTP|header|host|endpoint|port|DNS|subdomain|payload|response|request|status|cookie|token|credential|repository|file|code|scan|probe|target)\b/i;

export function classifyRefusal(text: string, finishReason?: string): RefusalKind {
  if (finishReason === "content_filter") return "hard";
  const trimmed = text.trim();
  if (!trimmed) return "none";
  if (CLARIFY_PATTERNS.some((pattern) => pattern.test(trimmed))) return "clarify";
  if (HARD_PATTERNS.some((pattern) => pattern.test(trimmed))) return "hard";
  if (trimmed.length <= 320 && HEDGE_PATTERN.test(trimmed) && !TECHNICAL_PATTERN.test(trimmed)) {
    return "partial";
  }
  return "none";
}

export function shouldRecover(kind: RefusalKind): boolean {
  return kind === "hard" || kind === "partial";
}
