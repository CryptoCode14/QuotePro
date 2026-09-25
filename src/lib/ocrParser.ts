/**
 * ocrParser.ts — structure-aware parser for My Clopay iStore "Pricing Details" OCR text.
 *
 * Card anatomy (one white card per priced item in the iStore modal):
 *   - Header line: EITHER a bare door model code ("9208", "3200", "904U", "524S",
 *     "T50S", "GD2LP", "VSAXU", ...) OR "PRICE FOR <LABEL>" (e.g. "PRICE FOR
 *     FRAMING", "PRICE FOR EXTRA STRUT", "PRICE FOR INSULATED TEMPERED FULL VISION").
 *     The header line usually carries a trailing "Multiplier: 1.268".
 *   - Body lines: "List Price: 949.00", "Net Price: 1191.30", "1% iStore Discount
 *     Applied". Net prices already include the multiplier AND the 1% discount.
 *
 * Contract:
 *   - Cards are detected by header lines; each card's NET price is read by anchoring
 *     STRICTLY on the "Net Price" label (case-insensitive; tolerates "NetPrice:",
 *     missing colon, extra spaces). Numbers on other lines — "Multiplier: 1.268"
 *     (3 decimals), "List Price: ...", "1% iStore Discount Applied" — are NEVER
 *     read as prices.
 *   - Decimal tolerance, applied ONLY to text anchored to the Net Price label:
 *       "1191.30"  -> 1191.30
 *       "1,191.30" -> 1191.30
 *       "1191 30"  -> 1191.30  (OCR dropped the decimal point)
 *       "119130"   -> 1191.30  (trailing two digits are cents)
 *   - Classification:
 *       door    = card whose header is a bare model code (no "PRICE FOR" prefix).
 *       windows = label contains WINDOW, GLASS, GLAZING, LITE, INSERT,
 *                 FULL VISION, FULL-VIEW, VISION, or FV+digits (e.g. FV200U —
 *                 Weston confirmed 2026-09-24: Full Vision 200U is glass).
 *       etc     = everything else (FRAMING, COLOR, EXTRA STRUT, INSULATED,
 *                 TRACK MOUNT/LIFT, INSULATION, TOP SEAL, ...).
 *   - Missing door: if no door card is detected, the door is reported as missing
 *     (0) — the parser NEVER promotes another card to door. Guessing the door
 *     from the largest price silently hid real door prices (2026-09-24).
 *   - Cropped screenshots: parse whatever cards are present; never invent cards.
 *     A header with no parseable net price is skipped, not zero-filled.
 *   - Card order is irrelevant: an EXTRA STRUT card above the door card parses
 *     the same as one below it.
 *
 * No dependencies. Pure function — safe to run anywhere (browser or node).
 */

export type CardKind = "door" | "windows" | "etc";

export interface ParsedCard {
  /** Header label: the model code for door cards, the text after "PRICE FOR" otherwise. */
  label: string;
  kind: CardKind;
  netPrice: number;
}

export interface PricingParseResult {
  door: number;
  windows: number;
  etc: number;
  cards: ParsedCard[];
}

/** "PRICE FOR ..." header. Tolerates OCR confusions of the letter I (1, L). */
const PRICE_FOR_RE = /^\s*PR[I1L]CE\s+FOR\s+(.+)$/i;
/**
 * Door header with Multiplier tail: "9208 Multiplier: 1.268".
 * The tail is the signal — the code itself may be digitless by design (VSAXU)
 * or have OCR-mangled digits (BD1NU -> "BDINU", GD1LU -> "GDILU"), so NO
 * digit requirement. (2026-09-24: the old has-digit rule silently dropped
 * these door cards, and the largest-price fallback then promoted a wrong
 * card to door.)
 */
const DOOR_MULT_TAIL_RE = /^\s*([A-Z0-9][A-Z0-9 ]{1,6}):?\s*Multiplier\s*:?\s*[0-9.,]+\s*$/i;
/** Bare door model code: 3-6 alphanumerics (tesseract split the Multiplier tail off). */
const BARE_CODE_RE = /^[A-Z0-9]{3,6}$/i;
/** Net-price label anchor. Tolerates "NetPrice:", missing colon, I/1/l confusion. */
const NET_PRICE_LABEL_RE = /Net\s*Pr[i1l]ce/i;
/** A normal dotted price token: "1,191.30". */
const DOTTED_PRICE_RE = /[0-9][0-9,]*\.[0-9]+/;
/** Decimal-dropped OCR form: "1191 30" (dollars, whitespace, exactly 2 cent digits). */
const DROPPED_DECIMAL_RE = /([0-9][0-9,]*)\s+([0-9]{2})(?![0-9])/;
/** A line that is essentially just a price: "$1,191.30", "1191.30", "1191 30". */
const PURE_PRICE_LINE_RE = /^\s*\$?\s*[0-9][0-9,]*(\.[0-9]{1,2})?\s*$/;
/** Fallback numeric run for the trailing-two-digits-as-cents rule. */
const DIGIT_RUN_RE = /[0-9][0-9,]*/;

