import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVndAnalyticReports, type AnalyticReport } from "../providers/vndirect-news";
import type { Meta } from "../types";

const TTL_MS = 15 * 60_000; // 15 mins cache
const STALE_MS = 24 * 60 * 60_000; // 24 hours stale

export interface StockReportsResult {
  symbol: string;
  reports: AnalyticReport[];
  total: number;
  latestTargetPrice: number | null;
  latestRating: string | null;
}

export async function getStockAnalyticReports(
  symbol: string,
  limit = 15
): Promise<{ data: StockReportsResult; meta: Meta } | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  try {
    const res = await cached(`stock-reports:vndirect:${sym}:${limit}`, {
      ttlMs: TTL_MS,
      staleMs: STALE_MS,
      producer: async () => {
        const reports = await getVndAnalyticReports(sym, limit);
        let latestTargetPrice: number | null = null;
        let latestRating: string | null = null;

        for (const rep of reports) {
          if (!latestTargetPrice && rep.targetPrice) {
            latestTargetPrice = rep.targetPrice;
          }
          if (!latestRating && rep.rating) {
            latestRating = rep.rating;
          }
          if (latestTargetPrice && latestRating) break;
        }

        return {
          symbol: sym,
          reports,
          total: reports.length,
          latestTargetPrice,
          latestRating,
        };
      },
    });

    const meta = buildMeta({
      source: "vndirect-research",
      sourceTimestampMs: Date.now(),
      hasData: res.value.reports.length > 0,
      cached: res.cached,
      stale: res.stale,
      note: `Báo cáo phân tích định giá ${sym} từ khối phân tích Orca Research.`,
      slas: { liveSlaMs: -1, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
    });

    return { data: res.value, meta };
  } catch {
    return null;
  }
}
