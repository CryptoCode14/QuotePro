/**
 * Shared quote-row building for the /v1/quotes endpoints (single POST and
 * bulk POST). The server recomputes ALL money fields with the frozen pricing
 * math — client-supplied totals are never trusted.
 */
import { computeQuote, parseQuoteInputs } from "./inputs";

export const QUOTE_COLS =
  "id, created_at, door, windows, miscellaneous, multiplier, base, pct, " +
  "installation, fuel, dealer_cost_total, double_cost, final_price, margin, source, note, " +
  "door_model, door_specs, door_options";

export interface QuoteTextFields {
  source: string;
  note: string | null;
  doorModel: string | null;
  doorSpecs: string | null;
  doorOptions: string | null;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  return v.trim().slice(0, max);
};

/**
 * Optional free-text fields. Deliberately not rigid: anything missing or
 * blank becomes null (source defaults to "api"), overlong values are
 * truncated, never rejected.
 */
export function parseQuoteTextFields(
  body: Record<string, unknown>,
): QuoteTextFields {
  return {
    source: clean(body.source, 32) ?? "api",
    note: clean(body.note, 1000),
    doorModel: clean(body.door_model, 64),
    doorSpecs: clean(body.door_specs, 256),
    doorOptions: clean(body.door_options, 2000),
  };
}

export type QuoteRowResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

/** Validate pricing inputs, recompute money fields, shape the insert row. */
export function buildQuoteRow(
  body: unknown,
  userId: string,
): QuoteRowResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const parsed = parseQuoteInputs(b);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const q = computeQuote(parsed.inputs);
  const t = parseQuoteTextFields(b);
  return {
    ok: true,
    row: {
      user_id: userId,
      door: parsed.inputs.door,
      windows: parsed.inputs.windows,
      miscellaneous: parsed.inputs.misc,
      multiplier: parsed.inputs.multiplier,
      base: parsed.inputs.base,
      pct: parsed.inputs.pct,
      installation: parsed.inputs.installation,
      fuel: parsed.inputs.fuel,
      dealer_cost_total: q.dealer_cost_total,
      double_cost: q.double_cost,
      final_price: q.final_price,
      margin: q.margin,
      source: t.source,
      note: t.note,
      door_model: t.doorModel,
      door_specs: t.doorSpecs,
      door_options: t.doorOptions,
    },
  };
}
