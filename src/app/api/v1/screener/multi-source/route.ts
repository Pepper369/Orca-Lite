import { ok, unavailable } from "@/lib/envelope";
import { getMultiSourceScreenerData } from "@/lib/services/multi-source-screener";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/screener/multi-source
 * Bộ lọc đa nguồn Pro: Target Upside, Tổ chức sở hữu, P/E 3Y, Dòng tiền gom ngoại VPS.
 * Hỗ trợ phân trang limit/offset, compact projection và bộ lọc bảo vệ kỹ thuật techGuardOnly.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;
    const compact = searchParams.get("compact") === "true";
    const techGuardOnly = searchParams.get("techGuardOnly") === "true";
    const q = searchParams.get("q") || undefined;

    const res = await getMultiSourceScreenerData({ limit, offset, compact, techGuardOnly, q });
    return ok(res.data, res.meta, {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    });
  } catch {
    return unavailable("multi-source-screener", "Không tải được bộ lọc đa nguồn.");
  }
}
