import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";

export class AuthCommand implements CommandHandler {
  public readonly name = "auth";
  public readonly description = "Display real-time authentication status across all providers";
  public readonly aliases = ["/auth", "/whoami"];

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
            const providerName = p.name.toLowerCase();
            if (p.authenticated) {
              let detailLines = "";
              if (p.identity) {
                detailLines += `\n  identity: \`${p.identity}\``;
              }
              if (p.expiry) {
                detailLines += `\n  token expiry: \`${p.expiry}\``;
              }
              if (p.details?.count !== undefined) {
                detailLines += `\n  discovered models: \`${p.details.count}\``;
              }
              return `- **${providerName}**: active${detailLines}`;
            } else {
              let hint = "";
              if (p.provider === "claude") {
                hint = "run `claude auth login` or `/login claude <token>`";
              } else if (p.provider === "codex") {
                hint = "run `codex login` or `/login codex <token>`";
              } else if (p.provider === "antigravity") {
                hint = "run `/login antigravity`";
              } else if (p.provider === "openrouter") {
                hint = "run `/login openrouter <api-key>`";
              } else if (p.provider === "local") {
                hint = "start ollama (`ollama serve`) or `/login local [url]`";
              }
              return `- **${providerName}**: inactive\n  ${p.error?.toLowerCase() || "unauthenticated"}\n  hint: ${hint}`;
            }
          });

          authStatusText = `modular provider status:\n\n${sections.join("\n\n")}\n\nconfigure any provider with \`/login <provider>\``;
        } else if (info.authenticated) {
          authStatusText = `authentication active:\n- account: \`${info.email || "active"}\`\n- keychain target: \`${info.service || "gemini"} / ${info.account || "antigravity"}\`\n- token expiry: \`${info.expiry || "auto-refreshing"}\``;
        } else {
          authStatusText = `authentication missing\nno credentials found in macos keychain. type \`/login\` to authenticate.`;
        }
      }
    } catch {
      authStatusText = `neo router offline\ncould not connect to neo on port 8787. ensure neo daemon is running.`;
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
