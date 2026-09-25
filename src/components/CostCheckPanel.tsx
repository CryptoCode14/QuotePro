import { fmt$, type CalcResult } from "@/lib/calc";
import { gapVerdict, type GapVerdict } from "@/lib/gap";
import { Eyebrow } from "@/components/primitives";

interface CostCheckPanelProps {
  c: CalcResult;
}

function ComponentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-num text-[14px] text-ink">${value}</span>
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
 * First-class 2× cost-check panel — Weston's manual OCR cross-check against
 * iStore. The three cost components are summed first (Total materials is the
 * star — the number he verifies against iStore), then doubled with the
 * multiplier kept visible so the math stays auditable.
 *
 * Display restructuring only: every number is read from the frozen calc()
 * result (doubleCost = 2 × (door+windows+misc) × multiplier).
 */
export function CostCheckPanel({ c }: CostCheckPanelProps) {
  // Signed band logic — shared with QuoteRail via gapVerdict().
  const verdict = gapVerdict(c.gap);
  const v = VERDICT_STYLES[verdict];

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <Eyebrow>2× COST CHECK</Eyebrow>
        <span className="text-xs text-muted">
          sum the costs, then double — cross-check vs iStore
        </span>
      </div>

      {/* The sum — grouped in a tonal inset block (elevation, not hairlines).
          Total materials is the star of the panel. */}
      <div className="mt-4 rounded-xl bg-fill p-4">
        <div className="space-y-2">
          <ComponentRow label="Door" value={fmt$(c.door)} />
          <ComponentRow label="Windows" value={fmt$(c.windows)} />
          <ComponentRow label="Misc" value={fmt$(c.etc)} />
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <span className="text-sm font-semibold text-ink">Total materials</span>
          <span className="font-num text-xl font-semibold text-ink">
            ${fmt$(c.totalMaterials)}
          </span>
        </div>
      </div>

      {/* The double — multiplier stays visible for the audit trail. */}
      <div className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-sans text-sm font-medium text-ink">
              Total × 2
            </div>
            <div className="font-num mt-0.5 text-xs text-muted">
              ${fmt$(c.totalMaterials)} × {c.mult.toFixed(2)} × 2
            </div>
          </div>
          <div className="font-num text-xl font-semibold text-ink">
            ${fmt$(c.doubleCost)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-muted">
            Grand total
          </span>
          <span className="font-num text-base font-medium text-muted">
            ${fmt$(c.grandTotal)}
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
