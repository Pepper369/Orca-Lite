import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getStockAnalyticReports } from "@/lib/services/stock-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/stocks/:symbol/reports?limit=15
 * Báo cáo phân tích chuyên sâu (VNDirect Research) kèm Giá mục tiêu, Khuyến nghị & File PDF chính thức.
 */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) return badRequest("symbol không hợp lệ");
  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? 15);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 30) : 15;
  const r = await getStockAnalyticReports(symbol, limit);
  if (!r) return unavailable("stock-reports", `Không lấy được báo cáo phân tích cho ${symbol}.`);
  return ok(r.data, r.meta, { "Cache-Control": "private, max-age=300, stale-while-revalidate=86400" });
}
