/**
 * /v1/api-keys — manage the caller's own API keys. Session-JWT auth only.
 *
 * GET    → list the caller's keys (never hashes), newest first.
 * POST   → mint a new key owned by the caller. Body: { name }.
 *          The plaintext key is returned exactly once, in this response.
 * DELETE → soft-revoke one of the caller's own keys. Query: ?id=<key id>.
 *          Scoped to user_id, so revoking another user's key id returns 404
 *          (indistinguishable from unknown).
 *
 * Every query is scoped to the caller's user_id: a user can never see,
 * list, or mint keys for anyone else.
 */
import {
  anonClient,
  bad,
  getSessionUser,
  methodNotAllowed,
  mintApiKey,
  notFound,
  ok,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../_lib/auth";

const KEY_COLS = "id, name, prefix, created_at, last_used_at, revoked_at";

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const user = await getSessionUser(req, anonClient());
  if (!user) return unauth(res, "Sign in required");
  const sb = serviceClient();

  if (req.method === "GET") {
    const { data, error } = await sb
      .from("api_keys")
      .select(KEY_COLS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) return bad(res, error.message);
    return ok(res, { keys: data });
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") return bad(res, "Body must include a non-empty 'name'");
    if (name.length > 120) return bad(res, "'name' must be 120 characters or fewer");

    const { apiKey, hash, prefix } = mintApiKey();
    const { data, error } = await sb
      .from("api_keys")
      .insert([{ name, key_hash: hash, prefix, user_id: user.id }])
      .select("id, name, prefix, created_at")
      .single();
    if (error || !data) return bad(res, error?.message ?? "Failed to create API key");
    // Plaintext key appears here and nowhere else — store it now.
    return ok(
      res,
      { id: data.id, name: data.name, prefix: data.prefix, apiKey },
      201,
    );
  }

  if (req.method === "DELETE") {
    const rawId = req.query.id;
    const idStr = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!idStr || !/^\d+$/.test(idStr)) return notFound(res, "Unknown key");
    const { data, error } = await sb
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", Number(idStr))
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .select("id, revoked_at");
    if (error || !data || data.length === 0) return notFound(res, "Unknown key");
    return ok(res, { id: data[0].id, revoked_at: data[0].revoked_at });
  }

  return methodNotAllowed(res, "GET, POST, DELETE");
}
