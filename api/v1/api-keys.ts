/**
 * /v1/api-keys — manage the caller's own API keys.
 *
 * Auth: end-user session JWT (full access), OR a Bearer <redacted> API key
 * carrying the right scope: `keys:read` for GET, `keys:manage` for POST/DELETE.
 *
 * GET    → list the caller's keys (never hashes), newest first.
 * POST   → mint a new key owned by the caller. Body: { name, scopes? }.
 *          The plaintext key is returned exactly once, in this response.
 *          A key minted by another API key cannot exceed the minter's scopes.
 * DELETE → soft-revoke one of the caller's own keys. Query: ?id=<key id>.
 *
 * Every query is scoped to the caller's user_id: a user can never see,
 * list, mint, or revoke keys for anyone else.
 */
import {
  anonClient,
  bad,
  callerHasScope,
  DEFAULT_KEY_SCOPES,
  forbidden,
  methodNotAllowed,
  mintApiKey,
  normalizeScopes,
  notFound,
  ok,
  resolveCaller,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../_lib/auth";

const KEY_COLS = "id, name, prefix, scopes, created_at, last_used_at, revoked_at";

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const sb = serviceClient();
  const caller = await resolveCaller(req, sb, anonClient());
  if (!caller) return unauth(res, "Sign in required");
  // resolveCaller already attributed the call to exactly one user id,
  // from either a session JWT or an API key owned by that user.
  const userId = caller.userId;

  if (req.method === "GET") {
    if (!callerHasScope(caller, "keys:read"))
      return forbidden(res, "This API key lacks the 'keys:read' scope");
    const { data, error } = await sb
      .from("api_keys")
      .select(KEY_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) return bad(res, error.message);
    return ok(res, { keys: data });
  }

  if (req.method === "POST") {
    if (!callerHasScope(caller, "keys:manage"))
      return forbidden(res, "This API key lacks the 'keys:manage' scope");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") return bad(res, "Body must include a non-empty 'name'");
    if (name.length > 120) return bad(res, "'name' must be 120 characters or fewer");

    let scopes: string[];
    if (body.scopes === undefined) {
      scopes = [...DEFAULT_KEY_SCOPES];
    } else {
      const parsed = normalizeScopes(body.scopes);
      if (!parsed) return bad(res, "Invalid 'scopes' — use an array of known scope names");
      scopes = parsed;
    }
    // A key cannot mint a key more powerful than itself.
    if (caller.via === "api_key" && caller.scopes !== null) {
      const excess = scopes.filter((s) => !caller.scopes!.includes(s));
      if (excess.length > 0)
        return forbidden(res, `Cannot grant scopes beyond this key's own: ${excess.join(", ")}`);
    }

    const { apiKey, hash, prefix } = mintApiKey();
    const { data, error } = await sb
      .from("api_keys")
      .insert([{ name, key_hash: hash, prefix, scopes, user_id: userId }])
      .select("id, name, prefix, scopes, created_at")
      .single();
    if (error || !data) return bad(res, error?.message ?? "Failed to create API key");
    // Plaintext key appears here and nowhere else — store it now.
    return ok(
      res,
      { id: data.id, name: data.name, prefix: data.prefix, scopes: data.scopes, apiKey },
      201,
    );
  }

  if (req.method === "DELETE") {
    if (!callerHasScope(caller, "keys:manage"))
      return forbidden(res, "This API key lacks the 'keys:manage' scope");
    const rawId = req.query.id;
    const idStr = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!idStr || !/^\d+$/.test(idStr)) return notFound(res, "Unknown key");
    const { data, error } = await sb
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", Number(idStr))
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id, revoked_at");
    if (error || !data || data.length === 0) return notFound(res, "Unknown key");
    return ok(res, { id: data[0].id, revoked_at: data[0].revoked_at });
  }

  return methodNotAllowed(res, "GET, POST, DELETE");
}
