import { ok, badRequest } from "@/lib/envelope";
import { calculateForexPositionSize, type PositionSizerInput } from "@/lib/engines/forex-position-sizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * FOREX POSITION SIZE & RISK MATRIX API
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PositionSizerInput;
    if (!body || !body.pair || !body.entryPrice || !body.stopLossPrice) {
      return badRequest("Thiếu thông tin: pair, entryPrice, stopLossPrice là bắt buộc.");
    }
    const result = calculateForexPositionSize({
      accountBalance: Number(body.accountBalance) || 10_000,
      riskPercent: body.riskPercent ? Number(body.riskPercent) : 1.0,
      riskAmountUsd: body.riskAmountUsd ? Number(body.riskAmountUsd) : undefined,
      pair: String(body.pair),
      entryPrice: Number(body.entryPrice),
      stopLossPrice: Number(body.stopLossPrice),
      takeProfit1: body.takeProfit1 ? Number(body.takeProfit1) : null,
      takeProfit2: body.takeProfit2 ? Number(body.takeProfit2) : null,
      takeProfit3: body.takeProfit3 ? Number(body.takeProfit3) : null,
      leverage: Number(body.leverage) || 100,
    });
    return ok(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Dữ liệu tính toán vị thế không hợp lệ.";
    return badRequest(message);
  }
}
