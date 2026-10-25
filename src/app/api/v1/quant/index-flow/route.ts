import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const universe = searchParams.get("universe") || "vnindex";
    const days = parseInt(searchParams.get("days") || "30", 10);

    const flowData = await MiQuantProvider.getTotalIndexMoneyFlow(universe.toLowerCase(), days);

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
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
