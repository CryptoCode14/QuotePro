import { Loader2 } from "lucide-react";

interface OcrOverlayProps {
  active: boolean;
  progress: number | null;
}

/**
 * OCR overlay — fullscreen blur, spinner, "Scanning screenshot…",
 * substatus "ANALYZING TEXT & PRICES" → "READING — NN%".
 * Always dismissed on success AND failure (no stuck spinner, ever).
 */
export function OcrOverlay({ active, progress }: OcrOverlayProps) {
  if (!active) return null;
  return (
    <div id="ocr-overlay" className="active" role="status" aria-live="polite">
      <div className="ocr-card">
        <Loader2 className="ocr-spin" size={34} strokeWidth={2.5} aria-hidden />
        <div className="ocr-status">Scanning screenshot…</div>
        <div className="ocr-substatus">
          {progress == null ? "ANALYZING TEXT & PRICES" : `READING — ${progress}%`}
        </div>
      </div>
    </div>
  );
}
