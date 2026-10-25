import { NextRequest, NextResponse } from "next/server";
import { getStockInsiderDeals } from "@/lib/services/stock-insider-deals";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.max(5, Math.min(50, Number(searchParams.get("limit") || 25)));

    const result = await getStockInsiderDeals(symbol, limit);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load insider deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
