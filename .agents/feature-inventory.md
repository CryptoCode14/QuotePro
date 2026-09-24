# QuotePro v5 → v6 Feature Inventory (Port Contract)

Source: `public/index.html` (single 1301-line file, branch `quotepro-v6`, HEAD `694e7b7`), read in full 2026-09-24.
Background: `.agents/ocr-diagnosis.md`. Cost-analysis named formulas live in `api/index.js` lines 62–68; the frontend holds equivalents.

Everything below is checkbox-verified against the file. **OPEN QUESTION** markers flag ambiguities — do not guess; confirm with Weston before the port.

---

## 1. Input fields

All price inputs: `<input inputmode="decimal">` (text-type, numeric entry), right-aligned mono font, `$`/`×`/`%` prefix chip, editable, fire `input` → `refresh(true)` + `hideSolved()`. `num()` helper: `parseFloat(value) || 0`; multiplier special-cased `|| 1`.

### DOOR COSTS group
- [ ] `#f_door` — label **GARAGE DOOR**, default `1200`, `$` prefix, wrapper `#w_door`, tag `#t_door`
- [ ] `#f_windows` — label **WINDOWS**, default `250`, `$` prefix, wrapper `#w_windows`, tag `#t_windows`
- [ ] `#f_etc` — label **ETC**, default `92.50`, `$` prefix, wrapper `#w_etc`, tag `#t_etc`
- [ ] `#f_mult` — label **MULTIPLIER**, default **`1.00`** (NOT 1.08 — see OPEN QUESTION 1), `×` prefix, no tag
### OVERHEAD group
- [ ] `#f_base` — label **BASE AMOUNT**, default `2000`, `$` prefix, tag `#t_base`
- [ ] `#f_pct` — label **PERCENT FACTOR**, default `25`, `%` prefix, tag `#t_pct`
### LABOR group (sub-label "— leave at zero, let the solver work")
- [ ] `#f_install` — label **INSTALLATION**, default `326.40`, `$` prefix
- [ ] `#f_fuel` — label **FUEL & TRAVEL**, default `108.80`, `$` prefix
### Field tags (FROM PASTE / CHECK ME)
- [ ] Each tagged field shows an inline `.ftag` pill: `FROM PASTE` (green) when parser confidence is `high`; `CHECK ME` (amber) when confidence is `med`
- [ ] `FROM PASTE` triggers 1.6s green `fillflash` background animation on the field; `CHECK ME` gives the input an amber border + soft ring
- [ ] `clearTags()` resets tags on door/windows/etc before every fill
### Other inputs (auth + estimates views)
- [ ] `#email-input` — placeholder `Email address`, autocomplete `email`
- [ ] `#password-input` — placeholder `Password`, type password, autocomplete `current-password`
- [ ] `#new-estimate-name` — placeholder `Client name...`
- [ ] `#new-estimate-status` — placeholder `Status (optional)`

---

## 2. `calc()` — the pricing engine (canonical, comment says "identical to API")

Copy verbatim:
```js
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = id => parseFloat(document.getElementById(id).value) || 0;
const state = { discount:true, mode:'express', gstep:0 };
function calc(){
  const door=num('f_door'), win=num('f_windows'), etc=num('f_etc'), mult=num('f_mult')||1;
  const base=num('f_base'), pct=num('f_pct');
  const inst=num('f_install'), fuel=num('f_fuel');
  const totalMaterials = door+win+etc;
  const afterMult = totalMaterials*mult;
  const overhead = base*(pct/100);
  const f04 = afterMult*0.4;
  const subBefore = afterMult+overhead+f04;
  const subAfter = subBefore+inst+fuel;
  const grandTotal = subAfter*1.10;
  const expenses = afterMult+overhead;
  const net = grandTotal-expenses;
  const margin = grandTotal>0 ? net/grandTotal*100 : 0;
  const dc = 2*(state.discount?0.99:1)*afterMult;
  const gap = grandTotal-dc;
  return {door,win,etc,mult,base,pct,inst,fuel,totalMaterials,afterMult,overhead,f04,
    subBefore,subAfter,grandTotal,expenses,net,margin,doubleCost:dc,gap};
}
```
- [ ] Note: the frontend function is named `calc()`, not `calculateQuote` (that name is in `api/index.js`)
- [ ] Formatting helpers: `fmt$ = x => x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})`; `fmt0$ = x => (x<0?'-$':'$')+Math.abs(Math.round(x)).toLocaleString('en-US')`
- [ ] `solve()` (the SOLVE PRICING math), verbatim:
```js
document.getElementById('f_install').value='0'; document.getElementById('f_fuel').value='0';
const c = calc();
const gtAtMin = c.expenses/0.60;
const gapAtMin = gtAtMin - c.doubleCost;
let finalGT;
if(gapAtMin > 400 || (gapAtMin >= 300 && gapAtMin <= 400)) finalGT = gtAtMin;
else finalGT = Math.min(c.doubleCost+300, c.expenses/0.5901);
const needed = finalGT/1.10 - c.subBefore;
const inst = Math.max(0, r2(needed*0.75));
const fuel = Math.max(0, r2(needed-inst));
document.getElementById('f_install').value=inst.toFixed(2);
document.getElementById('f_fuel').value=fuel.toFixed(2);
```
- [ ] Quirk to preserve: `gapAtMin > 400 || (gapAtMin >= 300 && gapAtMin <= 400)` is logically equivalent to `gapAtMin >= 300`; keep the exact branching
- [ ] Quirk to preserve: `0.60` vs `0.5901` thresholds are unexplained — keep both numbers

