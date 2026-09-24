import { useEffect, useRef, useState } from "react";
import {
  Copy,
  List,
  LogOut,
  Monitor,
  Moon,
  Printer,
  Sun,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface HeaderProps {
  mode: "express" | "guided";
  onMode: (m: "express" | "guided") => void;
  user: User | null;
  onSignOut: () => void;
  showEstimates: boolean;
  onToggleEstimates: () => void;
  onCopyApi: () => void;
  onPrint: () => void;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { v: "light" as const, icon: Sun, label: "Light" },
    { v: "dark" as const, icon: Moon, label: "Dark" },
    { v: "system" as const, icon: Monitor, label: "System" },
  ];
  return (
    <div className="seg seg-tight" role="tablist" aria-label="Theme">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          role="tab"
          aria-selected={theme === v}
          title={label}
          className={cn(theme === v && "on")}
          onClick={() => setTheme(v)}
        >
          <Icon size={14} strokeWidth={1.75} aria-label={label} />
        </button>
      ))}
    </div>
  );
}

function ProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open ]);

  return (
    <div
      className="profile-container"
      ref={ref}
      style={{ display: "block" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="profile-trigger"
        aria-label="Account"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {(user.email ?? "?").charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="profile-dropdown active">
          <div className="profile-email">{user.email}</div>
          <button className="profile-btn" onClick={onSignOut}>
            <LogOut size={13} strokeWidth={2} /> SIGN OUT
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({
  mode,
  onMode,
  user,
  onSignOut,
  showEstimates,
  onToggleEstimates,
  onCopyApi,
  onPrint,
}: HeaderProps) {
  return (
    <header className="qp-header">
      <div className="brandmark">
        <img className="hlogo" src="/large-logo.png" alt="QuotePro logo" />
        <div className="wordmark">
          QUOTE<span className="p">PRO</span>
          <small>EXPRESS ESTIMATING</small>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Mode">
        <button
          role="tab"
          aria-selected={mode === "express"}
          className={cn(mode === "express" && "on")}
          onClick={() => onMode("express")}
        >
          EXPRESS
        </button>
        <button
          role="tab"
          aria-selected={mode === "guided"}
          className={cn(mode === "guided" && "on")}
          onClick={() => onMode("guided")}
        >
          GUIDED
        </button>
      </div>

      <div className="hctl">
        <ThemeToggle />
        <button
          className={cn("btn ghost hbtn", showEstimates && "on")}
          onClick={onToggleEstimates}
          title="Open estimate list"
        >
          <List size={15} strokeWidth={1.75} />
          <span className="hbtn-lbl">LIST</span>
        </button>
        <button
          className="btn ghost hbtn"
          onClick={onCopyApi}
          title="Copy this quote as an API call"
        >
          <Copy size={15} strokeWidth={1.75} />
          <span className="hbtn-lbl lbl-api">API</span>
        </button>
        <button className="btn ghost hbtn hbtn-print" onClick={onPrint} title="Print">
          <Printer size={15} strokeWidth={1.75} />
          <span className="hbtn-lbl">PRINT</span>
        </button>
        {user && <ProfileMenu user={user} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}
