/*
 * streamReveal: pure math and ANSI rendering for the streaming "decode" effect.
 * Text eases in instead of arriving in provider-sized bursts, and its newest
 * characters carry a short green glow trail that settles into normal text.
 */

/* Backlog shrinks exponentially with this time constant, so bursts glide in
 * but reveal never trails the model by more than a few frames. */
const REVEAL_TAU_MS = 90;
/* Floor on reveal speed so a slow trickle still moves visibly. */
const MIN_CHARS_PER_SECOND = 60;
/* Glow brightens fast when text arrives and fades slower once it stops. */
const GLOW_RISE_TAU_MS = 60;
const GLOW_FALL_TAU_MS = 260;
/* Below this the glow is invisible, so the effect can switch itself off. */
export const GLOW_EPSILON = 0.02;

export const TRAIL_LENGTH = 8;

/* Half-width katakana and digits: single-cell glyphs, so flicker never shifts layout. */
const MATRIX_GLYPHS = Array.from("ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789");
/* Only plain printable ASCII gets scrambled; wide or combining characters are left alone. */
const SCRAMBLE_ELIGIBLE = /^[\x21-\x7e]$/;

/* Matches CSI sequences (colors, styles) and OSC sequences (hyperlinks). */
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/y;

export interface RevealState {
  shown: number;
  glow: number;
}

export interface TrailPalette {
  /* Color of the freshest character, just resolving out of the dark. */
  deep: string;
  /* Peak of the glow, a few characters behind the head. */
  bright: string;
  /* Color the trail settles into. */
  settled: string;
}

export function advanceReveal(state: RevealState, target: number, dtMs: number): RevealState {
  const backlog = target - state.shown;
  let shown = target;
  if (backlog > 0) {
    const eased = backlog * (1 - Math.exp(-dtMs / REVEAL_TAU_MS));
    const floor = (MIN_CHARS_PER_SECOND * dtMs) / 1000;
    shown = Math.min(target, state.shown + Math.max(eased, floor));
  }

  const revealing = shown < target || backlog > 0;
  const glowTarget = revealing ? 1 : 0;
  const tau = revealing ? GLOW_RISE_TAU_MS : GLOW_FALL_TAU_MS;
  let glow = state.glow + (glowTarget - state.glow) * (1 - Math.exp(-dtMs / tau));
  if (!revealing && glow < GLOW_EPSILON) glow = 0;

  return { shown, glow };
}

export function isRevealSettled(state: RevealState, target: number): boolean {
  return state.shown >= target && state.glow === 0;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? Array.from(clean, (c) => c + c).join("") : clean;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as Rgb;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

/* Trail color for a character `age` positions behind the head (0 = newest):
 * deep -> bright over the first third, then bright -> settled. */
export function trailColor(age: number, trailLength: number, glow: number, palette: TrailPalette): Rgb {
  const deep = hexToRgb(palette.deep);
  const bright = hexToRgb(palette.bright);
  const settled = hexToRgb(palette.settled);
  const t = trailLength <= 1 ? 1 : age / (trailLength - 1);
  const PEAK = 0.3;
  const lit = t <= PEAK ? mix(deep, bright, t / PEAK) : mix(bright, settled, (t - PEAK) / (1 - PEAK));
  return mix(settled, lit, glow);
}

type Token = { kind: "esc" | "char"; value: string };

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    ANSI_PATTERN.lastIndex = i;
    const esc = ANSI_PATTERN.exec(line);
    if (esc) {
      tokens.push({ kind: "esc", value: esc[0] });
      i += esc[0].length;
      continue;
    }
    const codePoint = line.codePointAt(i)!;
    const char = String.fromCodePoint(codePoint);
    tokens.push({ kind: "char", value: char });
    i += char.length;
  }
  return tokens;
}

/**
 * Recolors the last `trailLength` visible characters of an ANSI-formatted line.
 * Only foreground color is touched, so backgrounds (code blocks) and styles
 * survive, and escape codes after the trail are kept so the line closes as before.
 */
export function applyTrail(
  line: string,
  glow: number,
  palette: TrailPalette,
  options: { trailLength?: number; scramble?: () => number } = {}
): string {
  if (glow <= 0) return line;
  const trailLength = options.trailLength ?? TRAIL_LENGTH;
  const tokens = tokenize(line);
  const visible = tokens.filter((t) => t.kind === "char").length;
  const trailStart = visible - Math.min(trailLength, visible);
  const random = options.scramble;

  let out = "";
  let charIndex = 0;
  for (const token of tokens) {
    if (token.kind === "esc" || charIndex < trailStart) {
      out += token.value;
      if (token.kind === "char") charIndex++;
      continue;
    }

    const age = visible - 1 - charIndex;
    const [r, g, b] = trailColor(age, trailLength, glow, palette);
    let char = token.value;
    /* Only the newest character flickers, and only while text is actively arriving. */
    if (random && age === 0 && glow > 0.6 && SCRAMBLE_ELIGIBLE.test(char) && random() < 0.35) {
      char = MATRIX_GLYPHS[Math.floor(random() * MATRIX_GLYPHS.length)] ?? char;
    }
    out += `\x1b[38;2;${r};${g};${b}m${char}`;
    charIndex++;
    if (charIndex === visible) out += "\x1b[39m";
  }
  return out;
}