## 3. Cost-analysis block (double cost / target gap)

The named fields `doorWithDiscount / windowsWithDiscount / etcWithDiscount / totalCostWithDiscount / doubleCost / targetGap` exist in **`api/index.js`** (lines 62–68), verbatim:
```js
const discountRate = 0.99; // Assume discount enabled by default for API
results.doorWithDiscount = (inputs.garageDoor * inputs.multiplier) * discountRate;
results.windowsWithDiscount = (inputs.windows * inputs.multiplier) * discountRate;
results.etcWithDiscount = (inputs.etc * inputs.multiplier) * discountRate;
results.totalCostWithDiscount = results.doorWithDiscount + results.windowsWithDiscount + results.etcWithDiscount;
results.doubleCost = results.totalCostWithDiscount * 2;
results.targetGap = calculateQuote(inputs).grandTotal - results.doubleCost;
```
The frontend's equivalent (inside `calc()`, honors the 1% DISC toggle; API assumes discount always on — mathematically identical when toggle is on):
```js
const dc = 2*(state.discount?0.99:1)*afterMult;   // ← 0.99 discount rate
const gap = grandTotal-dc;
return {..., doubleCost:dc, gap};
```
- [ ] Discount rate `0.99` toggled by the **1% DISC** pill (`#dtoggle`, class `on` by default, `state.discount` starts `true`)
- [ ] Gap drives the sweet-spot bar: marker position `clamp(4–96%, gap/800*100%)` on `#spotmark`; `#spotval` text `±$N`; colors: gap 300–400 → accent (in band), >400 → blue, else red
- [ ] Ticks on the spot bar: `$300` and `$400` (band `left:37.5%; width:12.5%` of the 800 scale)

---

## 4. OCR intake flow

