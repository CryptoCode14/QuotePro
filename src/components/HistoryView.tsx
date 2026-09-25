import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import {
  clearHistory,
  loadHistory,
  type HistoryEntry,
} from "@/lib/history";
import { fmt$ } from "@/lib/calc";
import { cn } from "@/lib/utils";

interface HistoryViewProps {
  onRestore: (entry: HistoryEntry) => void;
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
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());
  const [version, setVersion] = useState(0);

  const refresh = () => {
    setEntries(loadHistory());
    setVersion((v) => v + 1);
  };

  const onClear = () => {
    if (!window.confirm("Clear estimate history?")) return;
    clearHistory();
    refresh();
  };

  return (
    <section
      id="view-history"
      aria-label="Estimate history"
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"
      key={version}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>History</Eyebrow>
          <p className="mt-1.5 text-[13px] text-muted">
            Every scan and solve, newest first — restore any entry into the
            workbench.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="Clear history"
            aria-label="Clear history"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface hover:text-bad"
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        {entries.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-4 py-12 text-center shadow-card">
            <History size={20} strokeWidth={1.75} className="text-muted" />
            <p className="text-[13px] text-muted">
              No history yet — scan a screenshot or solve a pricing to start
              the log.
            </p>
          </div>
        )}
        {entries.map((e) => (
          <article
            key={e.id}
            className="rounded-2xl bg-surface p-4 shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                    e.type === "scan"
                      ? "bg-accent/15 text-accent"
                      : "bg-ok/15 text-ok",
                  )}
                >
                  {e.type === "scan" ? "Scan" : "Solve"}
                </span>
                <span className="truncate font-num text-[12px] text-muted">
                  {fmtTime(e.at)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRestore(e)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                title="Load these costs into the workbench"
              >
                <RotateCcw size={13} strokeWidth={2} />
                Restore
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-num text-[13px] text-ink">
              <span>
                Door <span className="font-semibold">${fmt$(e.door)}</span>
              </span>
              <span>
                Win <span className="font-semibold">${fmt$(e.windows)}</span>
              </span>
              <span>
                Misc <span className="font-semibold">${fmt$(e.etc)}</span>
              </span>
              {e.type === "solve" && e.grandTotal !== undefined && (
                <span>
                  Total{" "}
                  <span className="font-semibold">
                    ${fmt$(e.grandTotal)}
                  </span>
                  {e.margin !== undefined && (
                    <span className="text-muted">
                      {" "}
                      · {e.margin.toFixed(1)}%
                    </span>
                  )}
                </span>
              )}
            </div>
            {e.type === "scan" && e.cards && e.cards.length > 0 && (
              <p className="mt-1.5 truncate text-[12px] text-muted">
                {e.cards
                  .map(
                    (c) =>
                      `${c.label} (${c.kind} $${c.netPrice.toFixed(2)})`,
                  )
                  .join(" · ")}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
