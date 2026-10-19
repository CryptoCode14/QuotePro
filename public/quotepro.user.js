// ==UserScript==
// @name         QuotePro Quick Estimate
// @namespace    https://grandvalleygaragedoors.example/quotepro
// @version      1.0.7
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
  };

  /* -------------------------------- utils -------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmt = (n) =>
    Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    // Matches $1,234.56 / 1234.56 / $45 — first plausible money value in text.
    const m = String(text).match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})|\$?\s*[0-9]+\.[0-9]{2}|\$[0-9][0-9,]*)/);
    if (!m) return null;
    const n = Number(m[1].replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  const compact = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  function isWindowsLabel(label) {
    if (!WINDOW_KEYWORDS.some((k) => compact(label).includes(k))) return false;
    // Negations ("NO WINDOWS", "WITHOUT WINDOWS", "WINDOWLESS") mean no windows:
    // the iStore prints "SOLID (NO WINDOWS)" on solid doors.
    if (/\bNO\s+WINDOWS?\b/i.test(label) ||
        /\bWITHOUT\s+WINDOWS?\b/i.test(label) ||
        /WINDOWLESS/i.test(label)) return false;
    return true;
  }
  function isDoorLabel(label) {
    // "PRICE FOR ..." cards are add-ons/options, never the door itself.
    if (/^\s*PRICE FOR\b/i.test(label)) return false;
    return DOOR_KEYWORDS.some((k) => compact(label).includes(k));
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

  /* ------------------------------- panel UI ------------------------------- */
  const PANEL_CSS = `
    .qp-panel { position: fixed; z-index: 2147483647; width: 320px; max-height: 82vh;
      overflow-y: auto; background: #16181d; color: #e8eaed; border: 1px solid #2e323a;
      border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.55);
      font: 13px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; }
    .qp-head { display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; cursor: move; background: #1e2127; border-radius: 12px 12px 0 0;
      border-bottom: 1px solid #2e323a; user-select: none; }
    .qp-head b { font-size: 13px; letter-spacing: .02em; }
    .qp-head .qp-x { cursor: pointer; border: 0; background: #2a2e36; color: #cfd3da;
      width: 22px; height: 22px; border-radius: 50%; font-size: 12px; line-height: 1; }
    .qp-body { padding: 12px; }
    .qp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .qp-row label { flex: 0 0 92px; color: #9aa0ab; font-size: 12px; }
    .qp-row input { flex: 1; min-width: 0; background: #0f1114; border: 1px solid #2e323a;
      color: #e8eaed; border-radius: 8px; padding: 7px 9px; font-size: 13px; }
    .qp-row input:focus { outline: none; border-color: #4f7ccf; }
    .qp-row input.qp-guess { border-color: #8a6d1f; }
    .qp-note { font-size: 11px; color: #8b9099; margin: 6px 0 10px; }
    .qp-btn { width: 100%; border: 0; border-radius: 9px; padding: 10px; font-size: 13px;
      font-weight: 600; cursor: pointer; background: #2f6fed; color: #fff; margin-bottom: 8px; }
    .qp-btn:hover { background: #3b7bf5; }
    .qp-btn.qp-secondary { background: #24282f; color: #dfe3e8; border: 1px solid #343a44; }
    .qp-btn.qp-secondary:hover { background: #2b3038; }
    .qp-btn:disabled { opacity: .55; cursor: default; }
    .qp-err { background: #3a1d1d; border: 1px solid #6e2b2b; color: #f2b8b8;
      border-radius: 8px; padding: 8px 10px; font-size: 12px; margin-bottom: 8px; display: none; }
    .qp-res { border-top: 1px solid #2e323a; margin-top: 4px; padding-top: 10px; display: none; }
    .qp-res .qp-rrow { display: flex; align-items: center; justify-content: space-between;
      padding: 6px 0; border-bottom: 1px dashed #262a31; }
    .qp-res .qp-rrow:last-child { border-bottom: 0; }
    .qp-res .qp-k { color: #9aa0ab; font-size: 12px; }
    .qp-res .qp-v { font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
    .qp-res .qp-v.qp-final { color: #7ee2a8; font-size: 17px; }
    .qp-copy { border: 1px solid #343a44; background: #24282f; color: #cfd3da; border-radius: 7px;
      font-size: 11px; padding: 4px 9px; cursor: pointer; margin-left: 8px; }
    .qp-copy:hover { background: #2f353e; }
    .qp-ok { color: #7ee2a8; font-size: 12px; margin-top: 6px; display: none; }
    .qp-panel { transition: transform .3s cubic-bezier(.22,1,.36,1), opacity .25s ease;
      background: rgba(22,24,29,.96); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
    .qp-panel.qp-min { transform: translateX(calc(-100% - 32px)); opacity: 0; pointer-events: none; }
    .qp-dock { position: fixed; z-index: 2147483647; left: 0; top: 34%;
      width: 44px; padding: 14px 0 12px;
      background: rgba(18,20,25,.78);
      -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
      color: #e8eaed; border: 1px solid rgba(255,255,255,.09); border-left: 0;
      border-radius: 0 14px 14px 0;
      box-shadow: 8px 0 28px rgba(0,0,0,.5), inset 1px 0 0 rgba(255,255,255,.05);
      cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 10px;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      transition: transform .3s cubic-bezier(.22,1,.36,1), background .15s ease, width .18s ease; }
    .qp-dock:hover { background: rgba(30,34,41,.92); width: 50px; }
    .qp-dock.qp-hidden { transform: translateX(-115%); }
    .qp-dock .qp-dock-mark { width: 26px; height: 26px; border-radius: 9px; flex-shrink: 0;
      background: linear-gradient(135deg, #2f6fed 0%, #7a5cff 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800; letter-spacing: .03em; color: #fff;
      box-shadow: 0 2px 12px rgba(80,110,250,.55); }
    .qp-dock .qp-dock-label { writing-mode: vertical-rl; letter-spacing: .24em;
      font-size: 9px; font-weight: 700; color: #8b9099; transition: color .15s ease; }
    .qp-dock:hover .qp-dock-label { color: #d5d9e0; }
    .qp-dock .qp-dock-total { font-size: 10px; font-weight: 700; color: #7ee2a8;
      font-variant-numeric: tabular-nums; max-width: 38px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
  `;

  function makePanel(title) {
    const host = document.createElement("div");
    host.id = "qp-host";
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const panel = document.createElement("div");
    panel.className = "qp-panel";
    panel.style.left = "16px";
    panel.style.bottom = "16px";
    panel.innerHTML =
      '<div class="qp-head"><b>' + title + '</b><button class="qp-x" title="Dock to edge">\u2013</button></div>' +
      '<div class="qp-body"></div>';
    shadow.appendChild(style);
    shadow.appendChild(panel);

    // Edge dock: slim tab that lives on the right edge while the panel is
    // tucked away. Click it to slide the panel back out.
    const dock = document.createElement("div");
    dock.className = "qp-dock";
    dock.title = "QuotePro \u2014 click to expand";
    const dockMark = document.createElement("span");
    dockMark.className = "qp-dock-mark";
    dockMark.textContent = "QP";
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

    const setDocked = (docked) => {
      panel.classList.toggle("qp-min", docked);
      dock.classList.toggle("qp-hidden", !docked);
      try { GM_setValue(STORE.docked, docked); } catch (e) { /* noop */ }
    };
    const setDockTotal = (text) => {
      if (text) {
        dockTotal.textContent = text;
        dockTotal.style.display = "block";
      } else {
        dockTotal.style.display = "none";
      }
    };
    dock.addEventListener("click", () => setDocked(false));

    const head = panel.querySelector(".qp-head");
    head.querySelector(".qp-x").addEventListener("click", () => setDocked(true));
    // Start docked; the dock tab is the entry point.
    setDocked(GM_getValue(STORE.docked, true));
    // Drag by header.
    head.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("qp-x")) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = r.left + "px";
      panel.style.top = r.top + "px";
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const move = (ev) => {
        panel.style.left = Math.max(0, ev.clientX - sx) + "px";
        panel.style.top = Math.max(0, ev.clientY - sy) + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
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
      const label = (best.innerText || "").replace(/\s+/g, " ").trim();
      const m = label.match(/net price:\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})/i);
      if (!m) continue;
      const amount = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;
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
  function classifyItems(items, allowGuess) {
    const TOTAL_WORDS = /\b(subtotal|grand total|order total|total due|balance due|amount due|total price)\b/i;
    const included = [];
    items.forEach((r) => {
      if (TOTAL_WORDS.test(r.label)) { r.bucket = "total"; }
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
    let door = 0, windows = 0, misc = 0, doorGuess = false;
    const rest = [];
    let doorSet = false;
    included.forEach((r) => {
      if (isWindowsLabel(r.label)) { r.bucket = "windows"; windows += r.amount; return; }
      if (!doorSet && isDoorLabel(r.label)) { r.bucket = "door"; door = r.amount; doorSet = true; return; }
      rest.push(r);
    });
    let guessed = null;
    if (!doorSet && rest.length) {
      if (allowGuess) {
        guessed = rest.reduce((a, b) => (b.amount > a.amount ? b : a));
        guessed.bucket = "door";
        door = guessed.amount;
        doorGuess = true;
      } else {
        const first = rest.shift();
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
    return "Read " + s.rowCount + " " + what + " off this page. Verify before calculating" +
      (s.doorGuess ? " \u2014 door value is a guess (highlighted)." : ".");
  }

  function scrapeIStore() {
    const netItems = findNetPriceItems();
    if (netItems.length) {
      const r = classifyItems(netItems, false);
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
      if (amount === null || amount <= 0) continue;
      rows.push({ label, amount });
    }
    const r = classifyItems(rows, true);
    r.viaNet = false;
    return r;
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
        amt.textContent = "$" + fmt(ln.amount);
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
      const t = "$" + fmt(numVal(doorIn) + numVal(winIn) + numVal(miscIn));
      totalVal.textContent = t;
      setDockTotal(t);
    };
    [doorIn, winIn, miscIn].forEach((inp) => inp.addEventListener("input", updateTotal));
    updateTotal();

    const rescrape = document.createElement("button");
    rescrape.className = "qp-btn qp-secondary";
    rescrape.textContent = "Re-scan page";
    rescrape.addEventListener("click", () => {
      const s = scrapeIStore();
      doorIn.value = s.door || "";
      doorIn.classList.toggle("qp-guess", s.doorGuess);
      winIn.value = s.windows || "";
      miscIn.value = s.misc || "";
      note.textContent = describeScrape(s);
      renderLines(s);
      updateTotal();
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

    // Re-scan once more after late-loading SPA content settles.
    setTimeout(() => {
      if (!doorIn.value && !winIn.value && !miscIn.value) rescrape.click();
    }, 4000);
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
      val.textContent = "$" + fmt(r.v);
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

    const render = () => {
      body.innerHTML = "";
      const last = getLastResult();
      if (last) setDockTotal("$" + fmt(last.final_price));

      const note = document.createElement("div");
      note.className = "qp-note";
      if (last) {
        const when = new Date(last.at).toLocaleTimeString();
        note.textContent =
          "Last calculation (" + when + "): dealer $" + fmt(last.dealer_cost_total) +
          " \u00b7 double $" + fmt(last.double_cost) +
          " \u00b7 final $" + fmt(last.final_price) + ".";
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
        };
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
          lab.textContent = k.label + " ($" + fmt(last[k.key]) + ")" + (map[k.key] ? "" : " \u2014 not mapped");
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
      renderRows();
    };

    render();

    // ServiceTitan navigates without page loads: re-render when the URL
    // changes via hash, history API, or anything else.
    let lastHref = location.href;
    const checkNav = () => {
      if (location.href !== lastHref) {
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
