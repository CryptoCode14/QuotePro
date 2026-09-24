import type { FieldKey } from "@/lib/constants";
import { PriceField, Section } from "@/components/primitives";

interface PricingWorkbenchProps {
  fields: Record<FieldKey, string>;
  onField: (k: FieldKey, v: string) => void;
  filledKeys: FieldKey[];
}

/**
 * Center-column pricing inputs, grouped by meaning.
 * Layout is owned by the parent; this renders the three ruled sections only.
 */
export function PricingWorkbench({
  fields,
  onField,
  filledKeys,
}: PricingWorkbenchProps) {
  const bind = (k: FieldKey) => ({
    value: fields[k],
    onChange: (v: string) => onField(k, v),
    flash: filledKeys.includes(k),
  });

  return (
    <div className="space-y-6">
      <Section eyebrow="COSTS">
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
          <PriceField
            id="door"
            label="Garage door"
            adornment="$"
            {...bind("door")}
          />
          <PriceField
            id="windows"
            label="Windows"
            adornment="$"
            {...bind("windows")}
          />
          <PriceField id="etc" label="Misc" adornment="$" {...bind("etc")} />
          <PriceField
            id="mult"
            label="Multiplier"
            adornment="×"
            {...bind("mult")}
          />
        </div>
      </Section>

      <Section eyebrow="OVERHEAD">
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
          <PriceField
            id="base"
            label="Base amount"
            adornment="$"
            {...bind("base")}
          />
          <PriceField
            id="pct"
            label="Percent factor"
            adornment="%"
            {...bind("pct")}
          />
        </div>
      </Section>

      <Section eyebrow="LABOR" hint="leave at zero — Solve sets these">
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
          <PriceField
            id="inst"
            label="Installation"
            adornment="$"
            {...bind("inst")}
          />
          <PriceField
            id="fuel"
            label="Fuel & travel"
            adornment="$"
            {...bind("fuel")}
          />
        </div>
      </Section>
    </div>
  );
}
