import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/chart/tradingview/marks
 * TradingView UDF Marks endpoint (Dividends, Splits, Earnings)
 */
export async function GET() {
  return NextResponse.json({
    id: [],
    time: [],
    color: [],
    text: [],
    label: [],
    labelFontColor: [],
    minSize: [],
  }, {
    headers: {
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

