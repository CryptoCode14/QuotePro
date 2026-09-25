import type { ReactNode, Ref } from "react";
import { useRef } from "react";

/* ------------------------------------------------------------------ */
/* Eyebrow — the tiny tracked-out label used for every group header.  */
/* ------------------------------------------------------------------ */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-muted ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PriceField — eyebrow label + large tabular input with an adornment  */
/* prefix ($ | × | %). Fields read as inset controls: a light tonal    */
/* fill on the white card, blue focus ring. `flash` triggers the 600ms */
/* OCR "accepted" highlight (green-tinted).                            */
/* ------------------------------------------------------------------ */
export function PriceField({
  id,
  label,
  value,
  onChange,
  adornment,
  hint,
  flash = false,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  adornment?: "$" | "×" | "%";
  hint?: ReactNode;
  flash?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  // Select-all-on-focus: focusing the field (click or Tab) selects the whole
  // value so typing replaces it. A second click into an already-focused field
  // keeps normal caret placement. The mouseup that completes the focus click
  // would collapse the selection, so it is suppressed exactly once per focus.
  const justFocused = useRef(false);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    justFocused.current = true;
    e.target.select();
  };
  const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    if (justFocused.current) {
      justFocused.current = false;
      e.preventDefault();
    }
  };
  const handleBlur = () => {
    justFocused.current = false;
  };

  return (
    <div>
      <label htmlFor={`field-${id}`} className="mb-2 block">
        <Eyebrow>{label}</Eyebrow>
      </label>
      <div className="relative">
        {adornment && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-num text-[15px] text-muted"
          >
            {adornment}
          </span>
        )}
        <input
          ref={inputRef}
          id={`field-${id}`}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onMouseUp={handleMouseUp}
          onBlur={handleBlur}
          className={`h-14 w-full rounded-xl border border-transparent bg-fill px-4 font-num text-[20px] font-medium text-ink text-right shadow-inset outline-none transition-all duration-150 placeholder:text-muted/50 hover:bg-ink/[0.04] focus:border-accent focus:bg-surface focus:shadow-none focus:ring-4 focus:ring-accent/20 ${adornment ? "pl-9" : ""} ${flash ? "flash" : ""}`}
        />
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section — a white elevated card grouping one eyebrow row and its    */
/* fields. Depth comes from the tonal page + soft shadow, not rules.   */
/* ------------------------------------------------------------------ */
export function Section({
  eyebrow,
  hint,
  children,
}: {
  eyebrow: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        {hint && (
          <span className="text-right text-[12px] text-muted">{hint}</span>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
