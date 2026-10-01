const MAX_STALL_CHARS = 400;

/* Evaluates whether assistant content is an advisory deflection, future narrative,
 * or permission prompt that stalls autonomous tool execution. */
export function isConversationalStall(
  content: string,
  stepCount: number,
  maxSteps: number,
  nudges: number
): boolean {
  if (stepCount >= maxSteps || nudges >= 3) {
    return false;
  }

  const trimmed = content.trim();
  if (trimmed.length > MAX_STALL_CHARS || trimmed.includes("```")) {
    return false;
  }

  const matchesFutureAction =
    /(\b(let's|let us|let me|i'll|i will|i should|i'm going to|i need to|we will|we can|we should|we need to)\s+(?:try\s+(?:to\s+)?|first\s+|now\s+|also\s+|proceed\s+to\s+|go\s+ahead\s+and\s+|just\s+|quickly\s+)?(?:take\s+(?:a\s+)?(?:look|peek)|check(?:\s+out)?|confirm|verify|dig\s+into|dive\s+into|turn\s+(?:our\s+)?attention\s+to|look(?:\s+at|\s+into)?|explore|investigate|search|inspect|scan|list|read|outline|see\s+(?:if|whether)?|find\s+out|examine|start\s+(?:by|with)?|locate|head\s+over\s+to|browse|fetch|pull\s+up|query)\b|\bshall i\b|\bshould we\b|\bwould you like\b)/i.test(
      content
    );

  const matchesAdvisory =
    /\b(you can|you may|feel free to|you should|you might want to)\s+(?:check|read|inspect|look at|explore|see|review|find|open)\b/i.test(
      content
    );

  const endsWithColon = /:[\s\n]*$/.test(content);

  return matchesFutureAction || matchesAdvisory || endsWithColon;
}
