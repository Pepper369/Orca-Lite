import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    if (!symbol) {
      return NextResponse.json({ success: false, error: "Missing symbol" }, { status: 400 });
    }

    const cleanSymbol = symbol.toUpperCase();
    const [catalysts, risks, metrics, valuation, commentary] = await Promise.all([
      MiQuantProvider.getStockCatalysts(cleanSymbol),
      MiQuantProvider.getStockRisks(cleanSymbol),
      MiQuantProvider.getStockKeyMetrics(cleanSymbol),
      MiQuantProvider.getStockValuation(cleanSymbol),
      MiQuantProvider.getStockFinancialCommentary(cleanSymbol),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        symbol: cleanSymbol,
        catalysts,
        risks,
        metrics,
        valuation,
        commentary,
      },
    });
  } catch (err: unknown) {
    console.error("[API Stock Catalyst/Risk] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
