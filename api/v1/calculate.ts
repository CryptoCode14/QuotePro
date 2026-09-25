/**
 * POST /v1/calculate — run the QuotePro pricing math on dealer costs.
 *
 * Auth: Bearer <redacted> key (qp_live_…) with the `calculate` scope.
 * Body: { door, windows, miscellaneous (aliases: misc, etc),
 *         multiplier?, base?, pct?, installation?, fuel? }
 * Never fetches external pricing — the caller passes dealer cost in.
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
import { computeQuote, parseQuoteInputs } from "../_lib/inputs";

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const sb = serviceClient();
  const key = await verifyApiKey(req, sb);
  if (!key) return unauth(res, "Missing or invalid API key");
  if (!keyHasScope(key, "calculate"))
    return forbidden(res, "This API key lacks the 'calculate' scope");

  const parsed = parseQuoteInputs(req.body);
  if (!parsed.ok) return bad(res, parsed.error);

  const q = computeQuote(parsed.inputs);
  return ok(res, {
    dealer_cost_total: q.dealer_cost_total,
    double_cost: q.double_cost,
    final_price: q.final_price,
    margin: q.margin,
    breakdown: q.breakdown,
  });
}
