/**
 * gap.ts — single source of truth for the gap verdict pill.
 *
 * Signed band logic, used by both QuoteRail and CostCheckPanel:
 *   gap in [300, 400] → ON TARGET
 *   gap > 400         → ABOVE
 *   gap < 300         → BELOW
 * (gap = grandTotal − doubleCost; calc.ts is frozen, so this lives here.)
 */

export type GapVerdict = "on" | "above" | "below";

export function gapVerdict(gap: number): GapVerdict {
  if (gap >= 300 && gap <= 400) return "on";
  return gap > 400 ? "above" : "below";
}
