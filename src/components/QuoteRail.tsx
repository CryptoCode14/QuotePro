import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Calculator,
  Check,
  Printer,
  RotateCcw,
  Save,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import { useTween } from "@/hooks/useTween";
import { fmt$, marginBand, type CalcResult } from "@/lib/calc";
import { gapVerdict } from "@/lib/gap";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface QuoteRailProps {
  c: CalcResult;
  tweenDur: number;
  tweenSeq: number;
  solving: boolean;
  solved: { margin: number; gap: number } | null;
  onSolve: () => void;
  onReset: () => void;
  onPrint: () => void;
  doorModel: string;
  doorSpecs: string;
  doorOptions: string;
  onDoorModel: (v: string) => void;
  onDoorSpecs: (v: string) => void;
  onDoorOptions: (v: string) => void;
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
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[12px] font-medium text-muted transition-all duration-150 hover:bg-fill hover:text-ink active:scale-[0.97]"
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
  onPrint,
  doorModel,
  doorSpecs,
  doorOptions,
  onDoorModel,
  onDoorSpecs,
  onDoorOptions,
}: QuoteRailProps) {
  const hero = useTween(c.grandTotal, tweenDur, tweenSeq);

  /* ---------- save quote to the API (subtle ghost action; Solve stays primary) ---------- */
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    kind: "ok" | "bad";
    text: string;
  } | null>(null);
  const saveTimer = useRef<number | null>(null);

  const flashSaveMsg = (m: { kind: "ok" | "bad"; text: string }) => {
    setSaveMsg(m);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaveMsg(null), 5000);
  };

  const saveQuote = async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in to save a quote.");
      const res = await fetch("/v1/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        /* IMPORTANT: the app's internal misc field is `etc`; the API
           contract names it `miscellaneous`. */
        body: JSON.stringify({
          door: c.door,
          windows: c.windows,
          miscellaneous: c.etc,
          multiplier: c.mult,
          base: c.base,
          pct: c.pct,
          installation: c.inst,
          fuel: c.fuel,
          source: "app",
          door_model: doorModel.trim() || undefined,
          door_specs: doorSpecs.trim() || undefined,
          door_options: doorOptions.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (json && (json.error || json.message)) ||
            `Save failed (${res.status})`,
        );
      const id = json?.id ?? json?.quote_id ?? json?.quoteId ?? json?.data?.id;
      flashSaveMsg({
        kind: "ok",
        text: id ? `Saved · quote ${id}` : "Quote saved.",
      });
    } catch (e) {
      flashSaveMsg({
        kind: "bad",
        text: e instanceof Error ? e.message : "Could not save the quote.",
      });
    } finally {
      setSaving(false);
    }
  };

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
          white edge keeps it distinct from the dark card. An inset top
          highlight gives the glassy keynote-grade edge; the sheen overlay
          stays subtle. Clamped to fit the rail; Inter tabular numerals keep
          every width stable. */}
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-b from-[#333338] via-[#1c1c20] to-[#101013] px-5 py-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),inset_0_-1px_0_rgb(0_0_0/0.4)] dark:border dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.09] via-white/[0.02] to-transparent"
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
        className="group relative mt-6 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent text-[13px] font-semibold uppercase tracking-[0.06em] text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none"
      >
        {/* Sheen sweep on hover — keynote-grade tactile feedback. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
        />
        <Calculator size={16} strokeWidth={2} className="relative" />
        <span className="relative">
          {solving ? "SOLVING…" : "SOLVE PRICING"}
        </span>
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

      {saveMsg && (
        <div
          role="status"
          className={cn(
            "mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium",
            saveMsg.kind === "ok"
              ? "bg-ok/15 text-ok"
              : "bg-bad/15 text-bad",
          )}
        >
          <Check size={14} strokeWidth={2.5} className="shrink-0" />
          <span>{saveMsg.text}</span>
        </div>
      )}

      {/* Door identity — saved with the quote so it can be found later.
          Model/size/options are auto-captured from the scan's Product line
          (editable). */}
      <div className="mt-6 rounded-xl bg-fill p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Door for this quote
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="text"
            value={doorModel}
            onChange={(e) => onDoorModel(e.target.value)}
            placeholder="Model · 3200"
            aria-label="Door model"
            maxLength={64}
            className="h-10 rounded-lg bg-surface px-3 text-[13px] text-ink shadow-inset outline-none placeholder:text-muted/70 focus-visible:border-accent"
          />
          <input
            type="text"
            value={doorSpecs}
            onChange={(e) => onDoorSpecs(e.target.value)}
            placeholder="Size · 16x7"
            aria-label="Door size"
            maxLength={256}
            className="h-10 rounded-lg bg-surface px-3 text-[13px] text-ink shadow-inset outline-none placeholder:text-muted/70 focus-visible:border-accent"
          />
          <textarea
            value={doorOptions}
            onChange={(e) => onDoorOptions(e.target.value)}
            placeholder="Options · track, windows, insulation…"
            aria-label="Door options"
            maxLength={2000}
            rows={3}
            className="col-span-2 rounded-lg bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink shadow-inset outline-none placeholder:text-muted/70 focus-visible:border-accent"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <GhostBtn icon={RotateCcw} label="Reset" onClick={onReset} />
        <GhostBtn
          icon={Save}
          label={saving ? "Saving…" : "Save quote"}
          onClick={saveQuote}
        />
        <GhostBtn icon={Printer} label="Print" onClick={onPrint} />
      </div>
    </aside>
  );
}
