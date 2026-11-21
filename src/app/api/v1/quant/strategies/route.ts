import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 60; // Cache 60s

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, {
    name: "quant_strategies_get",
    binding: "RL_AI",
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const rawStrategyId = searchParams.get("id");

    if (rawStrategyId !== null && rawStrategyId !== "") {
      const cleanedId = rawStrategyId.trim();
      if (!/^[a-z0-9_-]{1,64}$/i.test(cleanedId)) {
        return NextResponse.json(
          { success: false, error: "ID chiến lược không hợp lệ" },
          { status: 400 },
        );
      }

      const strategies = await MiQuantEngine.getQuantStrategies();
      const found = strategies.find((s) => s.id === cleanedId);
      if (!found) {
        return NextResponse.json(
          { success: false, error: "Không tìm thấy chiến lược định lượng theo yêu cầu" },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: found });
    }

    const strategies = await MiQuantEngine.getQuantStrategies();

    return NextResponse.json({
      data: strategies,
      metadata: {
        total_strategies: strategies.length,
        timestamp: new Date().toISOString(),
        provider: "MiQuant AI Multi-Factor & Quantitative Strategy Engine",
      },
    });
  } catch (error) {
    console.error("[API quant/strategies] Error:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải dữ liệu chiến lược định lượng" },
      { status: 500 },
    );
  }
}
