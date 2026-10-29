import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getActiveFlowAnalysis } from "@/lib/engines/active-flow-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * GET /api/v1/stocks/:symbol/active-flow
 * Phân tích khớp lệnh Mua/Bán chủ động (Active Buy vs Active Sell Flow).
 * - Tỷ lệ % Mua chủ động (PB) vs Bán chủ động (PS) vs Khớp ATC/ATO
 * - Phân rã dòng tiền Cá mập (>=30K) vs Lệnh vừa vs Nhỏ lẻ (<5K)
 * - Ma trận phân bổ dòng tiền theo từng bước giá
 * - Đường xu hướng lũy kế dòng tiền theo khung giờ
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) {
    return badRequest("symbol không hợp lệ");
  }

  const flow = await getActiveFlowAnalysis(symbol);
  if (!flow) {
    return unavailable(
      "vndirect-active-flow",
      `Chưa có dữ liệu phân tích dòng tiền Mua/Bán chủ động cho mã ${symbol}.`,
    );
  }

  return ok(
    flow,
    {
      source: "vndirect-active-flow",
      sourceTimestampMs: Date.now(),
      cached: true,
      freshness: "LIVE",
      ageMs: 0,
    },
    { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  );
}
