import { ok, badRequest } from "@/lib/envelope";
import { calculateCryptoPositionSize } from "@/lib/engines/crypto-position-sizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CRYPTO MARGIN & FUTURES POSITION SIZER API
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      accountBalance = 10_000,
      riskPercent = 1.0,
      entryPrice,
      stopLossPrice,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      leverage = 5,
      direction = "BUY",
    } = body;

    if (!entryPrice || !stopLossPrice || entryPrice <= 0 || stopLossPrice <= 0) {
      return badRequest("entryPrice và stopLossPrice phải lớn hơn 0.");
    }

    const result = calculateCryptoPositionSize({
      accountBalance: Number(accountBalance),
      riskPercent: Number(riskPercent),
      entryPrice: Number(entryPrice),
      stopLossPrice: Number(stopLossPrice),
      takeProfit1: takeProfit1 ? Number(takeProfit1) : null,
      takeProfit2: takeProfit2 ? Number(takeProfit2) : null,
      takeProfit3: takeProfit3 ? Number(takeProfit3) : null,
      leverage: Number(leverage),
      direction,
    });

    return ok(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi tính toán vị thế Crypto Margin";
    return badRequest(msg);
  }
}
