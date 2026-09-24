import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { useTheme } from "./lib/theme";
import { Sun, Moon, Monitor, Hammer } from "lucide-react";

export default function App() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="QuotePro" className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg font-semibold tracking-tight">QuotePro</span>
            <Badge variant="secondary">v6 skeleton</Badge>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
            {(
              [
                { value: "light", icon: Sun, label: "Light" },
                { value: "dark", icon: Moon, label: "Dark" },
                { value: "system", icon: Monitor, label: "System" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                variant={theme === value ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={`${label} theme`}
                onClick={() => setTheme(value)}
              >
                <Icon className="size-4" />
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg">
          <Hammer className="size-8" />
        </div>
        <h1 className="mt-8 text-5xl font-semibold tracking-tight">
          QuotePro v6
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          App shell is ready. The calculator UI gets ported in next — this is
          just the clean skeleton: theme tokens, primitives, and a working
          build.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg">Primary action</Button>
          <Button size="lg" variant="secondary">
            Secondary
          </Button>
          <Button size="lg" variant="ghost">
            Ghost
          </Button>
        </div>

        <Card className="mt-12 w-full max-w-2xl text-left">
          <CardHeader>
            <CardTitle>Shell checklist</CardTitle>
            <CardDescription>
              What this skeleton wires up out of the box.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-[15px]">
              {[
                "Tailwind v4 CSS-first tokens (OKLCH, light + dark)",
                "System-aware theme provider with no-flash script",
                "Base UI primitives via shadcn components/ui",
                "Lucide icons, Sonner toasts, Motion for micro-interactions",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="size-2 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
