import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInitialStepBudget,
  shouldExtendStepBudget,
  DEFAULT_MAX_STEPS,
  DEFAULT_HARD_MAX_STEPS,
} from "../src/core/stepBudget";

test("calculateInitialStepBudget assigns generous runway without keyword guessing", () => {
  assert.equal(
    calculateInitialStepBudget({ prompt: "fix the authentication bug in login.ts" }),
    DEFAULT_MAX_STEPS
  );
  assert.equal(
    calculateInitialStepBudget({ prompt: "where is the database connection configured?" }),
    DEFAULT_MAX_STEPS
  );
  assert.equal(
    calculateInitialStepBudget({ prompt: "analyse repo", userSpecifiedMaxSteps: 20 }),
    20
  );
  assert.equal(
    calculateInitialStepBudget({ defaultMaxSteps: 30 }),
    30
  );
});

test("shouldExtendStepBudget manages step runway extension safely against token safety limits", () => {
  const tokenSafetyCeiling = 100_000;

  /* Model is nearing step horizon and token usage is safe -> should extend */
  assert.equal(
    shouldExtendStepBudget({
      stepCount: 24,
      maxSteps: 25,
      hardMaxSteps: DEFAULT_HARD_MAX_STEPS,
      totalTokens: 25_000,
      tokenSafetyCeiling,
    }),
    true
  );

  /* User explicitly locked step count -> should not extend */
  assert.equal(
    shouldExtendStepBudget({
      userSpecifiedMaxSteps: 10,
      stepCount: 9,
      maxSteps: 10,
      hardMaxSteps: DEFAULT_HARD_MAX_STEPS,
      totalTokens: 25_000,
      tokenSafetyCeiling,
    }),
    false
  );

  /* Max steps reached hard ceiling -> should not extend */
  assert.equal(
    shouldExtendStepBudget({
      stepCount: 49,
      maxSteps: DEFAULT_HARD_MAX_STEPS,
      hardMaxSteps: DEFAULT_HARD_MAX_STEPS,
      totalTokens: 25_000,
      tokenSafetyCeiling,
    }),
    false
  );

  /* Token usage reached context safety ceiling -> should not extend */
  assert.equal(
    shouldExtendStepBudget({
      stepCount: 24,
      maxSteps: 25,
      hardMaxSteps: DEFAULT_HARD_MAX_STEPS,
      totalTokens: 105_000,
      tokenSafetyCeiling,
    }),
    false
  );
});
