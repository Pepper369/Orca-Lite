import { ok, badRequest, unavailable } from "@/lib/envelope";
import { getVpsForeignFlow } from "@/lib/providers/vps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/v1/stocks/:symbol/foreign-live
 * Dòng tiền gom/xả ròng khối ngoại realtime từng giây & Room ngoại từ VPS BGAPI.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(symbol)) return badRequest("symbol không hợp lệ");
  const flow = await getVpsForeignFlow(symbol);
  if (!flow) return unavailable("vps-foreign-flow", `Không lấy được dòng tiền ngoại realtime cho ${symbol}.`);
  return ok(flow, {
    source: "vps-live-feed",
    sourceTimestampMs: Date.now(),
    cached: false,
    freshness: "LIVE",
    ageMs: 0,
  }, { "Cache-Control": "no-cache, no-store, must-revalidate" });
}
