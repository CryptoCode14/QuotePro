// ==UserScript==
// @name         QuotePro Quick Estimate
// @namespace    https://grandvalleygaragedoors.example/quotepro
// @version      1.4.1
// @description  Pull dealer costs off the iStore page, run them through the QuotePro pricing API, and fill the results into ServiceTitan estimate fields.
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      quotepro-7s2mex88k-pizza122202-9153s-projects.vercel.app
// @connect      quotepro-lz9rwghw6-pizza122202-9153s-projects.vercel.app
// @connect      grandvalley-quotepro.vercel.app
// @updateURL    https://grandvalley-quotepro.vercel.app/quotepro.user.js
// @downloadURL  https://grandvalley-quotepro.vercel.app/quotepro.user.js
// ==/UserScript==

/* ============================================================================
 * QuotePro Quick Estimate — Tampermonkey userscript
 *
 * WHAT IT DOES
 *   1. On the iStore (dealer portal) tab: auto-scrapes door / windows / misc
 *      costs off the page into a small panel, lets you tweak the pricing
 *      variables, calls your QuotePro POST /v1/calculate, and shows
 *      dealer_cost_total, double_cost, final_price (+ margin) with copy buttons.
 *   2. On the ServiceTitan tab: one click writes those numbers straight into
 *      the estimate fields — bypassing the paste rejection, because the
 *      script sets the field values programmatically (paste-blockers only
 *      intercept real paste gestures).
 *
 * SETUP (one time, per machine)
 *   1. Install Tampermonkey (free) from the Chrome Web Store.
 *   2. Open https://<your-quotepro-domain>/quotepro.user.js and click Install.
 *   3. Tampermonkey menu (puzzle-piece icon) -> "QuotePro: Set API key"
 *      and paste your per-user QuotePro API key (needs the `calculate` scope).
 *      Optional: "QuotePro: Set API URL" if your live domain differs.
 *   4. Fill in ISTORE_HOSTS / ST_HOSTS below (or ask Dorian to do it).
 *   Scripts sync across your machines via Chrome sync; updates install
 *   automatically whenever @version is bumped on the hosted file.
 *
 * HOSTING
 *   This file is served from your QuotePro app's public/ folder, so it lives
 *   at https://<your-quotepro-domain>/quotepro.user.js. The file itself holds
 *   NO secrets — your API key stays in Tampermonkey storage on each machine.
 *   Update checks default to the URL you installed from, so no metadata
 *   changes are needed per domain. If your API host isn't listed in @connect
 *   above, add a line for it.
 * ========================================================================== */

