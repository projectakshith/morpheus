export const DEFAULT_MAX_STEPS = 25;
export const DEFAULT_HARD_MAX_STEPS = 50;
export const DEFAULT_RUN_TOKEN_BUDGET = 300_000;
export const MAX_FINAL_RESPONSE_RESERVE = 32_000;

/** Keep room for one final synthesis request when exploration uses its budget. */
export function calculateExplorationTokenBudget(totalBudget = DEFAULT_RUN_TOKEN_BUDGET): number {
  if (!Number.isFinite(totalBudget) || totalBudget <= 0) return 0;
  const reserve = Math.min(MAX_FINAL_RESPONSE_RESERVE, Math.floor(totalBudget * 0.15));
  return Math.max(0, Math.floor(totalBudget) - reserve);
}

export interface StepBudgetOptions {
  userSpecifiedMaxSteps?: number;
  prompt?: string;
  defaultMaxSteps?: number;
}

/* Calculates initial max step limit based on user preferences or default runway.
 * Never uses regex keyword guessing or artificial 5/12 step cutoffs. */
export function calculateInitialStepBudget(options: StepBudgetOptions): number {
  if (options.userSpecifiedMaxSteps !== undefined) {
    return options.userSpecifiedMaxSteps;
  }
  return options.defaultMaxSteps ?? DEFAULT_MAX_STEPS;
}

export interface StepExtensionParams {
  userSpecifiedMaxSteps?: number;
  hasModifiedFiles?: boolean;
  stepCount: number;
  maxSteps: number;
  hardMaxSteps: number;
  totalTokens: number;
  tokenSafetyCeiling: number;
}

/* Dynamically extends step budget when the agent is nearing its current limit,
 * has room before hardMaxSteps, has modified files or is early in exploration,
 * and remains safely below the context ceiling. */
export function shouldExtendStepBudget(params: StepExtensionParams): boolean {
  if (params.userSpecifiedMaxSteps !== undefined) {
    return false;
  }
  // If the agent hasn't modified any files and is already deep in exploration, do not extend
  if (params.hasModifiedFiles === false && params.stepCount >= 20) {
    return false;
  }
  return (
    params.stepCount >= params.maxSteps - 1 &&
    params.maxSteps < params.hardMaxSteps &&
    params.totalTokens < params.tokenSafetyCeiling
  );
}
