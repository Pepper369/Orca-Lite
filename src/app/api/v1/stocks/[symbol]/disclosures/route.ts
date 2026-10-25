import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getStockSignedDisclosures } from "@/lib/services/stock-disclosures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/stocks/:symbol/disclosures?limit=25
 * Văn bản BCTC kiểm toán, công văn giải trình và nghị quyết HĐQT ký số chính thức từ HOSE/HNX.
 */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) return badRequest("symbol không hợp lệ");
  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 25;
  const r = await getStockSignedDisclosures(symbol, limit);
  if (!r) return unavailable("stock-disclosures", `Không lấy được văn bản ký số cho ${symbol}.`);
  return ok(r.data, r.meta, { "Cache-Control": "private, max-age=300, stale-while-revalidate=86400" });
}
