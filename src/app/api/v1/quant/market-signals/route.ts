import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req?: NextRequest) {
  if (req) {
    const limited = await rateLimit(req, {
      name: "quant_market_signals_get",
      binding: "RL_AI",
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;
  }
  try {
    const [signals, overview, supportResistance] = await Promise.all([
      MiQuantProvider.getMarketSignals(),
      MiQuantProvider.getMarketOverview("VNINDEX"),
      MiQuantProvider.getSupportResistance("VNINDEX"),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        signals,
        overview,
        supportResistance,
      },
    });
  } catch (err: unknown) {
    console.error("[API Quant Market Signals] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
