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

  return (
    <div id="login-overlay" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="login-card">
        <img src="/large-logo.png" alt="QuotePro logo" />
        <div className="login-title">QuotePro</div>
        <div className="login-sub">GRAND VALLEY GARAGE DOORS</div>
        <Input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          className="login-input"
          aria-label="Email address"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="login-input"
          aria-label="Password"
          onKeyDown={(e) => {
            if (e.key === "Enter") run(() => onLogin(email, password));
          }}
        />
        <div
          className={cn("error-msg", errorOk && "ok")}
          role={error ? "alert" : undefined}
        >
          {error || "\u00A0"}
        </div>
        <button
          className="btn primary abtn"
          onClick={() => run(() => onLogin(email, password))}
          disabled={busy}
        >
          <LogIn size={15} strokeWidth={2} aria-hidden /> SIGN IN
        </button>
        <div className="login-links">
          <button
            className="linkbtn"
            onClick={() => run(() => onSignup(email, password))}
            disabled={busy}
          >
            <UserPlus size={13} strokeWidth={2} aria-hidden /> CREATE ACCOUNT
          </button>
          <button
            className="linkbtn"
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