### Paste anywhere (global)
- [ ] `addEventListener('paste', …)` on window: image clipboard item → `handleImage(file)`; otherwise text → `applyPaste(text)`; `e.preventDefault()` when handled
- [ ] Works from anywhere on the page — dropzone copy reinforces: `CLICK HERE AND PRESS ⌘V / CTRL+V — OR DRAG A FILE IN` / `PASTE WORKS ANYWHERE ON THIS PAGE`
### Dropzone
- [ ] `#dropzone` (tabindex=0, role=button, aria-label "Paste screenshot or price text"): click → toast `PRESS ⌘V / CTRL+V TO PASTE`
- [ ] Drag-over/drag-enter → `.over` highlight class; drag-leave/drop removes it
- [ ] Drop: image file → `handleImage`; text/`.txt`/`.csv` file → read as text → `applyPaste`
### Image preview
- [ ] `#imgprev` shows the pasted/dropped image (FileReader data URL), max 220×140px, rounded + shadow
### OCR overlay / progress UI
- [ ] `#ocr-overlay` fullscreen blur overlay with `.ocr-card`: spinner (`.ocr-spin`), status `Scanning screenshot…` (`.ocr-status`), substatus `ANALYZING TEXT & PRICES` (`.ocr-substatus`)
- [ ] During Tesseract progress: substatus becomes `READING — NN%`
- [ ] Overlay hides on success or failure (no stuck spinner on failure path — but see OPEN QUESTION 4)
### `runOCR`
- [ ] `Tesseract.recognize(file,'eng',{logger})` (tesseract.js v5 from jsdelivr CDN)
- [ ] Success → `parseOCRTextFull(res.data.text)`; failure → status `COULD NOT READ IMAGE — TRY AGAIN OR PASTE TEXT`, toast `OCR FAILED — PASTE THE TEXT INSTEAD`
### `parseOCRTextFull` (NET PRICE regex path)
- [ ] Regex (verbatim): `/(?:NET|NE1|N\s?E\s?T)\s*(?:PRICE|PRCE|PNCE|PICE)?\s*[:.,-\s]*?\$?\s*(\d[\d\s,]*\.\d{2})/gi` — tolerant of `NE1`, `PNCE` misreads; requires exactly two decimals
- [ ] Context = 150 chars before each match, uppercased; hits sorted descending by price; priciest = door (`high` confidence)
- [ ] Remaining hits: context matches `/WINDOW|GLASS|GLAZING|LITE|INSERT/` → summed into windows (`high`); everything else → summed into etc (`high`)
- [ ] Zero hits → status `NO NET PRICE FOUND — TRY A CLEARER SHOT OR PASTE TEXT` (warn), toast `NO PRICES FOUND IN IMAGE`
- [ ] Then `clearTags()` + `runFillJobs(jobs, 'SCANNED N ITEM(S) — MULTIPLIER → 1.00')`
### `parsePrices` (text-paste keyword path) via `applyPaste`
- [ ] Splits lines; price regex `/\$?\s*([\d,]+\.\d{2})/`; skips non-`$` values under $10 (multipliers/quantities)
- [ ] `window|glass` → windows (`high`); door word-boundary regex `/(^|[^a-z])door([^a-z]|$)/` → door (`high`); `etc|misc|additional|other|hardware|opener|strut|spring|seal` → etc list (`high`); `net|price|total|amount` → unmatched pool
- [ ] Fallback: biggest unmatched line → door (`med` = CHECK ME); rest → etc (med if no high-confidence etc)
- [ ] No prices → status `NO PRICES FOUND IN THAT PASTE — TRY AGAIN` (warn), toast `NO PRICES FOUND`
### `runFillJobs` typewriter fill sequence (shared by paste + OCR)
- [ ] Snaps `#f_mult` → `1.00` ("multiplier → 1.00" — iStore prices already carry it)
- [ ] Status `READING N PRICE(S)…`; fields filled sequentially via `fillAnimated` (26ms/char typewriter, 140ms stagger, `refresh(true)` after each field)
- [ ] Tags applied per field: high → `FROM PASTE` (green flash), med → `CHECK ME` (amber)
- [ ] Completion: if any med fields → status `N PRICES READ · M NEED(S) A LOOK` (warn), toast `FILLED — CHECK THE AMBER FIELDS`; else okMsg or `N PRICES READ · MULTIPLIER → 1.00`, toast `VALUES FILLED — QUOTE UPDATED`
- [ ] Always: `doorPulse()`, `refresh(true)`; in guided mode auto-advances `setGstep(1)`
### Sample text + status strings
- [ ] `#btnSample` — **USE SAMPLE ISTORE TEXT** → parses:
  `QUOTE - iStore` / `Clopay Classic Steel 16x7 insulated             NET PRICE  $1,849.99` / `Windows - Stockton long panel                  NET PRICE  $312.00` / `ETC - strut kit + spring upgrade               NET PRICE  $45.00`
- [ ] `#parseStatus` statusline: `WAITING FOR INPUT…` (idle) → `SCANNING SCREENSHOT…` → `READING N PRICE(S)…` → success/ok or warn variants above; classes `ok` (green) / `warn` (amber)
- [ ] `#imgNote` (`.imgnote`) exists in markup but is **never populated** — dead element, port may drop or keep hidden

---

## 5. Express vs guided modes

