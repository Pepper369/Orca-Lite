import { NextResponse } from "next/server";
import { queryScreenerStocks } from "@/lib/services/screener-snapshot-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 40) || 40));
    const sector = url.searchParams.get("sector") ?? undefined;
    const res = await queryScreenerStocks({ limit, sector });
    return NextResponse.json({
      success: true,
      data: res.items,
      total: res.total,
      meta: res.meta,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch unified quant screener data", details: String(error) },
      { status: 500 },
    );
  }
}
