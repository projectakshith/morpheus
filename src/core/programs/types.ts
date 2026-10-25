import type { SubagentRole } from "../types";

export type ProgramId =
  | "keymaker"
  | "merovingian"
  | "oracle"
  | "architect"
  | "sati"
  | "smith"
  | "twins";

export interface ProgramContract {
  id: ProgramId;
  name: string;
  callsign: string;
  icon: string;
  lore: string;
  role: SubagentRole;
  description: string;
  operationalRules: string[];
  outputRequirements: string[];
  defaultModelTier?: "fast" | "reasoning" | "critic";
}
