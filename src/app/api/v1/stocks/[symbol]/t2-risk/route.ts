import { ok, unavailable, badRequest } from "@/lib/envelope";
import { getVnOhlcv } from "@/lib/services/stocks-board";
import { computeT2OverextensionRisk } from "@/lib/services/t2-risk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRỤ CỘT 2: T+2 OVEREXTENSION RISK API
 * Trả về chỉ số đo lường rủi ro kẹp hàng T+2 cho mã cổ phiếu.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const sym = symbol?.toUpperCase().trim();
  if (!sym || !/^[A-Za-z0-9]{1,10}$/.test(sym)) {
    return badRequest("Mã cổ phiếu không hợp lệ");
  }

  const ohlcv = await getVnOhlcv(sym, 40, "stock");
  if (!ohlcv || !ohlcv.bars.length) {
    return unavailable("vn-ohlcv", `Không có dữ liệu nến để tính rủi ro T+2 cho ${sym}`);
  }

  const riskAssessment = computeT2OverextensionRisk(sym, ohlcv.bars);
  return ok(riskAssessment, ohlcv.meta);
}
