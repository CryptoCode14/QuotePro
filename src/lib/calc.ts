/**
 * Pricing engine — ported verbatim from the v5 single-file app
 * (public/index.html, branch quotepro-v5-ui). The frontend function is named
 * `calc()` (canonical comment: "identical to API"); math is unchanged.
 */

export const r2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

export interface PriceInputs {
  door: number;
  windows: number;
  etc: number;
  mult: number;
  base: number;
  pct: number;
  inst: number;
  fuel: number;
}

export interface CalcResult extends PriceInputs {
  totalMaterials: number;
  afterMult: number;
  overhead: number;
  f04: number;
  subBefore: number;
  subAfter: number;
  grandTotal: number;
  expenses: number;
  net: number;
  margin: number;
  doubleCost: number;
  gap: number;
}

/** Pricing engine — the v5 `calc()` body. 2026-09-24: the legacy 0.99 "1% DISC"
 *  factor is dead per Weston. doubleCost is exactly 2 × after-multiplier. */
export function calc(p: PriceInputs): CalcResult {
  const door = p.door;
  const win = p.windows;
  const etc = p.etc;
  const mult = p.mult || 1;
  const base = p.base;
  const pct = p.pct;
  const inst = p.inst;
  const fuel = p.fuel;
  const totalMaterials = door + win + etc;
  const afterMult = totalMaterials * mult;
  const overhead = base * (pct / 100);
  const f04 = afterMult * 0.4;
  const subBefore = afterMult + overhead + f04;
  const subAfter = subBefore + inst + fuel;
  const grandTotal = subAfter * 1.1;
  const expenses = afterMult + overhead;
  const net = grandTotal - expenses;
  const margin = grandTotal > 0 ? (net / grandTotal) * 100 : 0;
  const dc = 2 * afterMult;
  const gap = grandTotal - dc;
  return {
    door, windows: win, etc, mult, base, pct, inst, fuel,
    totalMaterials, afterMult, overhead, f04,
    subBefore, subAfter, grandTotal, expenses, net, margin,
    doubleCost: dc, gap,
  };
}

/**
 * The v5 `solve()` math, verbatim. Quirks preserved intentionally:
 * - `gapAtMin > 400 || (gapAtMin >= 300 && gapAtMin <= 400)` ≡ `gapAtMin >= 300`
 * - unexplained `0.60` vs `0.5901` thresholds kept as-is
 */
export function solvePricing(c: CalcResult): { inst: number; fuel: number } {
  const gtAtMin = c.expenses / 0.6;
  const gapAtMin = gtAtMin - c.doubleCost;
  let finalGT: number;
  if (gapAtMin > 400 || (gapAtMin >= 300 && gapAtMin <= 400)) finalGT = gtAtMin;
  else finalGT = Math.min(c.doubleCost + 300, c.expenses / 0.5901);
  const needed = finalGT / 1.1 - c.subBefore;
  const inst = Math.max(0, r2(needed * 0.75));
  const fuel = Math.max(0, r2(needed - inst));
  return { inst, fuel };
}

/** Parse the string-valued React fields the way v5's `num()` did. */
export function parseInputs(
  f: Record<"door" | "windows" | "etc" | "mult" | "base" | "pct" | "inst" | "fuel", string>,
): PriceInputs {
  const n = (v: string): number => parseFloat(v) || 0;
  return {
    door: n(f.door),
    windows: n(f.windows),
    etc: n(f.etc),
    mult: n(f.mult),
    base: n(f.base),
    pct: n(f.pct),
    inst: n(f.inst),
    fuel: n(f.fuel),
  };
}

export const fmt$ = (x: number): string =>
  x.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmt0$ = (x: number): string =>
  (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");

/* Margin / sweet-spot band colors — verbatim from v5. */
export const COL_IN = "#4E617F";
export const COL_LOW = "#C05B4B";
export const COL_HIGH = "#2F5D8A";

export function bandColor(m: number): string {
  return m >= 39.5 && m <= 41.5 ? COL_IN : m > 41.5 ? COL_HIGH : COL_LOW;
}

export type MarginBand = "in" | "hi" | "lo";
export function marginBand(m: number): MarginBand {
  return m >= 39.5 && m <= 41.5 ? "in" : m > 41.5 ? "hi" : "lo";
}

export function marginChipLabel(m: number): string {
  const b = marginBand(m);
  return b === "in" ? "SWEET SPOT" : b === "hi" ? "ABOVE TARGET" : "BELOW TARGET";
}

/** API payload mapping — verbatim field mapping from v5's `apiPayload()`. */
export function apiPayload(c: CalcResult): Record<string, number> {
  return {
    garageDoor: c.door,
    windows: c.windows,
    etc: c.etc,
    multiplier: c.mult,
    baseAmount: c.base,
    percentFactor: c.pct,
    installation: c.inst,
    fuel: c.fuel,
  };
}

/** The COPY AS API CALL curl template — placeholder host kept as in v5. */
export function apiCurl(p: Record<string, number>): string {
  return (
    "curl -X POST https://<your-vercel-app>/api/calculator/run \\\n" +
    '  -H "Authorization: Bearer $PROTAKE_API_KEY" \\\n' +
    '  -H "Content-Type: application/json" \\\n' +
    "  -d '" + JSON.stringify(p) + "'"
  );
}
