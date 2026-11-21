import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req?: NextRequest) {
  if (req) {
    const limited = await rateLimit(req, {
      name: "quant_top_picks_get",
      binding: "RL_AI",
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;
  }
  try {
    const picks = await MiQuantEngine.getRankedPicks();
    return NextResponse.json({
      success: true,
      data: picks,
    });
  } catch (err: unknown) {
    console.error("[API Quant Top Picks] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