(function () {
  "use strict";

  // Top frame only: both sites embed iframes, and without this every frame
  // would spawn its own dock.
  if (window.top !== window.self) return;

  /* ------------------------------- CONFIG -------------------------------- */
  const CONFIG = {
    // Production API. (Old preview deployments sit behind Vercel SSO and
    // answer 401 before the key is ever checked — do not point this at one.)
    API_BASE_DEFAULT: "https://grandvalley-quotepro.vercel.app",

    // Hosts where each panel activates (host-only: order/estimate IDs in the
    // URL differ per customer, so we match the host, not the full URL).
    ISTORE_HOSTS: ["istorem.clopay.com"],
    ST_HOSTS: ["go.servicetitan.com"],

    // Optional: CSS selector narrowing the iStore cost area for the fallback
    // $-scan (e.g. "table.quote-lines"). The Net Price reader scans the whole
    // page. Leave "" for the default.
    ISTORE_SCOPE_SELECTOR: "",

    // ServiceTitan estimate fields: which QuotePro result number fills which
    // field. TODO: paste real CSS selectors once the estimate page is inspected.
    // key is one of: dealer_cost_total | double_cost | final_price | margin
    ST_FIELDS: [
      // { key: "final_price",       selector: "", label: "Final price" },
      // { key: "dealer_cost_total", selector: "", label: "Dealer cost" },
      // { key: "double_cost",       selector: "", label: "Double-cost check" },
    ],
  };

  // Window/glass classification keywords — same list as QuotePro's OCR parser
  // (src/lib/ocrParser.ts). A line item whose label contains one of these is
  // a windows cost, never miscellaneous.
  const WINDOW_KEYWORDS = [
    "WINDOW", "GLASS", "GLAZING", "LITE", "INSERT",
    "FULLVISION", "FULLVIEW", "VISION", "INSULAT",
  ];
  const DOOR_KEYWORDS = ["DOOR", "SECTIONAL", "OVERHEAD", "GARAGE DOOR"];

  const STORE = {
    key: "qp_api_key",
    apiBase: "qp_api_base",
    vars: "qp_vars",
    lastResult: "qp_last_result",
    fieldMap: "qp_field_map",
    docked: "qp_docked",
    pos: "qp_pos",
  };

  /* -------------------------------- utils -------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmt = (n) =>
    Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt$ = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n)));

  // Short display label for a scraped net-price card: the header before
  // "Multiplier:", with any price tail stripped.
  function shortLabel(label) {
    const m = String(label).match(/^(.*?)\s*Multiplier:/i);
    let s = (m ? m[1] : String(label)).replace(/\s+/g, " ").trim();
    s = s.replace(/\s*(List Price|Net Price).*$/i, "").trim();
    if (s.length > 48) s = s.slice(0, 48) + "\u2026";
    return s || String(label).slice(0, 48);
  }

  function parseMoney(text) {
    // Matches $1,234.56 / 1234.56 / $45, and negatives (-59.83, (59.83)) —
    // the iStore prints credit lines (e.g. a track-mount credit) as plain
    // negative amounts with no $ sign.
    const t = String(text).replace(/[\u2212\u2013]/g, "-");
    const m = t.match(/(-)?\s*\$?\s*(\()?([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})|[0-9]+\.[0-9]{2}|[0-9][0-9,]*)(\))?/);
    if (!m) return null;
    let n = Number(m[3].replace(/[$,\s]/g, ""));
    if (m[1] || (m[2] && m[4])) n = -n;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  const compact = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isPriceFor = (label) => /^\s*PRICE FOR\b/i.test(label || "");
  function isWindowsLabel(label) {
    const t = compact(label);
    // Negations ("NO WINDOWS", "WITHOUT WINDOWS", "WINDOWLESS") mean no windows:
    // the iStore prints "SOLID (NO WINDOWS)" on solid doors.
    if (/\bNO\s+WINDOWS?\b/i.test(label) ||
        /\bWITHOUT\s+WINDOWS?\b/i.test(label) ||
        /WINDOWLESS/i.test(label)) return false;
    const glassWord = /WINDOW|GLASS|GLAZING|LITE|INSERT|FULLVISION|FULLVIEW|VISION/.test(t);
    // "INSULAT..." alone is insulation (e.g. "PRICE FOR INSULATED"), not
    // windows — it needs a glass-specific companion word to count.
    if (/INSULAT/.test(t) && !glassWord) return false;
    return glassWord;
  }
  function isDoorLabel(label) {
    // "PRICE FOR ..." cards are add-ons/options, never the door itself.
    if (isPriceFor(label)) return false;
    return DOOR_KEYWORDS.some((k) => compact(label).includes(k));
  }
  // An item whose label IS a product line ("16' 0\" X 8' 0\" | 9203 | ...")
  // is a per-product subtotal row, not a line item.
  function isProductLineLabel(label) {
    const t = label || "";
    if (/Product\s*:/i.test(t)) return true;
    return /^\s*\d+\s*'\s*\d*\s*"?\s*x\s*\d+\s*'\s*\d*\s*"?\s*\|/i.test(t);
  }
  // Every model number from every "Product:" line on the page (multi-door
  // orders list one product group per door).
  function parseDoorModels() {
    const models = [];
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/Product\s*:/i.test(node.nodeValue || "")) {
          const host = node.parentElement;
          const t = host ? host.textContent : node.nodeValue;
          const m = t.match(/Product\s*:\s*[^|]+\|\s*([^|]+)/i);
          if (m) {
            const model = m[1].replace(/\s+/g, " ").trim();
            if (model && models.indexOf(model) === -1) models.push(model);
          }
        }
      }
    } catch (e) { /* noop */ }
    return models;
  }

  const getApiKey = () => GM_getValue(STORE.key, "");
  const getApiBase = () =>
    (GM_getValue(STORE.apiBase, "") || CONFIG.API_BASE_DEFAULT).replace(/\/+$/, "");
  const getVars = () =>
    Object.assign(
      { multiplier: 1.0, base: 2000, pct: 25, installation: 0, fuel: 0 },
      GM_getValue(STORE.vars, {})
    );
  const getLastResult = () => GM_getValue(STORE.lastResult, null);

  function copyText(text, btn) {
    const done = () => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = orig), 1200);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(text)).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* noop */ }
    ta.remove();
    done();
  }

  /* ------------------------- programmatic field fill ---------------------- */
  // Sets a field's value the way frameworks (React etc.) require: via the
  // native value setter + bubbling input/change events. This bypasses
  // onPaste blockers entirely — they only fire on real paste gestures.
  function fillField(el, value) {
    if (!el) return false;
    try {
      el.focus({ preventScroll: true });
    } catch (e) { el.focus(); }
    const str = String(value);
    let setter = null;
    try {
      const proto =
        el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      setter = desc && desc.set;
    } catch (e) { /* fall through to direct assignment */ }
    if (setter) setter.call(el, str);
    else el.value = str;
    el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    // React 16+ value tracker workaround: re-set via native setter if the
    // framework swallowed the first one.
    try {
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue("");
    } catch (e) { /* noop */ }
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    try { el.blur(); } catch (e) { /* noop */ }
    return true;
  }

  // Text-field fill for estimate title / summary / door description. ST's
  // line-item description editor only registers real keystrokes, so this
  // tries (1) the native value setter + events, then (2) execCommand
  // insertText as real keystrokes for contenteditable popups. Returns whether
  // the value stuck — Copy is always the fallback.
  function fillTextField(el, text) {
    if (!el) return false;
    const str = String(text == null ? "" : text);
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      let setter = null;
      try {
        const proto = tag === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        setter = desc && desc.set;
      } catch (e) { /* fall through */ }
      if (setter) setter.call(el, str);
      else el.value = str;
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      try { const tr = el._valueTracker; if (tr) tr.setValue(""); } catch (e) { /* noop */ }
      el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      try { el.blur(); } catch (e) { /* noop */ }
      return el.value === str;
    }
    // contenteditable (ST's inline description popup)
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(el);
    } catch (e) { /* noop */ }
    let ok = false;
    try { ok = document.execCommand("insertText", false, str); } catch (e) { ok = false; }
    if (!ok) {
      try { el.textContent = str; ok = true; } catch (e) { /* noop */ }
    }
    el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    const cur = (el.innerText != null ? el.innerText : el.textContent) || "";
    return cur.replace(/\s+$/, "") === str.replace(/\s+$/, "") || ok;
  }

  /* ------------------------------ API client ------------------------------ */
  function apiCalculate(body, onOk, onErr) {
    const key = getApiKey();
    if (!key) {
      onErr("No API key set yet \u2014 paste it in the key field at the top of this panel, " +
        "or via the Tampermonkey toolbar menu under QuotePro Quick Estimate \u2192 'QuotePro: Set API key'.");
      return;
    }
    GM_xmlhttpRequest({
      method: "POST",
      url: getApiBase() + "/v1/calculate",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      data: JSON.stringify(body),
      timeout: 20000,
      onload: (res) => {
        let data = null;
        try { data = JSON.parse(res.responseText); } catch (e) { /* handled below */ }
        if (res.status >= 200 && res.status < 300 && data) {
          onOk(data);
        } else if (res.status === 401) {
          onErr("API key rejected (401). Check the key via the Tampermonkey menu.");
        } else if (res.status === 403) {
          onErr("Key lacks the 'calculate' scope (403). Mint a key with calculate checked.");
        } else {
          onErr(
            "QuotePro error " + res.status + ": " +
            ((data && (data.error || data.message)) || res.responseText || "unknown").toString().slice(0, 200)
          );
        }
      },
      onerror: () => onErr("Network error reaching the QuotePro API. Check the API URL / @connect host."),
      ontimeout: () => onErr("QuotePro API timed out."),
    });
  }

  /* ------------------------- estimate text engine ------------------------- */
  // Builds Weston's estimate title / summary / door-description texts from a
  // door profile extracted off the iStore page. Conventions encoded from his
  // ServiceTitan style guide:
  // - NEVER an em dash anywhere; sizes ALWAYS width x height
  // - summary uses x-sizes ("16x8"); door-desc line 1 uses feet/inch marks
  //   when inches are present ("10'2\"x8'"), x-sizes when whole-foot
  // - the Summary NEVER contains a price breakdown; never leave it blank

  // Window phrases as they actually appear across 1,419 real estimates
  // (learned 2026-10-20 via the ServiceTitan Bridge).
  const WINDOWS_VARIANTS = [
    "Solid No Windows",
    "Solid, No Windows",
    "No Windows",
    "Insulated Windows",
    "Insulated Windows Top Section",
    "Insulated Windows SQ24 Design",
    "Insulated Windows, 24x12",
    "Full Vision Insulated Glass 4th Section",
    "Insulated Tempered Windows",
    "Windows Top Section",
  ];

  // Model -> series, majority usage per model across the estimate history.
  // 4050/4300/4310/9200/9203 appear under two series names in the data, so
  // these are defaults; the Series field stays editable.
  const SERIES_MAP = {
    "4050": "Classic Steel", "4053": "Classic Steel",
    "4300": "Classic Steel", "4310": "Classic Steel",
    "9130": "Classic Steel", "9133": "Classic Steel", "9203": "Classic Steel",
    "9200": "Premium Series",
    "4132": "Modern Steel", "4308": "Modern Steel",
    "9208": "Modern Steel", "9209": "Modern Steel",
    "3150": "Commercial", "3200": "Commercial", "3211": "Commercial",
    "3715": "Commercial", "3717": "Commercial", "3720": "Commercial",
    "3722": "Commercial", "3723": "Commercial", "3724": "Commercial",
    "3730": "Commercial",
    "524": "Commercial", "524S": "Commercial", "524V": "Commercial",
    "525S": "Commercial",
    "T50L": "T50L",
  };

  const CLOSERS = [
    "Door Removal",
    "No Opener",
    "No Openers",
    "No Door Removal",
    "Door Removal\nNo Opener",
    "No Opener\nDoor Removal",
    "No Installation",
    "Customer Pickup No Installation",
    "Door Removal and Reconnect to Existing Opener",
    "NO OPENERS, Reconnect to existing Openers",
  ];

  const CLOPAY_COLORS = [
    "Standard White", "Commercial White", "Almond", "Desert Tan", "Sandtone",
    "Commercial Beige", "Commercial Tan", "Bronze", "Chocolate", "Mocha Brown",
    "Charcoal", "Black", "Hunter Green", "Gray", "Walnut Finish", "Dark Finish",
    "Medium Finish", "Cherry Finish", "Slate Finish",
  ];

  const noEmDash = (s) =>
    String(s == null ? "" : s).replace(/\u2014/g, "-").replace(/\u2013/g, "-");

  // "12\" RADIUS" -> "12\" Radius" for prefilled estimate fields.
  const toTitleCase = (s) =>
    String(s || "").toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

  // "16' 0\" x 8' 0\"" -> {wFt:16,wIn:0,hFt:8,hIn:0}; null when unparseable.
  function parseSizeStr(s) {
    const m = String(s || "").match(/(\d+)\s*'\s*(\d*)\s*"?\s*x\s*(\d+)\s*'\s*(\d*)\s*"?/i);
    if (!m) return null;
    return { wFt: +m[1], wIn: +(m[2] || 0), hFt: +m[3], hIn: +(m[4] || 0) };
  }
  function fmtXSize(sz) {
    if (!sz) return "";
    // Whole-foot sizes stay plain ("16x8"). Once either dimension carries
    // inches, both render in feet/inch marks ("10'2\"x8'", "10'x6'6\"").
    if (!sz.wIn && !sz.hIn) return sz.wFt + "x" + sz.hFt;
    return fmtFeetSize(sz);
  }
  function fmtFeetSize(sz) {
    if (!sz) return "";
    const bit = (f, i) => f + "'" + (i ? i + '"' : "");
    return bit(sz.wFt, sz.wIn) + "x" + bit(sz.hFt, sz.hIn);
  }

  function mapWindowsVariant(seg) {
    const s = String(seg || "").trim();
    if (!s) return "";
    if (/no\s*windows|without\s*windows|windowless/i.test(s)) {
      return /solid/i.test(s) ? "Solid, No Windows" : "No Windows";
    }
    const hit = WINDOWS_VARIANTS.find((v) => v.toLowerCase() === s.toLowerCase());
    if (hit) return hit;
    if (/full\s*vision|fullvision|fullview/i.test(s)) return "Full Vision Insulated Glass";
    // A window design segment such as "PLAIN LONG 40 1/2 X 12" becomes
    // Weston's phrase "Insulated Windows, Plain Long 40 1/2 x 12".
    const style = s.match(/(plain\s+(?:long|short)|sq\s*24|arch\s*\d+|rec\s*\d+)/i);
    if (style) {
      if (/sq\s*24/i.test(style[1])) return "Insulated Windows SQ24 Design";
      let st = toTitleCase(style[1].replace(/\s+/g, " "))
        .replace(/^(Arch|Rec)(\d+)$/i, (m, a, n) => a.toUpperCase() + n);
      const wsize = s.match(/(\d+(?:\s+\d+\/\d+)?)\s*x\s*(\d+(?:\s+\d+\/\d+)?)/i);
      const sz = wsize ? (wsize[1].replace(/\s+/g, " ").trim() + " x " + wsize[2].replace(/\s+/g, " ").trim()) : "";
      return ("Insulated Windows, " + st + (sz ? " " + sz : "")).trim();
    }
    if (/top\s*section/i.test(s)) return "Insulated Windows Top Section";
    return toTitleCase(s);
  }

  // Track / radius live in free-floating product-line segments (for example
  // '2" FLAG & JAMB BRACKETS LOOSE', '12" RADIUS'), not in a "track" segment,
  // so read them off the whole product text.
  // Weston, 2026-10-20: descriptions carry just the track size + "Track"
  // ("2\" Track"). Bracket kinds are NOT named (no more Flag & Jamb) —
  // the only kinds spelled out are Reverse Angle and Continuous Angle.
  function mapTrackFromText(rest) {
    if (/LOW\s+HEADROOM|\bLHR\b/i.test(rest)) return "Low Headroom Track";
    const sizeM = rest.match(/(\d+(?:\.\d+)?)\s*"\s*(?:FLAG|REVERSE|CONTINUOUS|CA\b|RA\b|BRACKET|TRACK)/i);
    const hasTrack = /FLAG|JAMB|BRACKET|ANGLE|\bTRACK\b|MOUNT/i.test(rest);
    if (!sizeM && !hasTrack) return "";
    const size = sizeM ? sizeM[1] : "2";
    if (/REVERSE\s+ANGLE|\bRA\s+BRACKET|\bRA\s+TRACK\b/i.test(rest)) return size + '" Reverse Angle Track';
    if (/CONTINUOUS\s+ANGLE|\bCA\s+BRACKET|\bCA\s+TRACK\b/i.test(rest)) return size + '" Continuous Angle Track';
    return size + '" Track';
  }
  function mapRadiusFromText(rest) {
    const hlt = rest.match(/(\d+(?:\.\d+)?)\s*"?\s*HLT/i);
    if (hlt) return hlt[1] + '" HLT Radius';
    const m = rest.match(/(\d+(?:\.\d+)?)\s*"\s*RADIUS/i);
    if (m) return m[1] + '" Radius';
    if (/\bLHR\b|LOW\s+HEADROOM/i.test(rest)) return "LHR Radius";
    return "";
  }

  // Pull the door profile off the iStore Pricing Details modal. The modal
  // header carries a pipe-separated "Product:" line, e.g.
  // "Product: 16' 0\" x 8' 0\" | 4300 | COMPLETE DOOR | SOLID (NO WINDOWS) | ...".
  function parseDoorProfile() {
    const profile = {
      size: null, sizeRaw: "", model: "", series: "",
      color: "", windows: "", insulation: "", track: "", radius: "",
    };
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let prodText = "", node;
      while ((node = walker.nextNode())) {
        if (/Product\s*:/i.test(node.nodeValue || "")) {
          const host = node.parentElement;
          const t = host ? host.textContent : node.nodeValue;
          if (/\|/.test(t)) { prodText = t; break; }
        }
      }
      const m = prodText.match(/Product\s*:\s*([^|]+)\|(.+)/i);
      if (!m) return profile;
      const segs = [m[1]].concat(m[2].split("|"))
        .map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      profile.size = parseSizeStr(segs[0] || "");
      profile.sizeRaw = segs[0] || "";
      profile.model = segs[1] || "";
      const rest = segs.slice(2).join(" | ");
      for (const c of CLOPAY_COLORS) {
        if (new RegExp(c.replace(/[()]/g, ""), "i").test(rest)) { profile.color = c; break; }
      }
      profile.color = profile.color
        .replace(/^(Standard|Commercial)\s+/i, "").replace(/\s*\(Trinar\)\s*/i, "").trim();
      profile.windows = mapWindowsVariant(
        segs.find((s) => /window|plain\s+(long|short)|sq\s*24|arch\s*\d|rec\s*\d|full\s*vision/i.test(s)) || "");
      const secm = rest.match(/SECTION\s*(\d+)/i);
      if (secm && profile.windows && /insulated|full vision/i.test(profile.windows) &&
          !/section/i.test(profile.windows)) {
        if (/^Full Vision/i.test(profile.windows)) {
          const ord = { "1": "1st", "2": "2nd", "3": "3rd" }[secm[1]] || secm[1] + "th";
          profile.windows += " " + ord + " Section";
        } else {
          profile.windows += ", Section " + secm[1];
        }
      }
      const iseg = segs.find((s) => /insulat|r-value|polystyrene|polyurethane|intellicore/i.test(s)) || "";
      if (iseg) profile.insulation = toTitleCase(iseg);
      profile.track = mapTrackFromText(rest);
      if (!profile.track) {
        const tseg = segs.find((s) => /track/i.test(s)) || "";
        if (tseg) profile.track = toTitleCase(tseg);
      }
      profile.radius = mapRadiusFromText(rest);
      if (!profile.radius) {
        const rseg = segs.find((s) => /radius/i.test(s)) || "";
        if (rseg) profile.radius = toTitleCase(rseg);
      }
    } catch (e) { /* best effort; every field stays editable */ }
    profile.series = SERIES_MAP[profile.model] ||
      (/^(CAN|CED)/i.test(profile.model) ? "Canyon Ridge" : profile.model);
    return profile;
  }

  // profile: {jobType, series, model, size, color, windows, insulation, track,
  //           radius, closer, titleOption, openerRows[], serviceTitle, serviceSummary}
  // returns {title, summary, doorDescs[]}
  function genEstimateTexts(p) {
    const out = { title: "", summary: "", doorDescs: [] };
    const sizeX = fmtXSize(p.size);
    if (p.jobType === "service") {
      out.title = noEmDash(p.serviceTitle || "");
      out.summary = noEmDash(p.serviceSummary || "");
      return out;
    }
    // Commercial titles carry the model: "Clopay Commercial 3722 10'2\"x8' Door".
    let title;
    if (p.series === "Commercial" && p.model) {
      title = ("Clopay Commercial " + p.model + " " + sizeX + " Door")
        .replace(/\s+/g, " ").trim();
    } else {
      title = ("Clopay " + [p.series, sizeX].filter(Boolean).join(" ") + " Door")
        .replace(/\s+/g, " ").trim();
    }
    if (p.titleOption) title += " (" + p.titleOption.trim() + ")";
    out.title = noEmDash(title);

    const head = [p.model, sizeX].filter(Boolean).join(" ");
    const tail = [p.color, p.windows, p.track, p.radius].filter(Boolean).join(", ");
    const rows = [tail ? head + ", " + tail : head];
    (p.openerRows || []).forEach((r) => { const t = r.trim(); if (t) rows.push(t); });
    rows.push(p.closer || "No Opener");
    out.summary = noEmDash(rows.join("\n"));

    const sz1 = (p.size && (p.size.wIn || p.size.hIn)) ? fmtFeetSize(p.size) : sizeX;
    const lines = [
      ["Clopay", p.model, sz1, "Garage Door"].filter(Boolean).join(" "),
      p.color ? "Color: " + p.color : "",
      p.insulation || "",
      [p.track, p.radius].filter(Boolean).join(", "),
      p.windows || "",
    ].filter((l) => l.trim() !== "");
    out.doorDescs = [noEmDash(lines.join("\n"))];
    return out;
  }

  /* ------------------------------- panel UI ------------------------------- */
  // v1.3.0 shell: machined-metal floating panel + dock, per the design
  // research in ~/workspace/research_notes/premium-floating-dock-ui-20261020-1630.
  // One light source from the top, hairline ring shadows instead of borders,
  // brushing + grain texture, Inter with a system fallback stack, tabular
  // numerals, strong ease-out curves, spring snap on drag release.
  const NOISE_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
  const QP_ICON = "data:image/png;base64,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";
  const PANEL_CSS = `
    .qp-panel, .qp-dock {
      --ease-out: cubic-bezier(.23,1,.32,1);
      --ease-drawer: cubic-bezier(.32,.72,0,1);
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
      color: rgba(255,255,255,.92);
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 38%),
        linear-gradient(180deg, #26282c 0%, #1b1c1f 55%, #151619 100%);
      box-shadow:
        0 0 0 1px rgba(255,255,255,.08),
        inset 0 1px 0 rgba(255,255,255,.10),
        inset 0 -1px 0 rgba(0,0,0,.55),
        inset 0 12px 24px -12px rgba(255,255,255,.05),
        inset 0 -18px 28px -18px rgba(0,0,0,.6),
        0 1px 2px rgba(0,0,0,.45),
        0 8px 16px rgba(0,0,0,.38),
        0 24px 56px -12px rgba(0,0,0,.55);
    }
    .qp-panel::before, .qp-dock::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      pointer-events: none; z-index: 0;
      background: repeating-linear-gradient(90deg,
        rgba(255,255,255,.016) 0 1px, rgba(0,0,0,.016) 1px 2px);
      background-size: 2px 100%;
    }
    .qp-panel::after, .qp-dock::after {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      pointer-events: none; z-index: 0; opacity: .045; mix-blend-mode: overlay;
      background-image: url("${NOISE_URI}"); background-size: 180px 180px;
    }
    .qp-panel { position: fixed; z-index: 2147483647; width: 328px; max-height: 86vh;
      border-radius: 20px; display: flex; flex-direction: column; overflow: hidden;
      isolation: isolate; font-size: 13px; line-height: 1.45;
      transition: opacity .22s var(--ease-out), transform .28s var(--ease-drawer); }
    .qp-panel.qp-min { opacity: 0; transform: scale(.96); pointer-events: none; }
    .qp-panel.qp-dragging, .qp-dock.qp-dragging { transition: none; }
    .qp-panel.qp-dragging { box-shadow:
        0 0 0 1px rgba(255,255,255,.10),
        inset 0 1px 0 rgba(255,255,255,.12),
        inset 0 -1px 0 rgba(0,0,0,.55),
        0 2px 4px rgba(0,0,0,.5),
        0 16px 32px rgba(0,0,0,.45),
        0 40px 80px -12px rgba(0,0,0,.6); }
    .qp-head { position: relative; z-index: 1; display: flex; align-items: center;
      padding: 11px 12px 11px 10px; cursor: grab; user-select: none; touch-action: none;
      border-bottom: 1px solid rgba(255,255,255,.06); }
    .qp-head:active { cursor: grabbing; }
    .qp-grip { flex: 0 0 auto; width: 12px; height: 20px; margin-right: 9px; opacity: .45;
      background-image: radial-gradient(circle, rgba(255,255,255,.5) 1px, transparent 1.4px);
      background-size: 5px 5px; background-position: 1px 2px; }
    .qp-head b { flex: 1; font-size: 13px; font-weight: 600; letter-spacing: -.011em;
      color: rgba(255,255,255,.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qp-head .qp-x { flex: 0 0 auto; cursor: pointer; border: 0; width: 24px; height: 24px;
      border-radius: 50%; font-size: 13px; line-height: 1; color: rgba(255,255,255,.75);
      background: linear-gradient(180deg, #34363b, #26282c);
      box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.12),
        inset 0 -1px 0 rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.4);
      transition: transform .12s var(--ease-out), color .12s ease; }
    .qp-head .qp-x:hover { color: #fff; }
    .qp-head .qp-x:active { transform: scale(.94); }
    .qp-ver { position: relative; z-index: 1; padding: 2px 14px 10px; font-size: 10px;
      letter-spacing: .05em; color: #71757d; text-align: right; }
    .qp-body { position: relative; z-index: 1; padding: 14px; overflow-y: auto; flex: 1;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.16) transparent; }
    .qp-body::-webkit-scrollbar { width: 8px; }
    .qp-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 4px; }
    .qp-body::-webkit-scrollbar-track { background: transparent; }
    .qp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .qp-row label { flex: 0 0 92px; color: rgba(255,255,255,.55); font-size: 10.5px;
      font-weight: 600; letter-spacing: .09em; text-transform: uppercase; }
    .qp-row input, .qp-row select { flex: 1; min-width: 0; border: 0; border-radius: 10px;
      background: linear-gradient(180deg, #101112, #141518); color: rgba(255,255,255,.92);
      box-shadow: inset 0 1px 3px rgba(0,0,0,.7), inset 0 -1px 0 rgba(255,255,255,.05),
        0 0 0 1px rgba(255,255,255,.05);
      padding: 8px 10px; font: inherit; font-size: 13px; font-weight: 500;
      font-variant-numeric: tabular-nums; }
    .qp-row input:focus, .qp-row select:focus { outline: none;
      box-shadow: inset 0 1px 3px rgba(0,0,0,.7), inset 0 -1px 0 rgba(255,255,255,.05),
        0 0 0 1px rgba(96,150,255,.65), 0 0 0 4px rgba(47,111,237,.20); }
    .qp-row input.qp-guess { box-shadow: inset 0 1px 3px rgba(0,0,0,.7),
      inset 0 -1px 0 rgba(255,255,255,.05), 0 0 0 1px rgba(230,180,60,.55); }
    .qp-note { font-size: 11.5px; color: rgba(255,255,255,.45); margin: 6px 0 10px; }
    .qp-btn { width: 100%; border: 0; border-radius: 11px; padding: 11px; font: inherit;
      font-size: 13.5px; font-weight: 600; letter-spacing: -.006em; cursor: pointer;
      color: #fff; margin-bottom: 8px;
      background: linear-gradient(180deg, #3d7bf0, #2f6fed 55%, #2a63d8);
      box-shadow: 0 0 0 1px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.28),
        inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 10px rgba(47,111,237,.35);
      transition: transform .12s var(--ease-out), filter .14s ease, box-shadow .14s ease; }
    .qp-btn:hover { filter: brightness(1.07); }
    .qp-btn:active { transform: translateY(.5px); box-shadow: 0 0 0 1px rgba(0,0,0,.45),
      inset 0 2px 5px rgba(0,0,0,.4), inset 0 -1px 0 rgba(255,255,255,.06); }
    .qp-btn.qp-secondary { color: rgba(255,255,255,.88);
      background: linear-gradient(180deg, #34363b, #26282c);
      box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.12),
        inset 0 -1px 0 rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.4); }
    .qp-btn.qp-secondary:hover { filter: brightness(1.12); }
    .qp-btn:disabled { opacity: .55; cursor: default; }
    .qp-err { background: rgba(122,32,32,.28); box-shadow: 0 0 0 1px rgba(255,120,120,.25);
      color: #f3c1c1; border-radius: 10px; padding: 8px 10px; font-size: 12px;
      margin-bottom: 8px; display: none; }
    .qp-res { border-top: 1px solid rgba(255,255,255,.06); margin-top: 4px; padding-top: 10px; display: none; }
    .qp-res .qp-rrow { display: flex; align-items: center; justify-content: space-between;
      padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,.07); }
    .qp-res .qp-rrow:last-child { border-bottom: 0; }
    .qp-res .qp-k { color: rgba(255,255,255,.55); font-size: 10.5px; font-weight: 600;
      letter-spacing: .09em; text-transform: uppercase; }
    .qp-res .qp-v { font-weight: 600; font-size: 14px; letter-spacing: -.01em;
      font-variant-numeric: tabular-nums; }
    .qp-res .qp-v.qp-final { color: #7ee2a8; font-size: 18px; letter-spacing: -.02em; }
    .qp-copy { border: 0; border-radius: 8px; font: inherit; font-size: 11px; font-weight: 600;
      padding: 5px 10px; cursor: pointer; margin-left: 8px; color: rgba(255,255,255,.82);
      background: linear-gradient(180deg, #34363b, #26282c);
      box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.12),
        inset 0 -1px 0 rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.35);
      transition: transform .12s var(--ease-out), filter .14s ease; }
    .qp-copy:hover { filter: brightness(1.14); }
    .qp-copy:active { transform: scale(.96); }
    .qp-ok { color: #7ee2a8; font-size: 12px; margin-top: 6px; display: none; }
    .qp-dock { position: fixed; z-index: 2147483647; isolation: isolate;
      padding: 11px 13px 10px; border-radius: 18px; overflow: hidden;
      cursor: grab; user-select: none; touch-action: none;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      transition: opacity .2s var(--ease-out), transform .24s var(--ease-drawer), filter .16s ease; }
    .qp-dock:hover { filter: brightness(1.1); }
    .qp-dock:active { cursor: grabbing; }
    .qp-dock.qp-hidden { opacity: 0; transform: scale(.9); pointer-events: none; }
    .qp-dock .qp-dock-mark { position: relative; z-index: 1; width: 40px; height: 40px;
      border-radius: 12px; flex-shrink: 0; background: #fff; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 1px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.9),
        inset 0 -1px 0 rgba(0,0,0,.08), 0 3px 10px rgba(0,0,0,.35); }
    .qp-dock .qp-dock-mark img { width: 100%; height: 100%; object-fit: contain;
      padding: 3px; box-sizing: border-box; display: block; pointer-events: none; }
    .qp-head-icon { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 7px;
      background: #fff; overflow: hidden; margin-right: 9px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 1px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.9),
        0 1px 3px rgba(0,0,0,.35); }
    .qp-head-icon img { width: 100%; height: 100%; object-fit: contain; padding: 2px;
      box-sizing: border-box; display: block; pointer-events: none; }
    .qp-dock .qp-dock-label { position: relative; z-index: 1; letter-spacing: .22em;
      font-size: 8.5px; font-weight: 700; color: rgba(255,255,255,.48); padding-left: .22em; }
    .qp-dock .qp-dock-total { position: relative; z-index: 1; font-size: 11px; font-weight: 700;
      color: #7ee2a8; font-variant-numeric: tabular-nums; max-width: 74px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .qp-liquid { position: fixed; left: 0; top: 0; z-index: 1; pointer-events: none;
      overflow: visible; visibility: hidden;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)) drop-shadow(0 18px 30px rgba(0,0,0,.35)); }
    .qp-dock.qp-dock-h { flex-direction: row; padding: 10px 14px; gap: 10px; }
    .qp-dock.qp-dock-h .qp-dock-label { padding-left: 0; }
    .qp-dock.qp-dock-h .qp-dock-total { max-width: 96px; }
    @media (prefers-reduced-motion: reduce) {
      .qp-panel, .qp-dock, .qp-btn, .qp-copy, .qp-head .qp-x { transition-duration: .01ms !important; }
    }
  `;

  function makePanel(title) {
    // Tier-1 webfont: Inter from Google Fonts. Host-page CSP may refuse it,
    // in which case the system stack in PANEL_CSS carries the design.
    try {
      if (!document.querySelector("link[data-qp-font]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.setAttribute("data-qp-font", "1");
        l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
        document.head.appendChild(l);
      }
    } catch (e) { /* fallback stack applies */ }

    const host = document.createElement("div");
    host.id = "qp-host";
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const panel = document.createElement("div");
    panel.className = "qp-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    panel.innerHTML =
      '<div class="qp-head"><span class="qp-grip"></span>' +
      '<span class="qp-head-icon"><img src="' + QP_ICON + '" alt=""></span><b>' + title + '</b>' +
      '<button class="qp-x" title="Dock (Alt+Q)">\u2013</button></div>' +
      '<div class="qp-body"></div>';
    shadow.appendChild(style);
    // Liquid silhouette layer: an SVG meniscus bridge rendered behind the
    // panel/pill (sized to the element + margin, never the full viewport),
    // shadowed with CSS drop-shadow so the flare and body read as one
    // liquid object when the dock bleeds into a screen edge.
    const svgNS = "http://www.w3.org/2000/svg";
    const liquid = document.createElementNS(svgNS, "svg");
    liquid.setAttribute("class", "qp-liquid");
    const defs = document.createElementNS(svgNS, "defs");
    const grad = document.createElementNS(svgNS, "linearGradient");
    grad.setAttribute("id", "qpMetal");
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    [["0", "#26282c"], ["0.55", "#1b1c1f"], ["1", "#151619"]].forEach((pair) => {
      const stop = document.createElementNS(svgNS, "stop");
      stop.setAttribute("offset", pair[0]);
      stop.setAttribute("stop-color", pair[1]);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    liquid.appendChild(defs);
    const bridge = document.createElementNS(svgNS, "path");
    bridge.setAttribute("class", "qp-bridge");
    bridge.setAttribute("fill", "url(#qpMetal)");
    liquid.appendChild(bridge);
    shadow.appendChild(liquid);
    shadow.appendChild(panel);

    // Floating dock pill: lives wherever the panel was left, detached from
    // the screen edge. Click expands, drag repositions, double-click resets.
    const dock = document.createElement("div");
    dock.className = "qp-dock";
    dock.title = "QuotePro \u2014 click to expand, drag to move";
    const dockMark = document.createElement("span");
    dockMark.className = "qp-dock-mark";
    const dockImg = document.createElement("img");
    dockImg.src = QP_ICON;
    dockImg.alt = "QuotePro";
    dockImg.draggable = false;
    dockMark.appendChild(dockImg);
    const dockLabel = document.createElement("span");
    dockLabel.className = "qp-dock-label";
    dockLabel.textContent = "QUOTEPRO";
    const dockTotal = document.createElement("span");
    dockTotal.className = "qp-dock-total";
    dockTotal.style.display = "none";
    dock.appendChild(dockMark);
    dock.appendChild(dockLabel);
    dock.appendChild(dockTotal);
    shadow.appendChild(dock);
    document.documentElement.appendChild(host);

    /* ---- position: shared anchor, stored as viewport fractions ---- */
    const MARGIN = 14;
    let anchor = GM_getValue(STORE.pos, null) || { fx: 0.012, fy: 0.30 };
    const clampFor = (el, fx, fy) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = el.offsetWidth || 60, h = el.offsetHeight || 60;
      return {
        x: Math.min(Math.max(Math.round(fx * vw), 8), Math.max(8, vw - w - 8)),
        y: Math.min(Math.max(Math.round(fy * vh), 8), Math.max(8, vh - h - 8)),
      };
    };
    // Elements being dragged or springing own their position. place()
    // calls from refreshes/resize must not fight them (post-drag blink).
    const busyEls = new Set();
    /* ---- liquid state ---- */
    const EDGES = ["left", "right", "top", "bottom"];
    let snappedEdge = EDGES.indexOf(anchor.edge) >= 0 ? anchor.edge : null;
    let engEdge = snappedEdge;
    let bleedCur = snappedEdge ? 1 : 0;
    let tensionCur = 0;
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const clampAlong = (v, size, total) =>
      Math.min(Math.max(Math.round(v), 8), Math.max(8, total - size - 8));
    const activeEl = () => (panel.classList.contains("qp-min") ? dock : panel);
    // Contoured merge: the wall-side corner radius flattens as bleed -> 1.
    const applyContour = (el, edge, bleed) => {
      const r = el === dock ? 18 : 20;
      if (!edge || bleed < 0.45) { el.style.borderRadius = ""; return; }
      const flat = Math.max(0, Math.round(r * (1 - smooth(0.45, 1, bleed))));
      if (edge === "left") el.style.borderRadius = flat + "px " + r + "px " + r + "px " + flat + "px";
      else if (edge === "right") el.style.borderRadius = r + "px " + flat + "px " + flat + "px " + r + "px";
      else if (edge === "top") el.style.borderRadius = flat + "px " + flat + "px " + r + "px " + r + "px";
      else el.style.borderRadius = r + "px " + r + "px " + flat + "px " + flat + "px";
    };
    // Meniscus bridge: a flared tongue of metal from the engaged wall to
    // the element's near edge, tips spreading along the wall. Adapted from
    // Weston's liquid-dock prototype (flare ~95-105px, wall-tangent
    // beziers, neck pinch under tear tension), drawn flare-only because
    // the element renders its own body on top.
    const PAD = 150;
    const renderBridge = () => {
      const edge = engEdge;
      if (!edge || bleedCur <= 0.01) {
        bridge.setAttribute("d", "");
        liquid.style.visibility = "hidden";
        return;
      }
      const el = activeEl();
      const rect = el.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (w < 4 || h < 4) { bridge.setAttribute("d", ""); return; }
      liquid.style.visibility = "visible";
      liquid.setAttribute("width", Math.round(w + PAD * 2));
      liquid.setAttribute("height", Math.round(h + PAD * 2));
      liquid.style.transform =
        "translate3d(" + Math.round(rect.left - PAD) + "px," + Math.round(rect.top - PAD) + "px,0)";
      grad.setAttribute("x1", "0");
      grad.setAttribute("x2", "0");
      grad.setAttribute("y1", String(PAD));
      grad.setAttribute("y2", String(PAD + h));
      const tension = tensionCur;
      const flare = (el === dock ? 105 : 95) * Math.min(1, bleedCur) * (1 - tension * 0.35);
      const vw = window.innerWidth, vh = window.innerHeight;
      let d = "";
      if (edge === "left" || edge === "right") {
        const gap = Math.max(0, edge === "left" ? rect.left : vw - rect.right);
        const pinch = gap * tension * 0.40;
        const neck = Math.max(0, gap * (0.15 + (1 - tension) * 0.22) + w * 0.12 * (1 - tension * 0.5));
        const aTop = PAD + pinch, aBot = PAD + h - pinch;
        const topTip = PAD - flare, botTip = PAD + h + flare;
        if (edge === "left") {
          const wallX = PAD - gap, ax = PAD;
          d = "M " + wallX + " " + topTip +
            " C " + wallX + " " + (topTip + flare * 0.32) + ", " + (wallX + neck) + " " + aTop + ", " + ax + " " + aTop +
            " L " + ax + " " + aBot +
            " C " + (wallX + neck) + " " + aBot + ", " + wallX + " " + (botTip - flare * 0.32) + ", " + wallX + " " + botTip + " Z";
        } else {
          const wallX = PAD + w + gap, ax = PAD + w;
          d = "M " + wallX + " " + topTip +
            " C " + wallX + " " + (topTip + flare * 0.32) + ", " + (wallX - neck) + " " + aTop + ", " + ax + " " + aTop +
            " L " + ax + " " + aBot +
            " C " + (wallX - neck) + " " + aBot + ", " + wallX + " " + (botTip - flare * 0.32) + ", " + wallX + " " + botTip + " Z";
        }
      } else {
        const gap = Math.max(0, edge === "top" ? rect.top : vh - rect.bottom);
        const pinch = gap * tension * 0.40;
        const neck = Math.max(0, gap * (0.15 + (1 - tension) * 0.22) + h * 0.12 * (1 - tension * 0.5));
        const aLeft = PAD + pinch, aRight = PAD + w - pinch;
        const leftTip = PAD - flare, rightTip = PAD + w + flare;
        if (edge === "top") {
          const wallY = PAD - gap, ay = PAD;
          d = "M " + leftTip + " " + wallY +
            " C " + (leftTip + flare * 0.32) + " " + wallY + ", " + aLeft + " " + (wallY + neck) + ", " + aLeft + " " + ay +
            " L " + aRight + " " + ay +
            " C " + aRight + " " + (wallY + neck) + ", " + (rightTip - flare * 0.32) + " " + wallY + ", " + rightTip + " " + wallY + " Z";
        } else {
          const wallY = PAD + h + gap, ay = PAD + h;
          d = "M " + leftTip + " " + wallY +
            " C " + (leftTip + flare * 0.32) + " " + wallY + ", " + aLeft + " " + (wallY - neck) + ", " + aLeft + " " + ay +
            " L " + aRight + " " + ay +
            " C " + aRight + " " + (wallY - neck) + ", " + (rightTip - flare * 0.32) + " " + wallY + ", " + rightTip + " " + wallY + " Z";
        }
      }
      bridge.setAttribute("d", d);
    };
    const place = (el) => {
      if (busyEls.has(el)) return;
      if (el === dock) {
        dock.classList.toggle("qp-dock-h", snappedEdge === "top" || snappedEdge === "bottom");
      }
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = el.offsetWidth || 60, h = el.offsetHeight || 60;
      let p;
      if (snappedEdge === "left") p = { x: 0, y: clampAlong(anchor.fy * vh, h, vh) };
      else if (snappedEdge === "right") p = { x: vw - w, y: clampAlong(anchor.fy * vh, h, vh) };
      else if (snappedEdge === "top") p = { x: clampAlong(anchor.fx * vw, w, vw), y: 0 };
      else if (snappedEdge === "bottom") p = { x: clampAlong(anchor.fx * vw, w, vw), y: vh - h };
      else p = clampFor(el, anchor.fx, anchor.fy);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      applyContour(el, snappedEdge, snappedEdge ? 1 : 0);
      if (el === activeEl()) renderBridge();
    };
    const persist = () => { try { GM_setValue(STORE.pos, anchor); } catch (e) { /* noop */ } };
    const placeAll = () => { place(panel); place(dock); };
    placeAll();
    window.addEventListener("resize", placeAll);

    const reducedMotion = () =>
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- liquid motion engine (v1.4.0) ----
       The behavior of Weston's liquid edge-dock prototype, upgraded per
       the liquid-techniques research: time-normalised springs on separate
       channels (pointer-follow 240/z0.84, snap-home 330/z0.95, bleed and
       tension 150/z0.68), iOS rubber-band tear resistance (c=0.55,
       d=120) with the neck derived as pull minus panel offset,
       velocity-aware rupture past 85px of pull, snap commit inside 24px
       on 70ms dwell or slow movement (instant inside 8px), a 250ms
       re-snap lockout after rupture, and a loop that sleeps at rest. */
    const BLEED_NEAR = 52, BLEED_FULL = 14, SNAP_ZONE = 24, SNAP_NOW = 8;
    const TEAR_PULL = 85, LOCKOUT_MS = 250;
    const rubber = (x) => (x * 120 * 0.55) / (120 + 0.55 * x);
    let bleedTgt = bleedCur, bleedVel = 0;
    let tensionTgt = 0, tensionVel = 0;
    let lockoutUntil = 0;
    let mot = null;

    const nearestEdge = (x, y, w, h) => {
      const c = [
        ["left", x], ["right", window.innerWidth - (x + w)],
        ["top", y], ["bottom", window.innerHeight - (y + h)],
      ];
      c.sort((a, b) => a[1] - b[1]);
      return { edge: c[0][0], gap: Math.max(0, c[0][1]) };
    };
    const flushPos = (edge, x, y, w, h) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (edge === "left") return { x: 0, y: clampAlong(y, h, vh) };
      if (edge === "right") return { x: vw - w, y: clampAlong(y, h, vh) };
      if (edge === "top") return { x: clampAlong(x, w, vw), y: 0 };
      return { x: clampAlong(x, w, vw), y: vh - h };
    };
    const commitMot = (m) => {
      m.el.style.left = Math.round(m.x) + "px";
      m.el.style.top = Math.round(m.y) + "px";
      m.el.style.transform = "";
      m.el.classList.remove("qp-dragging");
      // Only a motion that actually travelled may rewrite the shared
      // anchor. A plain click (or the expand/collapse wet-in) rests at
      // the element's own clamped spot; writing that back would drag
      // the OTHER element to it — the pill crept up to the panel's top
      // after a mere header click in v1.4.0.
      if (m.moved) {
        anchor = { fx: m.x / window.innerWidth, fy: m.y / window.innerHeight, edge: snappedEdge };
        persist();
      }
      placeAll();
    };
    const motStop = (commit) => {
      if (!mot) return;
      cancelAnimationFrame(mot.raf);
      const m = mot;
      mot = null;
      busyEls.delete(m.el);
      m.el.style.willChange = "";
      if (commit) commitMot(m);
    };
    const motStart = (el) => {
      if (mot && mot.el === el) return mot;
      motStop(true);
      const r = el.getBoundingClientRect();
      el.style.left = Math.round(r.left) + "px";
      el.style.top = Math.round(r.top) + "px";
      el.style.transform = "";
      const m = {
        el: el, bx: r.left, by: r.top,
        x: r.left, y: r.top, vx: 0, vy: 0, tx: r.left, ty: r.top,
        dragging: false, moved: false, last: performance.now(), raf: 0,
        zoneEdge: null, zoneSince: 0, nearEdge: null,
      };
      mot = m;
      busyEls.add(el);
      el.style.willChange = "transform";
      m.raf = requestAnimationFrame(motStep);
      return m;
    };
    const motStep = (now) => {
      const m = mot;
      if (!m) return;
      let dt = Math.min(0.033, Math.max(0.0005, (now - m.last) / 1000));
      m.last = now;
      const RM = reducedMotion();
      const kPos = m.dragging ? 240 : 330;
      const zPos = RM ? 1 : (m.dragging ? 0.84 : 0.95);
      while (dt > 0) {
        const h = Math.min(dt, 1 / 120);
        dt -= h;
        const cP = 2 * zPos * Math.sqrt(kPos);
        m.vx += (-kPos * (m.x - m.tx) - cP * m.vx) * h;
        m.vy += (-kPos * (m.y - m.ty) - cP * m.vy) * h;
        m.x += m.vx * h;
        m.y += m.vy * h;
        const cB = 2 * (RM ? 1 : 0.68) * Math.sqrt(150);
        bleedVel += (-150 * (bleedCur - bleedTgt) - cB * bleedVel) * h;
        bleedCur += bleedVel * h;
        tensionVel += (-150 * (tensionCur - tensionTgt) - cB * tensionVel) * h;
        tensionCur += tensionVel * h;
      }
      bleedCur = Math.max(0, Math.min(1.1, bleedCur));
      tensionCur = Math.max(0, Math.min(1, tensionCur));
      m.el.style.transform = "translate3d(" + (m.x - m.bx) + "px," + (m.y - m.by) + "px,0)" +
        (m.el === panel && m.dragging ? " scale(1.01)" : "");
      applyContour(m.el, engEdge, bleedCur);
      renderBridge();
      const rest = !m.dragging &&
        Math.abs(m.x - m.tx) < 0.5 && Math.abs(m.y - m.ty) < 0.5 &&
        Math.abs(m.vx) < 10 && Math.abs(m.vy) < 10 &&
        Math.abs(bleedCur - bleedTgt) < 0.01 && Math.abs(tensionCur - tensionTgt) < 0.01;
      if (rest) {
        mot = null;
        busyEls.delete(m.el);
        m.el.style.willChange = "";
        if (!snappedEdge && bleedCur < 0.02) engEdge = null;
        commitMot(m);
        return;
      }
      m.raf = requestAnimationFrame(motStep);
    };
    const doSnap = (el, m, edge) => {
      snappedEdge = edge;
      anchor.edge = edge;
      engEdge = edge;
      bleedTgt = 1;
      tensionTgt = 0;
      const fp = flushPos(edge, m.tx, m.ty, el.offsetWidth, el.offsetHeight);
      m.tx = fp.x;
      m.ty = fp.y;
      m.nearEdge = edge;
      persist();
    };
    const dragTick = (el, m, desX, desY, pvx, pvy, px, py) => {
      m.moved = true;
      const now = performance.now();
      const w = el.offsetWidth, h = el.offsetHeight;
      if (snappedEdge) {
        engEdge = snappedEdge;
        bleedTgt = 1;
        const fp = flushPos(snappedEdge, desX, desY, w, h);
        let pull = 0, vPerp = 0;
        if (snappedEdge === "left") { pull = Math.max(0, desX - fp.x); vPerp = Math.max(0, pvx); }
        if (snappedEdge === "right") { pull = Math.max(0, fp.x - desX); vPerp = Math.max(0, -pvx); }
        if (snappedEdge === "top") { pull = Math.max(0, desY - fp.y); vPerp = Math.max(0, pvy); }
        if (snappedEdge === "bottom") { pull = Math.max(0, fp.y - desY); vPerp = Math.max(0, -pvy); }
        if (pull + vPerp * 0.055 > TEAR_PULL) {
          // Capillary rupture: pop free, with a short re-snap lockout.
          snappedEdge = null;
          anchor.edge = null;
          lockoutUntil = now + LOCKOUT_MS;
          tensionTgt = 0;
          bleedTgt = 0;
          engEdge = null;
          m.tx = desX;
          m.ty = desY;
          persist();
          return;
        }
        const off = reducedMotion() ? 0 : rubber(pull);
        tensionTgt = reducedMotion() ? 0 : Math.min(1, Math.max(0, (pull - off) / TEAR_PULL));
        if (snappedEdge === "left") { m.tx = fp.x + off; m.ty = clampAlong(desY, h, window.innerHeight); }
        if (snappedEdge === "right") { m.tx = fp.x - off; m.ty = clampAlong(desY, h, window.innerHeight); }
        if (snappedEdge === "top") { m.ty = fp.y + off; m.tx = clampAlong(desX, w, window.innerWidth); }
        if (snappedEdge === "bottom") { m.ty = fp.y - off; m.tx = clampAlong(desX, w, window.innerWidth); }
        m.nearEdge = snappedEdge;
        return;
      }
      // Free drag: bleed toward the nearest edge, with a magnetic wetting
      // pull, and snap commit on proximity + dwell (or a slow hand). An
      // edge only engages when the pointer is in that edge's half of the
      // screen — a nearly viewport-tall panel dragged horizontally by its
      // header otherwise "snaps" to the bottom edge it happens to span.
      const vw2 = window.innerWidth, vh2 = window.innerHeight;
      const cands = [
        ["left", desX, px < vw2 / 2], ["right", vw2 - (desX + w), px >= vw2 / 2],
        ["top", desY, py < vh2 / 2], ["bottom", vh2 - (desY + h), py >= vh2 / 2],
      ].filter((c) => c[2]);
      cands.sort((a, b) => a[1] - b[1]);
      const near = cands.length
        ? { edge: cands[0][0], gap: Math.max(0, cands[0][1]) }
        : nearestEdge(desX, desY, w, h);
      m.nearEdge = near.edge;
      engEdge = near.edge;
      bleedTgt = 1 - smooth(BLEED_FULL, BLEED_NEAR, near.gap);
      tensionTgt = 0;
      let tx = desX, ty = desY;
      const pullIn = bleedTgt * 14;
      if (near.edge === "left") tx = desX - pullIn;
      if (near.edge === "right") tx = desX + pullIn;
      if (near.edge === "top") ty = desY - pullIn;
      if (near.edge === "bottom") ty = desY + pullIn;
      if (now >= lockoutUntil && bleedTgt > 0) {
        if (near.gap <= SNAP_NOW) { doSnap(el, m, near.edge); return; }
        if (near.gap <= SNAP_ZONE) {
          if (m.zoneEdge !== near.edge) { m.zoneEdge = near.edge; m.zoneSince = now; }
          const speed = Math.abs(near.edge === "left" || near.edge === "right" ? pvx : pvy);
          if (now - m.zoneSince >= 70 || speed < 500) { doSnap(el, m, near.edge); return; }
        } else {
          m.zoneEdge = null;
        }
      }
      m.tx = tx;
      m.ty = ty;
    };

    /* ---- drag: header (panel) or the pill itself (dock) ---- */
    const attachDrag = (el, handle) => {
      let drag = null;
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest && e.target.closest(".qp-x")) return;
        if (el === dock) suppressDockClick = false;
        const m = motStart(el);
        drag = {
          id: e.pointerId, sx: e.clientX, sy: e.clientY, active: false,
          gx: e.clientX - m.x, gy: e.clientY - m.y, pvx: 0, pvy: 0,
          samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
        };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      });
      handle.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id || !mot || mot.el !== el) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.active && Math.hypot(dx, dy) < 3) return;
        if (!drag.active) {
          drag.active = true;
          mot.dragging = true;
          el.classList.add("qp-dragging");
        }
        // Pointer velocity over a trailing window of at least ~40ms.
        // Shorter spans (a first move landing 1-2ms after the press, or a
        // 1000Hz mouse) make the instantaneous velocity explode, which
        // falsely ruptured the tear-away in v1.4.0's first build.
        const nowMs = performance.now();
        drag.samples.push({ t: nowMs, x: e.clientX, y: e.clientY });
        while (drag.samples.length > 2 && nowMs - drag.samples[0].t > 150) drag.samples.shift();
        const s = drag.samples;
        if (s.length > 1) {
          const a = s[0], b = s[s.length - 1], span = b.t - a.t;
          if (span >= 40) {
            drag.pvx = (b.x - a.x) / (span / 1000);
            drag.pvy = (b.y - a.y) / (span / 1000);
          }
        }
        dragTick(el, mot, e.clientX - drag.gx, e.clientY - drag.gy,
          drag.pvx || 0, drag.pvy || 0, e.clientX, e.clientY);
      });
      const finish = (e, cancelled) => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        const wasActive = drag.active;
        const d = drag;
        drag = null;
        if (!mot || mot.el !== el) return;
        const m = mot;
        m.dragging = false;
        el.classList.remove("qp-dragging");
        if (!wasActive) return;
        if (el === dock) suppressDockClick = true;
        const pvx = d.pvx || 0, pvy = d.pvy || 0;
        tensionTgt = 0;
        if (cancelled) { bleedTgt = snappedEdge ? 1 : 0; return; }
        if (snappedEdge) {
          // Re-seat flush, with the along-edge coordinate taken from the
          // drop point (not the spring's lagging position).
          let ax = m.x, ay = m.y;
          if (e) { ax = e.clientX - d.gx; ay = e.clientY - d.gy; }
          const fp = flushPos(snappedEdge, ax, ay, el.offsetWidth, el.offsetHeight);
          m.tx = fp.x;
          m.ty = fp.y;
          bleedTgt = 1;
          return;
        }
        if (bleedCur > 0.35 && m.nearEdge) { doSnap(el, m, m.nearEdge); return; }
        bleedTgt = 0;
        engEdge = null;
        // Free rest: spring to the DROP point (where the pointer let go),
        // clamped into the viewport, carrying a little of the release
        // velocity so a flick still feels alive. v1.4.0 targeted the
        // spring's current lagging position instead, so every drag died
        // short of the drop point and felt unresponsive.
        m.vx += pvx * 0.25;
        m.vy += pvy * 0.25;
        let rx = m.x, ry = m.y;
        if (e) { rx = e.clientX - d.gx; ry = e.clientY - d.gy; }
        m.tx = Math.min(Math.max(rx, 8), Math.max(8, window.innerWidth - el.offsetWidth - 8));
        m.ty = Math.min(Math.max(ry, 8), Math.max(8, window.innerHeight - el.offsetHeight - 8));
      };
      handle.addEventListener("pointerup", (e) => finish(e, false));
      handle.addEventListener("pointercancel", (e) => finish(e, true));
      handle.addEventListener("dblclick", () => {
        motStop(false);
        el.style.transform = "";
        busyEls.delete(el);
        snappedEdge = null;
        bleedCur = 0; bleedTgt = 0; tensionCur = 0; tensionTgt = 0; engEdge = null;
        anchor = { fx: 0.012, fy: 0.30, edge: null };
        persist();
        placeAll();
      });
    };

    const setDocked = (docked) => {
      motStop(false);
      [panel, dock].forEach((el2) => {
        el2.style.transform = "";
        el2.classList.remove("qp-dragging");
        busyEls.delete(el2);
      });
      panel.classList.toggle("qp-min", docked);
      dock.classList.toggle("qp-hidden", !docked);
      dock.setAttribute("aria-expanded", docked ? "false" : "true");
      placeAll();
      // At a snapped edge, wet the silhouette in so the swap reads liquid.
      if (snappedEdge) {
        bleedCur = 0.25;
        bleedTgt = 1;
        engEdge = snappedEdge;
        motStart(activeEl());
      }
      try { GM_setValue(STORE.docked, docked); } catch (e) { /* noop */ }
    };
    const setDockTotal = (text) => {
      if (text) {
        dockTotal.textContent = text;
        dockTotal.style.display = "block";
      } else {
        dockTotal.style.display = "none";
      }
      place(dock);
    };
    let suppressDockClick = false;
    dock.addEventListener("click", () => {
      if (suppressDockClick) { suppressDockClick = false; return; }
      setDocked(false);
    });
    const head = panel.querySelector(".qp-head");
    head.querySelector(".qp-x").addEventListener("click", () => setDocked(true));
    attachDrag(panel, head);
    attachDrag(dock, dock);
    // Alt+Q toggles the dock from anywhere on the page (not while typing).
    document.addEventListener("keydown", (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== "q" && e.key !== "Q")) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setDocked(!panel.classList.contains("qp-min"));
    });
    // Esc collapses when the interaction is inside our own shadow tree.
    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setDocked(true);
    });
    // Tiny version tag at the panel's foot: makes "am I on the latest
    // build?" answerable at a glance.
    const verEl = document.createElement("div");
    verEl.className = "qp-ver";
    verEl.textContent = "QuotePro browser tool v1.4.1";
    panel.appendChild(verEl);
    // Start in the remembered state; the dock pill is the entry point.
    setDocked(GM_getValue(STORE.docked, true));
    return { host, body: panel.querySelector(".qp-body"), setDocked, setDockTotal };
  }

  function labeledInput(body, label, name, value, guess) {
    const row = document.createElement("div");
    row.className = "qp-row";
    const lab = document.createElement("label");
    lab.textContent = label;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "decimal";
    inp.name = name;
    inp.value = value;
    if (guess) inp.classList.add("qp-guess");
    row.appendChild(lab);
    row.appendChild(inp);
    body.appendChild(row);
    return inp;
  }

  function showError(body, msg) {
    let err = body.querySelector(".qp-err");
    if (!err) {
      err = document.createElement("div");
      err.className = "qp-err";
      body.prepend(err);
    }
    err.textContent = msg;
    err.style.display = "block";
  }
  function hideError(body) {
    const err = body.querySelector(".qp-err");
    if (err) err.style.display = "none";
  }

  /* ------------------------------ iStore side ----------------------------- */
  // Dealer cost on the iStore is the per-item NET price ("Net Price: 1491.61",
  // after the iStore discount) — never the list price and never the cart total.
  // Each priced item lives on its own card; find the largest ancestor that
  // mentions Net Price exactly once, and read the amount anchored to it.
  function findNetPriceItems() {
    const items = [];
    const seenCards = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!/net price/i.test(node.nodeValue || "")) continue;
      let card = node.parentElement, best = null;
      for (let i = 0; i < 8 && card && card !== document.body; i++) {
        const count = ((card.innerText || "").match(/net price/gi) || []).length;
        if (count === 1) best = card;
        else if (count > 1) break;
        card = card.parentElement;
      }
      if (!best || seenCards.has(best)) continue;
      seenCards.add(best);
      const label = (best.innerText || "").replace(/\s+/g, " ").replace(/[\u2212\u2013]/g, "-").trim();
      const m = label.match(/net price:\s*\$?\s*(-)?\s*(\()?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})(\)?)/i);
      if (!m) continue;
      let amount = Number(m[3].replace(/,/g, ""));
      if (m[1] || (m[2] && m[4])) amount = -amount;
      // Credits are real lines (negative Net Price); only $0 lines are noise.
      if (!Number.isFinite(amount) || amount === 0) continue;
      items.push({ label, amount });
    }
    return items;
  }

  // Classify scraped {label, amount} items into door/windows/misc.
  // - Summary/total lines are detected and excluded from the buckets (but
  //   kept on the item with bucket "total" so the panel can show them):
  //   total-ish words, or an amount equal to the sum of all other lines.
  // - Explicit door keywords win; otherwise the FIRST remaining item wins,
  //   because the iStore lists the main product before its options.
  // allowGuess: when true and no door found at all, the largest remaining
  // amount is used as a flagged door guess (fallback scan only).
  function classifyItems(items, allowGuess, models) {
    models = models || [];
    const TOTAL_WORDS = /\b(subtotal|grand total|order total|total due|balance due|amount due|total price)\b/i;
    const included = [];
    items.forEach((r) => {
      if (TOTAL_WORDS.test(r.label) || isProductLineLabel(r.label)) { r.bucket = "total"; }
      else included.push(r);
    });
    if (included.length >= 3) {
      const totalAll = included.reduce((s, r) => s + r.amount, 0);
      const biggest = Math.max.apply(null, included.map((x) => x.amount));
      for (let i = 0; i < included.length; i++) {
        if (i === 0) continue; // totals render after their line items, never first
        const r = included[i];
        if (r.amount >= biggest && Math.abs(r.amount - (totalAll - r.amount)) < 0.015) {
          r.bucket = "total";
          included.splice(i, 1);
          break;
        }
      }
    }
    // The door card's header carries the model number from the page's
    // "Product:" line(s) — the reliable door signal on multi-door orders.
    const modelRes = models
      .filter((m) => m && m.length >= 3)
      .map((m) => new RegExp("\\b" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
    const isModelCard = (label) => modelRes.some((re) => re.test(label || ""));
    let door = 0, windows = 0, misc = 0, doorGuess = false;
    const rest = [];
    let doorFound = false;
    included.forEach((r) => {
      if (isWindowsLabel(r.label)) { r.bucket = "windows"; windows += r.amount; return; }
      if (isPriceFor(r.label)) { rest.push(r); return; } // options are never the door
      if (isDoorLabel(r.label) || isModelCard(r.label)) {
        r.bucket = "door";
        door += r.amount; // multi-door orders accumulate every door card
        doorFound = true;
        return;
      }
      rest.push(r);
    });
    let guessed = null;
    if (!doorFound && rest.length) {
      // Last resort: first non-option item (an option card must never win).
      const pool = rest.filter((r) => !isPriceFor(r.label));
      const pickFrom = pool.length ? pool : rest;
      if (allowGuess) {
        guessed = pickFrom.reduce((a, b) => (b.amount > a.amount ? b : a));
        guessed.bucket = "door";
        door = guessed.amount;
        doorGuess = true;
      } else {
        const first = pickFrom[0];
        rest.splice(rest.indexOf(first), 1);
        first.bucket = "door";
        door = first.amount;
      }
    }
    rest.forEach((r) => {
      if (r === guessed) return;
      r.bucket = "misc";
      misc += r.amount;
    });
    const r2 = (n) => Math.round(n * 100) / 100;
    return { door: r2(door), windows: r2(windows), misc: r2(misc), doorGuess, rowCount: items.length, lines: items };
  }

  function describeScrape(s) {
    if (!s.rowCount) return "No priced lines found on this page \u2014 type the costs in manually.";
    const what = s.viaNet ? "Net Price line(s)" : "priced lines";
    const excl = (s.lines || []).filter((l) => l.bucket === "total").length;
    return "Read " + s.rowCount + " " + what + " off this page" +
      (excl ? " (" + excl + " subtotal" + (excl > 1 ? "s" : "") + " excluded)" : "") +
      ". Verify before calculating" +
      (s.doorGuess ? " \u2014 door value is a guess (highlighted)." : ".");
  }

  function scrapeIStore() {
    const netItems = findNetPriceItems();
    if (netItems.length) {
      const r = classifyItems(netItems, false, parseDoorModels());
      r.viaNet = true;
      return r;
    }
    // Fallback for pages without "Net Price" lines: generic $-amount scan.
    const rows = [];
    const scope = CONFIG.ISTORE_SCOPE_SELECTOR
      ? document.querySelector(CONFIG.ISTORE_SCOPE_SELECTOR) || document.body
      : document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || text.indexOf("$") === -1) continue;
      let el = node.parentElement;
      for (let i = 0; i < 4 && el && el !== scope; i++) {
        const t = el.innerText || "";
        if (t.length > 8 && t.length < 400 && /\$/.test(t)) break;
        el = el.parentElement;
      }
      if (!el || el === scope || seen.has(el)) continue;
      seen.add(el);
      const label = (el.innerText || "").replace(/\s+/g, " ").trim();
      const amount = parseMoney(label);
      if (amount === null || amount === 0) continue;
      rows.push({ label, amount });
    }
    const r = classifyItems(rows, true, parseDoorModels());
    r.viaNet = false;
    return r;
  }

  /* ---------------------- estimate texts panel (iStore) --------------------- */
  // Door profile fields + generated title / summary / door-description.
  // Everything is editable; regeneration never clobbers a hand-edited field
  // (a Regenerate button forces it). Returns { getTexts } for the ST tab.
  function initEstimateTexts(body) {
    let prof = parseDoorProfile();

    const sec = document.createElement("div");
    sec.style.cssText = "margin:14px 0 4px;border-top:1px solid #2e323a;padding-top:12px;";
    const hrow = document.createElement("div");
    hrow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
    const h = document.createElement("div");
    h.style.cssText = "font-size:11px;font-weight:800;color:#e8eaed;letter-spacing:.14em;";
    h.textContent = "ESTIMATE TEXTS";
    const regenBtn = document.createElement("button");
    regenBtn.className = "qp-copy";
    regenBtn.textContent = "Regenerate";
    hrow.appendChild(h);
    hrow.appendChild(regenBtn);
    sec.appendChild(hrow);
    body.appendChild(sec);

    let jobType = "install";
    // Segmented control for job type.
    const jtRow = document.createElement("div");
    jtRow.style.cssText = "display:flex;background:linear-gradient(180deg,#101112,#141518);" +
      "box-shadow:inset 0 1px 3px rgba(0,0,0,.7),inset 0 -1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.05);" +
      "border-radius:11px;padding:3px;gap:3px;margin-bottom:10px;";
    const jtBtns = {};
    const installBox = document.createElement("div");
    const serviceBox = document.createElement("div");
    const paintJt = () => {
      ["install", "service"].forEach((jt) => {
        const on = jt === jobType;
        const b = jtBtns[jt];
        b.style.background = on ? "#2f6fed" : "transparent";
        b.style.color = on ? "#fff" : "#9aa0ab";
        b.style.boxShadow = on ? "0 2px 8px rgba(47,111,237,.4)" : "none";
      });
      installBox.style.display = jobType === "install" ? "" : "none";
      serviceBox.style.display = jobType === "service" ? "" : "none";
    };
    ["install", "service"].forEach((jt) => {
      const b = document.createElement("button");
      b.textContent = jt === "install" ? "Install" : "Service / repair";
      b.style.cssText = "flex:1;padding:8px 0;border:0;border-radius:7px;cursor:pointer;" +
        "font:600 12px/1 -apple-system,\"Segoe UI\",Roboto,sans-serif;" +
        "transition:background .15s ease,color .15s ease;";
      b.addEventListener("click", () => { jobType = jt; paintJt(); regen(); });
      jtRow.appendChild(b);
      jtBtns[jt] = b;
    });
    sec.appendChild(jtRow);
    const profCap = document.createElement("div");
    profCap.style.cssText = "font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.12em;margin:2px 0 8px;";
    profCap.textContent = "DOOR PROFILE";
    sec.appendChild(profCap);
    sec.appendChild(installBox);
    sec.appendChild(serviceBox);

    const mkField = (parent, label, initial) => {
      const row = document.createElement("div");
      row.className = "qp-row";
      const lab = document.createElement("label");
      lab.textContent = label;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = initial || "";
      row.appendChild(lab);
      row.appendChild(inp);
      parent.appendChild(row);
      return inp;
    };
    const mkArea = (parent, label, initial, rows) => {
      const lab = document.createElement("div");
      lab.style.cssText = "color:#9aa0ab;font-size:12px;margin:6px 0 4px;";
      lab.textContent = label;
      const ta = document.createElement("textarea");
      ta.value = initial || "";
      ta.rows = rows || 2;
      ta.style.cssText = "width:100%;box-sizing:border-box;border:0;border-radius:10px;" +
        "background:linear-gradient(180deg,#101112,#141518);color:rgba(255,255,255,.92);" +
        "box-shadow:inset 0 1px 3px rgba(0,0,0,.7),inset 0 -1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.05);" +
        "padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;";
      parent.appendChild(lab);
      parent.appendChild(ta);
      return ta;
    };

    const seriesIn = mkField(installBox, "Series", prof.series);
    const modelIn = mkField(installBox, "Model", prof.model);
    const sizeIn = mkField(installBox, "Size", prof.sizeRaw);
    const colorIn = mkField(installBox, "Color", prof.color);
    const winRow = document.createElement("div");
    winRow.className = "qp-row";
    const winLab = document.createElement("label");
    winLab.textContent = "Windows";
    const winIn = document.createElement("input");
    winIn.type = "text";
    winIn.value = prof.windows;
    winIn.setAttribute("list", "qp-winlist");
    const dl = document.createElement("datalist");
    dl.id = "qp-winlist";
    WINDOWS_VARIANTS.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
    winRow.appendChild(winLab);
    winRow.appendChild(winIn);
    winRow.appendChild(dl);
    installBox.appendChild(winRow);
    const insulIn = mkField(installBox, "Insulation", prof.insulation);
    const trackIn = mkField(installBox, "Track", prof.track);
    const radiusIn = mkField(installBox, "Radius", prof.radius);
    const closerRow = document.createElement("div");
    closerRow.className = "qp-row";
    const closerLab = document.createElement("label");
    closerLab.textContent = "Closer";
    const closerSel = document.createElement("select");
    closerSel.style.cssText = "flex:1;min-width:0;";
    CLOSERS.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c.replace(/\n/g, " + ");
      closerSel.appendChild(o);
    });
    closerRow.appendChild(closerLab);
    closerRow.appendChild(closerSel);
    installBox.appendChild(closerRow);
    const titleOptIn = mkField(installBox, "Title option", "");
    titleOptIn.placeholder = "e.g. R-12.9 Option";
    const openerTa = mkArea(installBox, "Opener rows (one per line)", "", 2);
    openerTa.placeholder = "e.g. Liftmaster Opener";

    const svcTitleIn = mkField(serviceBox, "Title", "");
    const svcSummaryTa = mkArea(serviceBox, "Summary", "", 3);

    const genOut = (label, area, rows) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "margin:8px 0;";
      const top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;";
      const lab = document.createElement("span");
      lab.style.cssText = "color:#9aa0ab;font-size:12px;";
      lab.textContent = label;
      const cp = document.createElement("button");
      cp.className = "qp-copy";
      cp.textContent = "Copy";
      const ta = document.createElement(area ? "textarea" : "input");
      if (!area) ta.type = "text";
      else ta.rows = rows || 3;
      ta.style.cssText = "width:100%;box-sizing:border-box;border:0;" +
        "background:linear-gradient(180deg,#101112,#141518);" +
        "box-shadow:inset 0 1px 3px rgba(0,0,0,.7),inset 0 -1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.05),inset 2px 0 0 #2f6fed;" +
        "color:rgba(255,255,255,.92);border-radius:10px;padding:8px 10px;font-size:13px;" +
        "font-family:inherit;" + (area ? "resize:vertical;" : "");
      cp.addEventListener("click", () => copyText(ta.value, cp));
      top.appendChild(lab);
      top.appendChild(cp);
      wrap.appendChild(top);
      wrap.appendChild(ta);
      sec.appendChild(wrap);
      return ta;
    };
    const genCap = document.createElement("div");
    genCap.style.cssText = "font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.12em;margin:10px 0 2px;";
    genCap.textContent = "GENERATED";
    sec.appendChild(genCap);
    const titleOut = genOut("Estimate title", false);
    const summaryOut = genOut("Estimate description", true, 3);
    const doorOut = genOut("Door description", true, 5);

    const readProfile = () => ({
      jobType,
      series: seriesIn.value.trim(),
      model: modelIn.value.trim(),
      size: parseSizeStr(sizeIn.value) || prof.size,
      color: colorIn.value.trim(),
      windows: winIn.value.trim(),
      insulation: insulIn.value.trim(),
      track: trackIn.value.trim(),
      radius: radiusIn.value.trim(),
      closer: closerSel.value,
      titleOption: titleOptIn.value.trim(),
      openerRows: openerTa.value.split("\n"),
      serviceTitle: svcTitleIn.value.trim(),
      serviceSummary: svcSummaryTa.value.trim(),
    });

    const edited = { title: false, summary: false, door: false };
    titleOut.addEventListener("input", () => { edited.title = true; });
    summaryOut.addEventListener("input", () => { edited.summary = true; });
    doorOut.addEventListener("input", () => { edited.door = true; });

    const regen = (force) => {
      const g = genEstimateTexts(readProfile());
      if (force || !edited.title) titleOut.value = g.title;
      if (force || !edited.summary) summaryOut.value = g.summary;
      if (force || !edited.door) doorOut.value = g.doorDescs[0] || "";
      if (force) { edited.title = edited.summary = edited.door = false; }
    };
    regenBtn.addEventListener("click", () => regen(true));

    [seriesIn, modelIn, sizeIn, colorIn, winIn, insulIn, trackIn, radiusIn,
     titleOptIn, openerTa, svcTitleIn, svcSummaryTa].forEach((inp) =>
      inp.addEventListener("input", () => regen(false)));
    closerSel.addEventListener("change", () => regen(false));

    // Re-read the door profile off the page. The Pricing Details modal is
    // usually opened AFTER this panel initializes, so the first parse often
    // finds nothing — Re-scan picks it up. Never clobbers typed fields.
    const profEdited = {};
    const profInputs = {
      series: seriesIn, model: modelIn, size: sizeIn, color: colorIn,
      windows: winIn, insulation: insulIn, track: trackIn, radius: radiusIn,
    };
    Object.keys(profInputs).forEach((name) => {
      profEdited[name] = false;
      profInputs[name].addEventListener("input", () => { profEdited[name] = true; });
    });
    const refreshProfile = () => {
      const p = parseDoorProfile();
      if (!p.model && !p.sizeRaw) return false;
      prof = p;
      const set = (name, val) => {
        if (!profEdited[name] && val) profInputs[name].value = val;
      };
      set("series", p.series);
      set("model", p.model);
      set("size", p.sizeRaw);
      set("color", p.color);
      set("windows", p.windows);
      set("insulation", p.insulation);
      set("track", p.track);
      set("radius", p.radius);
      regen(false);
      return true;
    };

    const getTexts = () => {
      const p = readProfile();
      return {
        jobType: p.jobType,
        title: titleOut.value,
        summary: summaryOut.value,
        doorDescs: doorOut.value ? [doorOut.value] : [],
        profile: {
          series: p.series, model: p.model,
          size: fmtXSize(p.size), color: p.color,
        },
      };
    };

    paintJt();
    regen(false);

    // Save texts without calculating (service/repair jobs have no iStore costs).
    const saveRow = document.createElement("div");
    saveRow.style.cssText = "margin-top:8px;";
    const saveBtn = document.createElement("button");
    saveBtn.className = "qp-btn qp-secondary";
    saveBtn.textContent = "Save texts for ServiceTitan";
    const savedNote = document.createElement("span");
    savedNote.style.cssText = "color:#7ee2a8;font-size:12px;margin-left:8px;display:none;";
    savedNote.textContent = "Saved \u2713";
    saveBtn.addEventListener("click", () => {
      const prev = getLastResult() || {};
      const merged = {};
      Object.keys(prev).forEach((k) => { merged[k] = prev[k]; });
      merged.at = Date.now();
      merged.texts = getTexts();
      GM_setValue(STORE.lastResult, merged);
      savedNote.style.display = "inline";
      setTimeout(() => { savedNote.style.display = "none"; }, 2000);
    });
    saveRow.appendChild(saveBtn);
    saveRow.appendChild(savedNote);
    sec.appendChild(saveRow);

    return { getTexts, refreshProfile };
  }

  function initIStore() {
    const { body, setDockTotal } = makePanel("QuotePro \u2014 Quick Estimate");

    // API key manager — always visible so the key can be set or changed.
    // (Previously it vanished for good once saved, which looked like a bug.)
    // The Tampermonkey toolbar menu also has it under
    // QuotePro Quick Estimate > Set API key.
    {
      const details = document.createElement("details");
      details.style.cssText = "margin-bottom:10px;";
      const summary = document.createElement("summary");
      summary.style.cssText = "cursor:pointer;font-size:12px;color:#9aa0ab;list-style:none;";
      const refreshSummary = () => {
        summary.textContent = getApiKey()
          ? "API key: saved \u2713 (click to change)"
          : "API key: not set \u2014 click to set it";
      };
      refreshSummary();
      if (!getApiKey()) details.open = true;
      const keyNote = document.createElement("div");
      keyNote.className = "qp-note";
      keyNote.style.margin = "8px 0";
      keyNote.textContent = "Mint it in the QuotePro app's API tab with the Calculate scope checked. " +
        "Saved on this machine only, never sent anywhere except the QuotePro API.";
      const keyRow = document.createElement("div");
      keyRow.className = "qp-row";
      keyRow.style.marginBottom = "0";
      const keyInp = document.createElement("input");
      keyInp.type = "password";
      keyInp.dataset.qpkey = "1";
      keyInp.placeholder = "qp_live_\u2026";
      keyInp.autocomplete = "off";
      const keySave = document.createElement("button");
      keySave.className = "qp-copy";
      keySave.textContent = "Save";
      const doSave = () => {
        const v = keyInp.value.trim();
        if (!v) return;
        GM_setValue(STORE.key, v);
        keyInp.value = "";
        details.open = false;
        refreshSummary();
        hideError(body);
      };
      keySave.addEventListener("click", doSave);
      keyInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSave();
      });
      keyRow.appendChild(keyInp);
      keyRow.appendChild(keySave);
      details.appendChild(summary);
      details.appendChild(keyNote);
      details.appendChild(keyRow);
      body.appendChild(details);
    }

    const vars = getVars();
    const scraped = scrapeIStore();

    const note = document.createElement("div");
    note.className = "qp-note";
    note.textContent = describeScrape(scraped);
    body.appendChild(note);

    // Itemized net-price lines, exactly as found on the page.
    const linesBox = document.createElement("div");
    linesBox.style.cssText = "margin:2px 0 10px;border:1px solid #2e323a;border-radius:8px;overflow:hidden;";
    body.appendChild(linesBox);
    const renderLines = (s) => {
      linesBox.innerHTML = "";
      (s.lines || []).forEach((ln) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;" +
          "padding:6px 10px;font-size:12px;border-bottom:1px solid #22262d;" +
          (ln.bucket === "total" ? "opacity:.55;" : "");
        const lab = document.createElement("span");
        lab.style.cssText = "color:#9aa0ab;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;";
        lab.title = ln.label;
        lab.textContent = shortLabel(ln.label);
        const right = document.createElement("span");
        right.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;";
        const amt = document.createElement("span");
        amt.style.cssText = "font-variant-numeric:tabular-nums;color:#e8eaed;";
        amt.textContent = fmt$(ln.amount);
        const tag = document.createElement("span");
        tag.style.cssText = "font-size:10px;padding:2px 7px;border-radius:20px;background:#24282f;color:#9aa0ab;white-space:nowrap;";
        tag.textContent = ln.bucket === "total" ? "total \u2014 excluded" : "\u2192 " + ln.bucket;
        right.appendChild(amt);
        right.appendChild(tag);
        row.appendChild(lab);
        row.appendChild(right);
        linesBox.appendChild(row);
      });
    };
    renderLines(scraped);

    const doorIn = labeledInput(body, "Door", "door", scraped.door || "", scraped.doorGuess);
    const winIn = labeledInput(body, "Windows", "windows", scraped.windows || "", false);
    const miscIn = labeledInput(body, "Misc", "misc", scraped.misc || "", false);
    const multIn = labeledInput(body, "Multiplier", "multiplier", vars.multiplier, false);
    const baseIn = labeledInput(body, "Base", "base", vars.base, false);
    const pctIn = labeledInput(body, "Pct %", "pct", vars.pct, false);
    const instIn = labeledInput(body, "Install", "installation", vars.installation, false);
    const fuelIn = labeledInput(body, "Fuel", "fuel", vars.fuel, false);

    // Live summed total: door + windows + misc inputs. This is the dealer
    // cost total that gets injected into ServiceTitan.
    const totalRow = document.createElement("div");
    totalRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;" +
      "padding:10px 2px 4px;margin-bottom:8px;border-top:1px solid #2e323a;";
    const totalLab = document.createElement("span");
    totalLab.style.cssText = "font-size:12px;color:#9aa0ab;";
    totalLab.textContent = "Total dealer cost \u2192 ServiceTitan";
    const totalVal = document.createElement("span");
    totalVal.style.cssText = "font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;color:#7ee2a8;";
    totalRow.appendChild(totalLab);
    totalRow.appendChild(totalVal);
    body.appendChild(totalRow);
    const numVal = (inp) => {
      const v = Number(String(inp.value).replace(/[$,\s]/g, ""));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    };
    const updateTotal = () => {
      const t = fmt$(numVal(doorIn) + numVal(winIn) + numVal(miscIn));
      totalVal.textContent = t;
      setDockTotal(t);
    };
    [doorIn, winIn, miscIn].forEach((inp) => inp.addEventListener("input", updateTotal));
    updateTotal();

    // Estimate texts (title / summary / door description), generated from the
    // door profile. Saved alongside the calculation for the ST tab.
    const estTexts = initEstimateTexts(body);

    const rescrape = document.createElement("button");
    rescrape.className = "qp-btn qp-secondary";
    rescrape.textContent = "Re-scan page";
    rescrape.addEventListener("click", () => {
      const s = scrapeIStore();
      // Only overwrite fields the scrape actually found — never wipe typed values.
      if (s.door || s.doorGuess) {
        doorIn.value = s.door || "";
        doorIn.classList.toggle("qp-guess", s.doorGuess);
      }
      if (s.windows) winIn.value = s.windows;
      if (s.misc) miscIn.value = s.misc;
      note.textContent = describeScrape(s);
      renderLines(s);
      updateTotal();
      estTexts.refreshProfile();
    });
    body.appendChild(rescrape);

    const calcBtn = document.createElement("button");
    calcBtn.className = "qp-btn";
    calcBtn.textContent = "Calculate";
    body.appendChild(calcBtn);

    const res = document.createElement("div");
    res.className = "qp-res";
    body.appendChild(res);
    const okMsg = document.createElement("div");
    okMsg.className = "qp-ok";
    body.appendChild(okMsg);

    const num = (inp, name) => {
      const v = Number(String(inp.value).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(v) || v < 0) throw new Error("'" + name + "' must be a non-negative number.");
      return v;
    };

    calcBtn.addEventListener("click", () => {
      hideError(body);
      res.style.display = "none";
      okMsg.style.display = "none";
      let payload;
      try {
        payload = {
          door: num(doorIn, "Door"),
          windows: num(winIn, "Windows"),
          miscellaneous: num(miscIn, "Misc"),
          multiplier: num(multIn, "Multiplier"),
          base: num(baseIn, "Base"),
          pct: num(pctIn, "Pct %"),
          installation: num(instIn, "Install"),
          fuel: num(fuelIn, "Fuel"),
        };
      } catch (e) {
        showError(body, e.message);
        return;
      }
      GM_setValue(STORE.vars, {
        multiplier: payload.multiplier, base: payload.base, pct: payload.pct,
        installation: payload.installation, fuel: payload.fuel,
      });
      calcBtn.disabled = true;
      calcBtn.textContent = "Calculating\u2026";
      apiCalculate(
        payload,
        (data) => {
          calcBtn.disabled = false;
          calcBtn.textContent = "Calculate";
          GM_setValue(STORE.lastResult, {
            dealer_cost_total: data.dealer_cost_total,
            double_cost: data.double_cost,
            final_price: data.final_price,
            margin: data.margin,
            at: Date.now(),
            texts: estTexts.getTexts(),
          });
          renderResults(res, data, okMsg);
        },
        (msg) => {
          calcBtn.disabled = false;
          calcBtn.textContent = "Calculate";
          showError(body, msg);
        }
      );
    });

    // Enter in any cost/variable field triggers Calculate (not the API key field).
    body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!t || t.tagName !== "INPUT" || t.dataset.qpkey) return;
      e.preventDefault();
      if (!calcBtn.disabled) calcBtn.click();
    });

    // The iStore often renders prices seconds after load: retry the scan
    // while the cost fields are still empty (never touches typed values).
    [4000, 10000].forEach((ms) =>
      setTimeout(() => {
        if (!doorIn.value && !winIn.value && !miscIn.value) rescrape.click();
      }, ms));
  }

  function renderResults(res, data, okMsg) {
    res.innerHTML = "";
    const rows = [
      { k: "Dealer cost total", v: data.dealer_cost_total, raw: data.dealer_cost_total, cls: "" },
      { k: "Double-cost check", v: data.double_cost, raw: data.double_cost, cls: "" },
      { k: "Final price", v: data.final_price, raw: data.final_price, cls: "qp-final" },
      { k: "Margin", v: data.margin, raw: data.margin, cls: "" },
    ];
    rows.forEach((r) => {
      const div = document.createElement("div");
      div.className = "qp-rrow";
      const left = document.createElement("span");
      left.className = "qp-k";
      left.textContent = r.k;
      const right = document.createElement("span");
      const val = document.createElement("span");
      val.className = "qp-v " + r.cls;
      val.textContent = fmt$(r.v);
      const cp = document.createElement("button");
      cp.className = "qp-copy";
      cp.textContent = "Copy";
      cp.addEventListener("click", () => copyText(r.raw, cp));
      right.appendChild(val);
      right.appendChild(cp);
      div.appendChild(left);
      div.appendChild(right);
      res.appendChild(div);
    });
    res.style.display = "block";
    okMsg.textContent = "Saved \u2014 switch to the ServiceTitan tab and hit Fill.";
    okMsg.style.display = "block";
  }

  /* --------------------------- ServiceTitan side -------------------------- */
  // Result numbers are mapped to ST fields by click-to-pick: click "Pick field",
  // then click the matching field on the estimate page. Mappings are saved in
  // Tampermonkey storage (per machine) so you only do it once; CONFIG.ST_FIELDS
  // above acts as preset defaults that the saved picks override.
  const ST_RESULT_KEYS = [
    { key: "dealer_cost_total", label: "Dealer cost" },
    { key: "double_cost", label: "Double-cost check" },
    { key: "final_price", label: "Final price" },
  ];

  function getFieldMap() {
    const map = {};
    CONFIG.ST_FIELDS.forEach((f) => { if (f.key && f.selector) map[f.key] = f.selector; });
    Object.assign(map, GM_getValue(STORE.fieldMap, {}));
    return map;
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return "#" + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    if (el.name) return tag + '[name="' + String(el.name).replace(/"/g, "") + '"]';
    const aria = el.getAttribute("aria-label");
    if (aria) return tag + '[aria-label="' + aria.replace(/"/g, "") + '"]';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 7) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.prototype.filter.call(
          parent.children, (c) => c.tagName === cur.tagName);
        if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function isStEstimatePage() {
    return /#\/estimate\//.test(location.hash || "");
  }

  // The dock lives on every ServiceTitan page (not just estimates) so it
  // follows you around the app. The fill UI only activates on estimate
  // pages; everywhere else the panel shows the last result plus a hint.
  // Re-renders whenever the SPA navigates.
  function initServiceTitan() {
    const { body, setDockTotal } = makePanel("QuotePro \u2014 Fill ServiceTitan");

    let cancelPick = null;
    let seenAt = 0;
    const render = () => {
      if (cancelPick) { const cp = cancelPick; cancelPick = null; cp(); }
      body.innerHTML = "";
      const last = getLastResult();
      seenAt = last ? last.at : 0;
      if (last) setDockTotal(fmt$(last.final_price));

      const note = document.createElement("div");
      note.className = "qp-note";
      if (last) {
        const when = new Date(last.at).toLocaleTimeString();
        note.textContent =
          "Last calculation (" + when + "): dealer " + fmt$(last.dealer_cost_total) +
          " \u00b7 double " + fmt$(last.double_cost) +
          " \u00b7 final " + fmt$(last.final_price) + ".";
      } else {
        note.textContent = "No calculation saved yet \u2014 run Calculate on the iStore tab first.";
      }
      body.appendChild(note);

      const onEstimate = isStEstimatePage();
      if (!onEstimate) {
        const hint = document.createElement("div");
        hint.className = "qp-note";
        hint.textContent = "Open a ServiceTitan estimate and this panel will fill its fields.";
        body.appendChild(hint);
      }
      if (!last) return;

      const status = document.createElement("div");
      status.className = "qp-note";
      body.appendChild(status);

      const doFill = (keys) => {
        if (!isStEstimatePage()) {
          status.textContent = "Open an estimate first \u2014 this page has no estimate fields.";
          return;
        }
        const map = getFieldMap();
        const missing = [];
        let filled = 0;
        keys.forEach((k) => {
          const sel = map[k.key];
          const el = sel ? document.querySelector(sel) : null;
          if (!el) { missing.push(k.label + " (no field picked)"); return; }
          if (fillField(el, last[k.key])) filled++;
          else missing.push(k.label + " (set failed)");
        });
        status.textContent =
          "Filled " + filled + " of " + keys.length + "." +
          (missing.length ? " Missing: " + missing.join(", ") + "."
                          : " Verify the totals, then save the estimate.");
      };

      const fillAll = document.createElement("button");
      fillAll.className = "qp-btn";
      fillAll.textContent = "Fill all fields";
      fillAll.addEventListener("click", () => doFill(ST_RESULT_KEYS));
      body.appendChild(fillAll);

      const rowsBox = document.createElement("div");
      body.appendChild(rowsBox);

      const startPick = (k, pickBtn) => {
        const tip = document.createElement("div");
        tip.id = "qp-pick-tip";
        tip.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
          "z-index:2147483646;background:#16181d;color:#fff;padding:8px 14px;border-radius:8px;" +
          "font:13px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;";
        tip.textContent = 'Click the "' + k.label + '" field on the page (Esc to cancel)';
        const stop = () => {
          tip.remove();
          document.body.style.cursor = "";
          document.removeEventListener("keydown", onKey, true);
          document.removeEventListener("click", onClick, true);
          pickBtn.textContent = getFieldMap()[k.key] ? "Re-pick" : "Pick field";
          pickBtn.disabled = false;
          if (cancelPick) cancelPick = null;
        };
        cancelPick = stop;
        const onKey = (e) => {
          if (e.key === "Escape") { e.stopPropagation(); stop(); }
          };
        const onClick = (e) => {
          const t = e.target;
          // Ignore our own panel (shadow host) and the tip.
          if (t && (t.id === "qp-host" || (t.closest && (t.closest("#qp-host") || t.closest("#qp-pick-tip"))))) return;
          e.preventDefault();
          e.stopPropagation();
          const sel = buildSelector(t);
          if (sel) {
            const map = GM_getValue(STORE.fieldMap, {});
            map[k.key] = sel;
            GM_setValue(STORE.fieldMap, map);
            status.textContent = k.label + " mapped. Click Fill to test it.";
          }
          stop();
          renderRows();
          renderTextRows();
        };
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("click", onClick, true);
        document.body.appendChild(tip);
        document.body.style.cursor = "crosshair";
        pickBtn.textContent = "Picking\u2026";
        pickBtn.disabled = true;
      };

      const renderRows = () => {
        rowsBox.innerHTML = "";
        const map = getFieldMap();
        ST_RESULT_KEYS.forEach((k) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;" +
            "padding:6px 0;border-bottom:1px dashed #262a31;";
          const lab = document.createElement("span");
          lab.style.cssText = "color:#9aa0ab;font-size:12px;";
          lab.textContent = k.label + " (" + fmt$(last[k.key]) + ")" + (map[k.key] ? "" : " \u2014 not mapped");
          const btns = document.createElement("span");
          btns.style.cssText = "display:flex;gap:6px;flex-shrink:0;";
          const mk = (txt, fn) => {
            const b = document.createElement("button");
            b.className = "qp-copy";
            b.textContent = txt;
            b.addEventListener("click", fn);
            btns.appendChild(b);
            return b;
          };
          const pickBtn = mk(map[k.key] ? "Re-pick" : "Pick field", () => startPick(k, pickBtn));
          mk("Fill", () => doFill([k]));
          mk("Copy", (e) => copyText(last[k.key], e.target));
          row.appendChild(lab);
          row.appendChild(btns);
          rowsBox.appendChild(row);
        });
      };

      // ---- estimate texts: title -> Name, summary -> Summary, door desc ->
      // the door line's description editor. Same pick / fill / copy / re-pick
      // UX as the numbers; mappings are stored per key and remappable.
      const renderTextRows = () => {
        const texts = last.texts || null;
        if (!texts) return;
        const tkeys = [
          { key: "est_title", label: "Estimate title", text: texts.title },
          { key: "est_summary", label: "Estimate description", text: texts.summary },
        ];
        (texts.doorDescs || []).forEach((d, i) => {
          tkeys.push({
            key: "door_desc",
            label: "Door description" + (texts.doorDescs.length > 1 ? " " + (i + 1) : ""),
            text: d,
          });
        });
        const doFillText = (label, tkey, text) => {
          const map = getFieldMap();
          const sel = map[tkey];
          const el = sel ? document.querySelector(sel) : null;
          if (!el) { status.textContent = label + ": pick a field first (Pick field)."; return; }
          if (fillTextField(el, text)) status.textContent = label + " filled \u2014 verify it registered.";
          else status.textContent = label + ": fill may not have registered \u2014 use Copy.";
        };
        tkeys.forEach((tk) => {
          if (!tk.text) return;
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;" +
            "padding:6px 0;border-bottom:1px dashed #262a31;";
          const lab = document.createElement("span");
          lab.style.cssText = "color:#9aa0ab;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;";
          lab.textContent = tk.label + ": " + tk.text.replace(/\n/g, " / ");
          lab.title = tk.text;
          const map = getFieldMap();
          const btns = document.createElement("span");
          btns.style.cssText = "display:flex;gap:6px;flex-shrink:0;";
          const mk = (txt, fn) => {
            const b = document.createElement("button");
            b.className = "qp-copy";
            b.textContent = txt;
            b.addEventListener("click", fn);
            btns.appendChild(b);
            return b;
          };
          const tpick = mk(map[tk.key] ? "Re-pick" : "Pick field",
            () => startPick({ key: tk.key, label: tk.label }, tpick));
          mk("Fill", () => doFillText(tk.label, tk.key, tk.text));
          mk("Copy", (e) => copyText(tk.text, e.target));
          row.appendChild(lab);
          row.appendChild(btns);
          rowsBox.appendChild(row);
        });
      };
      renderRows();
      renderTextRows();
    };

    render();

    // ServiceTitan navigates without page loads: re-render when the URL
    // changes via hash, history API, or anything else.
    let lastHref = location.href;
    const checkNav = () => {
      // Re-render on SPA navigation — or when a fresh calculation lands from
      // the iStore tab, so the numbers appear with zero clicks.
      const l = getLastResult();
      const at = l ? l.at : 0;
      if (location.href !== lastHref || at !== seenAt) {
        lastHref = location.href;
        render();
      }
    };
    window.addEventListener("hashchange", checkNav);
    window.addEventListener("popstate", checkNav);
    ["pushState", "replaceState"].forEach((fn) => {
      try {
        const orig = history[fn];
        history[fn] = function () {
          const r = orig.apply(this, arguments);
          checkNav();
          return r;
        };
      } catch (e) { /* noop */ }
    });
    setInterval(checkNav, 3000);
  }

  /* -------------------------------- router -------------------------------- */
  function hostMatches(list) {
    const h = location.hostname.toLowerCase();
    return list.some((x) => x && !x.startsWith("PASTE-") && h === x.toLowerCase());
  }

  GM_registerMenuCommand("QuotePro: Set API key", () => {
    const cur = getApiKey();
    const v = prompt("Paste your QuotePro API key (needs the 'calculate' scope):", cur ? "(a key is already saved \u2014 paste a new one to replace it)" : "");
    if (v === null) return;
    const key = v.trim();
    if (!key || key.charAt(0) === "(") return;
    GM_setValue(STORE.key, key);
    alert("QuotePro API key saved on this machine.");
  });

  GM_registerMenuCommand("QuotePro: Set API URL", () => {
    const v = prompt("QuotePro API base URL:", getApiBase());
    if (v === null) return;
    const url = v.trim().replace(/\/+$/, "");
    if (!url) return;
    GM_setValue(STORE.apiBase, url);
    alert("QuotePro API URL saved: " + url + "\nIf this host is new, add it to the script's @connect lines.");
  });

  GM_registerMenuCommand("QuotePro: Clear saved result", () => {
    GM_setValue(STORE.lastResult, null);
    alert("Saved calculation cleared.");
  });

  if (hostMatches(CONFIG.ISTORE_HOSTS)) {
    initIStore();
  } else if (hostMatches(CONFIG.ST_HOSTS)) {
    initServiceTitan();
  }
  // Otherwise: quiet exit. Tighten by replacing @match */* with explicit hosts.
})();
