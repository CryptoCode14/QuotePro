/**
 * /v1/quotes — persisted quote history, strictly per-user.
 *
 * Auth: Bearer API key OR end-user session JWT. Both resolve to exactly one
 * user id (a key is attributed to its owning user_id); every read and write
 * is scoped to that id. No cross-user access anywhere.
 * API keys additionally need scopes: `quotes:read` for GET, `quotes:write`
 * for POST. Session-JWT callers are unrestricted.
 *
 * GET  → paginated list of the caller's quotes, newest first.
 *        ?limit= (default 25, max 100), ?offset= (default 0),
 *        ?q= optional search across door_model, door_specs, door_options,
 *        note. Response includes has_more for paging UIs.
 * POST → save a quote. Body: calculate inputs + optional note/source/
 *        door_model/door_specs/door_options. The server recomputes all money
 *        fields with the frozen pricing math — client-supplied totals are
 *        never trusted. Returns { id }.
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
} from "../_lib/auth";
import { QUOTE_COLS, buildQuoteRow } from "../_lib/quotes";

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
    if (!callerHasScope(caller, "quotes:read"))
      return forbidden(res, "This API key lacks the 'quotes:read' scope");
    const limit = Math.min(Math.max(queryInt(req.query.limit, 25), 1), 100);
    const offset = Math.max(queryInt(req.query.offset, 0), 0);
    const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    // Strip PostgREST `or=` list separators so the term can't break the query.
    const q = typeof rawQ === "string" ? rawQ.replace(/[,()]/g, "").trim().slice(0, 80) : "";
    let sel = sb
      .from("quotes")
      .select(QUOTE_COLS)
      .eq("user_id", caller.userId);
    if (q) {
      const pat = `*${q}*`;
      sel = sel.or(
        `door_model.ilike.${pat},door_specs.ilike.${pat},door_options.ilike.${pat},note.ilike.${pat}`,
      );
    }
    // Fetch one extra row to know whether another page exists.
    const { data, error } = await sel
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit);
    if (error) return bad(res, error.message);
    const rows = data ?? [];
    const has_more = rows.length > limit;
    return ok(res, { quotes: rows.slice(0, limit), limit, offset, has_more });
  }

  if (req.method === "POST") {
    if (!callerHasScope(caller, "quotes:write"))
      return forbidden(res, "This API key lacks the 'quotes:write' scope");
    const built = buildQuoteRow(req.body, caller.userId);
    if (!built.ok) return bad(res, built.error);

    const { data, error } = await sb
      .from("quotes")
      .insert([built.row])
      .select("id")
      .single();
    if (error || !data) return bad(res, error?.message ?? "Failed to save quote");
    return ok(res, { id: data.id }, 201);
  }

  return methodNotAllowed(res, "GET, POST");
}
