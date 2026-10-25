import { NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";

export const dynamic = "force-dynamic";

export async function GET() {
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
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
