import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    if (!symbol) {
      return NextResponse.json({ success: false, error: "Missing symbol" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "60", 10);

    const cleanSymbol = symbol.toUpperCase();
    const [moneyFlow, valuation, metrics] = await Promise.all([
      MiQuantProvider.getStockMoneyFlow(cleanSymbol, days),
      MiQuantProvider.getStockValuation(cleanSymbol),
      MiQuantProvider.getStockKeyMetrics(cleanSymbol),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        symbol: cleanSymbol,
        days,
        moneyFlow,
        valuation,
        metrics,
      },
    });
  } catch (err: unknown) {
    console.error("[API Stock Quant Flow] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
