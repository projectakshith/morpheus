import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_THEMES,
  getActiveThemeName,
  getThemeVersion,
  hexToRgb,
  setTheme,
  subscribeTheme,
  theme,
  transitionTheme,
} from "../src/cli/theme";

test("a zero-duration transition applies the target palette", () => {
  const version = getThemeVersion();
  transitionTheme("attack", 0);
  assert.equal(getActiveThemeName(), "attack");
  assert.equal(theme.bg, BUILTIN_THEMES.attack.bg);
  assert.equal(theme.accentBright, BUILTIN_THEMES.attack.accentBright);
  assert.ok(getThemeVersion() > version);
  setTheme("morpheus");
  assert.equal(theme.bg, BUILTIN_THEMES.morpheus.bg);
});

test("theme changes notify subscribers", () => {
  let calls = 0;
  const unsubscribe = subscribeTheme(() => {
    calls += 1;
  });
  setTheme("attack");
  setTheme("morpheus");
  unsubscribe();
  setTheme("attack");
  setTheme("morpheus");
  assert.equal(calls, 2);
});

test("hex colors parse and malformed values fall back", () => {
  assert.deepEqual(hexToRgb("#ff6369"), [255, 99, 105]);
  assert.deepEqual(hexToRgb("ff6369"), [255, 99, 105]);
  assert.deepEqual(hexToRgb("nope"), [0, 0, 0]);
});
