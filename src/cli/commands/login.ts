import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

const VALID_SUBCOMMANDS = [
  "claude",
  "anthropic",
  "codex",
  "openai",
  "chatgpt",
  "antigravity",
  "agy",
  "google",
  "openrouter",
  "or",
  "local",
  "ollama",
];

export class LoginCommand implements CommandHandler {
  public readonly name = "login";
  public readonly description =
    "authenticate provider credentials (claude, codex, antigravity, openrouter, local)";
  public readonly aliases = ["/login"];

  public matches(trimmed: string): boolean {
    return trimmed === "/login" || trimmed.startsWith("/login ");
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const parts = trimmed.split(/\s+/);
    const subCommand = parts[1]?.toLowerCase();
    const arg = parts.slice(2).join(" ").trim();
    const loginThreadId = `thread_${Date.now()}`;

    /* Show help overview if /login has no arguments or unknown subcommand */
    if (!subCommand || subCommand === "help" || !VALID_SUBCOMMANDS.includes(subCommand)) {
      const helpText = [
        "modular authentication providers:",
        "",
        "  /login claude [token]        claude pro / team oauth session",
        "  /login codex [token]         chatgpt plus / pro / team session",
        "  /login antigravity           google cloud code browser oauth",
        "  /login openrouter <api-key>  openrouter api key",
        "  /login local [base-url]      local ollama server (default: http://127.0.0.1:11434)",
        "  /auth                        view real-time status across all providers",
      ].join("\n");

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

    let targetProvider = "antigravity";
    let requestBody: Record<string, unknown> = { provider: "antigravity" };
    let initialMessage = "opening authentication...";

    if (subCommand === "claude" || subCommand === "anthropic") {
      targetProvider = "claude";
      requestBody = { provider: "claude", accessToken: arg || undefined };
      initialMessage = arg
        ? "validating claude oauth token..."
        : "checking claude pro session...";
    } else if (subCommand === "codex" || subCommand === "openai" || subCommand === "chatgpt") {
      targetProvider = "codex";
      requestBody = { provider: "codex", accessToken: arg || undefined };
      initialMessage = arg
        ? "validating codex access token..."
        : "checking codex session...";
    } else if (subCommand === "antigravity" || subCommand === "agy" || subCommand === "google") {
      targetProvider = "antigravity";
      requestBody = { provider: "antigravity" };
      initialMessage =
        "opening google authentication in default browser...\ncomplete sign-in and return to this terminal.";
    } else if (subCommand === "openrouter" || subCommand === "or") {
      targetProvider = "openrouter";
      if (!arg) {
        const errThread: Thread = {
          id: loginThreadId,
          index: ctx.threadsCount + 1,
          prompt: ctx.taskText,
          response: "error: openrouter api key required.\nusage: `/login openrouter <your-api-key>`",
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
      initialMessage = "validating openrouter api key...";
    } else if (subCommand === "local" || subCommand === "ollama") {
      targetProvider = "local";
      requestBody = { provider: "local", baseUrl: arg || undefined };
      initialMessage = "connecting to local ollama server...";
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
          auth?: {
            authenticated?: boolean;
            identity?: string;
            details?: Record<string, unknown>;
          };
        };

        const identity = resData?.auth?.identity || "active";
        const details = resData?.auth?.details || {};
        let successMessage = "";

        if (targetProvider === "claude") {
          const quota5h = details.fiveHourUsedPercent
            ? `\n  5h quota: ${details.fiveHourUsedPercent} used (resets at ${details.fiveHourResetsAt})`
            : "";
          const quota7d = details.weeklyUsedPercent
            ? `\n  weekly quota: ${details.weeklyUsedPercent} used (resets on ${details.weeklyResetsAt})`
            : "";
          successMessage = `claude pro session active: \`${identity}\`${quota5h}${quota7d}\n\nall claude models routed directly through anthropic inference api.`;
        } else if (targetProvider === "codex") {
          const primary =
            details.primaryUsagePercent !== undefined
              ? `\n  primary window: ${details.primaryUsagePercent}% used`
              : "";
          const credits =
            details.resetCredits !== undefined
              ? `\n  reset credits: ${details.resetCredits}`
              : "";
          successMessage = `codex session active: \`${identity}\`${primary}${credits}\n\nall gpt-6 and gpt-5 models routed directly through chatgpt backend api.`;
        } else if (targetProvider === "antigravity") {
          successMessage = `google cloud code session active: \`${identity}\`\ncredentials saved to macos keychain.`;
        } else if (targetProvider === "openrouter") {
          const maskedKey = identity || "sk-or-v1-***";
          successMessage = `openrouter api key validated: \`${maskedKey}\`\ncredentials saved to macos keychain.`;
        } else if (targetProvider === "local") {
          const count = (details?.count as number) || 0;
          successMessage = `local runtime connected at \`${identity}\`: ${count} models discovered.`;
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
          if (parsed.error)
            parsedErr =
              typeof parsed.error === "string" ? parsed.error : parsed.error.message;
        } catch {}

        let guidance = "";
        if (targetProvider === "claude" && !arg) {
          guidance =
            "\n\nto connect claude pro:\n  1. run `claude auth login` in terminal (keychain credentials auto-detected)\n  2. or pass token directly: `/login claude <access_token>`";
        } else if (targetProvider === "codex" && !arg) {
          guidance =
            "\n\nto connect codex / chatgpt:\n  1. run `codex login` in terminal (~/.codex/auth.json auto-detected)\n  2. or pass token directly: `/login codex <access_token>`";
        }

        ctx.setThreads((prev) =>
          prev.map((t) =>
            t.id === loginThreadId
              ? {
                  ...t,
                  status: "error",
                  response: `authentication error (${res.status}): ${parsedErr.toLowerCase()}${guidance}`,
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
                response: `could not reach neo proxy: ${err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()}. ensure neo is running on port 8787.`,
              }
            : t
        )
      );
    }
    return true;
  }
}

export const loginCommand = new LoginCommand();
