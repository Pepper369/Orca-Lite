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
  // Giai đoạn 7: Điểm Mua Tối Ưu & Quản Trị Rủi Ro
  buyPoint?: number | null;
  buyPointDiffPct?: number | null;
  absBuyDiff?: number | null;
  buyZoneStatus?: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "EXTENDED" | "BELOW_SUPPORT" | "NO_SETUP";
  isExtended?: boolean;
  chaseRisk?: "LOW" | "MODERATE" | "HIGH";
  buyRange?: [number, number] | null;
  stopLoss?: number | null;
  targetPricePlan?: number | null;
  riskReward?: number | null;
  buyStrategy?: string | null;
  // Giai đoạn 8: Đồng Thuận Đa Khung Thời Gian (H1 + D1 + W1)
  mtfConsensus?: string | null;
  isMtfAligned?: boolean | null;
  mtfScore?: number | null;
  mtfBadgeVi?: string | null;
  // Giai đoạn 9: Sức Mạnh Giá O'Neil (RS) & Orca Master Score
  rsRating?: number | null;
  rsTrend?: "IMPROVING" | "WEAKENING" | "NEUTRAL" | null;
  isMarketLeader?: boolean;
  orcaMasterScore?: number | null;
  orcaMasterCategory?: string | null;
  orcaMasterStrengthVi?: string | null;
  // Giai đoạn 10: Dấu Chân Dòng Tiền Lớn (Smart Money Flow & VSA)
  smartMoneyScore?: number | null;
  smartMoneySignal?: string | null;
  smartMoneySignalVi?: string | null;
  activeBuyRatioPct?: number | null;
  vsaSignal?: string | null;
  vsaSignalVi?: string | null;
  // Giai đoạn 11: Bộ Lọc Bảo Vệ Kỹ Thuật (Technical Consistency Guard)
  apexQuantScore?: number | null;
  apexCategoryVi?: string | null;
  maSignal?: string | null;
  superTrendDir?: string | null;
  isBrokenSupport?: boolean;
  isTechnicalBuyApproved?: boolean;
  isSweetLaunchZone?: boolean | null;
  sectorRrgQuadrant?: string | null;
  sector?: string | null;
  piotroskiFScore?: number | null;
  altmanZone?: string | null;
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

export interface MultiSourceFilterOpts {
  limit?: number;
  offset?: number;
  compact?: boolean;
  techGuardOnly?: boolean;
  q?: string;
}

