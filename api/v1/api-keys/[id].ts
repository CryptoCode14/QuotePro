/**
 * DELETE /v1/api-keys/[id] — soft-revoke one of the caller's own API keys.
 * Session-JWT auth only. The revoke is scoped to user_id, so revoking
 * another user's key id returns 404 (indistinguishable from unknown).
 */
import {
  anonClient,
  getSessionUser,
  methodNotAllowed,
  notFound,
  ok,
  serviceClient,
  unauth,
  type ApiReq,
  type ApiRes,
} from "../../_lib/auth";

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== "DELETE") return methodNotAllowed(res, "DELETE");

  const user = await getSessionUser(req, anonClient());
  if (!user) return unauth(res, "Sign in required");

  const rawId = req.query.id;
  const idStr = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idStr || !/^\d+$/.test(idStr)) return notFound(res, "Unknown key");

  const sb = serviceClient();
  const { data, error } = await sb
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", Number(idStr))
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id, revoked_at");
  if (error) return notFound(res, "Unknown key");
  if (!data || data.length === 0) return notFound(res, "Unknown key");
  return ok(res, { id: data[0].id, revoked_at: data[0].revoked_at });
}
