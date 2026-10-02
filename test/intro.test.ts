import test from "node:test";
import assert from "node:assert/strict";
import { buildFullScreenIntro } from "../src/cli/components/MatrixIntro";
import { cellWidth } from "../src/display/cells";

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : "";
}

const frame = (p: number, name?: string) =>
  buildFullScreenIntro(100, 24, p, 40, undefined, name).map((l) => stripAnsi(textOf(l.node)));

test("the greeting holds alone on screen before the rain starts", () => {
  const hold = frame(0.25, "akshith");
  const others = hold.filter((l) => !l.includes("wake up")).join("").trim();
  assert.equal(others, "", "nothing else is drawn while the greeting holds");
  const greeting = frame(0.2, "akshith");
  assert.ok(greeting.some((l) => l.includes("wake up, akshith…")));
  assert.ok(!greeting.some((l) => l.includes("the matrix has you")));
  assert.ok(frame(1, "akshith").some((l) => l.includes("MORPHEUS")));
});

test("every intro row is exactly the screen width in every phase", () => {
  for (const [w, h] of [[100, 24], [60, 18], [140, 40]]) {
    for (const p of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1]) {
      for (const line of buildFullScreenIntro(w, h, p, 77, undefined, "akshith")) {
        assert.equal(cellWidth(textOf(line.node)), w, `${w}x${h} at ${p}`);
      }
    }
  }
});

test("without a name the intro is the classic rain", () => {
  assert.ok(!frame(0.1).some((l) => l.includes("wake up")));
});
