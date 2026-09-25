import { useEffect, useState } from "react";
import { ScanLine, TriangleAlert, X, RotateCcw } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import type { ParsedCard } from "@/lib/ocrParser";
import { fmt$ } from "@/lib/calc";
import { cn } from "@/lib/utils";

interface IntakePanelProps {
  statusMsg: string;
  statusKind: "" | "ok" | "warn";
  ocrActive: boolean;
  ocrProgress: number | null; // 0-100
  ocrError: string | null;
  onDismissError: () => void;
  imgPreview: string | null; // data URL thumbnail
  cards: ParsedCard[];
  scanSeq: number; // increments on every completed scan
  lastScanAt: string | null; // e.g. "14:02"
  onDropFiles: (files: FileList) => void;
  onDropzoneClick: () => void;
  onCardClick: (kind: "door" | "windows" | "etc") => void;
  onRescan: () => void;
}

const KIND_TAG: Record<ParsedCard["kind"], string> = {
  door: "DOOR MODEL",
  windows: "WINDOWS",
  etc: "MISC",
};

/**
 * IntakePanel — left-rail intake zone for the Command Deck redesign.
 *
 * Dropzone (paste/drop) → inline OCR progress (replaces the fullscreen
 * overlay) → PARSED CARDS verification list. Once a scan completes and the
 * fields are confirmed, the panel collapses to a slim "last scan" strip;
 * any new scan (scanSeq) auto-expands it again.
 *
 * No pricing math, no OCR engine here — the parent owns all of that.
 */
export function IntakePanel({
  statusMsg,
  statusKind,
  ocrActive,
  ocrProgress,
  ocrError,
  onDismissError,
  imgPreview,
  cards,
  scanSeq,
  lastScanAt,
  onDropFiles,
  onDropzoneClick,
  onCardClick,
  onRescan,
}: IntakePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const hasCards = cards.length > 0;

  // Auto-expand on every completed scan that produced cards.
  useEffect(() => {
    if (scanSeq > 0 && hasCards) setCollapsed(false);
  }, [scanSeq, hasCards]);

  const statusChip =
    statusKind === "ok"
      ? "bg-ok/15 text-ok"
      : statusKind === "warn"
        ? "bg-warn/15 text-warn"
        : "text-muted";

  const pct = ocrProgress == null ? null : Math.max(0, Math.min(100, Math.round(ocrProgress)));

  /* ---------------- collapsed strip ---------------- */
  if (collapsed && hasCards) {
    return (
      <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
        <Eyebrow>INTAKE</Eyebrow>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="truncate text-[13px] text-muted">
            Last scan · {cards.length} {cards.length === 1 ? "card" : "cards"}
            {lastScanAt ? ` · ${lastScanAt}` : ""}
          </p>
          <button
            type="button"
            onClick={onRescan}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-fill px-2.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:text-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Re-scan
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- expanded ---------------- */
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow>INTAKE</Eyebrow>
          <p
            className={cn(
              "mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg px-2 py-1 text-[13px] font-medium",
              statusChip,
            )}
          >
            {statusKind === "warn" && (
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{statusMsg}</span>
          </p>
        </div>
        {hasCards && !ocrActive && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="shrink-0 text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            Done
          </button>
        )}
      </div>

      {/* Dropzone — a white card with a dashed affordance edge */}
      <button
        type="button"
        onClick={onDropzoneClick}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) onDropFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-surface px-6 py-10 text-center shadow-card transition-all duration-150 active:scale-[0.995]",
          dragOver
            ? "border-accent bg-accent/[0.06]"
            : "border-ink/15 hover:border-accent hover:bg-accent/[0.03]",
        )}
      >
        <div className="relative mb-1">
          {/* Soft accent halo — the empty state's quiet invitation. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-4 rounded-full bg-accent/15 blur-2xl"
          />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/[0.08]">
            <ScanLine className="h-7 w-7 text-accent" aria-hidden />
          </div>
        </div>
        <span className="text-[15px] font-medium text-ink">Paste screenshot</span>
        <span className="text-[13px] text-muted">⌘V / Ctrl+V anywhere · or drag a file</span>
      </button>

      {/* Inline OCR progress (replaces the fullscreen overlay) */}
      {ocrActive && (
        <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
          <div className="h-1 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${pct ?? 100}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Reading…{pct != null ? ` ${pct}%` : ""}
          </p>
        </div>
      )}

      {/* Inline OCR error — amber warning tint */}
      {ocrError && !ocrActive && (
        <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] leading-snug text-warn">{ocrError}</p>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="shrink-0 rounded p-0.5 text-warn/70 transition-colors hover:text-warn"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Tip: copy the pricing table as text, then ⌘V/Ctrl+V.
          </p>
        </div>
      )}

      {/* Pasted-image preview */}
      {imgPreview && (
        <img
          src={imgPreview}
          alt="Pasted screenshot preview"
          className="w-28 rounded-lg object-cover shadow-card"
        />
      )}

      {/* Parsed cards verification list */}
      {hasCards && !ocrActive && (
        <div>
          <Eyebrow>
            PARSED CARDS <span className="text-muted/70">· {cards.length}</span>
          </Eyebrow>
          <ul className="mt-2 flex flex-col gap-1">
            {cards.map((card, i) => (
              <li key={`${card.kind}-${card.label}-${i}`}>
                <button
                  type="button"
                  title={card.label}
                  onClick={() => onCardClick(card.kind)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 hover:bg-fill active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">
                      {card.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-muted">
                      {KIND_TAG[card.kind]}
                    </span>
                  </span>
                  <span className="font-num shrink-0 text-[14px] font-medium text-ink">
                    ${fmt$(card.netPrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
