import { ok } from "@/lib/envelope";
import { getEconomicData, economicMeta } from "@/lib/services/economy";
import { BOOTSTRAP_MACRO_ECONOMIC } from "@/lib/bootstrap-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await getEconomicData("macro-economic");
    if (result) return ok(result.data, result.meta);
  } catch {
    /* */
  }
  return ok(BOOTSTRAP_MACRO_ECONOMIC, economicMeta(BOOTSTRAP_MACRO_ECONOMIC, { cached: true, stale: true }, 5));
}
