import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { Header } from "@/components/Header";
import { TabBar, type TabId } from "@/components/TabBar";
import { IntakePanel } from "@/components/IntakePanel";
import { PricingWorkbench } from "@/components/PricingWorkbench";
import { CostCheckPanel } from "@/components/CostCheckPanel";
import { QuoteRail } from "@/components/QuoteRail";
import { EstimatesView } from "@/components/EstimatesView";
import { HistoryView, type SavedQuote } from "@/components/HistoryView";
import { ApiView } from "@/components/ApiView";
import { AuthGate, type AuthResult } from "@/components/AuthGate";

import {
  apiCurl,
  apiPayload,
  calc,
  fmt$,
  parseInputs,
  solvePricing,
} from "@/lib/calc";
import {
  FIELD_DEFAULTS,
  SETTINGS_STORAGE_KEY,
  type FieldKey,
} from "@/lib/constants";
import { parsePricingText, type ParsedCard } from "@/lib/ocrParser";
import { parsePrices, type FillJob } from "@/lib/parse";
import { addHistory } from "@/lib/history";
import { supabase } from "@/lib/supabase";

/** Hero-total tween duration (ms), carried over from v6. */
const TWEEN_MS = 650;

/** Legacy settings shape kept for cloud/localStorage compat. Guided mode is dead. */
interface Settings {
  mode: "express" | "guided";
}

function loadStoredSettings(): Settings {
  const base: Settings = { mode: "express" };
  try {
    const cached = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null",
    );
    if (cached && typeof cached === "object") return { ...base, ...cached };
  } catch {
    /* storage unavailable — fall back to defaults */
  }
  return base;
}

