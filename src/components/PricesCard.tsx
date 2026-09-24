import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FieldKey } from "@/lib/constants";

export type FieldTag = "paste" | "check" | null;

interface PriceFieldProps {
  id: string;
  label: string;
  value: string;
  prefix: "$" | "×" | "%";
  tag: FieldTag;
  onChange: (v: string) => void;
}

/** One price input — right-aligned mono, $/×/% prefix chip, FROM PASTE / CHECK ME tag. */
function PriceField({ id, label, value, prefix, tag, onChange }: PriceFieldProps) {
  return (
    <div
      className={cn(
        "field",
        tag === "paste" && "from-paste",
        tag === "check" && "check-me",
      )}
    >
      <label htmlFor={id}>
        {label}
        <span className={cn("ftag", tag && "show", tag === "paste" && "paste", tag === "check" && "check")}>
          {tag === "paste" ? "FROM PASTE" : tag === "check" ? "CHECK ME" : ""}
        </span>
      </label>
      <div className="inwrap">
        <span className="cur2" aria-hidden>
          {prefix}
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="price-input"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

interface PricesCardProps {
  fields: Record<FieldKey, string>;
  tags: Record<"door" | "windows" | "etc", FieldTag>;
  onField: (k: FieldKey, v: string) => void;
  guided: boolean;
  dim: boolean;
  onContinue: () => void;
}

/** Prices card — 8 inputs in DOOR COSTS / OVERHEAD / LABOR groups. */
export function PricesCard({ fields, tags, onField, guided, dim, onContinue }: PricesCardProps) {
  return (
    <section
      className={cn("card", dim && "dim")}
      id="pricesCard"
      data-step="1"
      data-label="STEP 2 · PRICES"
      aria-label="Prices"
    >
      <div className="microlabel">
        PRICES <span className="mlsub">auto-filled from paste · editable</span>
      </div>

      <div className="fgroup">DOOR COSTS</div>
      <div className="fields">
        <PriceField id="f_door" label="GARAGE DOOR" value={fields.door} prefix="$" tag={tags.door} onChange={(v) => onField("door", v)} />
        <PriceField id="f_windows" label="WINDOWS" value={fields.windows} prefix="$" tag={tags.windows} onChange={(v) => onField("windows", v)} />
        <PriceField id="f_etc" label="ETC" value={fields.etc} prefix="$" tag={tags.etc} onChange={(v) => onField("etc", v)} />
        <PriceField id="f_mult" label="MULTIPLIER" value={fields.mult} prefix="×" tag={null} onChange={(v) => onField("mult", v)} />
      </div>

      <div className="fgroup">OVERHEAD</div>
      <div className="fields">
        <PriceField id="f_base" label="BASE AMOUNT" value={fields.base} prefix="$" tag={null} onChange={(v) => onField("base", v)} />
        <PriceField id="f_pct" label="PERCENT FACTOR" value={fields.pct} prefix="%" tag={null} onChange={(v) => onField("pct", v)} />
      </div>

      <div className="fgroup">
        LABOR <span className="mlsub">— leave at zero, let the solver work</span>
      </div>
      <div className="fields">
        <PriceField id="f_install" label="INSTALLATION" value={fields.inst} prefix="$" tag={null} onChange={(v) => onField("inst", v)} />
        <PriceField id="f_fuel" label="FUEL & TRAVEL" value={fields.fuel} prefix="$" tag={null} onChange={(v) => onField("fuel", v)} />
      </div>

      {guided && (
        <button className="btn ghost gcont" onClick={onContinue}>
          CONTINUE <ArrowRight size={15} strokeWidth={2} />
        </button>
      )}
    </section>
  );
}
