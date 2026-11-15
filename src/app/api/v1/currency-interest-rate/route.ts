import { ok } from "@/lib/envelope";
import { getEconomicData, economicMeta } from "@/lib/services/economy";
import { BOOTSTRAP_CURRENCY_INTEREST_RATE } from "@/lib/bootstrap-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await getEconomicData("currency-interest-rate");
    if (result) return ok(result.data, result.meta);
  } catch {
    /* */
  }
  return ok(BOOTSTRAP_CURRENCY_INTEREST_RATE, economicMeta(BOOTSTRAP_CURRENCY_INTEREST_RATE, { cached: true, stale: true }, 5));
}