/** Window/glass classification keywords, matched against the spaceless uppercase label. */
const WINDOW_KEYWORDS = [
  "WINDOW",
  "GLASS",
  "GLAZING",
  "LITE",
  "INSERT",
  "FULLVISION",
  "FULLVIEW",
  "VISION",
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Detect a card header line. Returns the label and whether it is a door (bare model code). */
function detectHeader(line: string): { label: string; isDoor: boolean } | null {
  const priceFor = line.match(PRICE_FOR_RE);
  if (priceFor) {
    // Label runs until the "Multiplier" tail or end of line.
    const label = priceFor[1]
      .split(/Multiplier/i)[0]
      .replace(/\s+/g, " ")
      .replace(/:+\s*$/, "")
      .trim();
    return label ? { label, isDoor: false } : null;
  }
  // Door via Multiplier tail — no digit requirement (VSAXU; BD1NU->"BDINU").
  // Internal spaces tolerated ("9 208" -> "9208").
  const doorTail = line.match(DOOR_MULT_TAIL_RE);
  if (doorTail)
    return { label: doorTail[1].replace(/ /g, "").toUpperCase(), isDoor: true };
  // Door via bare code alone on the line (tail split onto another line by OCR).
  // Trailing punctuation stripped ("9208." -> "9208").
  const stripped = line.replace(/[^A-Z0-9]+$/i, "").trim();
  if (BARE_CODE_RE.test(stripped)) {
    return { label: stripped.toUpperCase(), isDoor: true };
  }
  return null;
}

/**
 * Parse a net amount from the text that follows the "Net Price" label.
 * Returns null when no usable number is present.
 */
function parseNetAmount(afterLabel: string): number | null {
  // 1. Normal dotted form: "1191.30", "1,191.30".
  const dotted = afterLabel.match(DOTTED_PRICE_RE);
  if (dotted) {
    const [intPart, decPart = ""] = dotted[0].replace(/,/g, "").split(".");
    if (!intPart) return null;
    if (decPart.length === 2) return parseFloat(`${intPart}.${decPart}`);
    if (decPart.length === 1) return parseFloat(`${intPart}.${decPart}0`);
    if (decPart.length === 0) return centsFromDigits(intPart);
    // 3+ decimals: OCR noise — keep the first two (prices always have 2 decimals).
    return parseFloat(`${intPart}.${decPart.slice(0, 2)}`);
  }
  // 2. Decimal dropped by OCR: "1191 30".
  const dropped = afterLabel.match(DROPPED_DECIMAL_RE);
  if (dropped) {
    return parseFloat(`${dropped[1].replace(/,/g, "")}.${dropped[2]}`);
  }
  // 3. No decimal point at all: trailing two digits are cents ("119130" -> 1191.30).
  const run = afterLabel.match(DIGIT_RUN_RE);
  if (run) return centsFromDigits(run[0].replace(/,/g, ""));
  return null;
}

/** "119130" -> 1191.30 ; "52" -> 0.52. Only ever called on Net-Price-anchored text. */
function centsFromDigits(digits: string): number | null {
  if (!digits) return null;
  if (digits.length <= 2) return parseInt(digits, 10) / 100;
  return parseInt(digits.slice(0, -2), 10) + parseInt(digits.slice(-2), 10) / 100;
}

function classifyLabel(label: string): CardKind {
  const compact = label.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // FV + digits (e.g. FV200U) = Full Vision glass — always windows.
  if (/FV\d/.test(compact)) return "windows";
  return WINDOW_KEYWORDS.some((k) => compact.includes(k)) ? "windows" : "etc";
}

export function parsePricingText(text: string): PricingParseResult {
  const lines = text.split(/\r?\n/);

  // Pass 1: find card header lines.
  const headerAt: Array<{ label: string; isDoor: boolean } | null> = lines.map(detectHeader);

  // Pass 2: for each header, scan its card (up to the next header) for the Net Price line.
  const cards: ParsedCard[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = headerAt[i];
    if (!header) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (headerAt[j]) {
        end = j;
        break;
      }
    }
    let netPrice: number | null = null;
    for (let j = i; j < end; j++) {
      const labelMatch = lines[j].match(NET_PRICE_LABEL_RE);
      if (labelMatch?.index !== undefined) {
        const amount = parseNetAmount(lines[j].slice(labelMatch.index + labelMatch[0].length));
        if (amount !== null) {
          netPrice = round2(amount);
          break;
        }
        // "Net Price" label present but the amount wrapped to the next line
        // (narrow crop / OCR line split). Accept it ONLY from a following line
        // that is essentially just a price — never from "1% iStore Discount
        // Applied" or any other labeled line. Stop at the next card header.
        for (let k = j + 1; k < Math.min(j + 3, end); k++) {
          if (headerAt[k]) break;
          if (NET_PRICE_LABEL_RE.test(lines[k])) break;
          if (PURE_PRICE_LINE_RE.test(lines[k])) {
            const wrapped = parseNetAmount(lines[k]);
            if (wrapped !== null) {
              netPrice = round2(wrapped);
              break;
            }
          }
        }
        if (netPrice !== null) break;
        // Label with no usable amount anywhere nearby: keep scanning later
        // lines for another Net Price label, but never invent a number.
      }
    }
    // Cropped card with no visible net price: skip it — never invent a card.
    if (netPrice === null) continue;
    cards.push({
      label: header.label,
      kind: header.isDoor ? "door" : classifyLabel(header.label),
      netPrice,
    });
  }

  // No largest-price fallback: if the door card wasn't detected, promoting the
  // biggest misc/windows card to "door" silently invents a wrong door price
  // (2026-09-24: this exact failure hid real door prices). A missing door
  // stays missing — the UI flags "door not found" instead of guessing.

  const sumKind = (kind: CardKind): number =>
    round2(cards.filter((c) => c.kind === kind).reduce((acc, c) => acc + c.netPrice, 0));

  return {
    door: sumKind("door"),
    windows: sumKind("windows"),
    etc: sumKind("etc"),
    cards,
  };
}
