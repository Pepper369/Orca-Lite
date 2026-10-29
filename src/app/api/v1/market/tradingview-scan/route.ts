import { NextRequest, NextResponse } from "next/server";
import { fetchTradingViewScanner } from "@/lib/providers/tradingview-scanner";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/market/tradingview-scan?limit=100&sort=volume&order=desc&symbol=SSI,VND,HPG
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || "100"), 300);
  const sort = searchParams.get("sort") || "volume";
  const order = (searchParams.get("order") === "asc" ? "asc" : "desc") as "asc" | "desc";
  const rawSymbols = searchParams.get("symbol");
  const symbols = rawSymbols ? rawSymbols.split(",").map((s) => s.trim().toUpperCase()) : undefined;

  try {
    const data = await fetchTradingViewScanner({
      symbols,
      sortColumn: sort,
      sortOrder: order,
      limit,
    });

    return NextResponse.json({
      ok: true,
      data,
      total: data.length,
      updatedAt: new Date().toISOString(),
    }, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error scanning stocks";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

