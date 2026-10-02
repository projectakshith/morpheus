/*
 * Pre-flight provider auth check against Neo, run before each turn so a missing login fails fast with a fix hint.
 */

/* Returns a markdown explanation when the model's provider is not authenticated, null when it is (or Neo can't tell). */
export async function checkProviderAuth(model: string, baseURL?: string): Promise<string | null> {
  try {
    const neoBase = baseURL || "http://127.0.0.1:8787/v1";
    let providerId = "antigravity";
    if (
      model.startsWith("cloud/") ||
      model.startsWith("openrouter/") ||
      model.includes("space-bunny") ||
      model.includes("deepseek")
    ) {
      providerId = "openrouter";
    } else if (model.startsWith("local/") || model.includes("llama") || model.includes("qwen")) {
      providerId = "local";
    }

    const statusUrl = neoBase.endsWith("/v1")
      ? `${neoBase}/auth/status?provider=${providerId}`
      : `${neoBase}/v1/auth/status?provider=${providerId}`;

    const checkRes = await fetch(statusUrl, { signal: AbortSignal.timeout(800) });
    if (!checkRes.ok) return null;
    const authData = (await checkRes.json()) as { authenticated?: boolean; error?: string; name?: string };
    if (authData.authenticated !== false) return null;

    let fixHint = "";
    if (providerId === "openrouter") {
      fixHint = "Run `/login openrouter <api-key>` to configure your OpenRouter key.";
    } else if (providerId === "antigravity") {
      fixHint = "Run `/login antigravity` to authenticate via Google OAuth.";
    } else if (providerId === "local") {
      fixHint = "Ensure Ollama is running (`ollama serve`) or run `/login local`.";
    }
    return `## Authentication Required for ${authData.name || providerId}\n\n${authData.error || "Provider is not authenticated."}\n\n*${fixHint}*`;
  } catch {
    /* Neo unreachable or slow: let the run surface the real error. */
    return null;
  }
}
