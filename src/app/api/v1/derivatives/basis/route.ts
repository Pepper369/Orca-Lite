import { NextRequest, NextResponse } from "next/server";
import { getDerivativesArbitrageSignal } from "@/lib/engines/derivatives-arbitrage-engine";

export const dynamic = "force-dynamic";
export const revalidate = 15; // Fast revalidation for derivatives (15s)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "VN30F1M";
    const data = await getDerivativesArbitrageSignal(symbol);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[api/v1/derivatives/basis] Error:", error);
    return NextResponse.json(
      { error: "Failed to calculate derivatives basis & arbitrage signals" },
      { status: 500 }
    );
  }
}
