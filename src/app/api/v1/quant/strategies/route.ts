import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";

export const dynamic = "force-dynamic";
export const revalidate = 60; // Cache 60s

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const strategyId = searchParams.get("id");

    const strategies = await MiQuantEngine.getQuantStrategies();

    if (strategyId) {
      const found = strategies.find((s) => s.id === strategyId);
      if (!found) {
        return NextResponse.json(
          { error: `Không tìm thấy chiến lược với ID: ${strategyId}` },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: found });
    }

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
      { error: "Không thể tải dữ liệu chiến lược định lượng" },
      { status: 500 },
    );
  }
}
