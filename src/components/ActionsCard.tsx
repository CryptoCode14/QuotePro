import { Calculator, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionsCardProps {
  solving: boolean;
  discount: boolean;
  dim: boolean;
  onSolve: () => void;
  onToggleDiscount: () => void;
  onReset: () => void;
  onCopyApi: () => void;
}

/** Actions card — SOLVE PRICING, 1% DISC toggle, RESET, COPY AS API CALL. */
export function ActionsCard({
  solving,
  discount,
  dim,
  onSolve,
  onToggleDiscount,
  onReset,
  onCopyApi,
}: ActionsCardProps) {
  return (
    <section className={cn("card", dim && "dim")} id="actionsCard" data-step="2" aria-label="Actions">
      <div className="microlabel">ACTIONS</div>
      <button
        className="btn primary abtn"
        onClick={onSolve}
        disabled={solving}
        aria-live="polite"
      >
        <Calculator size={16} strokeWidth={2} aria-hidden />
        {solving ? "SOLVING…" : "SOLVE PRICING"}
      </button>
      <div className="arow">
        <button
          className={cn("dtoggle", discount && "on")}
          onClick={onToggleDiscount}
          role="switch"
          aria-checked={discount}
          aria-label="1% discount"
        >
          <span>1% DISC</span>
          <span className="pill" />
        </button>
        <button className="linkbtn" onClick={onReset}>
          RESET
        </button>
      </div>
      <div className="arow">
        <button className="btn ghost abtn" onClick={onCopyApi}>
          <Copy size={15} strokeWidth={1.75} aria-hidden /> COPY AS API CALL
        </button>
      </div>
    </section>
  );
}
