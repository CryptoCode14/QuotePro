import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/primitives";
import { supabase } from "@/lib/supabase";
import { QUOTE_API_BASE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** In-app API calls are same-origin relative so they always hit the preview
    deployment the user is actually on. */
const API_KEYS_URL = "/v1/api-keys";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

/** First non-nullish value across candidate field names. */
function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = r[k];
    if (v != null) return v;
  }
  return null;
}

/** Defensive normalize — the backend is evolving, so accept common field
    variants for each property. */
function normKey(r: Record<string, unknown>): ApiKey {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id: s(pick(r, "id", "key_id", "keyId")),
    name: s(pick(r, "name")) || "Unnamed key",
    prefix: s(pick(r, "prefix", "key_prefix", "keyPrefix")),
    createdAt: str(pick(r, "created_at", "createdAt")),
    lastUsedAt: str(pick(r, "last_used_at", "lastUsedAt", "last_used")),
    revoked:
      pick(r, "revoked") === true ||
      pick(r, "revoked_at", "revokedAt") != null ||
      pick(r, "is_active", "active") === false,
  };
}

async function sessionJwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function copyText(t: string): Promise<boolean> {
  const done = () => true;
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(t).then(done, () => {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        return false;
      }
      document.body.removeChild(ta);
      return true;
    });
  }
  return Promise.resolve(false);
}

