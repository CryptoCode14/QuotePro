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

type PillTone = "ok" | "warn" | "bad" | "accent" | "neutral";

const pillTones: Record<PillTone, string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  accent: "bg-accent/15 text-accent",
  neutral: "bg-ink/8 text-ink",
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
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-bg hover:text-ink"
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
  const gapIn = gapAbs >= 300 && gapAbs <= 400;
  const gapHi = gapAbs > 400;
  const gapValueClass = gapIn ? "text-ink" : gapHi ? "text-accent" : "text-bad";
  const gapPill: { label: string; tone: PillTone } = gapIn
    ? { label: "ON TARGET", tone: "neutral" }
    : gapHi
      ? { label: "ABOVE", tone: "accent" }
      : { label: "BELOW", tone: "bad" };
  const gapSign = c.gap < 0 ? "−" : "+";

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <aside className="rounded-2xl border border-hairline bg-surface p-6 shadow-[0_8px_30px_rgb(0_0_0/0.06)] self-start lg:sticky lg:top-6 dark:shadow-none">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>Quote</Eyebrow>
        <span className="text-[12px] text-muted">{dateStr}</span>
      </div>

      <div
        className="mt-3 font-num font-medium text-ink"
        style={{
          fontSize: "clamp(48px, 5vw, 72px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
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

      <div className="mt-4 space-y-2.5">
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

      <div className="my-4 h-px bg-hairline" />

      <div>
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

      <div className="my-4 h-px bg-hairline" />

      <button
        type="button"
        onClick={onSolve}
        disabled={solving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold uppercase tracking-[0.06em] text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        <Calculator size={16} strokeWidth={2} />
        {solving ? "SOLVING…" : "SOLVE PRICING"}
      </button>

      {solved && (
        <div
          role="status"
          className="mt-2.5 flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2.5 text-[12px] font-medium text-ok"
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
