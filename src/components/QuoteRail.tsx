import type { ReactNode } from "react";
import {
  Calculator,
  Check,
  Copy,
  Printer,
  RotateCcw,
} from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import { useTween } from "@/hooks/useTween";
import { fmt$, marginBand, type CalcResult } from "@/lib/calc";
import { gapVerdict } from "@/lib/gap";
import { cn } from "@/lib/utils";

interface QuoteRailProps {
  c: CalcResult;
  tweenDur: number;
  tweenSeq: number;
  solving: boolean;
  solved: { margin: number; gap: number } | null;
  onSolve: () => void;
  onReset: () => void;
  onCopyApi: () => void;
  onPrint: () => void;
}

type PillTone = "ok" | "warn" | "bad";

const pillTones: Record<PillTone, string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        pillTones[tone],
      )}
    >
      {children}
    </span>
  );
}

function LedgerRow({
  label,
  value,
  strong,
  suffix,
}: {
  label: string;
  value: string;
  strong?: boolean;
  suffix?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={cn(
          "font-num text-[13px] text-ink",
          strong && "text-[15px] font-semibold",
        )}
      >
        {value}
        {suffix}
      </span>
    </div>
  );
}

function GhostBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
  );
}

export function QuoteRail({
  c,
  tweenDur,
  tweenSeq,
  solving,
  solved,
  onSolve,
  onReset,
  onCopyApi,
  onPrint,
}: QuoteRailProps) {
  const hero = useTween(c.grandTotal, tweenDur, tweenSeq);

  const marginB = marginBand(c.margin);
  const marginPill: { label: string; tone: PillTone } =
    marginB === "in"
      ? { label: "ON TARGET", tone: "ok" }
      : marginB === "hi"
        ? { label: "ABOVE", tone: "warn" }
        : { label: "BELOW", tone: "bad" };

  const gapAbs = Math.abs(c.gap);
  // Signed band logic — shared with CostCheckPanel via gapVerdict().
  const gv = gapVerdict(c.gap);
  const gapValueClass =
    gv === "on" ? "text-ink" : gv === "above" ? "text-warn" : "text-bad";
  const gapPill: { label: string; tone: PillTone } =
    gv === "on"
      ? { label: "ON TARGET", tone: "ok" }
      : gv === "above"
        ? { label: "ABOVE", tone: "warn" }
        : { label: "BELOW", tone: "bad" };
  const gapSign = c.gap < 0 ? "−" : "+";

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <aside className="rounded-2xl bg-surface p-6 shadow-card self-start lg:sticky lg:top-20">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>Quote</Eyebrow>
        <span className="text-[12px] text-muted">{dateStr}</span>
      </div>

      {/* Hero — deep-ink panel with white tabular numerals. The ink block
          floats on the white card in light mode; in dark mode a hairline
          white edge keeps it distinct from the dark card. Clamped to fit
          the rail; Inter tabular numerals keep every width stable. */}
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-b from-[#333338] via-[#1c1c20] to-[#101013] px-5 py-5 shadow-inset dark:border dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] to-transparent"
        />
        <div className="relative text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">
          Grand total
        </div>
        <div
          className="relative mt-1 whitespace-nowrap font-num font-semibold tracking-tight text-white"
          style={{
            fontSize: "clamp(34px, 4vw, 52px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
          aria-live="polite"
          aria-label={`Grand total $${hero.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        >
          $
          {hero.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-num text-[13px] text-muted">MARGIN</span>
          <span className="flex items-center gap-2">
            <span className="font-num text-[14px] text-ink">
              {c.margin.toFixed(1)}%
            </span>
            <Pill tone={marginPill.tone}>{marginPill.label}</Pill>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-num text-[13px] text-muted">GAP</span>
          <span className="flex items-center gap-2">
            <span className={cn("font-num text-[14px] font-medium", gapValueClass)}>
              {gapSign}${fmt$(gapAbs)}
            </span>
            <Pill tone={gapPill.tone}>{gapPill.label}</Pill>
          </span>
        </div>
      </div>

      <div className="mt-5">
        <LedgerRow label="Total materials" value={`$${fmt$(c.totalMaterials)}`} />
        <LedgerRow label="After multiplier" value={`$${fmt$(c.afterMult)}`} />
        <LedgerRow label="Overhead" value={`$${fmt$(c.overhead)}`} />
        <LedgerRow label="40% factor" value={`$${fmt$(c.f04)}`} />
        <LedgerRow label="Subtotal" value={`$${fmt$(c.subBefore)}`} />
        <LedgerRow label="Installation" value={`$${fmt$(c.inst)}`} />
        <LedgerRow label="Fuel & travel" value={`$${fmt$(c.fuel)}`} />
        <LedgerRow label="10% markup" value={`$${fmt$(c.subAfter * 0.1)}`} />
        <LedgerRow
          label="Grand total"
          value={`$${fmt$(c.grandTotal)}`}
          strong
        />
        <LedgerRow label="Expenses" value={`$${fmt$(c.expenses)}`} />
        <LedgerRow
          label="Net profit"
          value={`$${fmt$(c.net)}`}
          suffix={
            <span className="ml-1 text-[12px] font-normal text-muted">
              · {c.margin.toFixed(1)}%
            </span>
          }
        />
      </div>

      <button
        type="button"
        onClick={onSolve}
        disabled={solving}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold uppercase tracking-[0.06em] text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none"
      >
        <Calculator size={16} strokeWidth={2} />
        {solving ? "SOLVING…" : "SOLVE PRICING"}
      </button>

      {solved && (
        <div
          role="status"
          className="mt-2.5 flex items-center gap-2 rounded-xl bg-ok/15 px-3 py-2.5 text-[12px] font-medium text-ok"
        >
          <Check size={14} strokeWidth={2.5} className="shrink-0" />
          <span>
            Solved · {solved.margin.toFixed(1)}% margin · gap $
            {fmt$(Math.abs(solved.gap))}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1">
        <GhostBtn icon={RotateCcw} label="Reset" onClick={onReset} />
        <GhostBtn icon={Copy} label="Copy API call" onClick={onCopyApi} />
        <GhostBtn icon={Printer} label="Print" onClick={onPrint} />
      </div>
    </aside>
  );
}
