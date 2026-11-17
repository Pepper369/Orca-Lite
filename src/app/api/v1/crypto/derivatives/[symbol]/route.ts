import { ok, unavailable, badRequest } from "@/lib/envelope";
import * as binance from "@/lib/providers/binance";
import { buildCryptoDerivativesMetrics } from "@/lib/engines/crypto-derivatives-engine";
import { evaluateCryptoShield, calculateCryptoSlippageBufferUsd } from "@/lib/engines/crypto-news-shield";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CRYPTO TRUE LEVEL 2 DOM & DERIVATIVES SHIELD API
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  if (!symbol || !/^[A-Za-z0-9]{3,15}$/.test(symbol)) {
    return badRequest("Mã crypto không hợp lệ.");
  }

  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pair = clean.endsWith("USDT") ? clean : `${clean}USDT`;

  try {
    const [book, funding, oi, ticker] = await Promise.all([
      binance.getOrderBook(pair, 20),
      binance.getFundingRate(pair).catch(() => ({
        symbol: pair,
        markPrice: 0,
        indexPrice: 0,
        fundingRate: 0.0001,
        nextFundingTime: Date.now() + 8 * 3600000,
      })),
      binance.getOpenInterest(pair).catch(() => ({ openInterest: 0, time: Date.now() })),
      binance.getSpotTicker(pair).catch(() => null),
    ]);

    const markPrice = funding.markPrice || Number(ticker?.lastPrice) || 0;
    const indexPrice = funding.indexPrice || markPrice;
    const priceChange24h = Number(ticker?.priceChangePercent) || 0;

    const metrics = buildCryptoDerivativesMetrics({
      symbol: pair,
      markPrice,
      indexPrice,
      fundingRate: funding.fundingRate,
      openInterest: oi.openInterest,
      priceChange24hPct: priceChange24h,
      orderBook: book,
    });

    const shield = evaluateCryptoShield({
      symbol: pair,
      fundingRate: funding.fundingRate,
    });

    const slippageBuffer = calculateCryptoSlippageBufferUsd(markPrice, shield.slippageBufferPct);

    return ok({
      pair,
      metrics,
      shield,
      slippageBuffer,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi phân tích phái sinh & L2 DOM Crypto";
    return unavailable("crypto-derivatives", msg);
  }
}
