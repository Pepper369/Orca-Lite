import { ok, unavailable } from "@/lib/envelope";
import { getMultiSourceScreenerData } from "@/lib/services/multi-source-screener";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/v1/screener/multi-source
 * Bộ lọc đa nguồn Pro: Target Upside, Tổ chức sở hữu, P/E 3Y, Dòng tiền gom ngoại VPS.
 */
export async function GET() {
  try {
    const res = await getMultiSourceScreenerData();
    return ok(res.data, res.meta, {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    });
  } catch {
    return unavailable("multi-source-screener", "Không tải được bộ lọc đa nguồn.");
  }
}