- [ ] Header segmented control (`.seg`, role=tablist): `#modeExpress` **EXPRESS** (default on), `#modeGuided` **GUIDED**; `setMode(m, silent)`
- [ ] Express: all cards visible at once (default)
- [ ] Guided: `body.guided`; cards with `data-step` dim unless active (opacity .28, desaturated, `pointer-events:none`); black pill badge `::before` shows the step label
- [ ] Step map: `#pasteCard` step 0 `STEP 1 · PASTE` → `#pricesCard` step 1 `STEP 2 · PRICES` → `#totalCard` step 2 `STEP 3 · QUOTE`; `#actionsCard` is also `data-step="2"` but has **no** label badge
- [ ] `.gcont` **CONTINUE →** buttons appear only in guided: `#gcont0` (intake card) → `setGstep(1)`; `#gcont1` (prices card) → `setGstep(2)`; no continue button on the final step
- [ ] `setGstep` toasts `STEP n / 3 — <label>` with labels `PASTE YOUR PRICES` / `REVIEW THE PRICES` / `QUOTE IS READY`
- [ ] Mode change persists to settings (localStorage + cloud); toast `EXPRESS MODE — PASTE, DONE` / `GUIDED MODE — ONE STEP AT A TIME`; silent re-apply on settings load

## 6. Named features (no literal "Magic Fill" string exists — nearest match noted)

- [ ] **Fill sequence** = `runFillJobs` + `fillAnimated` typewriter fill (see §4); this is the "magic" auto-fill — confirm naming with Weston
- [ ] **SOLVE PRICING** (`#btnSolve`, `.btn.primary`): guarded by `solving` flag; button shows `SOLVING…` + disabled; at 400ms zeros install/fuel + refresh; at 1100ms runs `solve()` + refresh; banner `#solved` shows `✓ SOLVED — X.X% MARGIN · GAP $N`, auto-hides after 4200ms
- [ ] **1% DISC** toggle (`#dtoggle`, default ON) — flips `state.discount`, persisted
- [ ] **RESET** (`#btnReset` linkbtn) — restores `1200 / 250 / 92.50 / 1.00 / 2000 / 25 / 326.40 / 108.80`, clears tags, status `WAITING FOR INPUT…`, toast `RESET TO DEMO NUMBERS`
- [ ] **COPY AS API CALL** — `#btnApi` (actions card) + `#btnApiTop` (header `⧉ API`, label hidden on mobile); copies curl template to clipboard (textarea fallback); toast `API CALL COPIED — PASTE IT ANYWHERE`
- [ ] **PRINT** header button → `window.print()`
- [ ] **LIST** header button (`#btnEstimates`) — toggles estimates view, `.on` active state
- [ ] **Margin meter**: `#marginchip` pill (`SWEET SPOT` 39.5–41.5% / `ABOVE TARGET` >41.5 / `BELOW TARGET` <39.5), `#marginval` colored by `bandColor`
- [ ] **Sweet-spot bar**: $300–$400 band on an $800 scale (see §3)
- [ ] **Price breakdown** (`details#breakdown`, summary `PRICE BREAKDOWN ▾`): ledger rows Total Materials / After Multiplier / Overhead / 40% Factor / Subtotal / Installation / Fuel & Travel / 10% Markup (= subAfter×0.10) / Grand Total / Expenses / Net Profit · X.X%
- [ ] **Door SVG preview** (`#doorCard`): sections/frame+glass/hardware parts fade in staggered on load (`doorIntro`, 350ms + 420ms steps, captions SECTIONS → FRAME + TRACKS → GLASS + HARDWARE → QUOTE READY); `doorPulse()` flashes all parts after a fill
- [ ] **Sticky mobile total bar** (`#mtotal`, ≤1023px only): `GRAND TOTAL` + `#mtotalnum`; hidden when estimates view is open
- [ ] North-star total uses container-query sizing + canvas-measured shrink-to-fit (`fitTotalFor`) so long totals never clip

---

## 7. Auth modal (Supabase)

