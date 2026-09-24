# OCR Diagnosis — QuotePro (2026-09-24)

## TL;DR
Weston's day-to-day OCR path is **client-side only**: paste screenshot → `Tesseract.recognize` (tesseract.js v5, jsdelivr CDN) in `public/index.html` → regex parser `parseOCRTextFull()` hunting for literal "NET PRICE". The OCR engine itself is healthy today (verified end-to-end with tesseract.js v5.1.1). The brittle link is the **regex parser**, which returns zero hits — surfacing as "NO PRICES FOUND IN IMAGE" / "OCR no longer working" — on two realistic inputs: (a) screenshots where OCR drops the decimal point, (b) iStore screenshots that no longer say "NET PRICE". The server-side OCR endpoint (`POST /api/calculator/run`) is **dead code in practice**: the frontend never calls it. Separately, every Vercel deployment found is behind Vercel's "Login" Deployment Protection, and `quotepro.vercel.app` is an unrelated squatter project.

## 1. Which path Weston uses
- `public/index.html`: global `paste` listener → `handleImage(file)` → `runOCR(file)` → `Tesseract.recognize(file,'eng',{logger})` → `parseOCRTextFull(res.data.text)` → fills `f_door` / `f_windows` / `f_etc`. This is the paste-screenshot flow Weston uses daily.
- `api/index.js` `POST /api/calculator/run`: accepts a `screenshot` multipart upload and runs tesseract.js v7 server-side. **The frontend never calls this** — the only reference is a curl template string copied to clipboard by `copyApiCall()` (line ~985, for Weston's middleman agent docs). Dead code for the OCR flow.

## 2. Client-side path — evidence
**CDN chain (all HTTP 200, verified 2026-09-24):**
- `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js` → serves v5.1.1
- `.../tesseract.js@v5.1.1/dist/worker.min.js` → 200
- `.../tesseract.js-core@v5.1.1/tesseract-core-lstm.wasm.js` (+ simd variants) → 200
- `.../@tesseract.js-data/eng/4.0.0/eng.traineddata.gz` (10.9 MB) and `4.0.0_best_int/…` (2.9 MB) → 200

Note: v5.1.x moved the default traineddata host from `tessdata.projectnaptha.com` to jsdelivr `@tesseract.js-data` (found by reading the 5.1.1 bundle). Both hosts are live, so the drift didn't break anything.

**Live engine test:** installed tesseract.js@5.1.1 in Node, ran `recognize()` on a synthetic iStore-style screenshot — **succeeded** ("NETPRICE $184099 …"). The engine is not broken.

**Parser test** (`parseOCRTextFull` copied verbatim, regex requires literal `NET`/`NE1` + a price with exactly `\.\d{2}`):
| Input | Result |
|---|---|
| `NET PRICE $1,849.99` (clean) | ✅ 1849.99 |
| `NETPRICE $184099` (OCR dropped the dot — very common) | ❌ NO HITS |
| `Your Price $1,849.99` (portal relabeled, no "NET PRICE") | ❌ NO HITS |
| `NE1 PRICE $1,849.99` | ✅ (tolerated) |

Both ❌ cases produce the exact user-visible symptom: toast "NO PRICES FOUND IN IMAGE" → Weston reads it as "OCR is no longer working." The regex also assumes the priciest line = the door (sort desc), which is heuristic.

**Secondary client-side flaw:** `runOCR` calls the global `Tesseract` with no guard. If the jsdelivr script is ever blocked (ad-blocker, offline, CSP), it throws an uncaught `ReferenceError`, the `#ocr-overlay` spinner stays stuck forever, and nothing explains why. Worth a `typeof Tesseract === 'undefined'` guard regardless.

**Code history:** the OCR code is unchanged since the initial commit (`e21a424`); the v5 UI rewrite only restyled it. Nothing in the repo changed to break it — the breakage is in the inputs (screenshots) or the browser environment, not a code regression.

## 3. Server-side path — why it never worked on Vercel
Even if the frontend called it, this path is not viable as-is:
- **Unreachable in practice:** the whole Vercel project sits behind Deployment Protection ("Login – Vercel" on every deployment URL I found), and the endpoint additionally requires a `Bearer` token validated against Supabase `api_keys`.
- **Serverless constraints:** tesseract.js v7 in Node needs worker threads plus runtime download of the ~4 MB WASM core and ~3–11 MB traineddata on cold start (cache writes target the read-only function filesystem, so likely re-downloaded per cold start), then 5–30 s+ of OCR compute against a 10 s (Hobby) / 60 s (Pro) function timeout. Fragile by design.
- Verdict: do not try to revive server-side tesseract on Vercel.

## 4. Deployment findings (need Weston to confirm which URL he uses)
- `https://quotepro.vercel.app/` → **unrelated squatter**: a Next.js marketing landing page ("QuotePro - Professional Quotation Generator", invoices/quotes SaaS template). Zero OCR code. Not Weston's app.
- Real deployments (from GitHub Deployments API):
  - Preview @ `694e7b7` (current branch HEAD): `https://quotepro-jk6aooif3-pizza122202-9153s-projects.vercel.app`
  - Production @ `fdacd8e` (older commit, pre-v5-UI): `https://quotepro-jd97yhx5q-pizza122202-9153s-projects.vercel.app`
  - Stable project URL: `https://quotepro-pizza122202-9153s-projects.vercel.app`
- **All of them return Vercel's "Login – Vercel" page** (Deployment Protection) to an unauthenticated visitor. Weston must be logged into that Vercel team in his browser, or he isn't using these URLs at all. Also note production is deployed from an older commit than the branch.

## 5. Ranked root causes for "OCR is no longer working"
1. **Parser finds no "NET PRICE" lines in his current screenshots** (portal relabeled OR OCR dropped decimals/dots on this batch of screenshots) → "NO PRICES FOUND IN IMAGE". Most consistent with Weston offering to upload the screenshots he OCRs — the input is the variable. **Needs one of his actual screenshots to confirm.**
2. **jsdelivr/tesseract script blocked or failed to load in his browser** → uncaught ReferenceError, overlay spinner stuck forever. Quick check: open devtools console, look for `Tesseract is not defined` or failed `tesseract.min.js` request.
3. **He's hitting the Vercel login wall** on a browser/device where he's not authenticated — but then the whole app would be dead, not just OCR.

## 6. Recommendation
**Replace the regex parser with a server-side vision-LLM endpoint** (`POST /api/ocr/parse`, multipart image → `{door, windows, etc}` JSON). Rationale:
- The OCR *engine* works; the *regex* is what's brittle. A vision model handles relabeled portals, dropped decimals, and fuzzy line-item classification (window/glass/lite/insert → `windows`, everything else → `etc`) in one step — exactly the durable requirement already recorded in memory.
- It removes the 11 MB traineddata + 4 MB WASM download from the client and kills the whole CDN-drift failure class.
- Keep tesseract client-side as the image→text fallback if LLM is ever unreachable, but stop parsing its output with regexes — or drop it once the endpoint proves out.
- If keeping tesseract short-term: pin `@5.1.1` (not `@5`), add the `typeof Tesseract` guard with a clear error message, and make the price regex decimal-optional with a sanity range ($10–$50k) instead of requiring `\.\d{2}`.

**Do NOT** invest in the server-side tesseract v7 path (`/api/calculator/run` screenshot upload) — it's dead code, auth-walled, and fights Vercel serverless limits.

**Open questions for Weston:** (1) Which URL does he actually open day-to-day? (2) One current iStore screenshot to confirm the parser-miss hypothesis — specifically whether "NET PRICE" still appears and whether prices still carry decimals.
