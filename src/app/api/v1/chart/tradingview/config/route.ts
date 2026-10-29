import { NextResponse } from "next/server";
import { DEFAULT_UDF_CONFIG } from "@/lib/chart/tradingview-udf";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/chart/tradingview/config
 * TradingView UDF Config endpoint
 */
export async function GET() {
  return NextResponse.json(DEFAULT_UDF_CONFIG, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

