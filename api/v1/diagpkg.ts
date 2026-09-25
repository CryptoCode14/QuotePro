/** TEMPORARY diagnostic — no static imports; require() the packages inside try/catch. */
export default function handler(_req: any, res: any): void {
  const out: Record<string, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@supabase/supabase-js");
    out.supabaseJs = "loaded, createClient=" + typeof m.createClient;
  } catch (e: any) {
    out.supabaseJs = "THROW: " + String((e && e.message) || e).slice(0, 200);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const c = require("crypto");
    out.crypto = "loaded, createHash=" + typeof c.createHash;
  } catch (e: any) {
    out.crypto = "THROW: " + String((e && e.message) || e).slice(0, 200);
  }
  res.status(200).json(out);
}
