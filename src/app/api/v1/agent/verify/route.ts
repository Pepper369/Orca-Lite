import { ok, badRequest, fail } from "@/lib/envelope";
import { verifyFinancialClaims } from "@/lib/ai/fact-check-engine";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * POST /api/v1/agent/verify
 * Chế độ Thẩm định Tin đồn & Fact-Checking (Verify Mode - FireAnt Inspired)
 * Nhận bài đăng, tin nhắn phím hàng trên mạng xã hội -> Tách ý & Đối chiếu BCTC thật.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "agent_verify", binding: "RL_AI", limit: 15, windowSec: 60 });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => null)) as { symbol?: string; text?: string } | null;
    if (!body) return badRequest("Body JSON không hợp lệ");

    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!symbol || !/^[A-Z0-9]{3,10}$/.test(symbol)) {
      return badRequest("Mã cổ phiếu không hợp lệ (ví dụ: HPG, VHM, NVL, DIG)");
    }
    if (!text || text.length < 10) {
      return badRequest("Nội dung bài đăng cần thẩm định quá ngắn (tối thiểu 10 ký tự)");
    }

    const report = await verifyFinancialClaims({ symbol, text });
    if (!report) {
      return fail("VERIFICATION_FAILED", `Không thể lấy dữ liệu BCTC chính thức cho mã ${symbol}`, 500);
    }

    return ok(report, {
      source: "orca-fact-check-engine",
      freshness: "FRESH",
      note: `Thẩm định bài đăng ${symbol} · Đối chiếu 4 bảng BCTC & Công bố thông tin HOSE/HNX`,
    });
  } catch (e) {
    console.error("[agent-verify-api]", e);
    return fail("AGENT_VERIFY_ERROR", e instanceof Error ? e.message : "Thẩm định thất bại", 500);
  }
}
