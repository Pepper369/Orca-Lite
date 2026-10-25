import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getStockComprehensiveRatios } from "@/lib/services/stock-comprehensive-ratios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/stocks/:symbol/comprehensive-ratios
 * Kho 166 chỉ số tài chính tính sẵn & định giá lịch sử 3 năm từ VNDirect.
 */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) return badRequest("symbol không hợp lệ");
  const r = await getStockComprehensiveRatios(symbol);
  if (!r) return unavailable("comprehensive-ratios", `Không lấy được chỉ số tài chính cho ${symbol}.`);
  return ok(r.data, r.meta, { "Cache-Control": "private, max-age=1800, stale-while-revalidate=86400" });
}
