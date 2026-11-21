import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_UNIVERSES = new Set([
  "vnindex",
  "vn30",
  "hnx",
  "hnx30",
  "upcom",
  "hose",
  "hsx",
]);

const MIN_DAYS = 1;
const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, {
    name: "quant_index_flow_get",
    binding: "RL_AI",
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const rawUniverse = searchParams.get("universe");
    let universe = "vnindex";
    if (rawUniverse !== null && rawUniverse.trim() !== "") {
      const cleaned = rawUniverse.trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,20}$/.test(cleaned) || !ALLOWED_UNIVERSES.has(cleaned)) {
        return NextResponse.json(
          { success: false, error: "Tham số universe không hợp lệ" },
          { status: 400 },
        );
      }
      universe = cleaned;
    }

    const rawDays = searchParams.get("days");
    let days = DEFAULT_DAYS;
    if (rawDays !== null && rawDays.trim() !== "") {
      const parsed = Number(rawDays);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json(
          { success: false, error: "Tham số days không hợp lệ" },
          { status: 400 },
        );
      }
      days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.trunc(parsed)));
    }

    const flowData = await MiQuantProvider.getTotalIndexMoneyFlow(universe, days);

    return NextResponse.json({
      success: true,
      data: {
        universe,
        days,
        items: flowData,
      },
    });
  } catch (err: unknown) {
    console.error("[API Quant Index Flow] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
