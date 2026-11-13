import { useCallback, useEffect, useRef, useState } from "react";

// A set of numbers that can glide to new values. set(target, true) glides there over `ms`; set(target, false) jumps,
// unless a glide is under way, in which case the glide just aims at the new target (so a measurement taken mid-glide,
// such as a resize, doesn't cut it short). People who ask for reduced motion always get the jump.
export function useTween<T extends Record<string, number>>(ms = 420) {
  const [value, setValue] = useState<T | null>(null);
  const cur = useRef<T | null>(null);
  const from = useRef<T | null>(null);
  const to = useRef<T | null>(null);
  const elapsed = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  const set = useCallback((target: T | null, glide: boolean) => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (target == null || cur.current == null || reduce || (!glide && raf.current == null)) {
      if (raf.current != null) { cancelAnimationFrame(raf.current); raf.current = null; }
      cur.current = target;
      setValue(target);
      return;
    }
    to.current = target;
    if (!glide) return; // a glide is under way: it now ends at the new target
    from.current = cur.current;
    elapsed.current = 0;
    lastFrame.current = null;
    if (raf.current != null) return;
    const step = (now: number) => {
      // Each frame moves on by the time since the last one, but never more than two frames' worth: while the new
      // page is being drawn a frame can come late, and the glide then slows for a moment instead of skipping ahead.
      if (lastFrame.current != null) elapsed.current += Math.min(now - lastFrame.current, 34);
      lastFrame.current = now;
      const p = Math.min(1, elapsed.current / ms);
      // Eases in and out: starts softly, glides, settles softly.
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const a = from.current!, b = to.current!;
      const next = {} as Record<string, number>;
      for (const k of Object.keys(b)) next[k] = (a[k] ?? b[k]) + (b[k] - (a[k] ?? b[k])) * e;
      cur.current = next as T;
      setValue(next as T);
      raf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  }, [ms]);

  return [value, set] as const;
}
