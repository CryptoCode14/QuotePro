import {
  AlertTriangle,
  Copy,
  Download,
  KeyRound,
  MousePointerClick,
  Puzzle,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Eyebrow, Section } from "@/components/primitives";

/**
 * BrowserToolView — install + usage instructions for the "QuotePro Quick
 * Estimate" Tampermonkey userscript. The script file itself is served from
 * this app's public/ folder, so the install link below is same-origin and
 * works on every deployment.
 */
/** Verified 2026-10-19 via Chrome Web Store search. */
const TAMPERMONKEY_URL =
  "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo";

/** Same-origin: the userscript is served from this app's public/ folder. */
const SCRIPT_URL = "/quotepro.user.js";

function Step({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[12px] font-bold text-accent">
        {n}
      </span>
      <div className="text-[13px] leading-relaxed text-ink">{children}</div>
    </li>
  );
}

function Bullet({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <div className="text-[13px] leading-relaxed text-ink">{children}</div>
    </li>
  );
}

export function BrowserToolView() {
  return (
    <section
      id="view-browser-tool"
      aria-label="Browser tool"
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"
    >
      <div>
        <Eyebrow>Browser tool</Eyebrow>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
          QuotePro Quick Estimate
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] text-muted">
          A Tampermonkey userscript that pulls dealer costs off the iStore
          order page, runs them through your QuotePro pricing API, and fills
          the results into ServiceTitan estimate fields with one click.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <Section
          eyebrow="What it does"
          hint="Free · syncs across your machines"
        >
          <ul className="space-y-3">
            <Bullet icon={<Download size={15} />}>
              <strong>On the iStore order review page</strong> a slim QuotePro
              tab docks to the left edge of the screen — click it to slide the
              panel out. Door / windows / misc costs come pre-filled from the
              page. Tweak the pricing variables, hit{" "}
              <strong>Calculate</strong>, and get dealer total, double-cost
              check, final price, and margin — each with a copy button.
            </Bullet>
            <Bullet icon={<MousePointerClick size={15} />}>
              <strong>On any ServiceTitan page</strong> the same dock follows
              you. Open an estimate and one click writes those numbers straight
              into the fields. This bypasses the paste rejection entirely —
              the script sets field values programmatically, which
              paste-blockers can't intercept.
            </Bullet>
            <Bullet icon={<Copy size={15} />}>
              <strong>Estimate texts.</strong> The panel builds your estimate
              title, Summary, and door line-item description from the door on
              the page — same conventions as your past estimates. Each one
              copies with a button or fills into a field you pick (and remap).
              Service/repair jobs get their own short-format track.
            </Bullet>
            <Bullet icon={<RefreshCw size={15} />}>
              <strong>One install, every machine.</strong> Tampermonkey syncs
              the script through Chrome sync, and updates install automatically
              whenever the script changes on this site.
            </Bullet>
          </ul>
        </Section>

        <Section eyebrow="Install" hint="One time per machine">
          <ol className="space-y-4">
            <Step n={1}>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Puzzle size={14} className="text-accent" /> Install Tampermonkey
              </span>{" "}
              — free from the{" "}
              <a
                href={TAMPERMONKEY_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent underline underline-offset-2 hover:brightness-110"
              >
                Chrome Web Store
              </a>
              . Pin it to your toolbar after installing.
            </Step>
            <Step n={2}>
              Open the script and install it:
              <div className="mt-2">
                <a
                  href={SCRIPT_URL}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.99]"
                >
                  <Download size={15} /> Install the userscript
                </a>
              </div>
              <p className="mt-2 text-muted">
                Tampermonkey will pop up an install prompt — confirm it.
              </p>
            </Step>
            <Step n={3}>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <KeyRound size={14} className="text-accent" /> Get your API key
                from this app:
              </span>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
                <li>
                  Open the <span className="font-medium text-ink">API tab</span>{" "}
                  above and create a new key.
                </li>
                <li>
                  Check the{" "}
                  <span className="font-mono text-[12px] text-ink">
                    Calculate
                  </span>{" "}
                  scope (that's all this tool needs) and copy the key — it only
                  shows once.
                </li>
                <li>
                  Paste it into the key field at the top of the QuotePro panel
                  on the iStore page — or via the Tampermonkey toolbar icon →
                  hover{" "}
                  <span className="font-medium text-ink">
                    “QuotePro Quick Estimate”
                  </span>{" "}
                  → <span className="font-medium text-ink">“QuotePro: Set API key”</span>.
                </li>
              </ol>
              <p className="mt-2 text-muted">
                Keys are per-user and stay on the machine you paste them into —
                never share them.
              </p>
            </Step>
            <Step n={4}>
              Repeat steps 1–3 on each machine. Tampermonkey syncs the script
              itself via Chrome sync; only the API key is entered per machine,
              and it never leaves that machine.
            </Step>
          </ol>
        </Section>

        <Section eyebrow="Using it" hint="~2 clicks per estimate">
          <ol className="space-y-4">
            <Step n={1}>
              Open an order review page on{" "}
              <span className="font-mono text-[12px]">istorem.clopay.com</span>.
              The QuotePro tab docks to the left edge — click it to open the
              panel with costs pre-filled —{" "}
              <strong>verify them</strong> before calculating. A highlighted
              door value is the script's best guess, not a sure thing.
            </Step>
            <Step n={2}>
              Adjust the pricing variables if needed and hit{" "}
              <strong>Calculate</strong>. Results appear with{" "}
              <span className="inline-flex items-center gap-1">
                <Copy size={12} /> copy
              </span>{" "}
              buttons, and the numbers are saved for the ServiceTitan tab.
            </Step>
            <Step n={3}>
              The dock follows you across every ServiceTitan page. Open the
              estimate and click the dock to open the panel.{" "}
              <strong>First time only:</strong> click{" "}
              <span className="font-medium">“Pick field”</span> next to each
              number, then click the matching field on the page. The mapping
              is remembered, so this is a one-time setup per machine.
            </Step>
            <Step n={4}>
              Click <strong>“Fill all fields.”</strong> Verify the totals on
              the estimate, then save it in ServiceTitan as usual.
            </Step>
          </ol>
        </Section>

        <Section eyebrow="Troubleshooting">
          <ul className="space-y-3">
            <Bullet icon={<AlertTriangle size={15} />}>
              <strong>Dock doesn't appear</strong> — make sure Tampermonkey is
              enabled (toolbar icon, not grayed out) and{" "}
              <strong>reload the tab</strong> (tabs open before the script was
              installed need one reload). It lives on the iStore order review
              pages and every ServiceTitan page.
            </Bullet>
            <Bullet icon={<AlertTriangle size={15} />}>
              <strong>“API key rejected (401)”</strong> — re-paste the key via
              the Tampermonkey menu.{" "}
              <strong>“Lacks the calculate scope (403)”</strong> — mint a new
              key in the API tab with Calculate checked.
            </Bullet>
            <Bullet icon={<AlertTriangle size={15} />}>
              <strong>Costs look wrong</strong> — hit{" "}
              <span className="font-medium">“Re-scan page”</span> in the panel,
              or just type the numbers in; every field is editable.
            </Bullet>
            <Bullet icon={<AlertTriangle size={15} />}>
              <strong>A field didn't fill</strong> — click{" "}
              <span className="font-medium">“Re-pick”</span> for that number and
              click the field on the page again.
            </Bullet>
            <Bullet icon={<Zap size={15} />}>
              <strong>Tip:</strong> press{" "}
              <span className="font-mono text-[12px]">Alt+Q</span> on any iStore
              or ServiceTitan page to toggle the dock, and{" "}
              <span className="font-mono text-[12px]">Enter</span> in any panel
              field to calculate.
            </Bullet>
          </ul>
        </Section>
      </div>
    </section>
  );
}
