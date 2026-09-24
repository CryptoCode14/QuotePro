# UI Stack Research — QuotePro v5 Rebuild

**Date:** 2026-09-24
**Goal:** Apple.com-tier look and feel — clean, premium, "expensive," UI elements with visual weight — dark + light mode, plain usable, desktop + mobile. Migrating from a single 1301-line `public/index.html` (Express + Vercel).

**Verified versions (all current as of Sept 2026):**
- Tailwind CSS v4 (~4.3, CSS-first config, OKLCH)
- shadcn/ui: Base UI (`@base-ui/react` v1.6.x) is now the default primitive engine (Radix still supported, not deprecated)
- HeroUI v3 is current (v2 on patches only); built on Tailwind v4 + React Aria
- Mantine v8.3.x (v9 ~9.4.0 in progress); static CSS, no longer CSS-in-JS
- Chakra UI v3 (Panda CSS, style props)
- DaisyUI v5 (Tailwind v4 plugin)
- Motion (formerly framer-motion): package `motion`, v12.x, `import { motion } from "motion/react"`

---

## Headline recommendation

**Vite + React 19 + Tailwind CSS v4 + shadcn/ui (Base UI default) + `motion` for micro-interactions + Lucide icons.**

This is the stack that gets Apple-tier results with the least risk for a solo operator.

## Why this stack wins for QuotePro

1. **Apple.com doesn't look like a component library — it looks like the OS.** HeroUI/Mantine/DaisyUI all ship a recognizable "library look" (rounded-playful, enterprise-SaaS, generic) that fights the Apple aesthetic. shadcn gives you *owned source code* in `components/ui/` — neutral starting point, then you dial the design tokens (radii, shadows, type scale) until it reads Apple. You own the code, so there is no fighting a library's defaults.
2. **Dark/light theming is trivial and bulletproof.** Tailwind v4 class-based dark variant + CSS custom properties on `:root`/`.dark`. No SSR to worry about (plain Vite SPA), so no next-themes needed — a ~30-line ThemeProvider handles system detection, localStorage, and the `.dark` class.
3. **"Weight" comes from tokens, not a library.** Heavy shadows, 2px hairline borders, `rounded-2xl`, SF-system type scale — these are one-line Tailwind v4 `@theme` token changes applied consistently via shadcn's CSS variables. Every component inherits the weight automatically.
4. **A11y without the work.** Base UI (built by the same engineers who created Radix, now actively developed by the MUI team) gives correct keyboard/focus-trap/modal behavior. You don't re-invent dialogs or toasts.
5. **Vercel-friendly.** Vite builds to static `dist/`; the existing `api/index.js` Express app keeps working as serverless functions with a small `vercel.json` route update. No framework lock-in, no server to babysit.
6. **Biggest ecosystem / AI-agent friendliness.** shadcn is the most-starred React UI system (~114k stars), has MCP/llms.txt/skills support, and any agent (including this one) can scaffold components deterministically.

## How the others were judged

| Option | Out-of-box beauty | Dark/light | Fit for QuotePro | Verdict |
|---|---|---|---|---|
| **Tailwind v4 + shadcn (Base UI)** | Neutral canvas you own | Excellent (`@custom-variant dark`, CSS vars) | Best: Vite SPA, small, own the code | ✅ **Pick** |
| HeroUI v3 | Beautiful, slightly playful/rounded | Strong | Black-box npm package; harder to push to Apple look; v3 just shipped (churn) | Runner-up |
| Mantine v8 | Clean but enterprise-SaaS, not Apple | Good | 120+ components is overkill; v9 migration coming; PostCSS/CSS Modules complexity | No |
| Chakra UI v3 | Decent, but "Chakra look" is recognizable | Good | Style-props make JSX verbose; Panda codegen build step; runtime styling in stable setup | No |
| DaisyUI v5 | Fast, but every DaisyUI site looks the same | Easy (`@plugin "daisyui/theme"`) | Fastest way to look generic | No |
| Hand-rolled CSS only | Total control | Fine | Viable, but you re-invent modal/toast/focus a11y; shadcn *is* hand-rolled with solved a11y | No |

## Dark / light mode implementation

CSS-first (Tailwind v4), no JS theming framework:

```css
/* src/index.css */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... map all semantic tokens ... */
}

:root {
  --background: oklch(1 0 0);          /* light */
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --border: oklch(0.9 0 0);
  color-scheme: light;
}

.dark {
  --background: oklch(0.16 0.02 250);  /* rich dark, slight blue = expensive */
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.2 0.02 250);
  --border: oklch(1 0 0 / 0.08);
  color-scheme: dark;
}
```

