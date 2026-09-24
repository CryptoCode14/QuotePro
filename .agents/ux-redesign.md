# QuotePro UX Redesign Proposal — "Command Deck"

**Date:** 2026-09-24
**Status:** Proposal — not built. Awaiting Weston's sign-off on direction.
**Scope:** Full visual/layout rebuild of the v6 frontend ("bare bones" per Weston). Stack unchanged (Vite + React 19 + Tailwind v4 + shadcn/ui + motion + lucide). Pricing math (`calc()` / `solvePricing()`) untouched — this is presentation only.
**Non-negotiables carried in:** tabular numerals for every price; dark/light system-aware + toggle; desktop-first, mobile-safe; restrained motion; no gradients/glassmorphism; Lucide icons only.

---

## 0. Design thesis

QuotePro is not a dashboard and not a form. It is a **pricing instrument** — the love child of a Bloomberg panel and Things 3: dense where it must be, calm everywhere else, with one number that matters more than everything else combined. The current v6 fails because it presents eight equal-weight cards in a grid; every card shouts, so nothing does. The redesign gives the screen a single reading order that mirrors Weston's actual workflow, makes the grand total inescapable, promotes the 2× cost check to a first-class panel, and replaces the system-font stack with type that signals *precision instrument*.

---

## 1. Information hierarchy

Ranked by what Weston needs, in the order he needs it:

| Rank | Element | Role |
|------|---------|------|
| **1 — Hero** | **Grand total** (the customer price) | Always visible, largest type on screen, sticky on desktop (right rail) and mobile (top bar). Nothing competes with it. |
| **2 — Secondary** | **2× cost check**: per-component doubled costs, total 2×, gap | His margin sanity check. Dedicated panel, always visible — never collapsed, never a tab. |
| **3 — Tertiary** | The 8 pricing inputs | Tools that change the numbers. Big, fast to edit, grouped by meaning. |
| **4 — Quaternary** | Intake (paste/dropzone + parsed-card verification) | Critical but transient: once OCR fills the fields, it collapses to a compact "last scan" state. |
| **5 — Utility** | Actions: Solve (primary), Reset, Copy API call, Print, Estimates, auth | Solve is the only prominent one; the rest are quiet. |

**Reading order for the workflow** (paste → verify → adjust → check 2× → total):
left rail → center column → right rail, i.e. **Intake → Pricing → Quote**. The eye travels the workflow; the total never leaves the viewport while adjusting.

### What can die (summary — argued in §7)
Guided mode, door SVG preview, sweet-spot $800 bar, 1% DISC toggle, sample-text button, typewriter fill, margin-meter chip clutter, the "card grid" itself.

---

## 2. Layout

### Direction A — "Command deck" (winner)
Three persistent zones. Intake rail left, pricing workbench center, quote rail right (sticky). The total and the 2× check are *places*, not cards — they live at fixed addresses on screen.

### Direction B — "Document" (rejected)
Top-down estimate sheet reading like an invoice. Familiar, prints nicely — but it's a prettier version of the same form Weston rejected, and it buries the 2× check below the fold. Too close to "reskin."

### Direction C — "Split" (rejected)
Inputs left, sticky summary right, intake as a top strip. Simpler than A, but intake deserves a persistent home: Weston re-pastes mid-estimate when a screenshot was wrong, and the parsed-card verification list needs somewhere to live. Collapsing intake into a strip recreates the current problem.

### Winner build spec — Direction A

**Desktop ≥ 1280px** — `grid-template-columns: 320px minmax(0, 1fr) 380px`, gap 24px, max-width 1560px centered, 24px page padding.

- **Left rail — INTAKE** (`position: sticky; top: 24px; align-self: start`):
  1. Eyebrow: `INTAKE`
  2. Dropzone: large, dashed hairline border, centered Scan icon + `Paste screenshot` + `⌘V / Ctrl+V anywhere · or drag a file`. Clicking focuses paste (same as v6).
  3. OCR progress: **inline** here (thin progress bar + `Reading… 42%`), replacing the fullscreen overlay takeover. Failures show an inline error with a `Paste text instead` affordance.
  4. `PARSED CARDS` verification list (appears after a scan): one row per card — card label (`9208 · Door model`), mono value, confidence chip (`AUTO` green / `CHECK` amber). Clicking a row focuses the corresponding input. This replaces the tiny FROM PASTE/CHECK ME pills scattered on inputs.
  5. Collapsed state: after fields are confirmed, intake collapses to a slim `Last scan · 3 cards · 14:02` strip with a `Re-scan` button.
