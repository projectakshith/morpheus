import type { TaskArchetype } from "./types";

export function classifyTaskArchetype(prompt: string): TaskArchetype {
  const normalized = prompt.toLowerCase().trim();

  // 1. Research & Evaluation
  if (
    /\b(research|evaluate|evaluation|compare|comparison|versus|\bvs\b|alternatives?|options|benchmark|benchmarking|pros and cons|survey|market)\b/i.test(
      normalized
    )
  ) {
    return "research";
  }

  // 2. New Project / System Scaffolding
  if (
    /\b(create\s+(?:a\s+|new\s+)*project|scaffold(ing)?|architect(ure)?|blueprint|bootstrap|design\s+(?:system|architecture)|new\s+feature|spec(ification)?)\b/i.test(
      normalized
    )
  ) {
    return "scaffold";
  }

  // 3. Forensic Codebase Investigation / Root Cause Bug Hunting
  if (
    /\b(investigate|why (is|does|did|are)|root cause|debug(ging)?|trace|traceback|failure|broken|exception|crash|regression|diagnos(e|is)|failing|leak)\b/i.test(
      normalized
    )
  ) {
    return "investigation";
  }

  // 4. Surgical Refactor & Implementation (default for coding tasks)
  return "refactor";
}
