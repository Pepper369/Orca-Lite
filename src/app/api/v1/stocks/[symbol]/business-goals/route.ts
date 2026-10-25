import { NextRequest, NextResponse } from "next/server";
import { getStockBusinessGoals } from "@/lib/services/stock-business-goals";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const result = await getStockBusinessGoals(symbol);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load business goals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
