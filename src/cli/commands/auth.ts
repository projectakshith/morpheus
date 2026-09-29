import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class AuthCommand implements CommandHandler {
  public readonly name = "auth";
  public readonly description = "Display real-time authentication status across all providers";
  public readonly aliases = ["/auth", "/whoami", "/status"];

  public matches(trimmed: string): boolean {
    return this.aliases.includes(trimmed);
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("settings");
      return true;
    }

    let authStatusText = "";
    try {
      const neoBase = ctx.baseURL || "http://127.0.0.1:8787/v1";
      const statusUrl = neoBase.endsWith("/v1")
        ? `${neoBase}/auth/status`
        : `${neoBase}/v1/auth/status`;

      const res = await fetch(statusUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const info = (await res.json()) as {
          authenticated?: boolean;
          email?: string;
          expiry?: string;
          service?: string;
          account?: string;
          providers?: Array<{
            provider: string;
            name: string;
            authType: string;
            authenticated: boolean;
            identity?: string;
            expiry?: string;
            details?: Record<string, unknown>;
            error?: string;
          }>;
        };

        if (info.providers && Array.isArray(info.providers)) {
          const sections = info.providers.map((p) => {
            if (p.authenticated) {
              let detailLines = "";
              if (p.identity) {
                detailLines += `\n• **Identity:** \`${p.identity}\``;
              }
              if (p.expiry) {
                detailLines += `\n• **Token Expiry:** \`${p.expiry}\``;
              }
              if (p.details?.count !== undefined) {
                detailLines += `\n• **Discovered Models:** \`${p.details.count}\``;
              }
              return `- **${p.name}**: Active${detailLines}`;
            } else {
              let hint = "";
              if (p.provider === "antigravity") {
                hint = "Type `/login antigravity` to authenticate via Google OAuth.";
              } else if (p.provider === "openrouter") {
                hint = "Type `/login openrouter <api-key>` to configure.";
              } else if (p.provider === "local") {
                hint = "Start Ollama (`ollama serve`) or run `/login local [url]`.";
              }
              return `- **${p.name}**: Inactive\n  - *${p.error || "Unauthenticated"}*\n  - ${hint}`;
            }
          });

          authStatusText = `### Provider Authentication Status\n\n${sections.join("\n\n")}\n\n*Configure any provider with \`/login <provider>\`.*`;
        } else if (info.authenticated) {
          authStatusText = `## Authentication Active (macOS Keychain)\n- **Account:** \`${info.email || "Active"}\`\n- **Keychain Target:** \`${info.service || "gemini"} / ${info.account || "antigravity"}\`\n- **Token Expiry:** \`${info.expiry || "Auto-refreshing"}\`\n\n*All Antigravity models route through this identity.*`;
        } else {
          authStatusText = `## Authentication Missing\nNo credentials found in macOS Keychain. Type \`/login\` to authenticate.`;
        }
      }
    } catch {
      authStatusText = `## Neo Router Offline\nCould not connect to Neo on port 8787. Ensure Neo is active.`;
    }

    const authThread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: authStatusText,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, authThread]);
    return true;
  }
}

export const authCommand = new AuthCommand();
