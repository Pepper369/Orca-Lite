import { NextRequest, NextResponse } from "next/server";
import { getStockConsensusUpside } from "@/lib/engines/consensus-upside-engine";

export const revalidate = 600; // Cache 10 mins

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    if (!symbol) {
      return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
    }

    const data = await getStockConsensusUpside(symbol);
    if (!data) {
      return NextResponse.json(
        { error: `No consensus upside data found for ${symbol}` },
        { status: 404 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("[api/v1/stocks/[symbol]/consensus] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
