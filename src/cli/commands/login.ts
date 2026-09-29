import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class LoginCommand implements CommandHandler {
  public readonly name = "login";
  public readonly description = "Authenticate provider credentials (antigravity, openrouter, local)";
  public readonly aliases = ["/login"];

  public matches(trimmed: string): boolean {
    return trimmed === "/login" || trimmed.startsWith("/login ");
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.split(/\s+/);
    const subCommand = parts[1]?.toLowerCase();
    const arg = parts.slice(2).join(" ").trim();
    const loginThreadId = `thread_${Date.now()}`;

    /* Handle /login help or unknown subcommand */
    if (subCommand && !["antigravity", "agy", "google", "openrouter", "local", "ollama"].includes(subCommand)) {
      const helpText = `## Modular Authentication Providers\n\n- \`/login antigravity\` - Authenticate Google Cloud Code via browser OAuth\n- \`/login openrouter <api-key>\` - Validate and store OpenRouter API key\n- \`/login local [baseUrl]\` - Connect to local Ollama server (default: http://127.0.0.1:11434)\n- \`/auth\` - View real-time status across all providers`;
      const helpThread: Thread = {
        id: loginThreadId,
        index: ctx.threadsCount + 1,
        prompt: ctx.taskText,
        response: helpText,
        isStreaming: false,
        steps: [],
        isExpanded: false,
        status: "completed",
        stepCount: 0,
        startTime: Date.now(),
        durationMs: 0,
      };
      ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
      ctx.setThreads((prev) => [...prev, helpThread]);
      return true;
    }

    /* Determine target provider */
    let targetProvider = "antigravity";
    let requestBody: Record<string, unknown> = { provider: "antigravity" };
    let initialMessage = "Opening Google authentication in your default browser...\nPlease complete sign-in and return to this terminal.";

    if (subCommand === "openrouter") {
      targetProvider = "openrouter";
      if (!arg) {
        const errThread: Thread = {
          id: loginThreadId,
          index: ctx.threadsCount + 1,
          prompt: ctx.taskText,
          response: "Error: OpenRouter API key is required.\nUsage: `/login openrouter <your-api-key>`",
          isStreaming: false,
          steps: [],
          isExpanded: false,
          status: "error",
          stepCount: 0,
          startTime: Date.now(),
          durationMs: 0,
        };
        ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
        ctx.setThreads((prev) => [...prev, errThread]);
        return true;
      }
      requestBody = { provider: "openrouter", apiKey: arg };
      initialMessage = "Validating OpenRouter API key...";
    } else if (subCommand === "local" || subCommand === "ollama") {
      targetProvider = "local";
      requestBody = { provider: "local", baseUrl: arg || undefined };
      initialMessage = "Connecting to local Ollama server...";
    }

    const initialLoginThread: Thread = {
      id: loginThreadId,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: initialMessage,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "running",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };
    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, initialLoginThread]);

    try {
      const neoBase = ctx.baseURL || "http://127.0.0.1:8787/v1";
      const loginUrl = neoBase.endsWith("/v1")
        ? `${neoBase}/auth/login`
        : `${neoBase}/v1/auth/login`;

      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const resData = (await res.json()) as {
          status?: string;
          provider?: string;
          auth?: { identity?: string; details?: Record<string, unknown> };
        };
        let successMessage = "";
        if (targetProvider === "antigravity") {
          successMessage = "Authentication successful! Google Cloud credentials have been refreshed and saved to macOS Keychain.";
        } else if (targetProvider === "openrouter") {
          const maskedKey = resData?.auth?.identity || "sk-or-v1-***";
          successMessage = `Authentication successful! OpenRouter API key validated (\`${maskedKey}\`) and securely saved to macOS Keychain.`;
        } else if (targetProvider === "local") {
          const count = (resData?.auth?.details?.count as number) || 0;
          successMessage = `Connected to local runtime successfully! Discovered ${count} local models from Ollama.`;
        }

        ctx.setThreads((prev) =>
          prev.map((t) =>
            t.id === loginThreadId
              ? {
                  ...t,
                  status: "completed",
                  response: successMessage,
                }
              : t
          )
        );
      } else {
        const errText = await res.text();
        let parsedErr = errText;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error) parsedErr = typeof parsed.error === "string" ? parsed.error : parsed.error.message;
        } catch {}
        ctx.setThreads((prev) =>
          prev.map((t) =>
            t.id === loginThreadId
              ? {
                  ...t,
                  status: "error",
                  response: `Authentication error (${res.status}): ${parsedErr}`,
                }
              : t
          )
        );
      }
    } catch (err: unknown) {
      ctx.setThreads((prev) =>
        prev.map((t) =>
          t.id === loginThreadId
            ? {
                ...t,
                status: "error",
                response: `Could not reach Neo proxy: ${err instanceof Error ? err.message : String(err)}. Ensure Neo is running on port 8787.`,
              }
            : t
        )
      );
    }
    return true;
  }
}

export const loginCommand = new LoginCommand();