- **Center — PRICING**:
  1. Eyebrow: `PRICING`
  2. `COSTS` group: Garage door / Windows / Misc / Multiplier — large inputs (h-14, 20px mono, right-aligned, `$`/`×` adornment).
  3. `OVERHEAD` group: Base amount / Percent factor.
  4. `LABOR` group: Installation / Fuel & travel (+ quiet hint `leave at zero — Solve sets these`).
  5. **`2× COST CHECK` panel** (full center-column width, visually distinct surface — see §5).
- **Right rail — QUOTE** (`position: sticky; top: 24px`):
  1. Eyebrow: `QUOTE` + meta line (date · estimate name when loaded).
  2. **Grand total hero** — Geist Mono 500, `clamp(48px, 5vw, 72px)`, tight tracking. Tweens on change (keep `useTween`).
  3. Stat rows (mono, 13–14px): `MARGIN 40.0%` + status pill (`ON TARGET` / `ABOVE` / `BELOW`); `GAP ±$350` colored by band.
  4. Hairline divider.
  5. **Ledger** — compact mono rows, always visible (not collapsed): Total materials, After multiplier, Overhead, 40% factor, Subtotal, Installation, Fuel & travel, 10% markup → `Grand total` (emphasized) → Expenses → `Net profit · 40.0%`. Weston said "our calculation is somehow off" — the audit trail stays in view so every number is checkable.
  6. Hairline divider.
  7. Actions: `SOLVE PRICING` (primary, full width) → solved banner appears beneath (`Solved · 40.2% margin · gap $350`, auto-dismiss 4s, keep v6 behavior); quiet row: `Reset` · `Copy API call` · `Print` (ghost buttons w/ Lucide icons).

**1024–1280px** — two columns: left = intake + pricing stacked, right = quote rail sticky (340px).

