import { ok, unavailable } from "@/lib/envelope";
import { getForexSignalsHub } from "@/lib/services/forex-signals-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * FOREX QUANTITATIVE SIGNALS HUB API
 * Scans top liquid FX pairs + Gold, computes multi-tier TP (TP1/2/3) and institutional lot sizing.
 */
export async function GET() {
  try {
    const hub = await getForexSignalsHub();
    if (!hub?.data) {
      return unavailable("forex-signals-engine", "Hệ thống Forex Signals tạm thời không sẵn sàng.");
    }
    return ok(hub.data, hub.meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi quét tín hiệu Forex định lượng";
    return unavailable("forex-signals-engine", message);
  }
}
