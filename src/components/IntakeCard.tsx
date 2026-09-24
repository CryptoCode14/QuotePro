import { useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, FileText, ImagePlus } from "lucide-react";
import type { ParsedCard } from "@/lib/ocrParser";
import { cn } from "@/lib/utils";

export interface StatusState {
  msg: string;
  kind: "" | "ok" | "warn";
}

interface IntakeCardProps {
  imgPreview: string | null;
  status: StatusState;
  parsedCards: ParsedCard[];
  guided: boolean;
  dim: boolean;
  onDropFiles: (files: FileList) => void;
  onDropzoneClick: () => void;
  onSample: () => void;
  onContinue: () => void;
}

/**
 * Intake card — paste-anywhere dropzone (click + drag/drop of images and
 * .txt/.csv), pasted-image preview, parse status line, parsed card breakdown,
 * sample-text button, guided CONTINUE.
 */
export function IntakeCard({
  imgPreview,
  status,
  parsedCards,
  guided,
  dim,
  onDropFiles,
  onDropzoneClick,
  onSample,
  onContinue,
}: IntakeCardProps) {
  const [over, setOver] = useState(false);
  const dzRef = useRef<HTMLDivElement>(null);

  return (
    <section
      className={cn("card", dim && "dim")}
      id="pasteCard"
      data-step="0"
      data-label="STEP 1 · PASTE"
      aria-label="Price intake"
    >
      <div className="microlabel">
        EXPRESS INTAKE <span className="mlsub">— paste, done</span>
      </div>
      <div className="intake-grid">
        <div
          id="dropzone"
          ref={dzRef}
          tabIndex={0}
          role="button"
          aria-label="Paste screenshot or price text"
          className={cn(over && "over")}
          onClick={onDropzoneClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onDropzoneClick();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
          }}
        >
          <div className="dzicon">
            <ClipboardPaste size={15} strokeWidth={2} aria-hidden />
            <span>⌘V</span>
          </div>
          <div className="dzbig">Paste your iStore screenshot or price text</div>
          <div className="dzsub">
            CLICK HERE AND PRESS ⌘V / CTRL+V — OR DRAG A FILE IN
            <br />
            PASTE WORKS ANYWHERE ON THIS PAGE
          </div>
          {imgPreview && (
            <div id="imgprev">
              <img src={imgPreview} alt="Pasted screenshot preview" />
            </div>
          )}
        </div>
        <ol className="intake-steps">
          <li>
            <span className="n">1</span>
            <div>
              <b>Paste</b>
              <span className="d">
                Screenshot or price text — ⌘V works anywhere on this page
              </span>
            </div>
          </li>
          <li>
            <span className="n">2</span>
            <div>
              <b>Review</b>
              <span className="d">Prices auto-fill below · amber tags mean “check me”</span>
            </div>
          </li>
          <li>
            <span className="n">3</span>
            <div>
              <b>Solve</b>
              <span className="d">Hit SOLVE PRICING for the final quote</span>
            </div>
          </li>
        </ol>
      </div>

      {parsedCards.length > 0 && (
        <div className="parsed-cards" aria-label="Parsed prices">
          {parsedCards.map((c, i) => (
            <div className="parsed-card" key={`${c.label}-${i}`}>
              <span className="pc-label" title={c.label}>
                {c.label}
              </span>
              <span className={cn("pc-kind", `pc-${c.kind}`)}>{c.kind}</span>
              <span className="pc-price">
                ${c.netPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div id="pasteRow">
        <button className="btn ghost sbtn" onClick={onSample}>
          <FileText size={15} strokeWidth={1.75} /> USE SAMPLE ISTORE TEXT
        </button>
        <span id="parseStatus" className={cn("statusline", status.kind)}>
          {status.msg}
        </span>
      </div>
      {guided && (
        <button className="btn ghost gcont" onClick={onContinue}>
          CONTINUE <ArrowRight size={15} strokeWidth={2} />
        </button>
      )}
      <span className="dz-hint" aria-hidden>
        <ImagePlus size={12} strokeWidth={2} /> images &amp; .txt / .csv accepted
      </span>
    </section>
  );
}
