# QuotePro OCR Options Research — Free Tier (2026)

Research date: 2026-09-24. Verified via web search; prices/quotas cited from sources checked August–September 2026.

**Key insight from Weston's own report:** he says the app "does a really good job at grabbing the door price... but doesn't grab windows or miscellaneous correctly." That is a **parser/classification failure, not an OCR-engine failure.** The screenshots I studied (~32 examples) are clean, high-contrast, digital-render screenshots — standard sans-serif, consistent card layout ("9208" or "PRICE FOR X" header, List Price, Net Price, Multiplier). This input type is Tesseract's sweet spot.

---

## Option 1 — Tesseract.js (current baseline) — $0 forever, no key

- **Cost:** Free, open source, unlimited. No API key, no account, no quota.
- **Privacy:** Perfect — runs client-side (or in Node), dealer pricing never leaves the device.
- **Accuracy on THIS input:** Strong. Multiple 2026 benchmarks confirm Tesseract excels on clean digital text:
  - Towards Data Science (May 2026, tested many engines): "Tesseract did fine on clean docs... but failed on photo/handwriting altogether outputting garbage." Our input is clean docs. — https://towardsdatascience.com/i-spent-may-evaluating-different-engines-for-ocr/
  - forensicnomicon OCR benchmark (Sept 2026): Tesseract 5.5.2 hit 10/11 recall — "portable, scriptable, second-fastest." — https://github.com/securityronin/forensicnomicon/blob/HEAD/research/ocr-engine-benchmark.md
  - Known weakness: visually similar characters (0/O, Y/*) can misread even at 2x resolution — one 2026 project verified this live (https://github.com/dandovdub/residoo/commit/b049f748de50ad6234ee882f3713ef5efc4bf77d7). Mitigation: structured parsing that validates numbers, doesn't trust single digits.
- **Vercel fit:** client-side is ideal (no serverless involvement at all). Server-side on Vercel is the flaky path (worker/WASM/traineddata loading under serverless constraints — separate diagnosis covers this).
- **Weakness:** raw text output only — it won't classify "window vs miscellaneous" for you. That logic must live in the parser.

## Option 2 — OCR.space API — free tier: 25,000 requests/month, $0, no credit card

- **Cost:** Free tier is permanent: **25,000 requests/month** (Engines 1 & 2) + **2,500 Engine 3 conversions/month**. No credit card. Key issued with just an email. Commercial use allowed.
- **Limits:** 1 MB file size per image via API (3-page PDF cap, irrelevant here — screenshots). Free routes through US servers.
- **Accuracy:** Fine for clean screenshots; slower than Google/Microsoft; weaker on complex/faded documents (not our case).
- **Vercel fit:** Excellent — dead-simple REST POST (multipart, URL, or base64), JSON response, trivially callable from a serverless function. This is the classic fallback when client-side OCR misbehaves.
- **Privacy:** Images sent to a third party (US). Stateless processing (no retention claimed), but it's still dealer pricing data leaving the device.
- Sources: https://freetier.co/directory/products/ocrspace-free-ocr-api · https://idp-software.com/vendors/ocr-space/ · verified 2026-08-14 by https://github.com/pacocartones/free-llm-api-hub

## Option 3 — Google Gemini API free tier (vision) — $0, Google account only

- **Cost:** Free, no credit card. Free tier covers Flash/Flash-Lite models: roughly **15 RPM, 250–1,000 requests/day** depending on model (2.5 Flash-Lite most generous; newer 3.x Flash-Lite models ~500/day per model). Pro models went paid-only in April 2026.
- **What it buys:** a vision model that reads the screenshot AND returns structured JSON in one call (door/windows/misc classification with reasoning — no brittle regex). This is the only option that fixes the classification problem inside the OCR step itself.
- **Vercel fit:** Easy REST/SDK call from a serverless function. Response is structured, not raw text.
- **Privacy (the catch):** Google's pricing page marks free tier "Used to improve our products" = **Yes**. Dealer pricing screenshots would be usable for model training. Paid tier opts out. For an internal tool this may be acceptable, but it's a real tradeoff vs. Tesseract/OCR.space.
- **Reliability caveat:** Google changes free quotas (cut 50–80% in Dec 2025; Pro restricted Apr 2026). A dependency on the free tier carries policy risk.
- Sources: https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration · https://www.how2shout.com/how-to/how-to-get-google-gemini-api-key.html · https://github.com/nandyalu/ten-acre (limits verified 2026-09-13)

## Option 4 — Mistral OCR — free "Experiment" tier (~$10/mo credits), then $4/1,000 pages

- **Cost:** New accounts get a free mode: **$10/month in API credits, no card required** (probed live 2026-09-17). OCR 4 pricing is $4 per 1,000 pages, so ~$10 ≈ **~2,500 pages/month free**. Past the allowance, usage stops until next month unless pay-as-you-go is enabled.
- **Accuracy:** Excellent — purpose-built document OCR with bounding boxes; widely praised in 2026 for clean structured extraction.
- **Privacy:** Best-in-class — **zero retention** on API endpoints.
- **Weaknesses:** Free allowance is modest (~2,500 pages/mo); free-mode rate limits are the lowest tier (~1 RPS). Output is raw document text (markdown), not classified fields — you'd still need parsing logic.
- Sources: https://github.com/mvalentsev/awesome-free-ai-coding/blob/HEAD/providers/mistral-free.md · https://www.computeleap.com/blog/baidu-unlimited-ocr-vs-mistral-ocr-4-document-parsing-2026/

## Option 5 — Azure AI Vision (Read) F0 tier — 5,000 transactions/month free

- **Cost:** F0 tier: **5,000 transactions/month free**, 20 transactions/minute. Industry-leading OCR accuracy with word-level bounding boxes.
- **Friction:** Requires an Azure account — signup needs **credit-card verification** (no charge on F0, but it's a real onboarding hurdle for Weston). Region availability limits for F0.
- **Vercel fit:** Fine via REST, but key/endpoint management + Azure portal overhead is the heaviest of all options. Async Read API (submit → poll for result) is clunkier than OCR.space's single call.
- Sources: https://voiceping.net/en/blog/research-commercial-ocr-api-benchmark-2026/ (F0 5,000/mo, 20/min, checked Sept 2026) · https://github.com/patriotnewsactivism/case-companion/blob/HEAD/OCR_SETUP.md

## Also considered (rejected)

- **Google Cloud Vision:** 1,000 units/month free forever, then ~$1.50/1,000. Rejected: requires GCP project + billing setup, far more friction than OCR.space for equal-or-less quota.
- **Puter.js "free unlimited Mistral OCR":** free with no key via puter.com's user-pays proxy — a third-party proxy in front of Mistral, no SLA, not appropriate for a business tool's pricing pipeline.

---

## Recommendation

### 1st choice: Keep Tesseract.js (client-side), fix the parser — $0, no key, private

The engine isn't the problem. On clean digital screenshots Tesseract reads text well; Weston's failure is classification (door vs windows vs misc), which a **structure-aware parser** fixes: parse per-card using the card header ("PRICE FOR EXTRA STRUT" → etc; "PRICE FOR INSULATED TEMPERED FULL VISION" / window keywords → windows; model-number header → door), take each card's **Net Price** (not the max price), instead of the current "biggest price = door" heuristic. This costs nothing, adds no quota/key/privacy risk, and matches Weston's "if what we're using is working, continue to use that."

### 2nd choice: OCR.space free tier as hosted fallback — $0, 25k req/mo, email-only key

If the client-side tesseract path stays flaky on his device, route the image through OCR.space from the serverless function: trivial integration, generous permanent free quota (25k/month ≫ his volume), no card. Keep the same structure-aware parser on its text output. This is also the best answer if Weston says "I already have an API key" — that key is most plausibly OCR.space (tesseract needs none), so confirm which key he has before building.

### 3rd choice: Gemini Flash-Lite as an "AI parse" upgrade — $0, ~1k req/day, Google account

Only if Weston wants the vision model to do the classification itself (one call → structured door/windows/misc JSON, no parser maintenance). Costs: dealer pricing data may train Google models, and free-tier quotas are subject to Google's changes. Implement as an optional toggle, not the default.

**What NOT to do:** don't pay for Mistral OCR or Azure for this — the free allowances are smaller than OCR.space's, the integration is heavier, and neither removes the need for classification logic.

---

## Suggested next step

Before writing code: confirm with Weston which API key he says he "already has set up" — if it's OCR.space, build path = keep tesseract client-side as primary, OCR.space as server fallback (both feeding the same structure-aware parser). If he has no key at all, path = tesseract only, which was always the plan and needs no key.
