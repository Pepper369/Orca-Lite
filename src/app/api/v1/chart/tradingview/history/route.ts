import { NextRequest, NextResponse } from "next/server";
import { getChartHistory } from "@/lib/services/chart";
import { detectAssetType, tvResolutionToOrcaTimeframe, type UdfHistoryResponse } from "@/lib/chart/tradingview-udf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/v1/chart/tradingview/history?symbol=SSI&resolution=D&from=1700000000&to=1730000000
 * TradingView UDF History endpoint
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") || "";
  const symbol = rawSymbol.split(":").pop()?.trim().toUpperCase() || "";
  const resolution = searchParams.get("resolution") || "D";
  const fromSec = Number(searchParams.get("from") || "0");
  const toSec = Number(searchParams.get("to") || "0");
  const countback = Number(searchParams.get("countback") || "300");

  if (!symbol) {
    const errorRes: UdfHistoryResponse = { s: "error", errmsg: "Symbol is required" };
    return NextResponse.json(errorRes, { status: 400 });
  }

  const assetType = detectAssetType(symbol);
  const timeframe = tvResolutionToOrcaTimeframe(resolution);
  const limit = Math.min(Math.max(countback || 300, 50), 1500);

  try {
    const history = await getChartHistory({
      symbol,
      assetType,
      timeframe,
      limit,
    });

    const candles = history?.data?.candles || [];
    if (!candles || candles.length === 0) {
      const noData: UdfHistoryResponse = { s: "no_data" };
      return NextResponse.json(noData, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Filter by timestamp range if requested
    let filtered = candles;
    if (fromSec > 0 && toSec > 0) {
      filtered = candles.filter((c) => {
        const cTimeSec = c.time > 1e11 ? Math.floor(c.time / 1000) : c.time;
        return cTimeSec >= fromSec && cTimeSec <= toSec;
      });
      if (filtered.length === 0) {
        filtered = candles.slice(-limit);
      }
    }

    const t: number[] = [];
    const o: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    const v: number[] = [];

    for (const bar of filtered) {
      const timeSec = bar.time > 1e11 ? Math.floor(bar.time / 1000) : Math.floor(bar.time);
      t.push(timeSec);
      o.push(bar.open);
      h.push(bar.high);
      l.push(bar.low);
      c.push(bar.close);
      v.push(bar.volume ?? 0);
    }

    const resData: UdfHistoryResponse = {
      s: "ok",
      t,
      o,
      h,
      l,
      c,
      v,
    };

    return NextResponse.json(resData, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[TradingView UDF History]", err);
    const errResp: UdfHistoryResponse = { s: "error", errmsg: "Internal server error" };
    return NextResponse.json(errResp, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}

