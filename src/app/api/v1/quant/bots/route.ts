import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bots = await MiQuantEngine.getBots();
    return NextResponse.json({
      success: true,
      data: bots,
    });
  } catch (err: unknown) {
    console.error("[API Quant Bots] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const botId = String(body.botId || "bot_breakout_momentum");
    const capital = Number(body.capital || 100000000); // Default 100M VND

    if (isNaN(capital) || capital <= 0) {
      return NextResponse.json(
        { success: false, error: "Số vốn không hợp lệ" },
        { status: 400 }
      );
    }

    const plan = await MiQuantEngine.calculateRebalancePlan(botId, capital);
    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (err: unknown) {
    console.error("[API Quant Bots Rebalance] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
