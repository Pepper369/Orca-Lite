import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/chart/tradingview/time
 * TradingView UDF Server Time endpoint (returns Unix time in seconds)
 */
export async function GET() {
  const epochSec = Math.floor(Date.now() / 1000);
  return new NextResponse(epochSec.toString(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

