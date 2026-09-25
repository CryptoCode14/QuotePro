/**
 * /v1/quotes — persisted quote history, strictly per-user.
 *
 * Auth: Bearer API key OR end-user session JWT. Both resolve to exactly one
 * user id (a key is attributed to its owning user_id); every read and write
 * is scoped to that id. No cross-user access anywhere.
 *
 * GET  → paginated list of the caller's quotes, newest first.
 *        ?limit= (default 25, max 100), ?offset= (default 0).
 * POST → save a quote. Body: calculate inputs + optional note/source.
 *        The server recomputes all money fields with the frozen pricing math
 *        — client-supplied totals are never trusted. Returns { id }.
 */
import {
  anonClient,
  bad,
  methodNotAllowed,
  ok,
  resolveCaller,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../_lib/auth";
import { computeQuote, parseQuoteInputs } from "../_lib/inputs";

const QUOTE_COLS =
  "id, created_at, door, windows, miscellaneous, multiplier, base, pct, " +
  "installation, fuel, dealer_cost_total, double_cost, final_price, margin, source, note";

function queryInt(v: string | string[] | undefined, def: number): number {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined) return def;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : def;
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const sb = serviceClient();
  const caller = await resolveCaller(req, sb, anonClient());
  if (!caller) return unauth(res, "Missing or invalid API key or session");

  if (req.method === "GET") {
    const limit = Math.min(Math.max(queryInt(req.query.limit, 25), 1), 100);
    const offset = Math.max(queryInt(req.query.offset, 0), 0);
    const { data, error } = await sb
      .from("quotes")
      .select(QUOTE_COLS)
      .eq("user_id", caller.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return bad(res, error.message);
    return ok(res, { quotes: data, limit, offset });
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = parseQuoteInputs(body);
    if (!parsed.ok) return bad(res, parsed.error);

    const q = computeQuote(parsed.inputs);
    const source =
      typeof body.source === "string" && body.source.trim() !== ""
        ? body.source.trim().slice(0, 32)
        : "api";
    const note =
      typeof body.note === "string" && body.note.trim() !== ""
        ? body.note.trim().slice(0, 1000)
        : null;

    const { data, error } = await sb
      .from("quotes")
      .insert([
        {
          user_id: caller.userId,
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
          source,
          note,
        },
      ])
      .select("id")
      .single();
    if (error || !data) return bad(res, error?.message ?? "Failed to save quote");
    return ok(res, { id: data.id }, 201);
  }

  return methodNotAllowed(res, "GET, POST");
}
