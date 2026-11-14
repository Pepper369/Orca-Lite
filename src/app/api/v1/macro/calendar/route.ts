import { ok } from "@/lib/envelope";
import { getEconomicCalendar } from "@/lib/providers/economic-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/macro/calendar
 * Lịch kinh tế định lượng: Sự kiện vĩ mô Việt Nam (GDP, CPI, PMI, Lãi suất, Giá xăng)
 * và Quốc tế (Fed FOMC, US CPI, NFP, China PMI) kèm mùa BCTC SSC.
 */
export async function GET() {
  const calendar = await getEconomicCalendar();
  return ok(calendar, {
    source: "orca-economic-calendar-hub",
    freshness: "FRESH",
    note: `Lịch sự kiện vĩ mô & Chu kỳ công bố BCTC (Tổng cộng ${calendar.events.length} sự kiện)`,
  });
}
