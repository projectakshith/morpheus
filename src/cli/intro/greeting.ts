import { execSync } from "node:child_process";
import os from "node:os";

export function greetingName(): string {
  try {
    const name = execSync("git config user.name", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (name) return name.split(/\s+/)[0].toLowerCase();
  } catch {}
  try {
    const user = os.userInfo().username;
    if (user) return user.toLowerCase();
  } catch {}
  return "neo";
}
