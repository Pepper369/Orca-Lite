import { ok, unavailable, badRequest } from "@/lib/envelope";
import { getForexDetail } from "@/lib/services/forex";
import { evaluateNewsCircuitBreaker, calculateDynamicSlippageBuffer } from "@/lib/engines/forex-news-shield";
import { reconstructSyntheticDom } from "@/lib/engines/forex-cme-dom-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ANTI-SLIPPAGE NEWS CIRCUIT BREAKER & CME LEVEL 2 DOM BRIDGE API
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  if (!symbol || !/^[A-Za-z0-9]{6,10}$/.test(symbol)) {
    return badRequest("Cặp tiền không hợp lệ.");
  }

  const normalized = symbol.toUpperCase().replace("/", "").replace("=X", "");

  try {
    const detailRes = await getForexDetail(normalized);
    const series = detailRes?.detail?.series ?? [];
    const spreadPips = normalized.startsWith("XAU") ? 2.0 : normalized.includes("JPY") ? 1.2 : 0.9;

    const circuitBreaker = evaluateNewsCircuitBreaker(normalized);
    const slippageBuffer = calculateDynamicSlippageBuffer(normalized, spreadPips);
    const cmeDom = reconstructSyntheticDom(normalized, series, spreadPips);

    return ok({
      pair: normalized,
      circuitBreaker,
      slippageBuffer,
      cmeDom,
    }, detailRes?.meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi phân tích CME DOM & News Shield";
    return unavailable("news-shield-engine", message);
  }
}
