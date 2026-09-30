import type { CommandHandler, CommandContext } from "./types.js";
import type { Thread } from "../types.js";

export class NeoCommand implements CommandHandler {
  public readonly name = "neo";
  public readonly description = "Check Neo proxy router connection and provider health";
  public readonly aliases = ["/neo", "/neo-status", "/status"];

  public matches(trimmed: string): boolean {
    return (
      trimmed === "/neo" ||
      trimmed.startsWith("/neo ") ||
      trimmed === "/neo-status" ||
      trimmed === "/status"
    );
  }

  public async execute(_trimmed: string, ctx: CommandContext): Promise<boolean> {
    if (ctx.openModal) {
      ctx.openModal("neo");
      return true;
    }

    const neoBase = ctx.baseURL || "http://127.0.0.1:8787/v1";
    const rootBase = neoBase.endsWith("/v1") ? neoBase.slice(0, -3) : neoBase;
    const healthUrl = `${rootBase}/health`;
    const statusUrl = `${rootBase}/v1/auth/status`;

    let responseText = "";

    try {
      const start = performance.now();
      const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
      const latency = Math.round(performance.now() - start);

      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as {
          status?: string;
          service?: string;
          role?: string;
          version?: string;
        };

        let providerDetails = "";
        try {
          const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(1500) });
          if (statusRes.ok) {
            const statusData = (await statusRes.json()) as {
              authenticated?: boolean;
              email?: string;
              expiry?: string;
              providers?: Array<{
                provider: string;
                name: string;
                authenticated: boolean;
                identity?: string;
                expiry?: string;
                details?: Record<string, unknown>;
                error?: string;
              }>;
            };

            if (statusData.providers && Array.isArray(statusData.providers)) {
              const items = statusData.providers.map((p) => {
                if (p.authenticated) {
                  const idStr = p.identity ? ` · \`${p.identity}\`` : "";
                  let extra = "";
                  if (p.provider === "antigravity" && p.expiry) {
                    try {
                      const expMs = new Date(p.expiry).getTime() - Date.now();
                      if (expMs > 0) {
                        const mins = Math.round(expMs / 60000);
                        extra = ` (token expires in ${mins}m)`;
                      }
                    } catch {}
                  } else if (p.provider === "local" && Array.isArray(p.details?.models)) {
                    extra = ` · ${p.details.models.length} local model(s)`;
                  }
                  return `- **${p.name}**: Online${idStr}${extra}`;
                } else {
                  return `- **${p.name}**: Inactive (${p.error || "unauthenticated"})`;
                }
              });
              providerDetails = `\n\n### Provider Adapters\n${items.join("\n")}`;
            }
          }
        } catch {}

        responseText = `## ▰ Neo Router · Online (${latency}ms)
- **Status**: \`${healthData.status || "ok"}\`
- **Endpoint**: \`${rootBase}\` (v${healthData.version || "0.1.0"})
- **Active Model**: \`${ctx.currentModel}\`
- **Role**: ${healthData.role || "Universal Proxy & Protocol Router"}${providerDetails}

*Run \`/model\` to switch models or \`/settings\` to configure providers.*`;
      } else {
        responseText = `## ▰ Neo Router · Error
Connected to port 8787 but received HTTP ${healthRes.status}.
Endpoint: \`${healthUrl}\``;
      }
    } catch {
      responseText = `## ▰ Neo Router · Offline
Could not connect to Neo at \`${rootBase}\`.

### To start Neo:
\`\`\`bash
cd ~/Developer/neo && npm run dev
\`\`\`
*Morpheus will route locally or through configured fallbacks while Neo is offline.*`;
    }

    const thread: Thread = {
      id: `thread_${Date.now()}`,
      index: ctx.threadsCount + 1,
      prompt: ctx.taskText,
      response: responseText,
      isStreaming: false,
      steps: [],
      isExpanded: false,
      status: "completed",
      stepCount: 0,
      startTime: Date.now(),
      durationMs: 0,
    };

    ctx.setPromptHistory((prev) => [...prev, ctx.taskText]);
    ctx.setThreads((prev) => [...prev, thread]);
    return true;
  }
}

export const neoCommand = new NeoCommand();
