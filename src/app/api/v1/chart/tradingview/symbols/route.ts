import { NextRequest, NextResponse } from "next/server";
import { detectAssetType, type UdfSymbolInfo } from "@/lib/chart/tradingview-udf";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/chart/tradingview/symbols?symbol=SSI
 * TradingView UDF Symbol Resolve endpoint
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") || "";
  const symbol = rawSymbol.split(":").pop()?.trim().toUpperCase() || "";

  if (!symbol) {
    return NextResponse.json({ s: "error", errmsg: "Symbol is required" }, { status: 400 });
  }

  const assetType = detectAssetType(symbol);
  const isCrypto = assetType === "crypto";
  const isForex = assetType === "forex";
  const isCommodity = assetType === "commodity";

  const symbolInfo: UdfSymbolInfo = {
    name: symbol,
    ticker: symbol,
    description: `${symbol} (${isCrypto ? "Crypto" : isForex ? "Forex" : isCommodity ? "Commodity" : "Stock"}) - Orca Financial`,
    type: isCrypto ? "crypto" : isForex ? "forex" : isCommodity ? "commodity" : "stock",
    session: isCrypto || isForex ? "24x7" : "0900-1130,1300-1500",
    exchange: isCrypto ? "BINANCE" : isForex ? "FOREX" : isCommodity ? "COMMODITY" : "HOSE",
    listed_exchange: isCrypto ? "BINANCE" : "HOSE",
    timezone: "Asia/Ho_Chi_Minh",
    format: "price",
    pricescale: isCrypto ? 100 : isForex ? 10000 : 1000,
    minmov: 1,
    has_intraday: true,
    supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
    intraday_multipliers: ["1", "5", "15", "30", "60"],
    has_daily: true,
    has_weekly_and_monthly: true,
    currency_code: isCrypto ? "USDT" : isForex ? "USD" : "VND",
  };

  return NextResponse.json(symbolInfo, {
    headers: {
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

