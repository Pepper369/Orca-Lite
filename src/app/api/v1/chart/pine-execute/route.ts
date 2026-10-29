import { NextRequest, NextResponse } from "next/server";
import { getChartHistory } from "@/lib/services/chart";
import { executePineScript } from "@/lib/engines/pine-runner";
import type { OhlcvBar } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/chart/pine-execute
 * Executes user Pine Script v5 against historical candles
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = (body.symbol || "SSI").trim().toUpperCase();
    const timeframe = body.timeframe || "1d";
    const script = String(body.script || "");

    if (!script.trim()) {
      return NextResponse.json({ ok: false, error: "Empty Pine Script" }, { status: 400 });
    }

    const history = await getChartHistory({
      symbol,
      assetType: "stock",
      timeframe,
      limit: 300,
    });

    const candles = history?.data?.candles || [];
    if (!candles || candles.length === 0) {
      return NextResponse.json({ ok: false, error: `No candle data for ${symbol}` }, { status: 404 });
    }

    const ohlcvBars: OhlcvBar[] = candles.map((c) => ({
      time: typeof c.time === "number" && c.time < 1e11 ? c.time * 1000 : Number(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));

    const result = executePineScript(script, ohlcvBars);

    return NextResponse.json({
      ok: result.ok,
      data: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error executing Pine Script";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