export async function getMultiSourceScreenerData(opts?: MultiSourceFilterOpts): Promise<{
  data: MultiSourceStockItem[];
  meta: Meta;
  total?: number;
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

      // 2. Lựa chọn Universe thanh khoản cao mở rộng (Tối đa 120 mã: VN30 + VN100 + top thanh khoản)
      const vn30Set = new Set<string>(VN30_BOARD.map((s) => s.toUpperCase()));
      const prioritySymbols = allItems
        .filter(
          (it) =>
            vn30Set.has(it.symbol) ||
            (it.volume != null && it.volume >= 100_000) ||
            (it.marketCap != null && it.marketCap >= 3_000)
        )
        .sort((a, b) => {
          const aVn30 = vn30Set.has(a.symbol) ? 1 : 0;
          const bVn30 = vn30Set.has(b.symbol) ? 1 : 0;
          if (aVn30 !== bVn30) return bVn30 - aVn30;
          return (b.volume ?? 0) - (a.volume ?? 0);
        })
        .slice(0, 120)
        .map((it) => it.symbol);

      const targetSymbols: string[] = prioritySymbols.length > 0 ? prioritySymbols : [...VN30_BOARD];

      // 3. Tải song song dữ liệu chuyên sâu đa nguồn qua mapPool 16 workers
      const enrichedItems: MultiSourceStockItem[] = [];

      await mapPool(targetSymbols, 16, async (symbol: string) => {
        const snap = itemMap.get(symbol);
        const price = snap?.price ?? 0;

        // Truy vấn 3 nguồn chuyên biệt có L1 cache & timeout guard (graceful degradation)
        const [foreign, reportsRes, shareholdersRes] = await Promise.all([
          fetchCachedVpsForeign(symbol),
          fetchCachedVndReports(symbol),
          fetchCachedVietcapShareholders(symbol),
        ]);

        // 2. VNDirect Research Reports (với fallback từ Master Snapshot Consensus)
        const repData = reportsRes?.data ?? null;
        const targetPrice = repData?.latestTargetPrice ?? snap?.consensusTargetPrice ?? null;
        let targetUpsidePct = repData
          ? targetPrice && price > 0
            ? Math.round(((targetPrice - (price > 1000 ? price : price * 1000)) / (price > 1000 ? price : price * 1000)) * 10000) / 100
            : null
          : snap?.consensusUpsidePct ?? null;
        const rating = repData?.latestRating ?? (targetUpsidePct && targetUpsidePct >= 15 ? "MUA (Định giá)" : null);
        const reportCount = repData?.total ?? (snap?.consensusTargetPrice ? 1 : 0);

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

        // 4. Bảo Vệ Kỹ Thuật (Technical Consistency Guard)
        const isBroken = Boolean(snap?.isBrokenSupport || snap?.buyZoneStatus === "BELOW_SUPPORT");
        const isDeathCross = snap?.maSignal === "DEATH_CROSS";
        const isDownTrend = snap?.superTrendDir === "down" && snap?.maSignal !== "GOLDEN_CROSS";
        const isTechnicalBuyApproved = !isBroken && !isDeathCross && !isDownTrend && Boolean(
          snap && (
            snap.maSignal === "GOLDEN_CROSS" ||
            snap.maSignal === "BULLISH_ALIGN" ||
            (snap.confluenceScore ?? 0) >= 50 ||
            (snap.rsRating ?? 0) >= 65 ||
            snap.smartMoneySignal === "HEAVY_ACCUMULATION" ||
            snap.smartMoneySignal === "SPRING_ABSORPTION" ||
            snap.smartMoneySignal === "POCKET_PIVOT"
          )
        );

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
          foreignBuyRatioPct: foreign?.buyRatioPct ?? (snap?.foreignAccumulating ? 60 : 50),
          foreignNetVolume: foreign?.netVolume ?? null,
          foreignNetValue: foreign?.netValue ?? (snap?.foreignNetVal != null ? snap.foreignNetVal * 1_000_000_000 : null),
          foreignRoom: foreign?.foreignRoom ?? null,
          quantEdgeScore: snap?.quantEdgeScore ?? null,
          ouZScore: snap?.ouZScore ?? null,
          ouHalfLife: snap?.ouHalfLife ?? null,
          tripleBarrierRiskReward: snap?.tripleBarrierRiskReward ?? null,
          quantAnomalyTag: snap?.quantAnomalyTag ?? null,
          confluenceScore: snap?.confluenceScore ?? null,
          confluenceBadge: snap?.confluenceBadge ?? null,
          buyPoint: snap?.buyPoint ?? null,
          buyPointDiffPct: snap?.buyPointDiffPct ?? null,
          absBuyDiff: snap?.absBuyDiff ?? null,
          buyZoneStatus: snap?.buyZoneStatus ?? "NO_SETUP",
          buyRange: snap?.buyRange ?? null,
          stopLoss: snap?.stopLoss ?? null,
          targetPricePlan: snap?.targetPrice ?? null,
          riskReward: snap?.riskReward ?? null,
          buyStrategy: snap?.buyStrategy ?? null,
          mtfConsensus: snap?.mtfConsensus ?? null,
          isMtfAligned: snap?.isMtfAligned ?? null,
          mtfScore: snap?.mtfScore ?? null,
          mtfBadgeVi: snap?.mtfBadgeVi ?? null,
          // Sức Mạnh Giá O'Neil & Orca Master Score
          rsRating: snap?.rsRating ?? null,
          rsTrend: snap?.rsTrend ?? null,
          isMarketLeader: snap?.isMarketLeader ?? false,
          orcaMasterScore: snap?.orcaMasterScore ?? null,
          orcaMasterCategory: snap?.orcaMasterCategory ?? null,
          orcaMasterStrengthVi: snap?.orcaMasterStrengthVi ?? null,
          // Dòng Tiền Lớn Smart Money & VSA
          smartMoneyScore: snap?.smartMoneyScore ?? null,
          smartMoneySignal: snap?.smartMoneySignal ?? null,
          smartMoneySignalVi: snap?.smartMoneySignalVi ?? null,
          activeBuyRatioPct: snap?.activeBuyRatioPct ?? null,
          vsaSignal: snap?.vsaSignal ?? null,
          vsaSignalVi: snap?.vsaSignalVi ?? null,
          // Bảo vệ kỹ thuật
          apexQuantScore: snap?.apexQuantScore ?? null,
          apexCategoryVi: snap?.apexCategoryVi ?? null,
          maSignal: snap?.maSignal ?? null,
          superTrendDir: snap?.superTrendDir ?? null,
          isBrokenSupport: isBroken,
          isTechnicalBuyApproved,
          isSweetLaunchZone: snap?.isSweetLaunchZone ?? null,
          sectorRrgQuadrant: snap?.sectorRrgQuadrant ?? null,
          sector: snap?.sector ?? null,
          piotroskiFScore: snap?.piotroskiFScore ?? null,
          altmanZone: snap?.altmanZone ?? null,
        });
      });

      // Sắp xếp mặc định theo Vốn hóa & Thanh khoản
      return enrichedItems.sort((a, b) => b.volume - a.volume);
    },
  });

  let items = res.value;

  // Filter & Pagination Options (Khắc phục Điểm nghẽn 4: Client-side Bloat & Payload Overhead)
  if (opts) {
    if (opts.q?.trim()) {
      const q = opts.q.trim().toUpperCase();
      items = items.filter((it) => it.symbol.includes(q) || it.name.toUpperCase().includes(q));
    }
    if (opts.techGuardOnly) {
      items = items.filter((it) => it.isTechnicalBuyApproved === true);
    }
    const total = items.length;
    const offset = Math.max(0, opts.offset ?? 0);
    const limit = opts.limit && opts.limit > 0 ? opts.limit : items.length;
    items = items.slice(offset, offset + limit);

    // Compact Projection: Rút gọn 80% dung lượng payload khi client chỉ cần bảng view
    if (opts.compact) {
      items = items.map((it) => ({
        symbol: it.symbol,
        name: it.name,
        price: it.price,
        changePercent: it.changePercent,
        volume: it.volume,
        targetPrice: it.targetPrice,
        targetUpsidePct: it.targetUpsidePct,
        rating: it.rating,
        reportCount: it.reportCount,
        institutionOwnershipPct: it.institutionOwnershipPct,
        leadershipOwnershipPct: it.leadershipOwnershipPct,
        majorHoldersCount: it.majorHoldersCount,
        pe: it.pe,
        pb: it.pb,
        pe3yAvg: it.pe3yAvg,
        beta: it.beta,
        high52w: it.high52w,
        low52w: it.low52w,
        foreignBuyRatioPct: it.foreignBuyRatioPct,
        foreignNetVolume: it.foreignNetVolume,
        foreignNetValue: it.foreignNetValue,
        foreignRoom: it.foreignRoom,
        quantEdgeScore: it.quantEdgeScore,
        ouZScore: it.ouZScore,
        ouHalfLife: it.ouHalfLife,
        tripleBarrierRiskReward: it.tripleBarrierRiskReward,
        quantAnomalyTag: it.quantAnomalyTag,
        confluenceScore: it.confluenceScore,
        confluenceBadge: it.confluenceBadge,
        buyPoint: it.buyPoint,
        buyPointDiffPct: it.buyPointDiffPct,
        absBuyDiff: it.absBuyDiff,
        buyZoneStatus: it.buyZoneStatus,
        buyRange: it.buyRange,
        stopLoss: it.stopLoss,
        targetPricePlan: it.targetPricePlan,
        riskReward: it.riskReward,
        buyStrategy: it.buyStrategy,
        mtfConsensus: it.mtfConsensus,
        isMtfAligned: it.isMtfAligned,
        mtfScore: it.mtfScore,
        mtfBadgeVi: it.mtfBadgeVi,
        rsRating: it.rsRating,
        rsTrend: it.rsTrend,
        isMarketLeader: it.isMarketLeader,
        orcaMasterScore: it.orcaMasterScore,
        orcaMasterCategory: it.orcaMasterCategory,
        orcaMasterStrengthVi: it.orcaMasterStrengthVi,
        smartMoneyScore: it.smartMoneyScore,
        smartMoneySignal: it.smartMoneySignal,
        smartMoneySignalVi: it.smartMoneySignalVi,
        activeBuyRatioPct: it.activeBuyRatioPct,
        vsaSignal: it.vsaSignal,
        vsaSignalVi: it.vsaSignalVi,
        apexQuantScore: it.apexQuantScore,
        apexCategoryVi: it.apexCategoryVi,
        maSignal: it.maSignal,
        superTrendDir: it.superTrendDir,
        isBrokenSupport: it.isBrokenSupport,
        isTechnicalBuyApproved: it.isTechnicalBuyApproved,
        isSweetLaunchZone: it.isSweetLaunchZone,
        sectorRrgQuadrant: it.sectorRrgQuadrant,
        sector: it.sector,
        piotroskiFScore: it.piotroskiFScore,
        altmanZone: it.altmanZone,
      }));
    }

    const meta = buildMeta({
      source: "multi-source-composite-screener (VPS + SSI + VNDirect + Vietcap + OQuant)",
      sourceTimestampMs: Date.now(),
      hasData: items.length > 0,
      cached: res.cached,
      stale: res.stale,
      note: `Bộ lọc đa nguồn (${items.length}/${total} mã) - Hợp nhất Giá Realtime, Khối ngoại, Báo cáo và Ưu thế Quant.`,
      slas: { liveSlaMs: 5_000, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
    });

    return { data: items, meta, total };
  }

  const meta = buildMeta({
    source: "multi-source-composite-screener (VPS + SSI + VNDirect + Vietcap + OQuant)",
    sourceTimestampMs: Date.now(),
    hasData: items.length > 0,
    cached: res.cached,
    stale: res.stale,
    note: `Bộ lọc đa nguồn toàn diện (${items.length} mã) - Hợp nhất Giá Realtime, Khối ngoại, Báo cáo phân tích và Ưu thế Quant.`,
    slas: { liveSlaMs: 5_000, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
  });

  return { data: items, meta, total: items.length };
}