- **Toggle strategy:** tiny `ThemeProvider` (React context + `localStorage` + `matchMedia('(prefers-color-scheme: dark)')`), toggles `.dark` class on `<html>`. Default: follow system.
- **No-flash:** inline `<script>` in `index.html` `<head>` sets `.dark` before first paint from localStorage/system.
- **Use OKLCH** for perceptually uniform colors — light and dark themes feel like the same product.
- `color-scheme: light/dark` makes native scrollbars, inputs, and date pickers follow the theme.

## Font stack (SF Pro-like, zero bundle cost)

```css
@theme inline {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
    "Segoe UI", Inter, "Helvetica Neue", Arial, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
}
```

- Apple devices render actual SF Pro; Windows/Android fall back gracefully. No webfont download = instant load, exactly like apple.com.
- Type scale: large tight display headings (`tracking-tight`, `-0.02em`), `text-[15px]` body, semibold section labels. Weight contrast (regular body / semibold headings) is half of the "expensive" feeling.

## Core component set (shadcn CLI, Base UI default)

Add only what the calculator needs — keep it plain:

| Component | Use |
|---|---|
| `button` | Primary (heavy, `shadow-lg`, full-black/white Apple-style) + secondary + ghost |
| `input`, `textarea`, `label` | Price fields — large touch targets (`h-12`), `rounded-xl`, strong focus ring |
| `card` | Quote sections — `rounded-2xl`, hairline border, layered shadow |
| `switch` | Toggles (e.g. tax on/off, discount) |
| `dialog` | Confirm/result modals — animated with `motion` |
| `sonner` | Toasts for save/copy/OCR status |
| `select` | Door model / color pickers |
| `badge`, `separator`, `tooltip` | Status chips, layout, hints |

- **Motion** (`motion` package): use *sparingly* — dialog/toast entrance (150–250ms easeOut), animated number transitions on the price total, theme toggle micro-interaction. ~34KB; or `LazyMotion` (~5KB) if bundle-paranoid.
- **Icons:** `lucide-react` — 1.5px stroke, `size={18}`, never emojis.

## Proposed file structure

```
quotepro-v5/
├── api/
│   └── index.js            # unchanged Express API (Vercel serverless)
├── public/                 # static assets (logo etc.)
├── index.html              # Vite entry (+ no-flash theme script)
├── components.json         # shadcn config (base-ui default)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css           # Tailwind import + @theme tokens + :root/.dark
│   ├── lib/
│   │   ├── utils.ts        # cn()
│   │   └── theme.tsx        # ThemeProvider (system-aware, localStorage)
│   └── components/
│       └── ui/             # shadcn CLI output — owned, editable
├── package.json
└── vercel.json             # static dist/ + /api/* → serverless
```

Dependencies: `react@19`, `tailwindcss@4`, `@tailwindcss/vite`, `@base-ui/react`, `motion`, `lucide-react`, `sonner`, `class-variance-authority`, `tailwind-merge`.

## What to AVOID (the "cheap" list)

1. **DaisyUI / pre-baked component classes** — instantly recognizable, generic.
2. **Purple-blue gradients** — the hallmark of cheap SaaS landing pages. Apple uses flat surfaces, black/white, and *one* restrained accent.
3. **Glassmorphism overuse** — one blurred sticky header max; glass cards everywhere looks dated.
4. **Emojis as UI icons** — use Lucide.
5. **Default shadcn zinc theme shipped as-is** — tune tokens: larger radii (`rounded-xl/2xl`), deeper shadows, SF stack, tighter tracking. That's what turns "shadcn default" into "Apple."
6. **Tiny text** (`text-xs` everywhere) — Apple uses generous sizes; small text reads cheap.
7. **Heavy animation** — no page-wide fades/slides; micro-interactions only (150–250ms). Over-animation is the fastest way to look like a template.
8. **Too many accent colors** — one accent (Apple blue `#0071e3` or a restrained indigo), semantic red/green only for errors/success.
9. **Cards with no shadow** — flat `border`-only cards look unfinished; the "weight" Weston wants = `shadow-[0_8px_30px_rgb(0,0,0,0.06)]` light / `shadow-[0_8px_30px_rgb(0,0,0,0.4)]` dark + hairline border.
