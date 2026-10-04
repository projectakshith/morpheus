import test from "node:test";
import assert from "node:assert/strict";
import { applyCloudFallback, isCloudEndpoint, CLOUD_BASE_URL, CLOUD_MODEL } from "../src/runtime";

test("without neo, a url or a key, morpheus uses the capped cloud", () => {
  const env: NodeJS.ProcessEnv = {};
  applyCloudFallback(env, false);
  assert.equal(env.MORPHEUS_BASE_URL, CLOUD_BASE_URL);
  assert.equal(env.MORPHEUS_MODEL, CLOUD_MODEL);
  assert.ok(isCloudEndpoint(env.MORPHEUS_BASE_URL));
});

test("an openrouter key goes to openrouter directly", () => {
  const env: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: "k", MORPHEUS_MODEL: "x/y" };
  applyCloudFallback(env, false);
  assert.equal(env.MORPHEUS_BASE_URL, "https://openrouter.ai/api/v1");
  assert.equal(env.MORPHEUS_MODEL, "x/y");
  assert.equal(isCloudEndpoint(env.MORPHEUS_BASE_URL), false);
});

test("neo, an explicit url and MORPHEUS_CLOUD=0 are left alone", () => {
  const cases: Array<[NodeJS.ProcessEnv, boolean]> = [[{}, true], [{ MORPHEUS_BASE_URL: "http://h/v1" }, false], [{ MORPHEUS_CLOUD: "0" }, false]];
  for (const [env, hasNeo] of cases) {
    const before = env.MORPHEUS_BASE_URL;
    applyCloudFallback(env, hasNeo);
    assert.equal(env.MORPHEUS_BASE_URL, before);
  }
});
