import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
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
 * Login gate — Supabase email/password auth. Same flows and strings as v5:
 * SIGN IN / CREATE ACCOUNT / FORGOT PASSWORD?, session-driven show/hide.
 */
export function AuthGate({ open, onLogin, onSignup, onReset }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const linkBtn =
    "flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted transition-colors duration-150 hover:text-ink disabled:opacity-50";

  return (
    <div
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-8">
        <div className="mb-7">
          <div className="font-sans text-[22px] font-semibold text-ink">
            QuotePro
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Grand Valley Garage Doors
          </div>
        </div>

        <div className="space-y-3">
          <Input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            aria-label="Email address"
            className="focus-visible:border-accent focus-visible:ring-accent/30"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
            className="focus-visible:border-accent focus-visible:ring-accent/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") run(() => onLogin(email, password));
            }}
          />
        </div>

        <div
          className={cn(
            "mt-3 min-h-[20px] text-[13px]",
            errorOk ? "text-ok" : "text-bad",
          )}
          role={error ? "alert" : undefined}
        >
          {error || "\u00A0"}
        </div>

        <button
          type="button"
          onClick={() => run(() => onLogin(email, password))}
          disabled={busy}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold uppercase tracking-[0.06em] text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          <LogIn size={15} strokeWidth={2} aria-hidden /> SIGN IN
        </button>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            className={linkBtn}
            onClick={() => run(() => onSignup(email, password))}
            disabled={busy}
          >
            <UserPlus size={13} strokeWidth={2} aria-hidden /> CREATE ACCOUNT
          </button>
          <button
            type="button"
            className={linkBtn}
            onClick={() => run(() => onReset(email))}
            disabled={busy}
          >
            FORGOT PASSWORD?
          </button>
        </div>
      </div>
    </div>
  );
}
