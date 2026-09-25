import { cn } from "@/lib/utils";

export type TabId = "quote" | "estimates" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "quote", label: "Quote" },
  { id: "estimates", label: "Estimates" },
  { id: "history", label: "History" },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="no-print sticky top-14 z-30 h-11 bg-bg/90 backdrop-blur"
    >
      <div className="flex h-full items-center gap-1 px-4 sm:px-6" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative px-3 py-2.5 text-[13px] font-medium transition-colors duration-150",
              active === t.id
                ? "text-ink"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-opacity duration-150",
                active === t.id ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}
