/**
 * Shared constants — copied verbatim from the v5 app (feature inventory §7/§8).
 * The Supabase anon key is a public key, safe to ship client-side.
 */

export const SUPABASE_URL = "https://ymwinetfkporjwxjkfgo.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd2luZXRma3Bvcmp3eGprZmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjY2MjYsImV4cCI6MjA5NjYwMjYyNn0.MtQziHbMQegw4A_cdEkR895cgmNT8MsPKUxWf7phP9I";

export const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyB7fWAsd8MQatdMw1dVDiYf4JYMpm2IHmTQZ9XrGuL_Gqi9iu8VdCwo3wlqUr1jODV/exec";
export const FILE_ID = "15FSowE6FmdicGyH_eOCFBCIfDW0BAaj_";

/** Field defaults — everything zeroed until a screenshot is pasted.
    mult stays 1.00 as the neutral identity (it is not a cost). Weston
    2026-09-25: no demo numbers on fresh load. */
export const FIELD_DEFAULTS = {
  door: "0.00",
  windows: "0.00",
  etc: "0.00",
  mult: "1.00",
  // Weston's standing overhead constants — always default, never zeroed.
  base: "2000",
  pct: "25",
  inst: "0",
  fuel: "0",
} as const;

export type FieldKey = keyof typeof FIELD_DEFAULTS;

export const SAMPLE_TEXT = [
  "QUOTE - iStore",
  "Clopay Classic Steel 16x7 insulated             NET PRICE  $1,849.99",
  "Windows - Stockton long panel                  NET PRICE  $312.00",
  "ETC - strut kit + spring upgrade               NET PRICE  $45.00",
].join("\n");

export const SETTINGS_STORAGE_KEY = "quoteproSettings";

/**
 * Latest preview deployment of this branch — used for the API docs curl
 * examples. In-app API calls use same-origin relative paths (/v1/…) so they
 * always hit the preview deployment the user is actually on.
 */
export const QUOTE_API_BASE =
  "https://quotepro-7s2mex88k-pizza122202-9153s-projects.vercel.app";