- [ ] `#login-overlay` fullscreen blur gate; hidden via `.hidden` class when signed in
- [ ] Card: logo `large logo.png`, title `QuotePro`, sub `GRAND VALLEY GARAGE DOORS`; inputs `#email-input` / `#password-input`; `#login-error` error line; `#btn-email-login` **SIGN IN** (`.btn.primary`); links **CREATE ACCOUNT** (`#btn-email-signup`) / **FORGOT PASSWORD?** (`#forgot-password-link`)
- [ ] Supabase project URL: `https://ymwinetfkporjwxjkfgo.supabase.co` (public anon key below — safe to ship client-side)
- [ ] Supabase anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd2luZXRma3Bvcmp3eGprZmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjY2MjYsImV4cCI6MjA5NjYwMjYyNn0.MtQziHbMQegw4A_cdEkR895cgmNT8MsPKUxWf7phP9I`
- [ ] Client: `@supabase/supabase-js@2` CDN, `window.supabase.createClient(URL, ANON_KEY)` (ES-module `<script type="module">`)
- [ ] Flows:
  - [ ] `onAuthStateChange`: session → hide overlay, `updateAuthUI(user)`, `loadSettingsFromCloud(uid)`; no session → show overlay
  - [ ] `getSession()` on boot does the same for an existing session
  - [ ] Login: `supabase.auth.signInWithPassword({email, password})`; empty fields → `Please enter email and password`; error containing `Invalid login` → `Invalid email or password.`; else raw message
  - [ ] Signup: `supabase.auth.signUp({email, password})` → green `Account created! Check your email to verify (or try logging in if auto-confirm is on).`, clears after 5s
  - [ ] Reset: `supabase.auth.resetPasswordForEmail(email)`; empty email → `Please enter your email address first.`; success → green `Password reset email sent!`, clears after 5s
- [ ] Profile menu (`#profile-container`, hidden until login): circle trigger shows first letter of email (uppercase); dropdown shows full email + **SIGN OUT** → `window.firebaseLogout()` → `supabase.auth.signOut()` (misnamed "firebase" — keep or rename, it's cosmetic)
- [ ] Dropdown: click toggles, document click closes, `stopPropagation` inside; no OAuth providers — email/password only

## 8. Estimates view (Google Apps Script — NOT Supabase)

