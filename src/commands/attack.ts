import path from "node:path";
import type { CommandHandler, CommandContext } from "./types";
import type { Thread } from "../core/thread";
import {
  createEngagement,
  engagementPath,
  loadEngagement,
  saveEngagement,
} from "../core/engagement";
import { activateSecuritySession, deactivateSecuritySession } from "../core/securitySession";
import { formatError } from "../utils/errors";

const USAGE = [
  "usage: `/attack <host|url> --auth <reference> [--methods GET,HEAD] [--rps 5] [--days 30]`",
  "",
  "Only name hosts you own or are authorized to test. The scope is written to `.morpheus/engagement.json` and every recon call checks it.",
].join("\n");

function addThread(ctx: CommandContext, response: string): void {
  const thread: Thread = {
    id: `thread_${Date.now()}`,
    index: ctx.threadsCount + 1,
    prompt: ctx.taskText,
    response,
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
}

interface AttackArgs {
  target: string;
  auth: string;
  methods: string[];
  rps: number;
  days: number;
  status: boolean;
}

function parseArgs(tokens: string[]): AttackArgs {
  const parsed: AttackArgs = { target: "", auth: "", methods: ["GET", "HEAD"], rps: 5, days: 30, status: false };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "status") {
      parsed.status = true;
    } else if (token === "--auth" || token === "--authorized-by") {
      parsed.auth = tokens[++index] ?? "";
    } else if (token === "--methods") {
      parsed.methods = (tokens[++index] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    } else if (token === "--rps") {
      parsed.rps = Number(tokens[++index]);
    } else if (token === "--days") {
      parsed.days = Number(tokens[++index]);
    } else if (!parsed.target && !token.startsWith("-")) {
      parsed.target = token;
    }
  }
  return parsed;
}

export class AttackCommand implements CommandHandler {
  public readonly name = "attack";
  public readonly description = "Declare an authorized engagement and switch to the attack view";
  public readonly aliases = ["/attack", "/engage"];

  public matches(trimmed: string): boolean {
    return /^\/(?:attack|engage)(?:\s|$)/i.test(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    const args = parseArgs(trimmed.trim().split(/\s+/).slice(1));

    if (args.status) {
      const engagement = await loadEngagement(process.cwd());
      if (!engagement) {
        addThread(ctx, "No engagement scope in this workspace. Run `/attack <host> --auth <reference>`.");
        return true;
      }
      activateSecuritySession(engagement);
      addThread(
        ctx,
        [
          `active scope: **${engagement.target}**`,
          `authorized by: ${engagement.authorizedBy}`,
          `hosts: ${engagement.allowedHosts.join(", ")}`,
          `methods: ${engagement.allowedMethods.join(", ")} · ${engagement.maxRequestsPerSecond} rps`,
          `expires: ${engagement.expiresAt.slice(0, 10)}`,
          `file: ${path.relative(process.cwd(), engagementPath(process.cwd()))}`,
        ].join("\n")
      );
      return true;
    }

    if (!args.target || !args.auth) {
      addThread(ctx, USAGE);
      return true;
    }

    try {
      const engagement = createEngagement({
        target: args.target,
        authorizedBy: args.auth,
        allowedMethods: args.methods,
        maxRequestsPerSecond: args.rps,
        days: args.days,
      });
      await saveEngagement(engagement, process.cwd());
      activateSecuritySession(engagement);
      addThread(
        ctx,
        [
          `attack mode armed for **${engagement.target}**`,
          `authorized by: ${engagement.authorizedBy}`,
          `methods: ${engagement.allowedMethods.join(", ")} · ${engagement.maxRequestsPerSecond} rps`,
          `expires: ${engagement.expiresAt.slice(0, 10)}`,
          `scope file: ${path.relative(process.cwd(), engagementPath(process.cwd()))}`,
          "",
          "The coordinator loads `security-engagement`. Recon runs through `security_recon`; raw responses stay in the evidence folder.",
          `Next: describe the target, for example \"map ${engagement.target} and report access-control gaps\".`,
        ].join("\n")
      );
    } catch (error) {
      addThread(ctx, `Could not arm the engagement: ${formatError(error)}\n\n${USAGE}`);
    }
    return true;
  }
}

export class NormalCommand implements CommandHandler {
  public readonly name = "normal";
  public readonly description = "Leave attack view and return to coding mode";
  public readonly aliases = ["/normal", "/coding"];

  public matches(trimmed: string): boolean {
    return /^\/(?:normal|coding)(?:\s|$)/i.test(trimmed);
  }

  public async execute(trimmed: string, ctx: CommandContext): Promise<boolean> {
    deactivateSecuritySession();
    addThread(
      ctx,
      `returned to coding mode. The engagement scope is still at \`${path.relative(process.cwd(), engagementPath(process.cwd()))}\` for the audit trail.`
    );
    return true;
  }
}

export const attackCommand = new AttackCommand();
export const normalCommand = new NormalCommand();
