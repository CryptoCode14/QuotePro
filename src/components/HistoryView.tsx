import { useEffect, useState } from "react";
import { Eye, History, RotateCcw, Search, Trash2 } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { fmt$ } from "@/lib/calc";
import { cn } from "@/lib/utils";

/** A quote row as returned by GET /v1/quotes. */
export interface SavedQuote {
  id: string;
  created_at: string;
  door: number;
  windows: number;
  miscellaneous: number;
  multiplier: number | null;
  base: number | null;
  pct: number | null;
  installation: number | null;
  fuel: number | null;
  dealer_cost_total: number;
  double_cost: number;
  final_price: number;
  margin: number;
  source: string | null;
  note: string | null;
  door_model: string | null;
  door_specs: string | null;
  door_options: string | null;
}

interface HistoryViewProps {
  onRestore: (quote: SavedQuote) => void;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    );
  } catch {
    return iso;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-num text-[13px] text-ink">{value}</span>
    </div>
  );
}

export function HistoryView({ onRestore }: HistoryViewProps) {
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<SavedQuote | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in to view saved quotes.");
      const res = await fetch("/v1/quotes?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (json && (json.error || json.message)) ||
            `Could not load quotes (${res.status})`,
        );
      setQuotes(Array.isArray(json?.quotes) ? json.quotes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load quotes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteQuote = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in to delete a quote.");
      const res = await fetch(`/v1/quotes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (json && (json.error || json.message)) ||
            `Could not delete quote (${res.status})`,
        );
      setQuotes((qs) => qs.filter((q) => q.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete quote.");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? quotes.filter((quote) =>
        [quote.door_model, quote.door_specs, quote.door_options, quote.note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : quotes;

  return (
    <section
      id="view-history"
      aria-label="Saved quotes"
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>History</Eyebrow>
          <p className="mt-1.5 text-[13px] text-muted">
            Saved quotes, newest first — click a card for full details, or
            restore an entry into the workbench.
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        <Search
          size={15}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by door model, size, options, or note…"
          aria-label="Search saved quotes"
          className="h-11 w-full rounded-xl bg-surface pl-10 pr-4 text-[13px] text-ink shadow-card outline-none placeholder:text-muted/70 focus-visible:border-accent"
        />
      </div>

      <div className="mt-4 space-y-2.5">
        {loading && (
          <div className="rounded-2xl bg-surface px-4 py-12 text-center shadow-card">
            <p className="text-[13px] text-muted">Loading saved quotes…</p>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-2xl bg-bad/10 px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-bad">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-bad transition-colors hover:bg-bad/10"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-4 py-12 text-center shadow-card">
            <History size={20} strokeWidth={1.75} className="text-muted" />
            <p className="text-[13px] text-muted">
              {quotes.length === 0
                ? "No saved quotes yet — build an estimate and hit “Save quote”."
                : "No quotes match your search."}
            </p>
          </div>
        )}
        {filtered.map((quote) => (
          <article
            key={quote.id}
            onClick={() => setDetail(quote)}
            className="cursor-pointer rounded-2xl bg-surface p-4 shadow-card transition-transform duration-150 hover:-translate-y-[1px] active:translate-y-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {quote.door_model && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
                    {quote.door_model}
                  </span>
                )}
                <span className="truncate font-num text-[12px] text-muted">
                  {fmtTime(quote.created_at)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetail(quote);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                  title="View full quote details"
                >
                  <Eye size={13} strokeWidth={2} />
                  Details
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore(quote);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                  title="Load this quote into the workbench"
                >
                  <RotateCcw size={13} strokeWidth={2} />
                  Restore
                </button>
                {confirmDelete === quote.id ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteQuote(quote.id);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-bad/15 px-2.5 py-1.5 text-[12px] font-semibold text-bad transition-colors duration-150 hover:bg-bad/25 disabled:opacity-60"
                    title="Confirm delete — removes this quote permanently"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                    {deleting ? "Deleting…" : "Confirm"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(quote.id);
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-bad/10 hover:text-bad"
                    title="Delete this quote"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                    Delete
                  </button>
                )}
              </div>
            </div>
            {(quote.door_specs || quote.note) && (
              <p className="mt-1.5 truncate text-[12px] text-muted">
                {[quote.door_specs, quote.note].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-num text-[13px] text-ink">
              <span>
                Door <span className="font-semibold">${fmt$(quote.door)}</span>
              </span>
              <span>
                Win{" "}
                <span className="font-semibold">${fmt$(quote.windows)}</span>
              </span>
              <span>
                Misc{" "}
                <span className="font-semibold">
                  ${fmt$(quote.miscellaneous)}
                </span>
              </span>
              <span>
                Total{" "}
                <span className="font-semibold">
                  ${fmt$(quote.final_price)}
                </span>
                <span className="text-muted">
                  {" "}
                  · {Number(quote.margin).toFixed(1)}%
                </span>
              </span>
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && quotes.length >= 100 && (
        <p className="mt-4 text-center text-[12px] text-muted">
          Showing the 100 most recent — refine your search to find older
          quotes.
        </p>
      )}

      {/* ---------- full quote detail ---------- */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  {detail.door_model && (
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
                      {detail.door_model}
                    </span>
                  )}
                  <span className="font-num text-[12px] font-normal text-muted">
                    {fmtTime(detail.created_at)}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Everything saved for this quote.
                </DialogDescription>
              </DialogHeader>

              {(detail.door_specs || detail.door_options || detail.note) && (
                <div className="mt-4 rounded-xl bg-fill p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Door
                  </div>
                  {detail.door_specs && (
                    <p className="mt-1.5 text-[13px] font-medium text-ink">
                      {detail.door_specs}
                    </p>
                  )}
                  {detail.door_options && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                      {detail.door_options}
                    </p>
                  )}
                  {detail.note && (
                    <p className="mt-1.5 text-[13px] italic text-muted">
                      “{detail.note}”
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4">
                <DetailRow label="Door cost" value={`$${fmt$(detail.door)}`} />
                <DetailRow
                  label="Windows"
                  value={`$${fmt$(detail.windows)}`}
                />
                <DetailRow
                  label="Miscellaneous"
                  value={`$${fmt$(detail.miscellaneous)}`}
                />
                <DetailRow
                  label="Multiplier"
                  value={`${Number(detail.multiplier ?? 1).toFixed(2)}×`}
                />
                <DetailRow
                  label="Overhead base"
                  value={`$${fmt$(Number(detail.base ?? 0))}`}
                />
                <DetailRow
                  label="Overhead %"
                  value={`${Number(detail.pct ?? 0).toFixed(0)}%`}
                />
                <DetailRow
                  label="Installation"
                  value={`$${fmt$(Number(detail.installation ?? 0))}`}
                />
                <DetailRow
                  label="Fuel & travel"
                  value={`$${fmt$(Number(detail.fuel ?? 0))}`}
                />
                <div className="my-2 border-t border-ink/10" />
                <DetailRow
                  label="Dealer cost"
                  value={`$${fmt$(detail.dealer_cost_total)}`}
                />
                <DetailRow
                  label="Double cost"
                  value={`$${fmt$(detail.double_cost)}`}
                />
                <div className="flex items-baseline justify-between gap-4 py-[3px]">
                  <span className="text-[13px] font-semibold text-ink">
                    Final price
                  </span>
                  <span className="font-num text-[16px] font-semibold text-ink">
                    ${fmt$(detail.final_price)}
                    <span className="ml-1.5 text-[12px] font-normal text-muted">
                      · {Number(detail.margin).toFixed(1)}% margin
                    </span>
                  </span>
                </div>
                {detail.source && (
                  <p className="mt-3 text-[11px] uppercase tracking-[0.06em] text-muted">
                    Source: {detail.source}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onRestore(detail);
                    setDetail(null);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2",
                    "text-[12px] font-semibold uppercase tracking-[0.06em] text-white",
                    "transition-all duration-150 hover:brightness-110 active:scale-[0.97]",
                  )}
                >
                  <RotateCcw size={13} strokeWidth={2} />
                  Restore
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
