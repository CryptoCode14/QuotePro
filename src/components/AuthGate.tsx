import { useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AuthResult {
  ok: boolean;
  message: string;
}

interface AuthGateProps {
  open: boolean;
  onLogin: (email: string, password: string) => Promise<AuthResult>;
  onSignup: (email: string, password: string) => Promise<AuthResult>;
  onReset: (email: string) => Promise<AuthResult>;
}

/**
 * Login gate — Supabase email/password auth. Same flows as v5:
 * SIGN IN / CREATE ACCOUNT / FORGOT PASSWORD?, session-driven show/hide.
 *
 * Premium split design: fixed dark brand panel + clean themed form panel.
 */
export function AuthGate({ open, onLogin, onSignup, onReset }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorOk, setErrorOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const showMessage = (msg: string, ok: boolean, clearAfterMs?: number) => {
    setError(msg);
    setErrorOk(ok);
    if (clearAfterMs) {
      window.setTimeout(() => {
        setError("");
        setErrorOk(false);
      }, clearAfterMs);
    }
  };

  const run = async (fn: () => Promise<AuthResult>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) showMessage(r.message, false);
      else if (r.message) showMessage(r.message, true, 5000);
      else {
        setError("");
        setErrorOk(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = () => run(() => onLogin(email, password));

  return (
    <div
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to QuotePro"
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
    >
      <div className="grid min-h-full md:grid-cols-2">
        {/* Brand panel — fixed premium dark, always. */}
        <div
          className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between md:p-12"
          style={{
            background:
              "radial-gradient(120% 90% at 20% 10%, #2b1a4d 0%, #14101f 45%, #0a0a10 100%)",
          }}
          aria-hidden="true"
        >
          {/* Soft accent glows */}
          <div
            className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "rgba(108, 71, 255, 0.28)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "rgba(0, 113, 227, 0.22)" }}
          />
          {/* Faint panel-line motif */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 118px, #ffffff 118px 120px)",
            }}
          />

          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
              Grand Valley Garage Doors
            </div>
            <div className="mt-6 font-sans text-[56px] font-semibold leading-none tracking-tight text-white">
              QuotePro
            </div>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/70">
              Dealer-grade estimate pricing — precise numbers for every door,
              window, and option, in seconds.
            </p>
          </div>

          <div className="relative flex items-center gap-3">
            <div
              className="h-px w-10"
              style={{ background: "rgba(255,255,255,0.35)" }}
            />
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/50">
              Internal estimating tool
            </div>
          </div>
        </div>

        {/* Form panel — follows the app theme. */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            {/* Compact brand header on mobile (panel is hidden). */}
            <div className="mb-8 md:hidden">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Grand Valley Garage Doors
              </div>
              <div className="mt-1 font-sans text-[32px] font-semibold tracking-tight text-ink">
                QuotePro
              </div>
            </div>

            <h1 className="font-sans text-[26px] font-semibold tracking-tight text-ink">
              Welcome back
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              Sign in to your QuotePro workspace.
            </p>

            <div className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor="qp-email"
                  className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted"
                >
                  Email
                </label>
                <Input
                  id="qp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@grandvalley.com"
                  autoComplete="email"
                  className="h-12 rounded-xl focus-visible:border-accent focus-visible:ring-accent/30"
                />
              </div>

              <div>
                <label
                  htmlFor="qp-password"
                  className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted"
                >
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="qp-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    className="h-12 rounded-xl pr-12 focus-visible:border-accent focus-visible:ring-accent/30"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitLogin();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-fill hover:text-ink"
                  >
                    {showPassword ? (
                      <EyeOff size={17} strokeWidth={2} aria-hidden />
                    ) : (
                      <Eye size={17} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "mt-3 min-h-[20px] text-[13px] font-medium",
                errorOk ? "text-ok" : "text-bad",
              )}
              role={error ? "alert" : undefined}
            >
              {error || "\u00A0"}
            </div>

            <button
              type="button"
              onClick={submitLogin}
              disabled={busy}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold uppercase tracking-[0.08em] text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none"
            >
              <LogIn size={15} strokeWidth={2} aria-hidden /> Sign in
            </button>

            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-hairline" />
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                New here
              </div>
              <div className="h-px flex-1 bg-hairline" />
            </div>

            <button
              type="button"
              onClick={() => run(() => onSignup(email, password))}
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface text-[13px] font-semibold uppercase tracking-[0.08em] text-ink shadow-card transition-all duration-150 hover:brightness-[0.98] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              <UserPlus size={15} strokeWidth={2} aria-hidden /> Create account
            </button>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => run(() => onReset(email))}
                disabled={busy}
                className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted transition-colors duration-150 hover:text-ink disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
