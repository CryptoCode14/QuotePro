import { useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useTween } from "@/hooks/useTween";
import {
  bandColor,
  fmt$,
  fmt0$,
  marginBand,
  marginChipLabel,
  type CalcResult,
} from "@/lib/calc";
import { cn } from "@/lib/utils";

interface TotalCardProps {
  c: CalcResult;
  tweenDur: number;
  tweenSeq: number;
  dim: boolean;
}

const TWEEN_MS = 650;

/**
 * Total card — north-star grand total (canvas-measured shrink-to-fit),
 * margin meter, sweet-spot bar, price-breakdown ledger.
 */
export function TotalCard({ c, tweenDur, tweenSeq, dim }: TotalCardProps) {
  const shownTotal = useTween(c.grandTotal, tweenDur, tweenSeq);
  const shownMargin = useTween(c.margin, tweenDur, tweenSeq);
  const shownGap = useTween(c.gap, tweenDur, tweenSeq);
  const shownProfit = useTween(c.net, tweenDur, tweenSeq);

  const totalRef = useRef<HTMLDivElement>(null);
  const totalNumRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* v5's fitTotalFor: guarantee long totals never clip (measured in the real font). */
  const fit = useCallback((str: string) => {
    const t = totalRef.current;
    if (!t) return;
    t.style.fontSize = "";
    const avail = t.clientWidth;
    if (!avail) return;
    try {
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const cs = getComputedStyle(t);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const need = ctx.measureText("$" + str).width;
      if (need > avail)
        t.style.fontSize = ((parseFloat(cs.fontSize) * avail) / need).toFixed(1) + "px";
    } catch {
      /* canvas unavailable — leave default size */
    }
  }, []);

  useEffect(() => {
    fit(fmt$(shownTotal));
  }, [shownTotal, fit]);

  useEffect(() => {
    const onResize = () => {
      if (totalNumRef.current) fit(totalNumRef.current.textContent ?? "");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);

  const band = marginBand(c.margin);
  const col = bandColor(c.margin);
  const gapPct = Math.max(4, Math.min(96, (c.gap / 800) * 100));
  const gapColor =
    c.gap >= 300 && c.gap <= 400 ? "#4E617F" : c.gap > 400 ? "#2F5D8A" : "#C05B4B";

  const rows: Array<[string, number]> = [
    ["Total Materials", c.totalMaterials],
    ["After Multiplier", c.afterMult],
    ["Overhead", c.overhead],
    ["40% Factor", c.f04],
    ["Subtotal", c.subBefore],
    ["Installation", c.inst],
    ["Fuel & Travel", c.fuel],
    ["10% Markup", c.subAfter * 0.1],
  ];

  return (
    <section
      className={cn("card", dim && "dim")}
      id="totalCard"
      data-step="2"
      data-label="STEP 3 · QUOTE"
      aria-label="Quote total"
    >
      <div className="microlabel">GRAND TOTAL · USD</div>
      <div id="totalScale">
        <div id="total" ref={totalRef}>
          <span className="cur">$</span>
          <span id="totalnum" ref={totalNumRef}>
            {fmt$(shownTotal)}
          </span>
        </div>
      </div>
      <div id="totalsub">QUOTE NO. 0001 · GRAND VALLEY GARAGE DOORS</div>

      <div id="stats">
        <div className="stat">
          <span className="k">MARGIN</span>
          <span className={cn("mchip", band)}>{marginChipLabel(c.margin)}</span>
          <span className="v" style={{ color: col }}>
            {shownMargin.toFixed(1)}%
          </span>
        </div>
        <div className="stat">
          <span className="k">SWEET SPOT</span>
          <span className="spotwrap">
            <span id="spotbar">
              <span id="spotband" />
              <span id="spotmark" style={{ left: `${gapPct}%` }} />
            </span>
            <span className="spotticks">
              <span>$300</span>
              <span>$400</span>
            </span>
          </span>
          <span className="v" style={{ color: gapColor }}>
            {(shownGap < 0 ? "-$" : "$") +
              Math.round(Math.abs(shownGap)).toLocaleString("en-US")}
          </span>
        </div>
        <div className="stat">
          <span className="k">NET PROFIT</span>
          <span className="v">{fmt0$(shownProfit)}</span>
        </div>
      </div>

      <details id="breakdown">
        <summary>
          PRICE BREAKDOWN{" "}
          <span className="arr">
            <ChevronDown size={13} strokeWidth={2} />
          </span>
        </summary>
        <div id="ledger">
          {rows.map(([k, v]) => (
            <div className="row" key={k}>
              <span className="k">{k}</span>
              <span className="dots" />
              <span className="v">${fmt$(v)}</span>
            </div>
          ))}
          <div className="row hl">
            <span className="k">Grand Total</span>
            <span className="dots" />
            <span className="v">${fmt$(c.grandTotal)}</span>
          </div>
          <div className="row">
            <span className="k">Expenses</span>
            <span className="dots" />
            <span className="v">${fmt$(c.expenses)}</span>
          </div>
          <div className="row profit">
            <span className="k">Net Profit · {c.margin.toFixed(1)}%</span>
            <span className="dots" />
            <span className="v">${fmt$(c.net)}</span>
          </div>
        </div>
      </details>
    </section>
  );
}

export { TWEEN_MS };
