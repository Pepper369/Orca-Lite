import { NextRequest, NextResponse } from "next/server";
import { runScreenerBacktest, StrategyType } from "@/lib/engines/screener-backtest-engine";

export const dynamic = "force-dynamic";
export const revalidate = 300; // Cache for 5 mins

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const strategy = (searchParams.get("strategy") || "breakout") as StrategyType;
    const holdingDays = searchParams.get("holdingDays") ? parseInt(searchParams.get("holdingDays")!, 10) : 20;
    const stopLossPct = searchParams.get("stopLossPct") ? parseFloat(searchParams.get("stopLossPct")!) : 7;
    const takeProfitPct = searchParams.get("takeProfitPct") ? parseFloat(searchParams.get("takeProfitPct")!) : 15;

    const result = await runScreenerBacktest({
      strategy,
      holdingDays,
      stopLossPct,
      takeProfitPct,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/v1/screener/backtest] Error running backtest:", error);
    return NextResponse.json(
      { error: "Failed to run screener backtest", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runScreenerBacktest(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/v1/screener/backtest POST] Error running backtest:", error);
    return NextResponse.json(
      { error: "Failed to run screener backtest", details: String(error) },
      { status: 500 }
    );
  }
}
