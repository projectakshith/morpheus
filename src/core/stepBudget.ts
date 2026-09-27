export const DEFAULT_MAX_STEPS = 25;
export const DEFAULT_HARD_MAX_STEPS = 50;

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
 * has room before hardMaxSteps, and remains safely below the context ceiling. */
export function shouldExtendStepBudget(params: StepExtensionParams): boolean {
  if (params.userSpecifiedMaxSteps !== undefined) {
    return false;
  }
  return (
    params.stepCount >= params.maxSteps - 1 &&
    params.maxSteps < params.hardMaxSteps &&
    params.totalTokens < params.tokenSafetyCeiling
  );
}
