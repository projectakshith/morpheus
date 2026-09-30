import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceReveal,
  applyTrail,
  isRevealSettled,
  trailColor,
  type RevealState,
} from "../src/cli/effects/streamReveal";
import { buildThreadFeedLines } from "../src/cli/components/ThreadFeed";
import type { Thread } from "../src/cli/types";

const palette = { deep: "#000000", bright: "#00ff00", settled: "#ffffff" };
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

function run(state: RevealState, target: number, frames: number, dt = 33): RevealState {
  for (let i = 0; i < frames; i++) state = advanceReveal(state, target, dt);
  return state;
}

test("advanceReveal eases a burst in over a few frames, not instantly", () => {
  const first = advanceReveal({ shown: 0, glow: 0 }, 300, 33);
  assert.ok(first.shown > 0 && first.shown < 300, `first frame showed ${first.shown}`);
  assert.equal(run(first, 300, 30).shown, 300, "burst must be fully shown within a second");
});

test("advanceReveal keeps a minimum pace for tiny backlogs", () => {
  const state = advanceReveal({ shown: 0, glow: 0 }, 2, 33);
  assert.ok(state.shown >= 1.9, "a two-char backlog should not crawl");
});

test("glow rises while revealing and fully settles once caught up", () => {
  const revealing = run({ shown: 0, glow: 0 }, 500, 3);
  assert.ok(revealing.glow > 0.8);

  const settled = run(revealing, 500, 60);
  assert.equal(settled.shown, 500);
  assert.equal(settled.glow, 0);
  assert.ok(isRevealSettled(settled, 500));
});

test("trailColor runs deep -> bright -> settled and fades with glow", () => {
  assert.deepEqual(trailColor(0, 8, 1, palette), [0, 0, 0]);
  assert.deepEqual(trailColor(7, 8, 1, palette), [255, 255, 255]);
  const peak = trailColor(2, 8, 1, palette);
  assert.ok(peak[1] > peak[0], "the glow peak is green-dominant");
  assert.deepEqual(trailColor(0, 8, 0, palette), [255, 255, 255], "no glow means settled color");
});

test("applyTrail preserves visible text and leaves the line untouched without glow", () => {
  const line = "\x1b[1mhello\x1b[22m world";
  assert.equal(applyTrail(line, 0, palette), line);

  const lit = applyTrail(line, 1, palette);
  assert.equal(stripAnsi(lit), "hello world");
  assert.ok(lit.startsWith("\x1b[1mhel"), "text before the trail keeps its formatting");
  assert.ok(lit.endsWith("\x1b[39m"), "foreground is restored after the trail");
});

test("applyTrail keeps escape codes that close the line", () => {
  const codeLine = "\x1b[48;2;1;2;3mconst x = 1;\x1b[0m";
  const lit = applyTrail(codeLine, 1, palette);
  assert.ok(lit.endsWith("\x1b[39m\x1b[0m"));
  assert.ok(lit.startsWith("\x1b[48;2;1;2;3m"), "background survives");
});

test("applyTrail only scrambles the newest printable character, with single-cell glyphs", () => {
  const always = () => 0;
  const lit = stripAnsi(applyTrail("abcdef", 1, palette, { scramble: always }));
  assert.equal(lit.slice(0, 5), "abcde");
  assert.notEqual(lit[5], "f");
  assert.equal(Array.from(lit).length, 6);

  const spaced = stripAnsi(applyTrail("abc ", 1, palette, { scramble: always }));
  assert.equal(spaced, "abc ", "whitespace never flickers");
});

function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : "";
}

function feedFor(
  threads: Thread[],
  streamReveal?: { threadId: string; text: string; glow: number; random?: () => number }
): string[] {
  return buildThreadFeedLines({ threads, leftWidth: 80, feedHeight: 20, maxLineWidth: 76, streamReveal })
    .filter((l) => l.id.includes("_asst_line_"))
    .map((l) => textOf(l.node));
}

const thread = (id: string, response: string): Thread => ({
  id,
  index: 1,
  prompt: "q",
  response,
  isStreaming: true,
  steps: [],
  status: "running",
  stepCount: 1,
  startTime: Date.now(),
});

test("feed renders only the revealed prefix of the streaming thread, with a trail", () => {
  const lines = feedFor([thread("t1", "hello world, this is streaming")], {
    threadId: "t1",
    text: "hello world",
    glow: 1,
    random: () => 1,
  });
  assert.equal(lines.length, 1);
  assert.equal(stripAnsi(lines[0]).trim(), "hello world");
  assert.match(lines[0], /\x1b\[38;2;/, "trail colors are applied");
});

test("feed leaves other threads and settled reveals untouched", () => {
  const old = thread("t0", "earlier answer");
  const live = thread("t1", "live text");
  const lines = feedFor([old, live], { threadId: "t1", text: "live text", glow: 0 });
  assert.deepEqual(lines.map((l) => stripAnsi(l).trim()), ["earlier answer", "live text"]);
  assert.ok(lines.every((l) => !/\x1b\[38;2;/.test(l)), "no trail once glow is zero");
});

test("feed shows narration notes as separate entries before the final answer", () => {
  const t: Thread = {
    ...thread("t1", "Final answer here."),
    isStreaming: false,
    status: "completed",
    steps: [
      { id: "n1", type: "note", content: "Checking the config first." },
      { id: "tool1", type: "tool", name: "read_file", args: {} },
      { id: "n2", type: "note", content: "Found it, now the router." },
    ],
  };
  const all = buildThreadFeedLines({ threads: [t], leftWidth: 80, feedHeight: 20, maxLineWidth: 76 });
  const text = all.map((l) => stripAnsi(textOf(l.node)).trimEnd());
  const first = text.findIndex((l) => l.includes("› Checking the config first."));
  const second = text.findIndex((l) => l.includes("› Found it, now the router."));
  const answer = text.findIndex((l) => l.includes("Final answer here."));

  assert.ok(first !== -1 && second !== -1 && answer !== -1, text.join("\n"));
  assert.ok(first < second && second < answer, "notes appear in order, before the answer");
  assert.equal(text[second - 1].trim(), "", "a blank line separates consecutive notes");
  assert.ok(!text.some((l) => l.includes("read_file")), "tool steps stay out of the left feed");
});
