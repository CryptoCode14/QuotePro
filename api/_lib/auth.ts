/**
 * Shared auth + response helpers for the /v1 serverless functions.
 *
 * - API keys: QuotePro keys (qp_live_…) are stored as SHA-256 hashes in the
 *   `api_keys` table (plaintext column retired 2026-09-25). A key is valid
 *   when its hash matches a row with revoked_at IS NULL.
 * - Session users: end-user Supabase Auth JWTs, validated via the anon client.
 *
 * All DB access here uses the service-role client (bypasses RLS). The anon
 * client is used ONLY to validate session JWTs via auth.getUser().
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

/** Minimal structural types for a Vercel Node (req, res) handler. */
export interface ApiReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiRes {
  status(code: number): ApiRes;
  json(data: unknown): void;
  setHeader(name: string, value: string | string[]): void;
}

export type Handler = (req: ApiReq, res: ApiRes) => void | Promise<void>;

export const sha256hex = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

/** Service-role client — bypasses RLS. Server-side only, never exposed. */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Anon client — used only to validate end-user session JWTs. */
export function anonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_KEY env vars");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function bearerToken(req: ApiReq): string | null {
  const h = req.headers.authorization;
  const v = Array.isArray(h) ? h[0] : h;
  if (!v || !v.toLowerCase().startsWith("bearer ")) return null;
  const token = v.slice(7).trim();
  return token === "" ? null : token;
}

export interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string | null;
  /** Owner of this key — auth.users id. Keys are strictly per-user. */
  user_id: string | null;
  /** Granted scopes, e.g. ["calculate","quotes:write"]. Null only for legacy rows. */
  scopes: string[] | null;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * Validate a QuotePro API key from the Authorization Bearer header.
 * Returns the key row (including its owning user_id), or null when
 * missing/unknown/revoked.
 */
export async function verifyApiKey(
  req: ApiReq,
  sb: SupabaseClient,
): Promise<ApiKeyRow | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await sb
    .from("api_keys")
    .select("id, name, prefix, user_id, scopes, created_at, last_used_at, revoked_at")
    .eq("key_hash", sha256hex(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  // Best-effort usage stamp; auth must not depend on it.
  void Promise.resolve(
    sb
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id),
  ).catch(() => undefined);
  return data as ApiKeyRow;
}

/**
 * Validate an end-user Supabase Auth session JWT from the Authorization
 * Bearer header. Returns the user, or null when missing/invalid.
 */
export async function getSessionUser(req: ApiReq, sbAnon: SupabaseClient) {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await sbAnon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Resolve the caller to exactly one Supabase user id, from either a valid
 * API key (attributed to the key's owner) or a valid end-user session JWT.
 * Returns null when neither authenticates. This is the single choke point
 * for per-user isolation: every user-scoped query filters on its result.
 */
export interface Caller {
  userId: string;
  /** "session" callers (the user in their own app) are unrestricted. */
  via: "api_key" | "session";
  /** Granted scopes for api_key callers; null = unrestricted (session). */
  scopes: string[] | null;
}

export async function resolveCaller(
  req: ApiReq,
  sb: SupabaseClient,
  sbAnon: SupabaseClient,
): Promise<Caller | null> {
  const key = await verifyApiKey(req, sb);
  if (key && key.user_id)
    return { userId: key.user_id, via: "api_key", scopes: key.scopes ?? DEFAULT_KEY_SCOPES };
  const user = await getSessionUser(req, sbAnon);
  if (user) return { userId: user.id, via: "session", scopes: null };
  return null;
}

// --- API key scopes ----------------------------------------------------------

/**
 * Scopes grant an API key access to specific /v1 capabilities. Session-JWT
 * callers (the signed-in user in the app) bypass scope checks entirely.
 * - calculate    → POST /v1/calculate
 * - quotes:read  → GET  /v1/quotes
 * - quotes:write → POST /v1/quotes
 * - keys:read    → GET  /v1/api-keys
 * - keys:manage  → POST /v1/api-keys (mint) and DELETE /v1/api-keys (revoke)
 */
export const SCOPE_CATALOG = [
  "calculate",
  "quotes:read",
  "quotes:write",
  "keys:read",
  "keys:manage",
] as const;

/** Default scopes for a newly minted key when the caller names none. */
export const DEFAULT_KEY_SCOPES: string[] = ["calculate", "quotes:read", "quotes:write"];

/** Validate a caller-supplied scope list. Returns null when invalid. */
export function normalizeScopes(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== "string") return null;
    if (!(SCOPE_CATALOG as readonly string[]).includes(s)) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** True when this caller may use the given scope. */
export function callerHasScope(caller: Caller, scope: string): boolean {
  return caller.scopes === null || caller.scopes.includes(scope);
}

/** True when a raw key row carries the given scope (legacy null → defaults). */
export function keyHasScope(key: ApiKeyRow, scope: string): boolean {
  return (key.scopes ?? DEFAULT_KEY_SCOPES).includes(scope);
}

/**
 * Mint a new API key. The plaintext `apiKey` must be shown to the caller
 * exactly once — only its sha256 `hash` is stored.
 */
export function mintApiKey(): { apiKey: string; hash: string; prefix: string } {
  const apiKey = "qp_live_" + randomBytes(32).toString("hex");
  return { apiKey, hash: sha256hex(apiKey), prefix: "qp_live_" + apiKey.slice(8, 12) };
}

// --- JSON response helpers -------------------------------------------------

export function ok(res: ApiRes, data: unknown, status = 200): void {
  res.status(status).json(data);
}

export function bad(res: ApiRes, message: string): void {
  res.status(400).json({ error: message });
}

export function unauth(res: ApiRes, message = "Unauthorized"): void {
  res.status(401).json({ error: message });
}

export function forbidden(res: ApiRes, message = "Forbidden"): void {
  res.status(403).json({ error: message });
}

export function notFound(res: ApiRes, message = "Not found"): void {
  res.status(404).json({ error: message });
}

export function methodNotAllowed(res: ApiRes, allow: string): void {
  res.setHeader("Allow", allow);
  res.status(405).json({ error: `Method not allowed; use ${allow}` });
}
