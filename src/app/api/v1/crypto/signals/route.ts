import { ok, unavailable } from "@/lib/envelope";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CRYPTO INSTITUTIONAL QUANT SIGNALS & SCALP HUB API
 */
export async function GET() {
  try {
    const hub = await getCryptoSignalsHubData();
    if (!hub) {
      return unavailable("crypto-signals-hub", "Không thể nạp dữ liệu tín hiệu Crypto.");
    }
    return ok(hub.data, hub.meta);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi quét tín hiệu Crypto Futures Hub";
    return unavailable("crypto-signals-hub", msg);
  }
}
