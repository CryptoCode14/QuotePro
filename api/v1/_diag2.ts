/** TEMPORARY diagnostic — imports the real _lib chain, catches the throw. */
import { anonClient, serviceClient } from "../_lib/auth";

export default function handler(_req: any, res: any): void {
  const out: Record<string, string> = {};
  try {
    anonClient();
    out.anonClient = "ok";
  } catch (e: any) {
    out.anonClient = "THROW: " + (e && e.message ? String(e.message).slice(0, 120) : String(e));
  }
  try {
    serviceClient();
    out.serviceClient = "ok";
  } catch (e: any) {
    out.serviceClient = "THROW: " + (e && e.message ? String(e.message).slice(0, 120) : String(e));
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    out.supabasePkg = typeof require("@supabase/supabase-js").createClient;
  } catch (e: any) {
    out.supabasePkg = "THROW: " + String(e && e.message ? e.message : e).slice(0, 120);
  }
  res.status(200).json(out);
}
