import type { ProgramId } from "../programs/types";

export type TaskArchetype =
  | "research"
  | "investigation"
  | "scaffold"
  | "refactor";

export interface WorkflowContract {
  archetype: TaskArchetype;
  name: string;
  description: string;
  icon: string;
  defaultPrograms: ProgramId[];
  operationalDirectives: string[];
  artifactFilename: string;
  artifactTitle: string;
  artifactSections: string[];
}