- [ ] `#btnEstimates` LIST toggles `body.show-est`: `#view-estimates` shown, `#layout` hidden (and vice versa)
- [ ] Backend: `APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyB7fWAsd8MQatdMw1dVDiYf4JYMpm2IHmTQZ9XrGuL_Gqi9iu8VdCwo3wlqUr1jODV/exec'`; `FILE_ID = '15FSowE6FmdicGyH_eOCFBCIfDW0BAaj_'`
- [ ] Header `ESTIMATE LIST — synced from your tracker`; `#auth-message` status line (starts `EXCEL INTEGRATION READY.`); `⟳ REFRESH` button (`#refresh_button`)
- [ ] Table columns: **Name** (40%) / **Status** (30%) / **Actions** (30%); `tbody#estimate-list-body`
- [ ] `listEstimates()`: `GET ?action=list&fileId=…` → `LOADING FROM TRACKER…` → `DATA LOADED.` / `ERROR: <msg>`; first data row skipped if col 0 contains "name" (header row); rows get id `row-<i>`; status defaults to `Pending`; empty → single row `No estimates found.`; also runs once on page load
- [ ] Create: inputs `#new-estimate-name`, `#new-estimate-status`; **ADD** button → `POST ?action=add` body `{name, status}` (status defaults `Pending`); blank name ignored; name cleared after; `ADDING…` / `ERROR ADDING: <msg>`
- [ ] Update: **Edit** → `toggleEdit(i)` swaps cells to inputs (`edit-name-i`, `edit-status-i`), buttons become **Save**/**Cancel**; **Save** → `window.saveEstimate(i)` → `POST ?action=update&fileId=…` body `{action:'update', name, status, rowIndex: index}` → `SAVING…` → `SAVED.` / `ERROR SAVING: <msg>`; **Cancel** re-renders list
- [ ] Delete: **Delete** → `window.deleteEstimateRow` → `confirm('Delete this estimate?')` → `POST ?action=delete` body `{rowIndex}` → `DELETING…`; failure → `alert('Error deleting: <msg>')`
- [ ] No defined status enum — free-text, defaults to `Pending`

## 9. `user_settings` sync

- [ ] Table: `user_settings`; columns: `id` (auth uid, primary key), `email`, `settings` (JSON object), `updated_at` (ISO timestamp)
- [ ] `window.currentSettings` default `{discount:true, mode:'express'}`; merged from `localStorage['quoteproSettings']` at boot
- [ ] Load: `supabase.from('user_settings').select('settings').eq('id', uid).single()` on sign-in and on initial `getSession()`; if row exists → `Object.assign` into `currentSettings`, `applySettings()`, rewrite localStorage; else keep local (console: "No cloud settings found, keeping local.")
- [ ] `applySettings()`: `state.discount = s.discount!==false`; toggles `#dtoggle.on`; `setMode(mode, silent=true)`; `refresh(false)`
- [ ] Save: `supabase.from('user_settings').upsert({id, email, settings: currentSettings, updated_at: new Date().toISOString()})` — only when signed in; fired by `persistSettings()` on **mode change** and **discount toggle** (exposed as `window.saveSettingsToCloudGlobal`)

---

## 10. Keyboard shortcuts, print/export, misc user-visible

- [ ] Keyboard: **no app shortcuts** beyond global Ctrl/Cmd+V paste-anywhere; no keydown handlers (Esc does nothing); dropzone is keyboard-focusable (`tabindex=0`)
- [ ] Print: header **PRINT** → `window.print()`; `@media print` hides header, intake card, actions card, toast, solved banner, mobile bar, guided buttons, estimates view, auth + OCR overlays; layout ungrids to a single column; cards `break-inside:avoid`; white background — door preview, prices, total card print
- [ ] Export = **COPY AS API CALL** (clipboard only, no file download); curl template:
  `curl -X POST https://<your-vercel-app>/api/calculator/run \` + `-H "Authorization: Bearer $PROTAKE_API_KEY"` + `-H "Content-Type: application/json"` + `-d '<{garageDoor,windows,etc,multiplier,baseAmount,percentFactor,installation,fuel}>'` — placeholder host, note `apiPayload()` maps `garageDoor:c.door, windows:c.win, etc:c.etc, multiplier:c.mult, baseAmount:c.base, percentFactor:c.pct, installation:c.inst, fuel:c.fuel`
- [ ] Boot sequence: `refresh(false)` → `doorIntro()` → after 400ms `refresh(true)` → after 900ms toast `PASTE AN ISTORE SCREENSHOT OR PRICE TEXT`
- [ ] Any edit in prices card hides the `#solved` banner (`hideSolved()`)
- [ ] Toast (`#toast`, bottom, dark pill, 2600ms): full string list — `PRESS ⌘V / CTRL+V TO PASTE` · `NO PRICES FOUND` · `NO PRICES FOUND IN IMAGE` · `OCR FAILED — PASTE THE TEXT INSTEAD` · `FILLED — CHECK THE AMBER FIELDS` · `VALUES FILLED — QUOTE UPDATED` · `EXPRESS MODE — PASTE, DONE` · `GUIDED MODE — ONE STEP AT A TIME` · `STEP n / 3 — …` · `RESET TO DEMO NUMBERS` · `API CALL COPIED — PASTE IT ANYWHERE` · `PASTE AN ISTORE SCREENSHOT OR PRICE TEXT`
- [ ] Header brand: `large logo.png` + wordmark `QUOTE`**PRO** + sub `EXPRESS ESTIMATING`; totalsub `QUOTE NO. 0001 · GRAND VALLEY GARAGE DOORS` (static text)
- [ ] Reduced motion: `prefers-reduced-motion` kills all animations/transitions
- [ ] Mobile ≤1023px: single-column order intake→prices→actions→total→door; total card unstickied; sticky `#mtotal` bar at bottom; header API label hidden; login card tightened

---

## OPEN QUESTIONS (do not guess — confirm with Weston)

1. **Multiplier default**: `index.html` hardcodes `value="1.00"` (and RESET restores `1.00`, paste snaps to `1.00`); MEMORY/API contract says default **1.08** and that the legacy 0.99 factor is dead. Which default should v6 use?
2. **"Magic Fill" naming**: no such string in the file; the feature is `runFillJobs` + typewriter fill + FROM PASTE/CHECK ME tags. Keep that name or rename?
3. **`#imgNote`**: present in markup, never used — drop in port or wire it up?
4. **Tesseract load guard**: `runOCR` calls global `Tesseract` with no `typeof` check — if the CDN is blocked the overlay can stick forever. Add a guard + clear error in v6?
5. **Guided mode labels**: `actionsCard` has `data-step="2"` but no step-badge label — intentional?
6. **Estimates statuses**: free-text with `Pending` default; any canonical status list wanted?
7. **API curl template**: placeholder `<your-vercel-app>` + `$PROTAKE_API_KEY` — update for v6 or keep as-is?
8. **Parser heuristics** (flagged in ocr-diagnosis.md, unchanged here): regex requires exactly `\.\d{2}` (OCR dropping the decimal → "NO PRICES FOUND IN IMAGE"); biggest-`NET PRICE`-line = door assumption. Port as-is or fix per the memory decision (server-side vision-LLM parser, window/glass/lite/insert → windows classification)?
