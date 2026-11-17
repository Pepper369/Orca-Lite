import { ok, unavailable, badRequest } from "@/lib/envelope";
import { getForexDetail } from "@/lib/services/forex";
import { scanForexSmc } from "@/lib/engines/forex-smc-scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SMART MONEY CONCEPTS (SMC) & FVG SCANNER API
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
      return unavailable("smc-engine", `Chưa đủ dữ liệu nến cho ${symbol.toUpperCase()}.`);
    }

    const smcResult = scanForexSmc(symbol, series);
    return ok(smcResult, detailRes?.meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi quét cấu trúc SMC";
    return unavailable("smc-engine", message);
  }
}
