/**
 * Keyword-mapped price parser for the TEXT-paste path — ported verbatim from
 * v5's `parsePrices()` (safety-first: never guesses, flags medium confidence).
 * The OCR-image path uses `src/lib/ocrParser.ts` instead.
 */

export type Confidence = "high" | "med";

export interface FillJob {
  key: "door" | "windows" | "etc";
  value: number;
  conf: Confidence;
}

export function parsePrices(text: string): FillJob[] {
  const lines = text.split(/\r?\n/);
  const found: { door: number | null; windows: number | null; etc: number[] } = {
    door: null,
    windows: null,
    etc: [],
  };
  const conf: Partial<Record<"door" | "windows" | "etc", Confidence>> = {};
  const unmatched: number[] = [];
  const priceRe = /\$?\s*([\d,]+\.\d{2})/;
  lines.forEach((ln) => {
    const m = ln.match(priceRe);
    if (!m) return;
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(val)) return;
    const hasDollar = /\$/.test(ln);
    if (!hasDollar && val < 10) return; /* skip multipliers / quantities */
    const l = ln.toLowerCase();
    if (/window|glass/.test(l)) {
      found.windows = val;
      conf.windows = "high";
    } else if (/(^|[^a-z])door([^a-z]|$)/.test(l)) {
      found.door = val;
      conf.door = "high";
    } else if (/etc|misc|additional|other|hardware|opener|strut|spring|seal/.test(l)) {
      found.etc.push(val);
      conf.etc = "high";
    } else if (/net|price|total|amount/.test(l)) {
      unmatched.push(val);
    }
  });
  /* fallback: the biggest unmatched NET PRICE line is usually the door itself —
     flagged medium confidence so the UI marks it CHECK ME instead of guessing silently */
  unmatched.sort((a, b) => b - a);
  if (found.door == null && unmatched.length) {
    found.door = unmatched.shift()!;
    conf.door = "med";
  }
  unmatched.forEach((v) => {
    found.etc.push(v);
  });
  if (found.etc.length && !conf.etc) conf.etc = "med";

  const jobs: FillJob[] = [];
  if (found.door != null)
    jobs.push({ key: "door", value: found.door, conf: conf.door ?? "med" });
  if (found.windows != null)
    jobs.push({ key: "windows", value: found.windows, conf: conf.windows ?? "med" });
  const etcTotal = found.etc.reduce((a, b) => a + b, 0);
  if (found.etc.length)
    jobs.push({ key: "etc", value: etcTotal, conf: conf.etc ?? "med" });
  return jobs;
}
