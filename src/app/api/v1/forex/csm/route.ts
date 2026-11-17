import { ok, unavailable } from "@/lib/envelope";
import { getForexMarkets } from "@/lib/services/forex";
import { calculateCurrencyStrengthMatrix } from "@/lib/engines/forex-currency-strength";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CURRENCY STRENGTH MATRIX (CSM) & DXY API
 */
export async function GET() {
  try {
    const markets = await getForexMarkets();
    const rows = markets?.data?.rows ?? [];

    const pairInputs = rows.map((r) => ({
      pair: r.pair,
      price: r.price,
      changePercent: r.changePercent ?? 0,
    }));

    const result = calculateCurrencyStrengthMatrix(pairInputs);
    return ok(result, markets?.meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi tính toán Currency Strength Matrix";
    return unavailable("csm-engine", message);
  }
}

