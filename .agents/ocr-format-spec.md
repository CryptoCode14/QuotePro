# OCR Input Format Spec — My Clopay iStore "Pricing Details" modal
Derived 2026-09-24 from ~32 real screenshots supplied by Weston. This is the
contract the new OCR intake parser must handle.

## Layout (very consistent across all examples)
- Title: "Pricing Details"
- Product spec line: `Product: 9' 0" X 8' 0" | 9208 | COMPLETE DOOR | INTELLICORE | LUSTRA BLACK | ...`
  (pipe-delimited; 2nd token is the door model code; may mention WINDOW / FULL VISION / SOLID (NO WINDOWS))
- One white card per priced item. Card anatomy:
  - Header left: EITHER a bare model code (`9208`, `3200`, `904U`, `524S`, `T50S`, `GD2LP`, `VSAXU`…)
    OR `PRICE FOR <LABEL>` (e.g. `PRICE FOR FRAMING`, `PRICE FOR COLOR`,
    `PRICE FOR EXTRA STRUT`, `PRICE FOR INSULATED`, `PRICE FOR TRACK MOUNT`,
    `PRICE FOR TRACK LIFT`, `PRICE FOR INSULATED TEMPERED FULL VISION`,
    `PRICE FOR FV200U`, `PRICE FOR INSULATION`, `PRICE FOR TOP SEAL - FACTORY INSTALLED`)
  - Header right: `Multiplier: 1.268` (varies PER CARD; e.g. COLOR cards use 1.227)
  - Body: `List Price: 949.00` … `Net Price: 1191.30` + `1% iStore Discount Applied`
- Net prices already include the multiplier AND the 1% iStore discount.
  → QuotePro behavior (unchanged): read NET prices, snap multiplier field to 1.00.

## Classification rules (decided with Weston 2026-09-24)
- **door** = the card whose header is a bare model code (no "PRICE FOR" prefix).
  It is usually the first card and usually the largest price — but DO NOT rely on
  either; card ORDER VARIES (e.g. EXTRA STRUT card appears above the door card
  in several screenshots) and the door is not always the max net price.
- **windows** = card label contains any of: WINDOW, GLASS, GLAZING, LITE, INSERT,
  FULL VISION, FULL-VIEW, VISION, FV + digits (e.g. FV200U).
  (Old parser only had WINDOW|GLASS|GLAZING|LITE|INSERT and missed the real-world
  labels "PRICE FOR INSULATED TEMPERED FULL VISION" and "PRICE FOR FV200U" —
  that is the windows bug.)
- **etc** = everything else (FRAMING, COLOR, EXTRA STRUT, INSULATED, TRACK MOUNT,
  TRACK LIFT, INSULATION, TOP SEAL, …). Note: "PRICE FOR FRAMING" on window
  packages stays in etc per Weston's rule (only window/glass/lite/insert-class
  labels go to windows).

## Expected outputs (net prices)
1. 9208 9'x8' Lustra Black, slim windows → door 1191.30, windows 0.00,
   etc 903.83 + 145.77 + 52.19 = 1101.79
2. 3200 16'2"x10' full vision → door 2461.59,
   windows 1338.61 + 196.12 (FV200U = Full Vision glass, per Weston 2026-09-24) = 1534.73,
   etc 41.19
3. 3150 10'x10' solid (strut card FIRST) → door 1244.32, windows 0.00,
   etc 94.30 + 78.96 = 173.26
4. T50S 9'x7' solid → door 475.50, windows 0.00, etc 24.34
5. 904U 12'2"x8' full vision → door 3247.91, windows 2021.83, etc 250.66

## Edge cases
- Screenshots may be cropped (cards cut off top/bottom) — parse whatever cards
  are fully/partially visible; never invent missing cards.
- Some screenshots are near-duplicates (user re-shot the same door) — no dedup
  needed; each paste is one intake.
- Multipliers like `1.268` (3 decimals) and `1% iStore Discount Applied` must not
  be misread as prices (prices always have exactly 2 decimals).
- Product line may wrap across 2 lines; model code is the 2nd pipe-delimited token.

## 2026-09-24 door-miss hardening
Real-screenshot sweep (35 tesseract OCR outputs) found the door card being
silently dropped when the model code had OCR-mangled digits (`BD1NU`→`BDINU`,
`GD1LU`→`GDILU`) or no digits at all (`VSAXU`) — the old has-digit rule
rejected the header, and the largest-price fallback then promoted a WRONG card
(FRAMING, once even a WINDOWS card) to door. Fixed: door header is recognized
by the `Multiplier` tail (no digit requirement; internal spaces tolerated),
net amounts may wrap to the next line, and the largest-price fallback is
removed — a missing door stays missing and the UI warns "DOOR NOT FOUND".
Regression suite: `npm run test:ocr` (35 real fixtures + 12 edge cases).
