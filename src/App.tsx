import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { Header } from "@/components/Header";
import { DoorPreview } from "@/components/DoorPreview";
import { IntakeCard, type StatusState } from "@/components/IntakeCard";
import { PricesCard, type FieldTag } from "@/components/PricesCard";
import { TotalCard, TWEEN_MS } from "@/components/TotalCard";
import { ActionsCard } from "@/components/ActionsCard";
import { EstimatesView } from "@/components/EstimatesView";
import { AuthGate, type AuthResult } from "@/components/AuthGate";
import { OcrOverlay } from "@/components/OcrOverlay";

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
  SAMPLE_TEXT,
  SETTINGS_STORAGE_KEY,
  type FieldKey,
} from "@/lib/constants";
import { parsePricingText, type ParsedCard } from "@/lib/ocrParser";
import { parsePrices, type FillJob } from "@/lib/parse";
import { supabase } from "@/lib/supabase";

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
  const [mode, setModeState] = useState<"express" | "guided">("express");
  const [gstep, setGstepState] = useState(0);
  const [showEstimates, setShowEstimates] = useState(false);
  const [tags, setTags] = useState<Record<"door" | "windows" | "etc", FieldTag>>({
    door: null,
    windows: null,
    etc: null,
  });
  const [status, setStatus] = useState<StatusState>({
    msg: "WAITING FOR INPUT…",
    kind: "",
  });
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [ocr, setOcr] = useState<{ active: boolean; progress: number | null }>({
    active: false,
    progress: null,
  });
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [solving, setSolving] = useState(false);
  const [solved, setSolved] = useState<{ margin: number; gap: number } | null>(
    null,
  );
  const [user, setUser] = useState<User | null>(null);
  const [doorStage, setDoorStage] = useState(-1);
  const [pulseKey, setPulseKey] = useState(0);
  const [tween, setTween] = useState({ dur: 0, seq: 0 });

  /* ---------- mirrors (read inside timers / global listeners) ---------- */
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const modeRef = useRef(mode);
  modeRef.current = mode;
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

  /** v5's `refresh(animate)` — re-runs the tween toward the latest calc. */
  const refresh = useCallback((animate = true) => {
    setTween((t) => ({ dur: animate ? TWEEN_MS : 0, seq: t.seq + 1 }));
  }, []);

  const c = useMemo(() => calc(parseInputs(fields)), [fields]);

  /* ---------- settings sync ---------- */
  const persistSettings = useCallback((next: Settings) => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    const u = userRef.current;
    if (!u) return;
    supabase
      .from("user_settings")
      .upsert({
        id: u.id,
        email: u.email,
        settings: next,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error("Error saving settings to cloud:", error);
      });
  }, []);

  const setGstep = useCallback(
    (s: number, silentToast = false) => {
      const ns = Math.max(0, Math.min(2, s));
      setGstepState(ns);
      if (!silentToast) {
        const labels = ["PASTE YOUR PRICES", "REVIEW THE PRICES", "QUOTE IS READY"];
        showToast(`STEP ${ns + 1} / 3 — ${labels[ns]}`);
      }
    },
    [showToast],
  );

  const setMode = useCallback(
    (m: "express" | "guided", silent = false) => {
      setModeState(m);
      if (m === "guided") setGstep(0, true);
      if (!silent) {
        const next: Settings = { ...settingsRef.current, mode: m };
        settingsRef.current = next;
        persistSettings(next);
        showToast(
          m === "express"
            ? "EXPRESS MODE — PASTE, DONE"
            : "GUIDED MODE — ONE STEP AT A TIME",
        );
      }
    },
    [persistSettings, setGstep, showToast],
  );

  const applySettings = useCallback(
    (s: Settings) => {
      setMode(s.mode === "guided" ? "guided" : "express", true);
      refresh(false);
    },
    [refresh, setMode],
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

  /* ---------- tags / fill sequence ---------- */
  const clearTags = useCallback(() => {
    setTags({ door: null, windows: null, etc: null });
  }, []);

  const fillAnimated = useCallback(
    (key: FieldKey, val: number, done: () => void) => {
      const v = val.toFixed(2);
      setFields((f) => ({ ...f, [key]: "" }));
      let j = 0;
      const step = () => {
        j += 1;
        const slice = v.slice(0, j);
        setFields((f) => ({ ...f, [key]: slice }));
        if (j >= v.length) {
          refresh(true);
          done();
        } else {
          later(step, 26);
        }
      };
      later(step, 26);
    },
    [later, refresh],
  );

  const runFillJobs = useCallback(
    (jobs: FillJob[], okMsg?: string) => {
      setFields((f) => ({ ...f, mult: "1.00" }));
      setStatus({
        msg: `READING ${jobs.length} PRICE${jobs.length > 1 ? "S" : ""}…`,
        kind: "",
      });
      let i = 0;
      const next = () => {
        if (i >= jobs.length) {
          const meds = jobs.filter((jj) => jj.conf === "med");
          if (meds.length) {
            setStatus({
              msg: `${jobs.length} PRICES READ · ${meds.length} NEED${
                meds.length > 1 ? "" : "S"
              } A LOOK`,
              kind: "warn",
            });
            showToast("FILLED — CHECK THE AMBER FIELDS");
          } else {
            setStatus({
              msg: okMsg ?? `${jobs.length} PRICES READ · MULTIPLIER → 1.00`,
              kind: "ok",
            });
            showToast("VALUES FILLED — QUOTE UPDATED");
          }
          setPulseKey((k) => k + 1);
          setDoorStage(3);
          refresh(true);
          if (modeRef.current === "guided") setGstep(1);
          return;
        }
        const job = jobs[i++];
        setTags((t) => ({
          ...t,
          [job.key]: job.conf === "high" ? "paste" : "check",
        }));
        fillAnimated(job.key, job.value, () => later(next, 140));
      };
      next();
    },
    [fillAnimated, later, refresh, setGstep, showToast],
  );

  const applyPaste = useCallback(
    (text: string) => {
      clearTags();
      const jobs = parsePrices(text);
      if (!jobs.length) {
        setStatus({ msg: "NO PRICES FOUND IN THAT PASTE — TRY AGAIN", kind: "warn" });
        showToast("NO PRICES FOUND");
        return;
      }
      runFillJobs(jobs);
    },
    [clearTags, runFillJobs, showToast],
  );

  /* ---------- OCR intake (tesseract.js v7, hardened) ---------- */
  const handleOcrText = useCallback(
    (text: string) => {
      clearTags();
      const r = parsePricingText(text);
      setParsedCards(r.cards);
      if (!r.cards.length) {
        setStatus({
          msg: "NO NET PRICE FOUND — TRY A CLEARER SHOT OR PASTE TEXT",
          kind: "warn",
        });
        showToast("NO PRICES FOUND IN IMAGE");
        return;
      }
      const jobs: FillJob[] = [];
      if (r.door > 0) jobs.push({ key: "door", value: r.door, conf: "high" });
      if (r.windows > 0)
        jobs.push({ key: "windows", value: r.windows, conf: "high" });
      if (r.etc > 0) jobs.push({ key: "etc", value: r.etc, conf: "high" });
      if (!jobs.length) {
        setStatus({
          msg: "NO NET PRICE FOUND — TRY A CLEARER SHOT OR PASTE TEXT",
          kind: "warn",
        });
        showToast("NO PRICES FOUND IN IMAGE");
        return;
      }
      runFillJobs(
        jobs,
        `SCANNED ${r.cards.length} ITEM${r.cards.length > 1 ? "S" : ""} — MULTIPLIER → 1.00`,
      );
    },
    [clearTags, runFillJobs, showToast],
  );

  const runOCR = useCallback(
    async (file: File) => {
      if (ocrBusyRef.current) return;
      ocrBusyRef.current = true;
      setOcr({ active: true, progress: null });
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
        setStatus({
          msg: "COULD NOT READ IMAGE — TRY AGAIN OR PASTE TEXT",
          kind: "warn",
        });
        showToast("OCR FAILED — PASTE THE TEXT INSTEAD");
      } finally {
        /* ALWAYS dismiss the overlay — no stuck spinner, ever. */
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

  /* ---------- global paste-anywhere ---------- */
  const actionsRef = useRef({ applyPaste, handleImage });
  actionsRef.current = { applyPaste, handleImage };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      /* Deliberate deviation from v5: never hijack paste inside form fields
         (v5's global handler swallowed pastes into the login/estimate inputs). */
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
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
      refresh(true);
      hideSolved();
    },
    [hideSolved, refresh],
  );

  const reset = useCallback(() => {
    setFields({ ...FIELD_DEFAULTS });
    clearTags();
    setParsedCards([]);
    setStatus({ msg: "WAITING FOR INPUT…", kind: "" });
    refresh(true);
    showToast("RESET TO DEMO NUMBERS");
  }, [clearTags, refresh, showToast]);

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
      later(() => setSolved(null), 4200);
      solvingRef.current = false;
      setSolving(false);
    }, 1100);
  }, [hideSolved, later, refresh]);

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

  /* ---------- boot sequence ---------- */
  useEffect(() => {
    [0, 1, 2, 3].forEach((s) => later(() => setDoorStage(s), 350 + s * 420));
    later(() => {
      refresh(true);
      later(() => showToast("PASTE AN ISTORE SCREENSHOT OR PRICE TEXT"), 900);
    }, 400);
    const stash = timersRef.current;
    return () => {
      stash.forEach((id) => window.clearTimeout(id));
    };
  }, [later, refresh, showToast]);

  /* ---------- render ---------- */
  const guided = mode === "guided";
  const dim = (step: number) => guided && gstep !== step;

  return (
    <div id="app" className={guided ? "guided" : ""}>
      <Header
        mode={mode}
        onMode={(m) => setMode(m)}
        user={user}
        onSignOut={handleSignOut}
        showEstimates={showEstimates}
        onToggleEstimates={() => setShowEstimates((s) => !s)}
        onCopyApi={copyApiCall}
        onPrint={() => window.print()}
      />

      {showEstimates ? (
        <EstimatesView />
      ) : (
        <div id="layout">
          <IntakeCard
            imgPreview={imgPreview}
            status={status}
            parsedCards={parsedCards}
            guided={guided}
            onDropFiles={onDropFiles}
            onDropzoneClick={() => showToast("PRESS ⌘V / CTRL+V TO PASTE")}
            onSample={() => applyPaste(SAMPLE_TEXT)}
            onContinue={() => setGstep(1)}
            dim={dim(0)}
          />
          <PricesCard
            fields={fields}
            tags={tags}
            onField={onField}
            guided={guided}
            onContinue={() => setGstep(2)}
            dim={dim(1)}
          />
          <TotalCard
            c={c}
            tweenDur={tween.dur}
            tweenSeq={tween.seq}
            dim={dim(2)}
          />
          <ActionsCard
            solving={solving}
            onSolve={solveSequence}
            onReset={reset}
            onCopyApi={copyApiCall}
            dim={dim(2)}
          />
          <DoorPreview stage={doorStage} pulseKey={pulseKey} />
        </div>
      )}

      {!showEstimates && (
        <div id="mtotal" aria-hidden="true">
          <span className="k">GRAND TOTAL</span>
          <span id="mtotalnum">${fmt$(c.grandTotal)}</span>
        </div>
      )}

      {solved && (
        <div id="solved" className="show" role="status">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          <span>
            SOLVED — {solved.margin.toFixed(1)}% MARGIN · GAP ${solved.gap}
          </span>
        </div>
      )}

      <OcrOverlay active={ocr.active} progress={ocr.progress} />

      <AuthGate
        open={!user}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onReset={handleReset}
      />
    </div>
  );
}
