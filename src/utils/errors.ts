/**
 * Formats an unknown caught value into a clean, readable error message.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function isToolError(output: string, explicitIsError?: boolean): boolean {
  if (explicitIsError !== undefined) {
    return explicitIsError;
  }
  const trimmed = output.trim();
  if (/^Command exited with code [1-9]/.test(trimmed)) {
    return true;
  }
  if (/^Error:/i.test(trimmed) || /^Fatal:/i.test(trimmed)) {
    return true;
  }
  return false;
}
