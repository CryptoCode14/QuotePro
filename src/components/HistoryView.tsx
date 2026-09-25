import { useEffect, useState } from "react";
import { History, RotateCcw, Search } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import { supabase } from "@/lib/supabase";
import { fmt$ } from "@/lib/calc";

/** A quote row as returned by GET /v1/quotes. */
export interface SavedQuote {
  id: string;
  created_at: string;
  door: number;
  windows: number;
  miscellaneous: number;
  multiplier: number | null;
  final_price: number;
  margin: number;
  source: string | null;
  note: string | null;
  door_model: string | null;
  door_specs: string | null;
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

export function HistoryView({ onRestore }: HistoryViewProps) {
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? quotes.filter((quote) =>
        [quote.door_model, quote.door_specs, quote.note]
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
            Saved quotes, newest first — restore any entry into the workbench.
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
          placeholder="Search by door model, specs, or note…"
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
            className="rounded-2xl bg-surface p-4 shadow-card"
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
              <button
                type="button"
                onClick={() => onRestore(quote)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                title="Load this quote into the workbench"
              >
                <RotateCcw size={13} strokeWidth={2} />
                Restore
              </button>
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
    </section>
  );
}