**< 1024px (mobile)** — single column; **sticky top bar** with compact total (`GRAND TOTAL` + mono number, keeps v5's `#mtotal` pattern). Content order: intake → pricing → 2× check → quote ledger → actions. The sticky bar guarantees the hero number survives the stack.

**Header** (slim, 56px, sticky, hairline bottom border): wordmark `QuotePro` (Geist 600) + `Grand Valley Garage Doors` muted suffix · right side: theme toggle (Sun/Moon, keep), Estimates (List icon), Print, API copy (icon buttons), profile avatar. No giant hero header — chrome stays out of the way.

---

## 3. Typography

### The pairing: Geist + Geist Mono (both Google Fonts, SIL OFL)

| Role | Font | Usage |
|------|------|-------|
| UI / labels / headings / buttons | **Geist** 400/500/600/700 | Everything that is words. Eyebrow labels: 600, 11px, uppercase, +0.08em tracking, muted. |
| **All numerals, everywhere** | **Geist Mono** 400/500/600 | Prices, inputs, hero total, ledger, stats, gap, estimate table figures. Mono = tabular by construction — no `tnum` feature-flag roulette. |

**Scale:**
- Hero total: Geist Mono 500, `clamp(48px, 5vw, 72px)`, letter-spacing −0.02em, line-height 1.
- Section eyebrows: Geist 600, 11px, uppercase, +0.08em, muted.
- Input text: Geist Mono 500, 20px, right-aligned.
- Body/UI: Geist 400/500, 14px. Small meta: 12–13px muted.
- Root: `-webkit-font-smoothing: antialiased` (macOS renders heavy otherwise).

**Why this pairing — the actual argument:**
1. **It is designed for exactly this object.** Geist is Vercel's typeface, drawn for a dense, dark-mode, data-heavy dashboard. QuotePro is a dense, dark-mode-capable, data-heavy instrument. The fit is literal, not aspirational.
2. **Mono numerals are the fintech-instrument pattern.** Vercel dashboard, Linear-adjacent tools, Bloomberg: currency figures in monospace, words in grotesque. "Never render a currency figure in a proportional font" is the standing rule in every serious dashboard design doc for a reason — digits stop jittering, columns align, the tool reads as *calibrated*.
3. **It answers "the fonts are terrible" without being quirky.** The current stack reads cheap because it's the default — it signals "no designer touched this." Geist/Geist Mono is visibly *chosen*: the mono numerals alone change the entire character of the screen. Distinctive, but zero novelty risk — it won't look dated in 18 months.
4. **The contrast that makes it feel designed is free:** tiny tracked-out uppercase Geist labels sitting over large tight-tracked Geist Mono numbers. That single contrast, repeated consistently, is most of the "premium" feeling. No decoration required.

**Rejected alternatives:**
- *Inter / Inter Tight* — too close to the system stack; would not satisfy "brand new fonts." Reads as the absence of a decision.
- *Space Grotesk / Sora* — carry web3/startup-landing connotations; tabular-figure support uncertain. Wrong signal for a pricing instrument.
- *IBM Plex Sans + Plex Mono* — strong runner-up on the "precision" axis, but reads enterprise-IBM; Geist is the more premium, more current choice.
- *Serif display (Fraunces / Instrument Serif)* — wrong signal. Serif says editorial/luxury-brand; this tool says calibrated instrument. Keep the wordmark in Geist 600 and spend the distinctiveness budget on the numerals.

**Loading:** Google Fonts CDN link, `display=swap`, `preconnect`. Weights: Geist 400;500;600;700, Geist Mono 400;500;600 (verify availability at build; fall back to 400;500 if a weight is missing).

---

## 4. Color (OKLCH token system, kept)

One accent, semantic colors with jobs, neutral everything else.

| Token | Light | Dark | Job |
|-------|-------|------|-----|
| `--bg` | `oklch(0.985 0 0)` | `oklch(0.16 0 0)` | Page |
| `--surface` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Panels / rails |
| `--ink` | `oklch(0.22 0 0)` | `oklch(0.93 0 0)` | Primary text |
| `--muted` | `oklch(0.55 0 0)` | `oklch(0.65 0 0)` | Labels, meta |
| `--hairline` | `oklch(0.90 0 0)` | `oklch(1 0 0 / 0.08)` | Borders, dividers |
| `--accent` | `oklch(0.60 0.15 250)` | `oklch(0.70 0.14 250)` | **The one accent** — Apple blue family. Primary button, focus rings, active nav, `AUTO` chip text? (no — chips are semantic) |
| `--ok` | `oklch(0.65 0.15 150)` | `oklch(0.72 0.14 150)` | On-target margin, AUTO chips, positive states |
| `--warn` | `oklch(0.70 0.14 80)` | `oklch(0.75 0.13 80)` | CHECK chips, below/above-target nudges |
| `--bad` | `oklch(0.60 0.16 25)` | `oklch(0.68 0.15 25)` | Negative gap, below-target margin |

**Rules:**
- Accent appears on: Solve button, focus-visible rings, active header icon, intake dropzone hover border. Nowhere else. It must stay rare to stay premium.
- Margin/gap bands keep Weston's 39.5–41.5 sweet-spot logic: pill + colored number, **not** the $800 bar (killed in §7).
- Surfaces: flat elevation model — separation by hairline borders, not shadows, in dark mode; light mode gets one soft layered shadow on the quote rail only (it's the hero surface). No shadow sprawl.
- Pure black backgrounds avoided in dark mode (`0.16`, not `0`) — crushes the mono numerals' legibility.

---

## 5. The 2× Cost Check (first-class panel)

Placement: full width of the center column, directly under LABOR. Distinct surface (tinted `--surface`, hairline border, 16px radius). Header: eyebrow `2× COST CHECK` + right-aligned quiet hint `each cost × multiplier × 2`.

**Exact rows** (labels left in Geist 500 14px, values right in Geist Mono 500 16px, tabular):

| Row | Formula | Example (door 1191.30, mult 1.00) |
|-----|---------|-------------------------------------|
| Door ×2 | `door × mult × 2` | `$2,382.60` |
| Windows ×2 | `windows × mult × 2` | `$0.00` |
| Misc ×2 | `etc × mult × 2` | `$2,203.58` |

Divider, then the verdict block:

| Row | Formula |
|-----|---------|
| **Total 2× cost** | `= 2 × afterMult` (= `doubleCost` from `calc()`) — Geist Mono 600, 20px |
| Grand total | reference, muted |
| **Gap** | `grandTotal − doubleCost`, prefixed `±`, Geist Mono 600 20px, colored: in-band (300–400) → `--ink` w/ `ON TARGET` pill; >400 → `--accent`-blue w/ `ABOVE` pill; <300 → `--bad` w/ `BELOW` pill |

Each component row carries a quiet sub-label showing its inputs (`$1,191.30 × 1.00 × 2`) — this is the auditability Weston asked for ("I need to see double that number somewhere" + "our calculation is somehow off"). No proportional mini-bars: restrained, rows + verdict is enough. The numbers *are* the visualization.

**Math note (do not change):** `doubleCost = 2 × afterMult` exactly; the legacy 0.99 factor is dead per Weston's 2026-09-24 decision. The 1% DISC toggle dies with it (§7).

---

## 6. Component inventory (minimal set)

Build only these. No shadcn-catalog bloat — most are hand-rolled on Tailwind tokens; shadcn/Base UI only where a11y is non-trivial (dialog, toast).

1. `AppShell` — header (wordmark, theme toggle, estimates/print/API icon buttons, profile) + responsive grid + mobile sticky total bar.
2. `IntakePanel` — dropzone, inline OCR progress, parsed-cards verification list, collapsed "last scan" state.
3. `PriceField` — eyebrow label + large mono input + `$`/`×`/`%` adornment + focus ring. (Bigger than v6: h-14, 20px.)
4. `Section` — eyebrow + ruled group container for COSTS / OVERHEAD / LABOR. (Replaces "cards in a grid.")
5. `CostCheckPanel` — §5 exactly.
6. `QuoteRail` — hero total, margin/gap stats, ledger, actions. Sticky.
7. `SolveButton` + solved banner (keep v6 timing/behavior, new skin).
8. `EstimatesView` — restyled table (keep Google Apps Script backend as-is).
9. `AuthGate` — restyled (keep Supabase flows as-is).
10. Toasts via Sonner (keep).

---

## 7. What dies — and why

| Killed | Reason |
|--------|--------|
| **Guided mode** (step dimming, CONTINUE buttons) | Onboarding cruft. Weston is a daily power user; the workflow is already linear by layout. The mode toggle, `data-step` machinery, and dim states all go. |
| **Door SVG preview** | Decorative. It never informed a pricing decision; the screen space buys the 2× panel instead. |
| **Sweet-spot $800 bar** (spotmark/ticks) | Superseded by the 2× panel's gap verdict. The *signal* (on/above/below target) survives as pill + colored number; the bar was decoration. |
| **1% DISC toggle** | Dead math — the 0.99 factor was removed per Weston's decision. A toggle that does nothing is worse than no toggle. |
| **USE SAMPLE ISTORE TEXT** | Dev affordance. It ships debug UI to production. |
| **Typewriter fill** (26ms/char) | Theater that slows his workflow. Replace with instant fill + 600ms highlight flash on filled fields (feedback without waiting). Keep the FROM PASTE/CHECK ME semantics — they move to the parsed-cards list. |
| **Fullscreen OCR overlay** | Jarring takeover for a 2–5s task. Inline progress in the intake rail; failures inline with a text-paste fallback. |
| **Margin-meter chip cluster** | Folded into the quote rail's two stat rows (margin + gap). One pill each, no meter. |
| **The card grid itself** | The thing he rejected. Zones and ruled sections replace equal-weight cards. |

**Kept but moved:** price-breakdown ledger (into quote rail, always visible — auditability), COPY AS API CALL (header icon + quiet button; his ServiceTitan agent needs it), PRINT, estimates list, auth, Sonner toasts (fewer of them).

---

## 8. Intake verification redesign (parsed-cards list)

This is the "verify" step of the workflow and the current UI's weakest moment (tiny pills on inputs). After OCR:

```
PARSED CARDS — 4 found · multiplier → 1.00
┌─────────────────────────────────────────┐
│ 9208 · Door model            $1,191.30  │  [AUTO]
│ FULL VISION · Windows          $1,338.61│  [AUTO]
│ EXTRA STRUT · Misc                $41.19│  [AUTO]
│ FV200U · Windows               $196.12  │  [CHECK]  ← amber
└─────────────────────────────────────────┘
```
- Row click → focuses the corresponding pricing input.
- `CHECK` rows get amber left-border; `AUTO` rows get a quiet green chip.
- This is also where the FV200U classification is *visible* — Weston sees it land in Windows and trusts the parser.

---

## 9. Motion (restrained)

- Grand total tweens on change (keep existing `useTween`, ~650ms). All other numbers update instantly.
- 600ms highlight flash on OCR-filled fields (replaces typewriter).
- 150ms ease-out on hover/focus states only. No entrance choreography, no layout animation, no scroll effects.
- Theme toggle: instant class swap (keep the no-flash inline script).

---

## 10. Parser amendment (from Weston, 2026-09-24)

**FV200U (Full Vision 200U) is glass → classify as windows**, not miscellaneous. Update `src/lib/ocrParser.ts`: `FV` + digits patterns join the windows keyword set. One-line-class change; the parsed-cards list (§8) makes the classification visible for trust.

---

## 11. Build notes & open questions

- **Math is frozen.** `calc()`, `solvePricing()`, band thresholds (39.5–41.5, gap 300–400), and all quirks port verbatim. This proposal changes zero numbers — only where they live and how they read.
- **Branch strategy:** build on a new branch from `quotepro-v6` (e.g. `quotepro-v7-redesign`); preview-deploy; Weston clicks through before anything touches production.
- **Estimates/Auth backends unchanged** (Apps Script + Supabase) — restyle only.
- **Open:** estimate-name/quote-number meta line in the quote rail — keep `QUOTE NO. 0001` convention or derive from estimate? (Minor; default to keep.)
- **Open:** Weston should confirm the Direction A layout from §2 before build — it's a real departure, and "brand new layout" deserves one explicit yes.
