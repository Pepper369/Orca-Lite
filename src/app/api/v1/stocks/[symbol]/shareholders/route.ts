import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getStockShareholders } from "@/lib/services/stock-shareholders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/stocks/:symbol/shareholders
 * Sổ cổ đông chi tiết 56+ tổ chức & ban điều hành từ Vietcap IQ Insight.
 */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) return badRequest("symbol không hợp lệ");
  const r = await getStockShareholders(symbol);
  if (!r) return unavailable("stock-shareholders", `Không lấy được sổ cổ đông cho ${symbol}.`);
  return ok(r.data, r.meta, { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" });
}
