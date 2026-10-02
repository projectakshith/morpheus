export function formatAgentError(errMsg: string, baseURL?: string): string {
  const lowErr = errMsg.toLowerCase();
  let response = `error: ${lowErr}`;
  if (lowErr.includes("claude") && /401|403|token|oauth|keychain/.test(lowErr)) {
    response += `\n\nclaude pro is not authenticated. run \`claude auth login\` in terminal or type \`/login claude <token>\`.`;
  } else if (lowErr.includes("codex") && /401|403|token|auth\.json/.test(lowErr)) {
    response += `\n\ncodex session is not authenticated. run \`codex login\` in terminal or type \`/login codex <token>\`.`;
  } else if (
    lowErr.includes("openrouter") &&
    /api key|unauthorized|401|not configured/.test(lowErr)
  ) {
    response += `\n\nopenrouter is not configured. type \`/login openrouter <api-key>\`.`;
  } else if (
    lowErr.includes("antigravity") &&
    /credentials|keychain|401|403|unauthenticated/.test(lowErr)
  ) {
    response += `\n\ngoogle cloud code is not authenticated. type \`/login antigravity\`.`;
  } else if (/fetch failed|econnrefused/.test(lowErr)) {
    response += `\n\nunable to connect to neo proxy (${baseURL || "http://127.0.0.1:8787"}). ensure neo daemon is running.`;
  }
  return response;
}
