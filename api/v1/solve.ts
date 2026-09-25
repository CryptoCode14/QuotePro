/**
 * POST /v1/solve — run Solve Pricing on dealer costs (the API twin of the
 * app's SOLVE PRICING button).
 *
 * Auth: Bearer API key (qp_live_…) with the `calculate` scope.
 * Body: { door, windows, miscellaneous (aliases: misc, etc),
 *         multiplier?, base?, pct? }
 * (installation/fuel are accepted but always overwritten by the solver.)
 *
 * Solves installation + fuel so the grand total lands on target, then
 * returns the solved price. Never fetches external pricing — the caller
 * passes dealer cost in.
 */
import {
  bad,
  forbidden,
  keyHasScope,
  methodNotAllowed,
  ok,
  serviceClient,
  unauth,
  verifyApiKey,
  type ApiReq,
  type ApiRes,
} from "../_lib/auth";
import { parseQuoteInputs, solveQuote } from "../_lib/inputs";

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const sb = serviceClient();
  const key = await verifyApiKey(req, sb);
  if (!key) return unauth(res, "Missing or invalid API key");
  if (!keyHasScope(key, "calculate"))
    return forbidden(res, "This API key lacks the 'calculate' scope");

  const parsed = parseQuoteInputs(req.body);
  if (!parsed.ok) return bad(res, parsed.error);

  const q = solveQuote(parsed.inputs);
  return ok(res, {
    installation: q.installation,
    fuel: q.fuel,
    dealer_cost_total: q.dealer_cost_total,
    double_cost: q.double_cost,
    final_price: q.final_price,
    margin: q.margin,
    gap: q.breakdown.gap,
    breakdown: q.breakdown,
  });
}
