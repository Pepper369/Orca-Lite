import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { BOOTSTRAP_VN30_QUOTES } from "../bootstrap-data";
import { getVpsQuotes, getVpsForeignFlow } from "../providers/vps";
import { getStockAnalyticReports } from "./stock-reports";
import { getStockShareholders } from "./stock-shareholders";
import { getStockComprehensiveRatios } from "./stock-comprehensive-ratios";
import type { Meta } from "../types";

export interface MultiSourceStockItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  // Giai đoạn 1: VNDirect Research Target
  targetPrice: number | null;
  targetUpsidePct: number | null;
  rating: string | null;
  reportCount: number;
  // Giai đoạn 2: Vietcap IQ Ownership
  institutionOwnershipPct: number | null;
  leadershipOwnershipPct: number | null;
  majorHoldersCount: number;
  // Giai đoạn 3: VNDirect 166 Ratios
  pe: number | null;
  pb: number | null;
  pe3yAvg: number | null;
  beta: number | null;
  high52w: number | null;
  low52w: number | null;
  // Giai đoạn 5: VPS Live Foreign Flow
  foreignBuyRatioPct: number;
  foreignNetVolume: number | null;
  foreignNetValue: number | null;
  foreignRoom: number | null;
}

const TTL_MS = 30_000; // 30s cache cho screener realtime
const STALE_MS = 10 * 60_000;

export async function getMultiSourceScreenerData(): Promise<{
  data: MultiSourceStockItem[];
  meta: Meta;
}> {
  const cacheKey = "screener:multi-source:pro-v2";

  const res = await cached(cacheKey, {
    ttlMs: TTL_MS,
    staleMs: STALE_MS,
    producer: async () => {
      const topSymbols = BOOTSTRAP_VN30_QUOTES.slice(0, 20).map((q) => q.symbol);
      const quotes = await getVpsQuotes(topSymbols);
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

      // Tải song song dữ liệu đa nguồn từ các engine giai đoạn 1, 2, 3, 5
      const enrichedItems = await Promise.all(
        topSymbols.map(async (symbol): Promise<MultiSourceStockItem> => {
          const baseQuote = quoteMap.get(symbol) || BOOTSTRAP_VN30_QUOTES.find((b) => b.symbol === symbol);
          const price = baseQuote?.price ?? 0;
          const boot = BOOTSTRAP_VN30_QUOTES.find((b) => b.symbol === symbol);

          // Lấy song song: VPS Foreign, VNDirect Reports, Vietcap Shareholders, VNDirect Ratios
          const [foreignRes, reportsRes, shareholdersRes, ratiosRes] = await Promise.allSettled([
            getVpsForeignFlow(symbol),
            getStockAnalyticReports(symbol, 5),
            getStockShareholders(symbol),
            getStockComprehensiveRatios(symbol),
          ]);

          // 1. VPS Foreign Flow
          const foreign = foreignRes.status === "fulfilled" ? foreignRes.value : null;

          // 2. VNDirect Research Reports
          const repData = reportsRes.status === "fulfilled" ? reportsRes.value?.data : null;
          const targetPrice = repData?.latestTargetPrice ?? null;
          const targetUpsidePct =
            targetPrice && price > 0
              ? Math.round(((targetPrice - (price > 1000 ? price : price * 1000)) / (price > 1000 ? price : price * 1000)) * 10000) / 100
              : null;
          const rating = repData?.latestRating ?? null;
          const reportCount = repData?.total ?? 0;

          // 3. Vietcap Shareholders
          const shData = shareholdersRes.status === "fulfilled" ? shareholdersRes.value?.data : null;
          const shList = shData?.shareholders ?? [];
          const instPct = shData
            ? Math.round((shData.structure.corporatePct + shData.structure.foreignPct) * 10) / 10
            : null;
          const leaderPct = shList.length
            ? Math.round(
                shList
                  .filter((item) => Boolean(item.positionName))
                  .reduce((acc, l) => acc + (l.percentage || 0), 0) * 10
              ) / 10
            : null;
          const majorHoldersCount = shData?.majorHoldersCount ?? shList.length;

          // 4. VNDirect Comprehensive Ratios
          const cr = ratiosRes.status === "fulfilled" ? ratiosRes.value?.data : null;

          return {
            symbol,
            name: boot?.name || symbol,
            price: price > 0 ? (price > 1000 ? price / 1000 : price) : 0,
            changePercent: baseQuote?.changePercent ?? 0,
            volume: baseQuote?.volume ?? 0,
            targetPrice,
            targetUpsidePct,
            rating,
            reportCount,
            institutionOwnershipPct: instPct,
            leadershipOwnershipPct: leaderPct,
            majorHoldersCount,
            pe: cr?.pe ?? null,
            pb: cr?.pb ?? null,
            pe3yAvg: cr?.peAvg3y ?? null,
            beta: cr?.beta ?? null,
            high52w: cr?.high52w ?? null,
            low52w: cr?.low52w ?? null,
            foreignBuyRatioPct: foreign?.buyRatioPct ?? 50,
            foreignNetVolume: foreign?.netVolume ?? null,
            foreignNetValue: foreign?.netValue ?? null,
            foreignRoom: foreign?.foreignRoom ?? null,
          };
        })
      );

      return enrichedItems;
    },
  });

  const meta = buildMeta({
    source: "multi-source-composite-screener",
    sourceTimestampMs: Date.now(),
    hasData: res.value.length > 0,
    cached: res.cached,
    stale: res.stale,
    note: "Dữ liệu sàng lọc đa nguồn: VNDirect Research + Vietcap IQ + VPS Live Flow + Finfo Ratios.",
    slas: { liveSlaMs: 5_000, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
  });

  return { data: res.value, meta };
}
