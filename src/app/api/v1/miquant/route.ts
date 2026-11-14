import { NextRequest } from "next/server";
import { ok, badRequest, fail } from "@/lib/envelope";
import { MiquantFinancialIntelligence } from "@/lib/services/miquant-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || searchParams.get("q");

    if (!symbol) {
      return badRequest("Vui lòng cung cấp mã cổ phiếu (param ?symbol=XYZ)");
    }

    const aiReport = await MiquantFinancialIntelligence.generateMiquantAiAnswer(symbol);
    return ok(aiReport);
  } catch (err: any) {
    console.error("[API v1 Miquant Error]:", err);
    return fail("INTERNAL_ERROR", err.message || "Lỗi xử lý yêu cầu Miquant AI", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = body.symbol || body.ticker || body.message;

    if (!symbol) {
      return badRequest("Vui lòng cung cấp mã cổ phiếu trong request body { symbol: 'XYZ' }");
    }

    const aiReport = await MiquantFinancialIntelligence.generateMiquantAiAnswer(symbol);
    return ok(aiReport);
  } catch (err: any) {
    console.error("[API v1 Miquant POST Error]:", err);
    return fail("INTERNAL_ERROR", err.message || "Lỗi xử lý yêu cầu Miquant AI", 500);
  }
}
