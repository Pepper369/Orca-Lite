import { NextRequest, NextResponse } from "next/server";
import { fetchTradingViewIdeas } from "@/lib/providers/tradingview-ideas";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stocks/[symbol]/tradingview-ideas
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await context.params;
  const symbol = (rawSymbol || "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }

  try {
    const ideas = await fetchTradingViewIdeas(symbol);
    return NextResponse.json({
      ok: true,
      data: ideas,
      total: ideas.length,
    }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error fetching ideas";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

