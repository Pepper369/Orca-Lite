import { ok, unavailable, badRequest } from "@/lib/envelope";
import { getForexDetail } from "@/lib/services/forex";
import { generateDeepFlowSignal } from "@/lib/engines/forex-order-flow-pro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * INSTITUTIONAL FOREX ORDER FLOW & LIQUIDITY READING API
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  if (!symbol || !/^[A-Za-z0-9]{6,10}$/.test(symbol)) {
    return badRequest("Cặp tiền không hợp lệ.");
  }

  try {
    const detailRes = await getForexDetail(symbol);
    const series = detailRes?.detail?.series ?? [];
    if (series.length < 20) {
      return unavailable("order-flow-engine", `Chưa đủ dữ liệu nến cho ${symbol.toUpperCase()}.`);
    }

    const flowResult = generateDeepFlowSignal(symbol, series);
    return ok(flowResult, detailRes?.meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi phân tích dòng tiền chuyên sâu";
    return unavailable("order-flow-engine", message);
  }
}
