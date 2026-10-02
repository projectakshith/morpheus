import { useEffect, useRef, useState } from "react";
import { advanceReveal, isRevealSettled, type RevealState } from "../effects/streamReveal";

const FRAME_MS = 1000 / 30;

export const REDUCED_MOTION =
  process.env.MORPHEUS_REDUCED_MOTION === "1" || process.env.MORPHEUS_REDUCED_MOTION === "true";

export interface StreamReveal {
  text: string;
  glow: number;
}

export function useStreamReveal(
  content: string,
  isStreaming: boolean,
  enabled = true,
  sourceKey?: string
): StreamReveal {
  const initialState = (): RevealState => ({ shown: enabled && isStreaming ? 0 : content.length, glow: 0 });
  const stateRef = useRef<RevealState>(initialState());
  const lastContentRef = useRef(content);
  const sourceKeyRef = useRef(sourceKey);
  const [, setFrame] = useState(0);

  if (sourceKey !== sourceKeyRef.current) {
    sourceKeyRef.current = sourceKey;
    stateRef.current = initialState();
    lastContentRef.current = content;
  }

  if (content !== lastContentRef.current) {
    if (!enabled || !content.startsWith(lastContentRef.current.slice(0, Math.floor(stateRef.current.shown)))) {
      stateRef.current = { shown: content.length, glow: 0 };
    }
    lastContentRef.current = content;
  }

  const needsAnimation = enabled && !isRevealSettled(stateRef.current, content.length);

  useEffect(() => {
    if (!needsAnimation) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const target = lastContentRef.current.length;
      stateRef.current = advanceReveal(stateRef.current, target, now - last);
      last = now;
      setFrame((f) => f + 1);
      if (isRevealSettled(stateRef.current, target)) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [needsAnimation]);

  if (!enabled) return { text: content, glow: 0 };
  let cut = Math.min(content.length, Math.floor(stateRef.current.shown));
  const code = content.charCodeAt(cut - 1);
  if (cut < content.length && code >= 0xd800 && code <= 0xdbff) cut--;
  return { text: content.slice(0, cut), glow: stateRef.current.glow };
}
