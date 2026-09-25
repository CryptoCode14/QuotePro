/** TEMPORARY diagnostic — imports the real ../_lib/auth chain. If this 500s, the import itself crashes. */
import { anonClient, serviceClient } from "../_lib/auth";

export default function handler(_req: any, res: any): void {
  const out: Record<string, string> = { importOk: "yes" };
  try {
    anonClient();
    out.anonClient = "ok";
  } catch (e: any) {
    out.anonClient = "THROW: " + String((e && e.message) || e).slice(0, 200);
  }
  try {
    serviceClient();
    out.serviceClient = "ok";
  } catch (e: any) {
    out.serviceClient = "THROW: " + String((e && e.message) || e).slice(0, 200);
  }
  res.status(200).json(out);
}