export default function App() {
  /* ---------- core state ---------- */
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    ...FIELD_DEFAULTS,
  });
  const [activeTab, setActiveTab] = useState<TabId>("quote");
  const [filledKeys, setFilledKeys] = useState<FieldKey[]>([]);
  const [status, setStatus] = useState<{ msg: string; kind: "" | "ok" | "warn" }>(
    { msg: "WAITING FOR INPUT…", kind: "" },
  );
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [ocr, setOcr] = useState<{ active: boolean; progress: number | null }>({
    active: false,
    progress: null,
  });
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [scanSeq, setScanSeq] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  /* Door identity for saved quotes: model auto-captured from the scan's
     door card (editable), specs typed by Weston (size, insulation…). */
  const [doorModel, setDoorModel] = useState("");
  const [doorSpecs, setDoorSpecs] = useState("");
  const [solving, setSolving] = useState(false);
  const [solved, setSolved] = useState<{ margin: number; gap: number } | null>(
    null,
  );
  const [user, setUser] = useState<User | null>(null);
  const [tween, setTween] = useState({ dur: 0, seq: 0 });

  /* ---------- mirrors (read inside timers / global listeners) ---------- */
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const userRef = useRef(user);
  userRef.current = user;
  const settingsRef = useRef<Settings>(loadStoredSettings());
  const timersRef = useRef<number[]>([]);
  const ocrBusyRef = useRef(false);
  const solvingRef = useRef(false);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const showToast = useCallback((msg: string) => {
    toast(msg, { duration: 2600 });
  }, []);

  /** Re-runs the hero-total tween toward the latest calc. */
  const refresh = useCallback((animate = true) => {
    setTween((t) => ({ dur: animate ? TWEEN_MS : 0, seq: t.seq + 1 }));
  }, []);

  const c = useMemo(() => calc(parseInputs(fields)), [fields]);

  /* ---------- settings: cloud read (kept); guided mode ignored ---------- */
  const applySettings = useCallback(
    (s: Settings) => {
      /* Guided mode is dead — always express, but keep the stored shape. */
      const next: Settings = { ...settingsRef.current, ...s, mode: "express" };
      settingsRef.current = next;
      refresh(false);
    },
    [refresh],
  );

  const loadSettingsFromCloud = useCallback(
    async (uid: string) => {
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("settings")
          .eq("id", uid)
          .single();
        if (data?.settings) {
          const next: Settings = { ...settingsRef.current, ...data.settings };
          settingsRef.current = next;
          applySettings(next);
          try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        } else {
          console.log("No cloud settings found, keeping local.");
        }
      } catch (e) {
        console.error("Error loading cloud settings:", e);
      }
    },
    [applySettings],
  );

  /* ---------- instant fill (replaces the v6 typewriter) ---------- */
  const runFillJobs = useCallback(
    (jobs: FillJob[], okMsg?: string, scanCards?: ParsedCard[]) => {
      // Replace semantics: every scan sets ALL THREE cost fields. Categories
      // the scan didn't find reset to 0.00 instead of keeping stale values
      // (e.g. a leftover demo "250" in windows).
      const seen = new Set(jobs.map((j) => j.key));
      const full: FillJob[] = [
        ...jobs,
        ...(
          ["door", "windows", "etc"] as const
        )
          .filter((k) => !seen.has(k))
          .map(
            (k): FillJob => ({ key: k, value: 0, conf: "high" }),
          ),
      ];
      const keys = full.map((j) => j.key);
      setFields((f) => {
        const n = { ...f, mult: "1.00" };
        for (const j of full) n[j.key] = j.value.toFixed(2);
        return n;
      });
      addHistory({
        type: "scan",
        door: full.find((j) => j.key === "door")?.value ?? 0,
        windows: full.find((j) => j.key === "windows")?.value ?? 0,
        etc: full.find((j) => j.key === "etc")?.value ?? 0,
        cards: scanCards,
      });
      setFilledKeys(keys);
      later(() => setFilledKeys([]), 700); // 600ms flash, then clear
      const meds = jobs.filter((jj) => jj.conf === "med");
      if (meds.length) {
        setStatus({
          msg: `${jobs.length} PRICES READ · ${meds.length} NEED${
            meds.length > 1 ? "" : "S"
          } A LOOK`,
          kind: "warn",
        });
        showToast("FILLED — VERIFY THE NUMBERS");
      } else {
        setStatus({
          msg: okMsg ?? `${jobs.length} PRICES READ · MULTIPLIER → 1.00`,
          kind: "ok",
        });
        showToast("VALUES FILLED — QUOTE UPDATED");
      }
      setScanSeq((s) => s + 1);
      setLastScanAt(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
      refresh(true);
    },
    [later, refresh, showToast],
  );

  const applyPaste = useCallback(
    (text: string) => {
      const jobs = parsePrices(text);
      if (!jobs.length) {
        setStatus({
          msg: "NO PRICES FOUND IN THAT PASTE — TRY AGAIN",
          kind: "warn",
        });
        showToast("NO PRICES FOUND");
        return;
      }
      runFillJobs(jobs);
    },
    [runFillJobs, showToast],
  );

  /* ---------- OCR intake (tesseract.js, hardened; inline progress) ---------- */
  const handleOcrText = useCallback(
    (text: string) => {
      const r = parsePricingText(text);
      setParsedCards(r.cards);
      /* Capture the door model from the scan's door card for saved quotes. */
      const doorCard = r.cards.find((card) => card.kind === "door");
      if (doorCard) setDoorModel(doorCard.label);
      if (!r.cards.length) {
        setStatus({
          msg: "NO NET PRICE FOUND — TRY A CLEARER SHOT OR PASTE TEXT",
          kind: "warn",
        });
        showToast("NO PRICES FOUND IN IMAGE");
        return;
      }
      const jobs: FillJob[] = [
        { key: "door", value: r.door, conf: "high" },
        { key: "windows", value: r.windows, conf: "high" },
        { key: "etc", value: r.etc, conf: "high" },
      ];
      const hasDoor = r.cards.some((c) => c.kind === "door");
      runFillJobs(
        jobs,
        // The door card wasn't detected (OCR mangled the model line or it was
        // cropped out). Never guess — flag it loudly instead of filling a
        // wrong number.
        hasDoor
          ? `SCANNED ${r.cards.length} ITEM${
              r.cards.length > 1 ? "S" : ""
            } — MULTIPLIER → 1.00`
          : `SCANNED ${r.cards.length} ITEM${
              r.cards.length > 1 ? "S" : ""
            } — DOOR NOT FOUND, CHECK THE SCREENSHOT`,
        r.cards,
      );
      if (!hasDoor) showToast("DOOR NOT FOUND IN SCAN");
    },
    [runFillJobs, showToast],
  );

  const runOCR = useCallback(
    async (file: File) => {
      if (ocrBusyRef.current) return;
      ocrBusyRef.current = true;
      setOcr({ active: true, progress: null });
      setOcrError(null);
      setStatus({ msg: "SCANNING SCREENSHOT…", kind: "" });
      try {
        /* Dynamic import so a failed worker/library load degrades gracefully. */
        let recognize: unknown = null;
        try {
          const mod = (await import("tesseract.js")) as unknown as {
            default?: { recognize?: unknown };
            recognize?: unknown;
          };
          recognize = mod.default?.recognize ?? mod.recognize ?? null;
        } catch {
          recognize = null;
        }
        if (typeof recognize !== "function")
          throw new Error("OCR engine failed to load");
        const res = await (
          recognize as (
            image: File,
            langs: string,
            options: {
              logger: (m: { status?: string; progress?: number }) => void;
            },
          ) => Promise<{ data?: { text?: string } }>
        )(file, "eng", {
          logger: (m) => {
            if (m?.status === "recognizing text") {
              setOcr((s) => ({
                ...s,
                progress: Math.round((m.progress ?? 0) * 100),
              }));
            }
          },
        });
        handleOcrText(String(res?.data?.text ?? ""));
      } catch (err) {
        console.error(err);
        /* A dead engine load means this tab is running a stale deployment
           (chunk URL orphaned by a redeploy) — a refresh is the real fix,
           not retrying the scan. */
        const staleBundle =
          err instanceof Error && err.message === "OCR engine failed to load";
        const msg = staleBundle
          ? "QUOTE PRO WAS UPDATED — PLEASE REFRESH THE PAGE AND TRY AGAIN"
          : "COULD NOT READ IMAGE — TRY AGAIN OR PASTE TEXT";
        setOcrError(msg);
        setStatus({ msg, kind: "warn" });
        showToast(staleBundle ? "PLEASE REFRESH THE PAGE, THEN SCAN AGAIN" : "OCR FAILED — PASTE THE TEXT INSTEAD");
      } finally {
        /* ALWAYS dismiss — no stuck spinner, ever. */
        setOcr({ active: false, progress: null });
        ocrBusyRef.current = false;
      }
    },
    [handleOcrText, showToast],
  );

  const handleImage = useCallback(
    (file: File) => {
      const rd = new FileReader();
      rd.onload = () => {
        setImgPreview(typeof rd.result === "string" ? rd.result : null);
      };
      rd.readAsDataURL(file);
      runOCR(file);
    },
    [runOCR],
  );

  const onDropFiles = useCallback(
    (files: FileList) => {
      const f = files[0];
      if (!f) return;
      if (f.type.indexOf("image/") === 0) handleImage(f);
      else if (/text/.test(f.type) || /\.txt$|\.csv$/.test(f.name)) {
        const rd = new FileReader();
        rd.onload = () =>
          applyPaste(typeof rd.result === "string" ? rd.result : "");
        rd.readAsText(f);
      }
    },
    [applyPaste, handleImage],
  );

  /* ---------- global paste-anywhere (never hijacks form fields) ---------- */
  const actionsRef = useRef({ applyPaste, handleImage });
  actionsRef.current = { applyPaste, handleImage };

  /* Warm the lazily-loaded OCR engine chunk at mount, while the tab is fresh.
     Without this, a tab left open across a production redeploy requests a
     stale chunk URL that no longer exists -> strict MIME failure -> the
     engine "fails to load". Fetching it now shrinks that window to page load. */
  useEffect(() => {
    import("tesseract.js").catch(() => {
      /* Loaded on demand in runOCR; a failure here is non-fatal. */
    });
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]"))
        return;
      const cd = e.clipboardData;
      if (!cd) return;
      let handled = false;
      for (let i = 0; i < cd.items.length; i++) {
        const item = cd.items[i];
        if (item.type.indexOf("image/") === 0) {
          const f = item.getAsFile();
          if (f) {
            actionsRef.current.handleImage(f);
            handled = true;
            break;
          }
        }
      }
      if (!handled) {
        const t = cd.getData("text");
        if (t && t.trim()) {
          actionsRef.current.applyPaste(t);
          handled = true;
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /* ---------- actions ---------- */
  const hideSolved = useCallback(() => setSolved(null), []);

  const onField = useCallback(
    (k: FieldKey, v: string) => {
      setFields((f) => ({ ...f, [k]: v }));
      setFilledKeys((ks) => ks.filter((kk) => kk !== k));
      refresh(true);
      hideSolved();
    },
    [hideSolved, refresh],
  );

  const onCardClick = useCallback((kind: "door" | "windows" | "etc") => {
    const el = document.getElementById(`field-${kind}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLInputElement).focus({ preventScroll: true });
    }
  }, []);

  const onRescan = useCallback(() => {
    setParsedCards([]);
    setDoorModel("");
    setDoorSpecs("");
    setImgPreview(null);
    setOcrError(null);
    setStatus({ msg: "WAITING FOR INPUT…", kind: "" });
  }, []);

  const reset = useCallback(() => {
    setFields({ ...FIELD_DEFAULTS });
    setFilledKeys([]);
    setParsedCards([]);
    setDoorModel("");
    setDoorSpecs("");
    setImgPreview(null);
    setOcrError(null);
    setLastScanAt(null);
    setStatus({ msg: "WAITING FOR INPUT…", kind: "" });
    refresh(true);
    showToast("RESET TO DEMO NUMBERS");
  }, [refresh, showToast]);

  const solveSequence = useCallback(() => {
    if (solvingRef.current) return;
    solvingRef.current = true;
    setSolving(true);
    hideSolved();
    later(() => {
      setFields((f) => ({ ...f, inst: "0.00", fuel: "0.00" }));
      refresh(true);
    }, 400);
    later(() => {
      const before = calc(parseInputs(fieldsRef.current));
      const { inst, fuel } = solvePricing(before);
      const solvedInputs = { ...parseInputs(fieldsRef.current), inst, fuel };
      setFields((f) => ({
        ...f,
        inst: inst.toFixed(2),
        fuel: fuel.toFixed(2),
      }));
      refresh(true);
      const c2 = calc(solvedInputs);
      setSolved({ margin: c2.margin, gap: Math.round(c2.gap) });
      addHistory({
        type: "solve",
        door: solvedInputs.door,
        windows: solvedInputs.windows,
        etc: solvedInputs.etc,
        grandTotal: c2.grandTotal,
        margin: c2.margin,
      });
      later(() => setSolved(null), 4200);
      solvingRef.current = false;
      setSolving(false);
    }, 1100);
  }, [hideSolved, later, refresh]);

  const onRestoreHistory = useCallback(
    (q: SavedQuote) => {
      setFields((f) => ({
        ...f,
        door: q.door.toFixed(2),
        windows: q.windows.toFixed(2),
        etc: q.miscellaneous.toFixed(2),
        mult: (q.multiplier ?? 1).toFixed(2),
      }));
      setDoorModel(q.door_model ?? "");
      setDoorSpecs(q.door_specs ?? "");
      setActiveTab("quote");
      refresh(true);
      showToast("QUOTE RESTORED");
    },
    [refresh, showToast],
  );

  const fallbackCopy = (t: string) => {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* clipboard unavailable */
    }
    document.body.removeChild(ta);
  };

  const copyApiCall = useCallback(() => {
    const cc = calc(parseInputs(fieldsRef.current));
    const curl = apiCurl(apiPayload(cc));
    const done = () => showToast("API CALL COPIED — PASTE IT ANYWHERE");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(curl).then(done, () => {
        fallbackCopy(curl);
        done();
      });
    } else {
      fallbackCopy(curl);
      done();
    }
  }, [showToast]);

  /* ---------- auth ---------- */
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadSettingsFromCloud(session.user.id);
        } else {
          setUser(null);
        }
      },
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadSettingsFromCloud(session.user.id);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadSettingsFromCloud]);

  const handleLogin = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!email || !password)
        return { ok: false, message: "Please enter email and password" };
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error)
        return {
          ok: false,
          message: error.message.includes("Invalid login")
            ? "Invalid email or password."
            : error.message,
        };
      return { ok: true, message: "" };
    },
    [],
  );

  const handleSignup = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!email || !password)
        return { ok: false, message: "Please enter email and password" };
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { ok: false, message: error.message };
      return {
        ok: true,
        message:
          "Account created! Check your email to verify (or try logging in if auto-confirm is on).",
      };
    },
    [],
  );

  const handleReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!email)
        return { ok: false, message: "Please enter your email address first." };
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: "Password reset email sent!" };
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    later(() => {
      refresh(true);
      later(() => showToast("PASTE AN ISTORE SCREENSHOT OR PRICE TEXT"), 900);
    }, 400);
    const stash = timersRef.current;
    return () => {
      stash.forEach((id) => window.clearTimeout(id));
    };
  }, [later, refresh, showToast]);

  /* ---------- render: the Command Deck ---------- */
  return (
    <div id="app" className="min-h-screen bg-bg text-ink">
      <Header
        user={user}
        onSignOut={handleSignOut}
        onCopyApi={copyApiCall}
        onPrint={() => window.print()}
      />
      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "quote" && (
        <>
          {/* Mobile sticky total bar (below the sticky header + tab bar).
              Frosted-glass material with a soft drop shadow so it reads as
              a floating layer over the scrolling content beneath it. */}
          <div className="no-print sticky top-[100px] z-30 bg-bg/75 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.28)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
            <div className="mx-auto flex max-w-[1560px] items-baseline justify-between px-4 py-2 sm:px-6">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Grand total
              </span>
              <span className="font-num text-xl font-semibold">
                ${fmt$(c.grandTotal)}
              </span>
            </div>
          </div>

          <main className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[320px_minmax(0,1fr)_380px]">
          {/* Left zone: on xl this wrapper disappears (contents) so intake
              becomes its own sticky grid column; on lg it stacks intake +
              pricing in column 1. */}
          <div className="min-w-0 space-y-6 xl:contents">
            <aside className="no-print min-w-0 xl:sticky xl:top-20 xl:self-start">
              <IntakePanel
                statusMsg={status.msg}
                statusKind={status.kind}
                ocrActive={ocr.active}
                ocrProgress={ocr.progress}
                ocrError={ocrError}
                onDismissError={() => setOcrError(null)}
                imgPreview={imgPreview}
                cards={parsedCards}
                scanSeq={scanSeq}
                lastScanAt={lastScanAt}
                onDropFiles={onDropFiles}
                onDropzoneClick={() =>
                  showToast("PRESS ⌘V / CTRL+V TO PASTE")
                }
                onCardClick={onCardClick}
                onRescan={onRescan}
              />
            </aside>
            <div className="min-w-0 space-y-6">
              <PricingWorkbench
                fields={fields}
                onField={onField}
                filledKeys={filledKeys}
              />
              <CostCheckPanel c={c} />
            </div>
          </div>
          <aside className="min-w-0">
            <QuoteRail
              c={c}
              tweenDur={tween.dur}
              tweenSeq={tween.seq}
              solving={solving}
              solved={solved}
              onSolve={solveSequence}
              onReset={reset}
              onCopyApi={copyApiCall}
              onPrint={() => window.print()}
              doorModel={doorModel}
              doorSpecs={doorSpecs}
              onDoorModel={setDoorModel}
              onDoorSpecs={setDoorSpecs}
            />
          </aside>
        </main>
        </>
      )}
      {activeTab === "estimates" && <EstimatesView />}
      {activeTab === "history" && <HistoryView onRestore={onRestoreHistory} />}
      {activeTab === "api" && <ApiView />}

      <AuthGate
        open={!user}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onReset={handleReset}
      />
    </div>
  );
}
