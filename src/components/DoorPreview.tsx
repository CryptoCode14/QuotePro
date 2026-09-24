import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const CAPS = ["SECTIONS", "FRAME + TRACKS", "GLASS + HARDWARE", "QUOTE READY"];

/** Door preview — ported from the v5 inline SVG. Stages fade in staggered
 *  (doorIntro: 350ms + 420ms steps); doorPulse flashes all parts after a fill. */
export function DoorPreview({
  stage,
  pulseKey,
}: {
  stage: number;
  pulseKey: number;
}) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (pulseKey === 0) return;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), 120);
    return () => window.clearTimeout(t);
  }, [pulseKey]);

  const secY = [261, 186, 111, 36];
  const panelX = [92, 169, 247, 324];

  return (
    <section className="card" id="doorCard" aria-label="Door preview">
      <div className="microlabel">DOOR PREVIEW</div>
      <svg
        id="doorSvg"
        viewBox="52 28 376 356"
        role="img"
        aria-label="Garage door preview"
      >
        <defs>
          <linearGradient id="secGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#ECEBE7" />
          </linearGradient>
          <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FDFCFA" />
            <stop offset="1" stopColor="#EAE8E3" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#93A3BB" />
            <stop offset="1" stopColor="#4E617F" />
          </linearGradient>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#D8D6D1" />
            <stop offset="1" stopColor="#B9B7B1" />
          </linearGradient>
          <linearGradient id="jambGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(27,26,21,.14)" />
            <stop offset=".18" stopColor="rgba(27,26,21,0)" />
            <stop offset=".82" stopColor="rgba(27,26,21,0)" />
            <stop offset="1" stopColor="rgba(27,26,21,.14)" />
          </linearGradient>
          <radialGradient id="shadowGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(27,26,21,.15)" />
            <stop offset="1" stopColor="rgba(27,26,21,0)" />
          </radialGradient>
        </defs>

        <g
          id="part-frame"
          className={cn("dpart", stage >= 1 && "on")}
          style={pulsing ? { opacity: 0.25, transition: "none" } : undefined}
        >
          <ellipse cx="240" cy="360" rx="165" ry="17" fill="url(#shadowGrad)" />
          <rect x="60" y="36" width="15" height="306" rx="3" fill="url(#trackGrad)" />
          <rect x="405" y="36" width="15" height="306" rx="3" fill="url(#trackGrad)" />
          <rect x="78" y="336" width="324" height="9" rx="2" fill="#3B3B39" />
        </g>

        <g
          id="part-sections"
          style={pulsing ? { opacity: 0.25, transition: "none" } : undefined}
        >
          {secY.map((y, si) => (
            <g
              key={y}
              className={cn("dpart sec", stage >= 0 && "on")}
              style={{ ["--i" as string]: 3 - si } as CSSProperties}
            >
              <rect x="78" y={y} width="324" height="75" fill="url(#secGrad)" />
              <g id={y === 36 ? "secTopPanels" : undefined} opacity={y === 36 && stage >= 2 ? 0 : 1} style={y === 36 ? { transition: "opacity .45s ease" } : undefined}>
                {panelX.map((x) => (
                  <g key={x}>
                    <rect x={x} y={y + 12} width="64" height="51" rx="3" fill="#DFDDD8" />
                    <rect
                      x={x + 7}
                      y={y + 19}
                      width="50"
                      height="37"
                      rx="2"
                      fill="url(#panelGrad)"
                      stroke="#CFCDC7"
                      strokeWidth="1.2"
                    />
                  </g>
                ))}
              </g>
              <rect x="78" y={y + 72} width="324" height="3" fill="#D2D0CA" />
              <rect x="78" y={y + 75} width="324" height="1" fill="#FFFFFF" opacity=".7" />
            </g>
          ))}
        </g>

        <g
          id="part-glass"
          className={cn("dpart", stage >= 2 && "on")}
          style={pulsing ? { opacity: 0.25, transition: "none" } : undefined}
        >
          {panelX.map((x) => (
            <g key={x}>
              <rect x={x} y="48" width="64" height="51" rx="3" fill="#33332F" />
              <rect x={x + 5} y="53" width="54" height="41" rx="2" fill="url(#glassGrad)" />
              <polygon
                points={`${x + 12},94 ${x + 36},53 ${x + 49},53 ${x + 25},94`}
                fill="#FFFFFF"
                opacity=".22"
              />
            </g>
          ))}
        </g>

        <g
          id="part-hardware"
          className={cn("dpart", stage >= 2 && "on")}
          style={pulsing ? { opacity: 0.25, transition: "none" } : undefined}
        >
          <rect x="226" y="297" width="28" height="9" rx="4.5" fill="#45453F" />
          <circle cx="231" cy="301.5" r="2" fill="#2A2A28" />
          <circle cx="249" cy="301.5" r="2" fill="#2A2A28" />
        </g>

        <rect
          x="78"
          y="36"
          width="324"
          height="300"
          fill="url(#jambGrad)"
          pointerEvents="none"
        />
      </svg>
      <div id="doorCaption">
        <span id="doorCapTxt">{stage >= 0 ? CAPS[Math.min(stage, 3)] : CAPS[0]}</span>
        <span id="doorCapState">
          {stage >= 3 && (
            <span className="ready">
              <span className="cdot" style={{ marginRight: 0 }} />
            </span>
          )}
        </span>
      </div>
    </section>
  );
}
