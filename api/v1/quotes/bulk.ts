/**
 * POST /v1/quotes/bulk — mass-add quotes to history (e.g. backfilling from
 * ServiceTitan). Strictly per-user, like the rest of /v1/quotes.
 *
 * Auth: Bearer API key with the `quotes:write` scope, OR end-user session
 * JWT (unrestricted).
 *
 * Body (deliberately not rigid — either shape works):
 *   { "quotes": [ {...}, {...} ] }     or a bare array: [ {...}, {...} ]
 *
 * Each item takes the same fields as POST /v1/quotes: door, windows,
 * miscellaneous (required; aliases misc/etc) plus optional multiplier,
 * base, pct, installation, fuel, note, source, door_model, door_specs,
 * door_options. The server recomputes ALL money fields with the frozen
 * pricing math — client-supplied totals are never trusted.
 *
 * Limits: max 500 items per request.
 *
 * Response (200): { inserted, ids, errors } where errors is
 * [{ index, error }] for the items that failed validation — valid items
 * are still saved. The envelope itself being malformed is a 400.
 */
import {
  anonClient,
  bad,
  callerHasScope,
  forbidden,
  methodNotAllowed,
  ok,
  resolveCaller,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../../_lib/auth";
import { buildQuoteRow } from "../../_lib/quotes";

const MAX_ITEMS = 500;

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const sb = serviceClient();
  const caller = await resolveCaller(req, sb, anonClient());
  if (!caller) return unauth(res, "Missing or invalid API key or session");
  if (!callerHasScope(caller, "quotes:write"))
    return forbidden(res, "This API key lacks the 'quotes:write' scope");

  const body = req.body as unknown;
  const items = Array.isArray(body)
    ? body
    : body !== null && typeof body === "object"
      ? (body as Record<string, unknown>).quotes
      : undefined;
  if (!Array.isArray(items))
    return bad(
      res,
      "Body must be an array of quotes or { \"quotes\": [...] }",
    );
  if (items.length === 0) return bad(res, "No quotes provided");
  if (items.length > MAX_ITEMS)
    return bad(res, `Too many quotes (max ${MAX_ITEMS} per request)`);

  const rows: Record<string, unknown>[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  items.forEach((item, index) => {
    const built = buildQuoteRow(item, caller.userId);
    if (built.ok) rows.push(built.row);
    else errors.push({ index, error: built.error });
  });

  let ids: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await sb
      .from("quotes")
      .insert(rows)
      .select("id");
    if (error) return bad(res, error.message);
    ids = (data ?? []).map((r: { id: string }) => r.id);
  }

  return ok(res, { inserted: ids.length, ids, errors });
}
