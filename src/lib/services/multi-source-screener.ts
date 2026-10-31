import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVpsForeignFlow } from "../providers/vps";
import { getStockAnalyticReports } from "./stock-reports";
import { getStockShareholders } from "./stock-shareholders";
import { getMasterScreenerSnapshot } from "./screener-snapshot-service";
import { mapPool } from "./screener-ohlcv";
import { VN30_BOARD } from "../providers/public-vn-feed";
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
  // Giai đoạn 3: VNDirect Ratios & Valuation
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
  // Giai đoạn 6: Ưu thế Quant Trading & Hội tụ
  quantEdgeScore?: number | null;
  ouZScore?: number | null;
  ouHalfLife?: number | null;
  tripleBarrierRiskReward?: number | null;
  quantAnomalyTag?: string | null;
  confluenceScore?: number | null;
  confluenceBadge?: string | null;
}

const TTL_MS = 30_000; // 30s fresh cache cho screener realtime
const STALE_MS = 10 * 60_000;

// High-speed in-memory L1 caches with timeout protection
const vpsForeignL1 = new Map<string, { val: Awaited<ReturnType<typeof getVpsForeignFlow>>; exp: number }>();
const vndReportsL1 = new Map<string, { val: Awaited<ReturnType<typeof getStockAnalyticReports>>; exp: number }>();
const vietcapShareholdersL1 = new Map<string, { val: Awaited<ReturnType<typeof getStockShareholders>>; exp: number }>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function fetchCachedVpsForeign(sym: string) {
  const e = vpsForeignL1.get(sym);
  if (e && Date.now() < e.exp) return e.val;
  const res = await withTimeout(getVpsForeignFlow(sym), 2_000).catch(() => null);
  if (res) vpsForeignL1.set(sym, { val: res, exp: Date.now() + 2 * 60_000 });
  return res;
}

async function fetchCachedVndReports(sym: string) {
  const e = vndReportsL1.get(sym);
  if (e && Date.now() < e.exp) return e.val;
  const res = await withTimeout(getStockAnalyticReports(sym, 5), 2_500).catch(() => null);
  if (res) vndReportsL1.set(sym, { val: res, exp: Date.now() + 10 * 60_000 });
  return res;
}

async function fetchCachedVietcapShareholders(sym: string) {
  const e = vietcapShareholdersL1.get(sym);
  if (e && Date.now() < e.exp) return e.val;
  const res = await withTimeout(getStockShareholders(sym), 2_500).catch(() => null);
  if (res) vietcapShareholdersL1.set(sym, { val: res, exp: Date.now() + 10 * 60_000 });
  return res;
}

export async function getMultiSourceScreenerData(): Promise<{
  data: MultiSourceStockItem[];
  meta: Meta;
}> {
  const cacheKey = "screener:multi-source:pro-v3";

  const res = await cached(cacheKey, {
    ttlMs: TTL_MS,
    staleMs: STALE_MS,
    producer: async () => {
      // 1. Lấy dữ liệu nền tảng đã đồng bộ từ Master Screener Snapshot
      const masterSnapshot = await getMasterScreenerSnapshot();
      const allItems = masterSnapshot.items ?? [];
      const itemMap = new Map(allItems.map((it) => [it.symbol, it]));

      // 2. Lựa chọn Universe thanh khoản cao (~50 mã: VN30 + top khối lượng)
      const vn30Set = new Set<string>(VN30_BOARD.map((s) => s.toUpperCase()));
      const prioritySymbols = allItems
        .filter((it) => vn30Set.has(it.symbol) || (it.volume != null && it.volume >= 200_000))
        .sort((a, b) => {
          const aVn30 = vn30Set.has(a.symbol) ? 1 : 0;
          const bVn30 = vn30Set.has(b.symbol) ? 1 : 0;
          if (aVn30 !== bVn30) return bVn30 - aVn30;
          return (b.volume ?? 0) - (a.volume ?? 0);
        })
        .slice(0, 50)
        .map((it) => it.symbol);

      const targetSymbols: string[] = prioritySymbols.length > 0 ? prioritySymbols : [...VN30_BOARD];

      // 3. Tải song song dữ liệu chuyên sâu đa nguồn qua mapPool 12 workers
      const enrichedItems: MultiSourceStockItem[] = [];

      await mapPool(targetSymbols, 12, async (symbol: string) => {
        const snap = itemMap.get(symbol);
        const price = snap?.price ?? 0;

        // Truy vấn 3 nguồn chuyên biệt có L1 cache & timeout guard
        const [foreign, reportsRes, shareholdersRes] = await Promise.all([
          fetchCachedVpsForeign(symbol),
          fetchCachedVndReports(symbol),
          fetchCachedVietcapShareholders(symbol),
        ]);

        // 2. VNDirect Research Reports
        const repData = reportsRes?.data ?? null;
        const targetPrice = repData?.latestTargetPrice ?? null;
        const targetUpsidePct =
          targetPrice && price > 0
            ? Math.round(((targetPrice - (price > 1000 ? price : price * 1000)) / (price > 1000 ? price : price * 1000)) * 10000) / 100
            : null;
        const rating = repData?.latestRating ?? null;
        const reportCount = repData?.total ?? 0;

        // 3. Vietcap Shareholders
        const shData = shareholdersRes?.data ?? null;
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

        enrichedItems.push({
          symbol,
          name: snap?.name || symbol,
          price: price > 0 ? (price > 1000 ? price / 1000 : price) : 0,
          changePercent: snap?.changePercent ?? 0,
          volume: snap?.volume ?? 0,
          targetPrice,
          targetUpsidePct,
          rating,
          reportCount,
          institutionOwnershipPct: instPct,
          leadershipOwnershipPct: leaderPct,
          majorHoldersCount,
          pe: snap?.pe ?? null,
          pb: snap?.pb ?? null,
          pe3yAvg: null,
          beta: snap?.beta ?? null,
          high52w: null,
          low52w: null,
          foreignBuyRatioPct: foreign?.buyRatioPct ?? 50,
          foreignNetVolume: foreign?.netVolume ?? null,
          foreignNetValue: foreign?.netValue ?? null,
          foreignRoom: foreign?.foreignRoom ?? null,
          quantEdgeScore: snap?.quantEdgeScore ?? null,
          ouZScore: snap?.ouZScore ?? null,
          ouHalfLife: snap?.ouHalfLife ?? null,
          tripleBarrierRiskReward: snap?.tripleBarrierRiskReward ?? null,
          quantAnomalyTag: snap?.quantAnomalyTag ?? null,
          confluenceScore: snap?.confluenceScore ?? null,
          confluenceBadge: snap?.confluenceBadge ?? null,
        });
      });

      // Sắp xếp mặc định theo Vốn hóa & Thanh khoản
      return enrichedItems.sort((a, b) => b.volume - a.volume);
    },
  });

  const meta = buildMeta({
    source: "multi-source-composite-screener (VPS + SSI + VNDirect + Vietcap + OQuant)",
    sourceTimestampMs: Date.now(),
    hasData: res.value.length > 0,
    cached: res.cached,
    stale: res.stale,
    note: `Bộ lọc đa nguồn toàn diện (${res.value.length} mã) - Hợp nhất Giá Realtime, Khối ngoại, Báo cáo phân tích và Ưu thế Quant.`,
    slas: { liveSlaMs: 5_000, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
  });

  return { data: res.value, meta };
}
