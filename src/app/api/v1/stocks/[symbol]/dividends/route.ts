import { NextRequest, NextResponse } from "next/server";
import { getStockDividendIntelligence } from "@/lib/services/stock-dividend-intelligence";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const result = await getStockDividendIntelligence(symbol);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load dividend intelligence";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
