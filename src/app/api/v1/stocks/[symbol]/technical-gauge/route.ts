import { NextRequest, NextResponse } from "next/server";
import { getChartHistory } from "@/lib/services/chart";
import { calculateTechnicalGauge } from "@/lib/engines/technical-rating-gauge";
import type { OhlcvBar } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stocks/[symbol]/technical-gauge
 * TradingView-grade 26-Indicator Technical Rating Gauge
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await context.params;
  const symbol = (rawSymbol || "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }

  try {
    const history = await getChartHistory({
      symbol,
      assetType: "stock",
      timeframe: "1d",
      limit: 250,
    });

    const candles = history?.data?.candles || [];
    if (!candles || candles.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No historical candles available for ${symbol}` },
        { status: 404 }
      );
    }

    const ohlcvBars: OhlcvBar[] = candles.map((c) => ({
      time: typeof c.time === "number" && c.time < 1e11 ? c.time * 1000 : Number(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));

    const report = calculateTechnicalGauge(symbol, ohlcvBars);

    return NextResponse.json({
      ok: true,
      data: report,
      timestamp: Date.now(),
    }, {
      headers: {
        "Cache-Control": "public, max-age=120, s-maxage=120",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error computing technical gauge";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

