import { useEffect, useRef, useState } from "react";

/**
 * Port of v5's `tweenTo()` — easeOutExpo number tween used by `refresh()`.
 * Every call to `refresh(animate)` bumps `seq`; `dur` 650ms (animated) or 0 (instant).
 */
export function useTween(target: number, dur: number, seq: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!(dur > 0)) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from =
      typeof shownRef.current === "number" && isFinite(shownRef.current)
        ? shownRef.current
        : target;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(2, -10 * k);
      const v = from + (target - from) * (k === 1 ? 1 : e);
      shownRef.current = v;
      setShown(v);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, dur, seq]);

  return shown;
}
