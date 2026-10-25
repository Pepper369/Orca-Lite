import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVndComprehensiveRatios, type VndComprehensiveRatios } from "../providers/vndirect-company";
import type { Meta } from "../types";

const TTL_MS = 30 * 60_000; // 30 mins
const STALE_MS = 24 * 60 * 60_000; // 24 hours

export async function getStockComprehensiveRatios(
  symbol: string
): Promise<{ data: VndComprehensiveRatios; meta: Meta } | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  try {
    const res = await cached(`comprehensive-ratios:vndirect:${sym}`, {
      ttlMs: TTL_MS,
      staleMs: STALE_MS,
      producer: async () => {
        const ratios = await getVndComprehensiveRatios(sym);
        if (!ratios) throw new Error(`Không lấy được ratios cho ${sym}`);
        return ratios;
      },
    });

    const meta = buildMeta({
      source: "vndirect-ratios-v4",
      sourceTimestampMs: Date.now(),
      hasData: Boolean(res.value),
      cached: res.cached,
      stale: res.stale,
      note: `Kho 166 chỉ số tài chính và định giá lịch sử ${sym} từ VNDirect.`,
      slas: { liveSlaMs: -1, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
    });

    return { data: res.value, meta };
  } catch {
    return null;
  }
}
