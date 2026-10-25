import type { Engagement } from "./engagement";
import type { Skill } from "./types";

export function formatEngagementBlock(engagement: Engagement): string {
  return [
    '<engagement mode="attack">',
    `target: ${engagement.target}`,
    `authorized by: ${engagement.authorizedBy}`,
    `allowed hosts: ${engagement.allowedHosts.join(", ")}`,
    `allowed methods: ${engagement.allowedMethods.join(", ")}`,
    `max requests per second: ${engagement.maxRequestsPerSecond}`,
    `expires: ${engagement.expiresAt}`,
    "Every user message in this session is a task for this authorized engagement. Stay inside the listed hosts and methods. Do not drift into unrelated coding work. Work the current phase, capture evidence to disk, and record only confirmed findings. If a request needs a host, method, or volume outside the scope, stop and say why.",
    "</engagement>",
  ].join("\n");
}

export function withSecurityRouter(
  available: Skill[],
  matched: Skill[],
  engaged: boolean
): Skill[] {
  if (!engaged) return matched;
  const router = available.find((skill) => skill.name === "security-engagement");
  if (!router) return matched;
  return [router, ...matched.filter((skill) => skill.name !== router.name)];
}
