import { NextRequest } from "next/server";
import { ok, badRequest, fail } from "@/lib/envelope";
import { MiquantFinancialIntelligence } from "@/lib/services/miquant-ai";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage, sanitizePlainText } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { name: "miquant_get", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;
  try {
    const { searchParams } = new URL(req.url);
    const rawSymbol = searchParams.get("symbol") || searchParams.get("q");
    const symbol = rawSymbol ? sanitizePlainText(rawSymbol, 64) : "";

    if (!symbol) {
      return badRequest("Vui lòng cung cấp mã cổ phiếu (param ?symbol=XYZ)");
    }

    const aiReport = await MiquantFinancialIntelligence.generateMiquantAiAnswer(symbol);
    return ok(aiReport);
  } catch (err: unknown) {
    console.error("[API v1 Miquant Error]:", err);
    return fail("INTERNAL_ERROR", safeInternalErrorMessage(err, "Lỗi xử lý yêu cầu Miquant AI"), 500);
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "miquant_post", binding: "RL_AI", limit: 20, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawSymbol = body.symbol || body.ticker || body.message;
    const symbol = typeof rawSymbol === "string" ? sanitizePlainText(rawSymbol, 120) : "";

    if (!symbol) {
      return badRequest("Vui lòng cung cấp mã cổ phiếu trong request body { symbol: 'XYZ' }");
    }

    const aiReport = await MiquantFinancialIntelligence.generateMiquantAiAnswer(symbol);
    return ok(aiReport);
  } catch (err: unknown) {
    console.error("[API v1 Miquant POST Error]:", err);
    return fail("INTERNAL_ERROR", safeInternalErrorMessage(err, "Lỗi xử lý yêu cầu Miquant AI"), 500);
  }
}