const fmtDate = (iso: string | null, emptyLabel = "—") => {
  if (!iso) return emptyLabel;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? emptyLabel
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const CURL_EXAMPLE =
  `curl -X POST ${QUOTE_API_BASE}/v1/calculate \\\n` +
  `  -H "Authorization: Bearer qp_live_…" \\\n` +
  `  -H "Content-Type: application/json" \\\n` +
  `  -d '{"door": 2420.78, "windows": 227.83, "miscellaneous": 944.32}'`;

/**
 * API tab — key management + docs for the ServiceTitan middleman agent.
 * Keys are created, listed, and revoked against /v1/api-keys with the
 * Supabase session JWT.
 */
export function ApiView() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "bad" } | null>(
    null,
  );
  const [name, setName] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /* The plaintext key lives only in this tab's state: leaving the tab
     unmounts this component and it is gone for good. */
  useEffect(() => {
    const stash = timers.current;
    return () => {
      stash.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ text: m || fallback, kind: "bad" });
    },
    [],
  );

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await sessionJwt();
      if (!token) {
        setAuthed(false);
        throw new Error("Sign in to manage API keys.");
      }
      const res = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
      if (res.status === 401) {
        setAuthed(false);
        throw new Error("Session expired — sign in again.");
      }
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (json && (json.error || json.message)) ||
            `Request failed (${res.status})`,
        );
      return json;
    },
    [],
  );

  const loadKeys = useCallback(async () => {
    setListBusy(true);
    setMsg(null);
    try {
      const json = await authFetch(API_KEYS_URL);
      const rows = Array.isArray(json)
        ? json
        : Array.isArray(json?.keys)
          ? json.keys
          : Array.isArray(json?.data)
            ? json.data
            : [];
      setKeys(rows.map(normKey));
      setAuthed(true);
    } catch (e) {
      fail(e, "Could not load API keys.");
    } finally {
      setListBusy(false);
    }
  }, [authFetch, fail]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const generate = useCallback(async () => {
    setGenBusy(true);
    setMsg(null);
    setCopied(false);
    try {
      const json = await authFetch(API_KEYS_URL, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "ServiceTitan agent" }),
      });
      const plain =
        json?.apiKey ??
        json?.key ??
        json?.plaintext ??
        json?.api_key ??
        json?.token ??
        json?.data?.key;
      if (!plain) throw new Error("The server did not return a key.");
      setPlainKey(String(plain));
      setName("");
      setMsg({ text: "Key created.", kind: "ok" });
      await loadKeys();
    } catch (e) {
      fail(e, "Could not create the key.");
    } finally {
      setGenBusy(false);
    }
  }, [authFetch, fail, loadKeys, name]);

  const revoke = useCallback(
    async (k: ApiKey) => {
      if (!window.confirm(`Revoke the key "${k.name}"? It stops working immediately.`))
        return;
      setRevoking(k.id);
      setMsg(null);
      try {
        await authFetch(`${API_KEYS_URL}?id=${encodeURIComponent(k.id)}`, {
          method: "DELETE",
        });
        setMsg({ text: `Key "${k.name}" revoked.`, kind: "ok" });
        await loadKeys();
      } catch (e) {
        fail(e, "Could not revoke the key.");
      } finally {
        setRevoking(null);
      }
    },
    [authFetch, fail, loadKeys],
  );

  const onCopyPlain = useCallback(async () => {
    if (!plainKey) return;
    if (await copyText(plainKey)) {
      setCopied(true);
      later(() => setCopied(false), 2000);
    }
  }, [later, plainKey]);

  const onCopyCurl = useCallback(async () => {
    if (await copyText(CURL_EXAMPLE)) {
      setCurlCopied(true);
      later(() => setCurlCopied(false), 2000);
    }
  }, [later]);

  return (
    <section
      id="view-api"
      aria-label="API"
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"
    >
      <div>
        <Eyebrow>API</Eyebrow>
        <p className="mt-1.5 text-[13px] text-muted">
          Programmatic access for the ServiceTitan middleman agent
        </p>
      </div>

      {authed === false && (
        <div
          role="status"
          className="mt-6 rounded-2xl bg-surface p-8 text-center shadow-card"
        >
          <p className="text-[15px] font-medium text-ink">
            Sign in to manage API keys.
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            Your session expired or you are signed out.
          </p>
        </div>
      )}

      {authed !== false && (
        <>
          {/* ---------- keys ---------- */}
          <div className="mt-6 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">API keys</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Bearer keys for calling <span className="font-mono text-[12px]">/v1/*</span> from outside this app.
                </p>
              </div>
              <button
                type="button"
                onClick={loadKeys}
                disabled={listBusy}
                title="Refresh"
                aria-label="Refresh API keys"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-fill hover:text-ink disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.75}
                  className={cn(listBusy && "animate-spin")}
                />
              </button>
            </div>

            {msg && (
              <p
                role="status"
                className={cn(
                  "mt-3 text-[13px]",
                  msg.kind === "ok" ? "text-ok" : "text-bad",
                )}
              >
                {msg.text}
              </p>
            )}

            {/* new-key banner — shown exactly once, then gone */}
            {plainKey && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-4"
              >
                <div className="flex items-center gap-2">
                  <KeyRound size={15} strokeWidth={2} className="text-warn" />
                  <span className="text-[13px] font-semibold text-ink">
                    Store it now — it will never be shown again.
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={plainKey}
                    aria-label="New API key"
                    onFocus={(e) => e.target.select()}
                    className="h-12 flex-1 rounded-xl border border-transparent bg-surface px-4 font-mono text-[13px] text-ink shadow-inset outline-none focus:border-accent focus:ring-4 focus:ring-accent/20"
                  />
                  <button
                    type="button"
                    onClick={onCopyPlain}
                    className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99]"
                  >
                    {copied ? (
                      <>
                        <Check size={15} strokeWidth={2} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={15} strokeWidth={1.75} /> Copy
                      </>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPlainKey(null)}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors hover:text-ink"
                >
                  <X size={13} strokeWidth={2} /> Dismiss
                </button>
              </div>
            )}

            {/* generate */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Key name — e.g. ServiceTitan agent"
                aria-label="New API key name"
                className="bg-fill text-[14px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") generate();
                }}
              />
              <button
                type="button"
                onClick={generate}
                disabled={genBusy}
                className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none"
              >
                <Plus size={15} strokeWidth={2} />
                {genBusy ? "Creating…" : "Generate"}
              </button>
            </div>

            {/* key list */}
            <div className="mt-4 space-y-2.5">
              {keys === null && (
                <p className="py-6 text-center text-[13px] text-muted">
                  {listBusy ? "Loading keys…" : "No keys loaded."}
                </p>
              )}
              {keys !== null && keys.length === 0 && (
                <p className="py-6 text-center text-[13px] text-muted">
                  No API keys yet — generate one above.
                </p>
              )}
              {keys?.map((k) => (
                <div
                  key={k.id || k.prefix}
                  className="flex items-center gap-3 rounded-xl bg-fill px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">
                        {k.name}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                          k.revoked
                            ? "bg-muted/15 text-muted"
                            : "bg-ok/15 text-ok",
                        )}
                      >
                        {k.revoked ? "Revoked" : "Active"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-muted">
                      {k.prefix || "—"}
                    </div>
                    <div className="mt-1 font-num text-[12px] text-muted">
                      Created {fmtDate(k.createdAt)} · Last used{" "}
                      {fmtDate(k.lastUsedAt, "Never")}
                    </div>
                  </div>
                  {!k.revoked && (
                    <button
                      type="button"
                      onClick={() => revoke(k)}
                      disabled={revoking === k.id}
                      title="Revoke key"
                      aria-label={`Revoke key ${k.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface hover:text-bad disabled:opacity-50"
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---------- docs ---------- */}
          <div className="mt-6 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
            <h2 className="text-[15px] font-semibold text-ink">Quick start</h2>
            <p className="mt-1 text-[13px] text-muted">
              Price a quote from the middleman agent. Standing defaults fill the
              rest: multiplier 1.0, base 2000, pct 25, installation 0, fuel 0.
            </p>
            <div className="relative mt-4">
              <pre className="overflow-x-auto rounded-xl bg-ink/[0.92] p-4 font-mono text-[12px] leading-relaxed text-white/90 dark:bg-black/60">
                {CURL_EXAMPLE}
              </pre>
              <button
                type="button"
                onClick={onCopyCurl}
                className="absolute right-2.5 top-2.5 flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12px] font-medium text-white/80 backdrop-blur transition-colors duration-150 hover:bg-white/20 hover:text-white"
              >
                {curlCopied ? (
                  <>
                    <Check size={13} strokeWidth={2.5} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={13} strokeWidth={1.75} /> Copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              The response carries{" "}
              <span className="font-mono text-[12px] text-ink">dealer_cost_total</span>
              {" "}(door + windows + misc → ServiceTitan material cost),{" "}
              <span className="font-mono text-[12px] text-ink">double_cost</span>
              {" "}(manual verification target), and{" "}
              <span className="font-mono text-[12px] text-ink">final_price</span>
              {" "}(the customer price).
            </p>
          </div>
        </>
      )}
    </section>
  );
}
