import { CircleUserRound, Copy, List, Moon, Printer, Sun } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: User | null;
  onSignOut: () => void;
  showEstimates: boolean;
  onToggleEstimates: () => void;
  onCopyApi: () => void;
  onPrint: () => void;
}

const iconBtn =
  "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface hover:text-ink";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={iconBtn}
    >
      {dark ? (
        <Sun size={16} strokeWidth={1.75} />
      ) : (
        <Moon size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}

export function Header({
  user,
  onSignOut,
  showEstimates,
  onToggleEstimates,
  onCopyApi,
  onPrint,
}: HeaderProps) {
  return (
    <header className="no-print sticky top-0 z-40 h-14 border-b border-hairline bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1560px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-sans text-[15px] font-semibold text-ink">
            QuotePro
          </span>
          <span className="hidden truncate text-[13px] text-muted sm:inline">
            Grand Valley Garage Doors
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={onToggleEstimates}
            title="Estimates"
            aria-label="Estimates"
            aria-pressed={showEstimates}
            className={cn(iconBtn, showEstimates && "text-accent")}
          >
            <List size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onPrint}
            title="Print"
            aria-label="Print"
            className={iconBtn}
          >
            <Printer size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onCopyApi}
            title="Copy as API call"
            aria-label="Copy as API call"
            className={iconBtn}
          >
            <Copy size={16} strokeWidth={1.75} />
          </button>
          {user && (
            <button
              type="button"
              onClick={onSignOut}
              title={user.email ?? "Sign out"}
              aria-label={`Sign out${user.email ? ` (${user.email})` : ""}`}
              className={iconBtn}
            >
              <CircleUserRound size={17} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
