import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine, type AllocationMode } from "@/lib/engines/miquant-quant-engine";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage } from "@/app/api/_security";

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
        error: safeInternalErrorMessage(err, "Internal server error"),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "quant_bots_post", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Payload không hợp lệ" }, { status: 400 });
    }
    const botId = typeof body.botId === "string" && /^[a-z0-9_-]{1,64}$/i.test(body.botId)
      ? body.botId
      : "bot_breakout_momentum";
    const capital = Number(body.capital ?? 100000000); // Default 100M VND
    const VALID_MODES = new Set<AllocationMode>([
      "EQUAL_WEIGHT",
      "INVERSE_VOLATILITY",
      "SCORE_WEIGHTED",
      "HIERARCHICAL_RISK_PARITY",
    ]);
    const allocationMode: AllocationMode =
      typeof body.allocationMode === "string" && VALID_MODES.has(body.allocationMode as AllocationMode)
        ? (body.allocationMode as AllocationMode)
        : "EQUAL_WEIGHT";

    if (!Number.isFinite(capital) || capital <= 0 || capital > 1e13) {
      return NextResponse.json(
        { success: false, error: "Số vốn không hợp lệ" },
        { status: 400 }
      );
    }

    const plan = await MiQuantEngine.calculateRebalancePlan(botId, capital, allocationMode);
    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (err: unknown) {
    console.error("[API Quant Bots Rebalance] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: safeInternalErrorMessage(err, "Internal server error"),
      },
      { status: 500 }
    );
  }
}
