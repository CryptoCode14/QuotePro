import { fmt$, type CalcResult } from "@/lib/calc";
import { gapVerdict, type GapVerdict } from "@/lib/gap";
import { Eyebrow } from "@/components/primitives";

interface CostCheckPanelProps {
  c: CalcResult;
}

function CheckRow({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-sans text-sm font-medium text-ink">{label}</div>
        <div className="font-num mt-0.5 text-xs text-muted">{sub}</div>
      </div>
      <div className="font-num text-base font-medium text-ink">{value}</div>
    </div>
  );
}

type Verdict = GapVerdict;

const VERDICT_STYLES: Record<
  Verdict,
  { valueClass: string; pillClass: string; label: string }
> = {
  on: {
    valueClass: "text-ink",
    pillClass: "bg-ok/15 text-ok",
    label: "ON TARGET",
  },
  above: {
    valueClass: "text-warn",
    pillClass: "bg-warn/15 text-warn",
    label: "ABOVE",
  },
  below: {
    valueClass: "text-bad",
    pillClass: "bg-bad/15 text-bad",
    label: "BELOW",
  },
};

/**
 * First-class 2× cost-check panel — full center-column width, distinct surface.
 * Rows + verdict only; no bars, no meters. All numbers are read from the
 * frozen calc() result (component rows show the trivial ×mult×2 audit trail).
 */
export function CostCheckPanel({ c }: CostCheckPanelProps) {
  // Signed band logic — shared with QuoteRail via gapVerdict().
  const verdict = gapVerdict(c.gap);
  const v = VERDICT_STYLES[verdict];

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <Eyebrow>2× COST CHECK</Eyebrow>
        <span className="text-xs text-muted">each cost × multiplier × 2</span>
      </div>

      <div className="mt-4 space-y-3">
        <CheckRow
          label="Door ×2"
          sub={`$${fmt$(c.door)} × ${c.mult.toFixed(2)} × 2`}
          value={`$${fmt$(c.door * c.mult * 2)}`}
        />
        <CheckRow
          label="Windows ×2"
          sub={`$${fmt$(c.windows)} × ${c.mult.toFixed(2)} × 2`}
          value={`$${fmt$(c.windows * c.mult * 2)}`}
        />
        <CheckRow
          label="Misc ×2"
          sub={`$${fmt$(c.etc)} × ${c.mult.toFixed(2)} × 2`}
          value={`$${fmt$(c.etc * c.mult * 2)}`}
        />
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-ink">
            Total 2× cost
          </span>
          <span className="font-num text-xl font-semibold text-ink">
            {`$${fmt$(c.doubleCost)}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-muted">
            Grand total
          </span>
          <span className="font-num text-base font-medium text-muted">
            {`$${fmt$(c.grandTotal)}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-ink">Gap</span>
          <span className="flex items-center gap-2">
            <span className={`font-num text-xl font-semibold ${v.valueClass}`}>
              ±${Math.round(Math.abs(c.gap)).toLocaleString("en-US")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${v.pillClass}`}
            >
              {v.label}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
