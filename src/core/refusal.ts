import type { RefusalKind } from "./types";

export type { RefusalKind };

const CLARIFY_PATTERNS = [
  /^(?:could|can|would) you (?:clarify|confirm|provide|share|specify)\b/i,
  /\bwhich (?:target|environment|host|scope|repository|organization)\b/i,
  /\b(?:need|require|provide|share|confirm|show)\b[^.]{0,80}\b(?:authorization|authorisation|permission|scope|written approval|rules of engagement)\b/i,
  /\bonly (?:assist|help|proceed|work)\b[^.]{0,80}\b(?:authorized|authorised|permission|scope)\b/i,
  /\b(?:are|is) you (?:the owner|authorized|authorised)\b/i,
];

const HARD_PATTERNS = [
  /\bI (?:can't|cannot|won't|will not|am unable to|am not able to)\b[^.]{0,120}\b(?:help|assist|provide|do|comply|participate|support)\b/i,
  /\b(?:against|violates?) (?:my|the|our) (?:policy|policies|guidelines|terms|usage)\b/i,
  /\bnot (?:able|allowed|permitted) to (?:assist|help|provide)\b/i,
];

const HEDGE_PATTERN = /\b(?:sorry|unfortunately|apologi[sz]e)\b/i;

const TECHNICAL_PATTERN =
  /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|HTTP|header|host|endpoint|port|DNS|subdomain|payload|response|request|status|cookie|token|credential|repository|file|code|scan|probe|target)\b/i;

const TECHNICAL_LIMIT_PATTERN =
  /\b(?:can't|cannot|unable)\b[^.]{0,100}\b(?:reach|read|access|verify|determine|confirm|connect|resolve|retrieve|fetch|parse)\b[^.]{0,100}\b(?:host|server|endpoint|port|DNS|TLS|certificate|response|body|header|40[134]|429|timeout|timed out)\b/i;

const SCOPE_DENIAL_PATTERN =
  /\b(?:host|target|url|domain|endpoint)\b[^.]{0,60}\b(?:not in scope|out of scope|outside (?:the )?scope)\b/i;

export function classifyRefusal(text: string, finishReason?: string): RefusalKind {
  if (finishReason === "content_filter") return "hard";
  const trimmed = text.trim();
  if (!trimmed) return "none";
  if (CLARIFY_PATTERNS.some((pattern) => pattern.test(trimmed))) return "clarify";
  if (TECHNICAL_LIMIT_PATTERN.test(trimmed) && !/\b(?:policy|policies|guidelines)\b/i.test(trimmed)) {
    return "none";
  }
  if (SCOPE_DENIAL_PATTERN.test(trimmed)) return "none";
  if (HARD_PATTERNS.some((pattern) => pattern.test(trimmed))) return "hard";
  if (trimmed.length <= 320 && HEDGE_PATTERN.test(trimmed) && !TECHNICAL_PATTERN.test(trimmed)) {
    return "partial";
  }
  return "none";
}

export function shouldRecover(kind: RefusalKind): boolean {
  return kind === "hard" || kind === "partial";
}
