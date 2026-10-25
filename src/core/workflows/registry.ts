import type { TaskArchetype, WorkflowContract } from "./types";

export const TASK_WORKFLOWS: Record<TaskArchetype, WorkflowContract> = {
  research: {
    archetype: "research",
    name: "Deep Research & Technical Evaluation",
    description: "Evaluates external libraries, architectural alternatives, or protocol choices across multiple dimensions.",
    icon: "⫽",
    defaultPrograms: ["twins", "keymaker"],
    operationalDirectives: [
      "Use 'twins' to analyze competing libraries, tools, or implementation patterns side-by-side.",
      "Use 'keymaker' to inspect external APIs, protocol specs, auth requirements, or MCP schemas.",
      "Evaluate trade-offs across performance, bundle size, license, token efficiency, and maintenance burden.",
      "Produce a structured Markdown report artifact (RESEARCH_REPORT.md) capturing the comparative matrix and recommendation."
    ],
    artifactFilename: "RESEARCH_REPORT.md",
    artifactTitle: "Technical Research & Evaluation Report",
    artifactSections: [
      "## 1. Executive Summary & Problem Scope",
      "## 2. Evaluated Alternatives & Methodology",
      "## 3. Comparative Decision Matrix (Trade-offs & Constraints)",
      "## 4. In-Depth Analysis of Leading Options",
      "## 5. Architectural Recommendation & Next Steps"
    ]
  },
  investigation: {
    archetype: "investigation",
    name: "Forensic Codebase Investigation",
    description: "Isolates subtle runtime defects, performance regressions, race conditions, and mysterious bugs.",
    icon: "⬡",
    defaultPrograms: ["merovingian", "oracle"],
    operationalDirectives: [
      "Establish reproducible evidence from stack traces, logs, or failing test fixtures before touching code.",
      "Use 'merovingian' to trace incoming callers, downstream dependents, and call trees leading to the fault.",
      "Use 'oracle' to anticipate edge cases, unhandled nulls, timeouts, or concurrency hazards.",
      "Produce a structured Markdown report artifact (INVESTIGATION_REPORT.md) detailing root cause and blast radius."
    ],
    artifactFilename: "INVESTIGATION_REPORT.md",
    artifactTitle: "Forensic Codebase Investigation & Root Cause Analysis",
    artifactSections: [
      "## 1. Issue Overview & Observed Symptoms",
      "## 2. Reproduction Steps & Baseline Evidence",
      "## 3. Root Cause Analysis & Callstack Trace",
      "## 4. Affected Components & Blast Radius",
      "## 5. Proposed Remediation Plan & Regression Prevention"
    ]
  },
  scaffold: {
    archetype: "scaffold",
    name: "Architecture & Project Scaffolding",
    description: "Designs system architecture, directories, schemas, and builds new features or projects from scratch.",
    icon: "⌂",
    defaultPrograms: ["architect", "sati"],
    operationalDirectives: [
      "Use 'architect' to establish structural boundaries, strict type schemas, and modular separation of concerns.",
      "Design clean directory trees, interface contracts, and configuration manifests before creating files.",
      "Use 'sati' for surgical generation of boilerplate, core types, and baseline tests.",
      "Produce a structured Markdown blueprint artifact (ARCHITECTURE_BLUEPRINT.md) before writing full implementation."
    ],
    artifactFilename: "ARCHITECTURE_BLUEPRINT.md",
    artifactTitle: "System Architecture Blueprint & Implementation Plan",
    artifactSections: [
      "## 1. System Vision & Functional Objectives",
      "## 2. Architectural Boundaries & Component Interaction",
      "## 3. Directory Layout & Module Specifications",
      "## 4. Core Interfaces, Data Models & Type Schemas",
      "## 5. Phased Implementation Roadmap & Acceptance Criteria"
    ]
  },
  refactor: {
    archetype: "refactor",
    name: "Surgical Implementation & Refactoring",
    description: "Executes verified code modifications, cleans up tech debt, and performs scoped bug fixes.",
    icon: "✦",
    defaultPrograms: ["merovingian", "sati", "smith"],
    operationalDirectives: [
      "Use 'merovingian' to assess blast radius and verify callers before applying edits.",
      "Use 'sati' to apply minimal AST diffs strictly inside the assigned workspace files.",
      "Use 'smith' to review the resulting diff and aggressively test for regressions.",
      "Run relevant test suites and record concrete proof of verification.",
      "Produce a change receipt artifact (CHANGE_RECEIPT.md) documenting before/after state and test proofs."
    ],
    artifactFilename: "CHANGE_RECEIPT.md",
    artifactTitle: "Verification & Change Receipt",
    artifactSections: [
      "## 1. Task Contract & Acceptance Checklist",
      "## 2. Files Modified & Diff Summary",
      "## 3. Verification Receipts (Tests, Typechecks, Linting)",
      "## 4. Adversarial Review & Edge Cases Handled",
      "## 5. Residual Assumptions & Rollback Notes"
    ]
  }
};

export function getWorkflow(archetype: TaskArchetype): WorkflowContract {
  return TASK_WORKFLOWS[archetype];
}

export function getAllWorkflows(): WorkflowContract[] {
  return Object.values(TASK_WORKFLOWS);
}

export function formatWorkflowPrompt(workflow: WorkflowContract): string {
  return [
    `<active_workflow archetype="${workflow.archetype}">`,
    `Workflow Mode: ${workflow.icon} ${workflow.name}`,
    workflow.description,
    "",
    "Recommended Matrix Programs to auto-deploy:",
    ...workflow.defaultPrograms.map((p) => `- ${p}`),
    "",
    "Operational Directives:",
    ...workflow.operationalDirectives.map((d) => `- ${d}`),
    "",
    `Target Deliverable Artifact: ${workflow.artifactFilename} ("${workflow.artifactTitle}")`,
    "Required Report Structure:",
    ...workflow.artifactSections.map((s) => `  ${s}`),
    `Ensure your final response includes or writes this structured ${workflow.artifactFilename} artifact.`,
    "</active_workflow>"
  ].join("\n");
}
