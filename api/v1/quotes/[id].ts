/**
 * /v1/quotes/:id — single saved quote, strictly per-user.
 *
 * Auth: Bearer API key OR end-user session JWT (resolves to exactly one
 * user id). API keys need `quotes:read` for GET, `quotes:write` for DELETE.
 * Session-JWT callers are unrestricted. Rows are always filtered by the
 * caller's user_id — a quote that isn't yours reads as 404.
 *
 * GET    → the quote, or 404.
 * DELETE → deletes the quote from the database, or 404. Returns { id }.
 */
import {
  anonClient,
  bad,
  callerHasScope,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  resolveCaller,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../../_lib/auth";
import { QUOTE_COLS } from "../../_lib/quotes";

function quoteId(req: ApiReq): string | null {
  const q = req.query.id;
  const id = Array.isArray(q) ? q[0] : q;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const sb = serviceClient();
  const caller = await resolveCaller(req, sb, anonClient());
  if (!caller) return unauth(res, "Missing or invalid API key or session");

  const id = quoteId(req);
  if (!id) return bad(res, "Missing quote id");

  if (req.method === "GET") {
    if (!callerHasScope(caller, "quotes:read"))
      return forbidden(res, "This API key lacks the 'quotes:read' scope");
    const { data, error } = await sb
      .from("quotes")
      .select(QUOTE_COLS)
      .eq("id", id)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (error) return bad(res, error.message);
    if (!data) return notFound(res, "Quote not found");
    return ok(res, { quote: data });
  }

  if (req.method === "DELETE") {
    if (!callerHasScope(caller, "quotes:write"))
      return forbidden(res, "This API key lacks the 'quotes:write' scope");
    const { data, error } = await sb
      .from("quotes")
      .delete()
      .eq("id", id)
      .eq("user_id", caller.userId)
      .select("id");
    if (error) return bad(res, error.message);
    if (!data || data.length === 0) return notFound(res, "Quote not found");
    return ok(res, { id: data[0].id, deleted: true });
  }

  return methodNotAllowed(res, "GET, DELETE");
}
