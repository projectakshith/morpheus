import test from "node:test";
import assert from "node:assert/strict";
import { AVAILABLE_MODELS } from "../src/cli/components/ModelSelector";
import { Operator } from "../src/provider/operator";

test("ModelSelector categorizes models cleanly", () => {
  /* Verify non-empty list */
  assert.ok(AVAILABLE_MODELS.length >= 8);

  const categories = new Set(AVAILABLE_MODELS.map((m) => m.category));
  assert.ok(categories.has("antigravity"));
  assert.ok(categories.has("local"));
  assert.ok(categories.has("cloud"));

  /* Ensure every model has valid properties */
  for (const m of AVAILABLE_MODELS) {
    assert.ok(m.id && m.id.length > 0);
    assert.ok(m.name && m.name.length > 0);
    assert.ok(m.description && m.description.length > 0);
  }

  /* Antigravity models must include flash and Claude thinking models */
  const agyModels = AVAILABLE_MODELS.filter((m) => m.category === "antigravity");
  assert.ok(agyModels.some((m) => m.id === "flash"));
  assert.ok(agyModels.some((m) => m.id === "claude-opus-4-6-thinking"));
  assert.ok(agyModels.some((m) => m.id === "claude-sonnet-4-6"));

  /* Local models must include Ollama models */
  const localModels = AVAILABLE_MODELS.filter((m) => m.category === "local");
  assert.ok(localModels.some((m) => m.id.includes("qwen")));

  /* Cloud models must include OpenRouter models */
  const cloudModels = AVAILABLE_MODELS.filter((m) => m.category === "cloud");
  assert.ok(cloudModels.some((m) => m.id.includes("space-bunny")));
});

test("Operator defaults to Neo proxy on port 8787", () => {
  const operator = new Operator();
  assert.equal(operator.getModel(), "flash");
  assert.equal(operator.getBaseURL(), "http://127.0.0.1:8787/v1");
  assert.equal(operator.getNumCtx(), 128000);
});
