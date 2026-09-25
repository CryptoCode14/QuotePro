/**
 * Shared input parsing + pricing computation for the /v1 functions.
 *
 * All pricing goes through the FROZEN math in ../../src/lib/calc (calc.ts is
 * frozen — do not reimplement it here). This module only validates/aliases
 * inputs and shapes the response.
 */
import { calc, r2 } from "../../src/lib/calc";

export interface QuoteInputs {
  door: number;
  windows: number;
  misc: number;
  multiplier: number;
  base: number;
  pct: number;
  installation: number;
  fuel: number;
}

const asNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export type ParseResult =
  | { ok: true; inputs: QuoteInputs }
  | { ok: false; error: string };

/**
 * Parse a calculate/quotes request body.
 * - `miscellaneous` accepts `misc` and `etc` as aliases.
 * - Optionals default to: multiplier 1.0, base 2000, pct 25,
 *   installation 0, fuel 0.
 * - Every value must be a finite, non-negative number.
 */
export function parseQuoteInputs(body: unknown): ParseResult {
  const b = (body ?? {}) as Record<string, unknown>;

  const door = asNum(b.door);
  const windows = asNum(b.windows);
  const misc = asNum(
    b.miscellaneous !== undefined ? b.miscellaneous : (b.misc !== undefined ? b.misc : b.etc),
  );
  if (door === null) return { ok: false, error: "Field 'door' is required and must be a finite number" };
  if (windows === null) return { ok: false, error: "Field 'windows' is required and must be a finite number" };
  if (misc === null) {
    return { ok: false, error: "Field 'miscellaneous' (aliases: 'misc', 'etc') is required and must be a finite number" };
  }

  const getOpt = (name: string, def: number): number | null => {
    const v = b[name];
    return v === undefined || v === null ? def : asNum(v);
  };
  const multiplier = getOpt("multiplier", 1.0);
  const base = getOpt("base", 2000);
  const pct = getOpt("pct", 25);
  const installation = getOpt("installation", 0);
  const fuel = getOpt("fuel", 0);

  const all: Record<string, number | null> = {
    door, windows, miscellaneous: misc, multiplier, base, pct, installation, fuel,
  };
  for (const [k, v] of Object.entries(all)) {
    if (v === null) return { ok: false, error: `Field '${k}' must be a finite number` };
    if ((v as number) < 0) return { ok: false, error: `Field '${k}' must be non-negative` };
  }

  return {
    ok: true,
    inputs: {
      door,
      windows,
      misc,
      multiplier: multiplier as number,
      base: base as number,
      pct: pct as number,
      installation: installation as number,
      fuel: fuel as number,
    },
  };
}

export interface ComputedQuote {
  dealer_cost_total: number;
  double_cost: number;
  final_price: number;
  margin: number;
  breakdown: Record<string, number>;
}

/**
 * Run the frozen pricing engine. dealer_cost_total = door+windows+misc,
 * double_cost = 2 × after-multiplier cost (the legacy 0.99 factor is dead),
 * final_price = grandTotal. Money fields rounded to cents via the frozen r2.
 */
export function computeQuote(i: QuoteInputs): ComputedQuote {
  const r = calc({
    door: i.door,
    windows: i.windows,
    etc: i.misc,
    mult: i.multiplier,
    base: i.base,
    pct: i.pct,
    inst: i.installation,
    fuel: i.fuel,
  });
  return {
    dealer_cost_total: r2(r.totalMaterials),
    double_cost: r2(r.doubleCost),
    final_price: r2(r.grandTotal),
    margin: r2(r.margin),
    breakdown: {
      totalMaterials: r2(r.totalMaterials),
      afterMult: r2(r.afterMult),
      overhead: r2(r.overhead),
      f04: r2(r.f04),
      subBefore: r2(r.subBefore),
      subAfter: r2(r.subAfter),
      grandTotal: r2(r.grandTotal),
      expenses: r2(r.expenses),
      net: r2(r.net),
      gap: r2(r.gap),
    },
  };
}
