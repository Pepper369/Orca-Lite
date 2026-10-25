import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getMultiQuotes } from "./multi-quote";
import { getFundamentalSnapshots, type FundamentalSnapshot } from "../financial/snapshots";
import { getVndValuationRatios, type VndValuationRatios } from "../providers/vndirect-company";
import { getVietcapCompany, type VietcapProfile } from "../providers/vietcap";
import { sectorOf, getSecurity, type VnExchange, VN_SECURITIES } from "../vn/master";
import { VN100 } from "../vn/vn100";
import { mapPool } from "../financial/snapshots";
import type { Meta } from "../types";

import { batchVnOhlcv } from "./ohlcv-batch";
import { sma } from "../engines/oscillators";

export type ScreenerPreset = "all" | "canslim" | "dividend" | "growth" | "value" | "breakout" | "ma_cross";

export type ScreenerStockItem = {
  symbol: string;
  name: string | null;
  sector: string | null;
  exchange: VnExchange | string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null; // in Billion VND
  pe: number | null;
  pb: number | null;
  ps: number | null;
  evEbitda: number | null;
  dividendYield: number | null; // % (e.g. 7.5 = 7.5%)
  roe: number | null; // %
  roa: number | null; // %
  grossMargin: number | null; // %
  netMargin: number | null; // %
  debtEquity: number | null;
  currentRatio: number | null;
  revenueYoyPct: number | null; // %
  niYoyPct: number | null; // %
  fcfTtm: number | null;
  qualityScore: number | null; // 0-100
  healthScore: number | null; // 0-100
  // MA Technical Momentum
  ma10: number | null;
  ma20: number | null;
  ma50: number | null;
  maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL";
  volRatio20: number | null;
  presetsPassed: ScreenerPreset[];
  compositeScore: number; // 0-100
};

export type ScreenerFilterParams = {
  preset?: ScreenerPreset;
  exchange?: string;
  sector?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minChg?: number;
  maxChg?: number;
  minVol?: number;
  maxVol?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  minPe?: number;
  maxPe?: number;
  minPb?: number;
  maxPb?: number;
  minRoe?: number;
  maxRoe?: number;
  minRoa?: number;
  maxRoa?: number;
  minDivYield?: number;
  maxDivYield?: number;
  maxDe?: number;
  minQualityScore?: number;
  minRevenueYoy?: number;
  minNiYoy?: number;
  maSignal?: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" | string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type ScreenerResponseData = {
  items: ScreenerStockItem[];
  total: number;
  totalUniverse: number;
  offset: number;
  limit: number;
  presetsCount: Record<ScreenerPreset, number>;
  sectorsAvailable: string[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
  };
  meta: Meta;
};

// Universe builder: combine VN100 with all defined VN_SECURITIES for high coverage
function getScreenerUniverse(): string[] {
  const set = new Set<string>();
  for (const s of VN100) set.add(s.toUpperCase());
  for (const s of VN_SECURITIES) set.add(s.symbol.toUpperCase());
  return Array.from(set);
}

function analyzeMaFeatures(bars: { close: number; volume: number }[], currentPrice: number | null) {
  if (!bars || bars.length < 15) {
    return {
      ma10: null,
      ma20: null,
      ma50: null,
      volRatio20: null,
      maSignal: "NEUTRAL" as const,
    };
  }
  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  if (closes.length < 15) {
    return { ma10: null, ma20: null, ma50: null, volRatio20: null, maSignal: "NEUTRAL" as const };
  }
  const len = closes.length;
  const sma10Series = sma(closes, 10);
  const sma20Series = sma(closes, 20);
  const sma50Series = sma(closes, 50);

  const ma10 = sma10Series[len - 1] ?? null;
  const ma20 = sma20Series[len - 1] ?? null;
  const ma50 = sma50Series[len - 1] ?? null;

  const prevMa10 = len >= 2 ? sma10Series[len - 2] : null;
  const prevMa20 = len >= 2 ? sma20Series[len - 2] : null;
  const prevMa50 = len >= 2 ? sma50Series[len - 2] : null;

  // Vol ratio 20
  const vols = bars.map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0);
  let volRatio20: number | null = null;
  if (vols.length >= 20) {
    const avgVol = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastVol = vols[vols.length - 1];
    if (avgVol > 0 && lastVol > 0) {
      volRatio20 = Number((lastVol / avgVol).toFixed(2));
    }
  }

  const p = currentPrice ?? closes[len - 1];

  let maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" = "NEUTRAL";

  // 1. Golden Cross: MA10 cắt lên MA20 hoặc MA20 cắt lên MA50
  const isCrossUp20_50 =
    prevMa20 != null && prevMa50 != null && ma20 != null && ma50 != null && prevMa20 <= prevMa50 && ma20 > ma50;
  const isCrossUp10_20 =
    prevMa10 != null && prevMa20 != null && ma10 != null && ma20 != null && prevMa10 <= prevMa20 && ma10 > ma20;

  // 2. Death Cross: MA20 cắt xuống MA50
  const isCrossDown20_50 =
    prevMa20 != null && prevMa50 != null && ma20 != null && ma50 != null && prevMa20 >= prevMa50 && ma20 < ma50;

  // 3. Bullish Alignment: Giá > MA10 >= MA20 > MA50
  const isAlignedBull =
    ma10 != null && ma20 != null && p > ma10 && ma10 >= ma20 && (ma50 == null || ma20 > ma50);

  if (isCrossUp20_50 || isCrossUp10_20) {
    maSignal = "GOLDEN_CROSS";
  } else if (isAlignedBull) {
    maSignal = "BULLISH_ALIGN";
  } else if (isCrossDown20_50 || (ma20 != null && ma50 != null && p < ma20 && ma20 < ma50)) {
    maSignal = "DEATH_CROSS";
  }

  return {
    ma10: ma10 ? Number(ma10.toFixed(2)) : null,
    ma20: ma20 ? Number(ma20.toFixed(2)) : null,
    ma50: ma50 ? Number(ma50.toFixed(2)) : null,
    volRatio20,
    maSignal,
  };
}

function calculateCompositeScore(
  quality: number | null,
  roe: number | null,
  netMargin: number | null,
  pe: number | null,
  pb: number | null,
  de: number | null,
): number {
  let score = 50;
  if (quality != null) {
    score += (quality - 50) * 0.35;
  }
  if (roe != null && Number.isFinite(roe)) {
    if (roe >= 20) score += 15;
    else if (roe >= 15) score += 10;
    else if (roe < 0) score -= 15;
  }
  if (netMargin != null && Number.isFinite(netMargin)) {
    if (netMargin >= 15) score += 8;
    else if (netMargin < 0) score -= 10;
  }
  if (pe != null && Number.isFinite(pe)) {
    if (pe > 0 && pe <= 12) score += 8;
    else if (pe > 35) score -= 8;
  }
  if (pb != null && Number.isFinite(pb)) {
    if (pb > 0 && pb <= 1.5) score += 6;
  }
  if (de != null && Number.isFinite(de)) {
    if (de <= 0.8) score += 5;
    else if (de > 2.5) score -= 8;
  }
  return Math.max(5, Math.min(98, Math.round(score)));
}

function detectPresets(item: {
  roe: number | null;
  revenueYoyPct: number | null;
  niYoyPct: number | null;
  price: number | null;
  changePercent: number | null;
  dividendYield: number | null;
  debtEquity: number | null;
  pe: number | null;
  pb: number | null;
  netMargin: number | null;
  volume: number | null;
  maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL";
}): ScreenerPreset[] {
  const passes: ScreenerPreset[] = ["all"];

  // 1. CANSLIM
  const roeGood = item.roe != null && item.roe >= 14;
  const growthGood = (item.niYoyPct != null && item.niYoyPct >= 15) || (item.revenueYoyPct != null && item.revenueYoyPct >= 15);
  const priceHealthy = item.price != null && item.price >= 8;
  if (roeGood && (growthGood || (item.changePercent != null && item.changePercent > 0)) && priceHealthy) {
    passes.push("canslim");
  }

  // 2. High Dividend
  const divGood = item.dividendYield != null && item.dividendYield >= 5;
  const deSafe = item.debtEquity == null || item.debtEquity <= 1.5;
  const peFair = item.pe == null || (item.pe > 0 && item.pe <= 16);
  if (divGood && deSafe && peFair) {
    passes.push("dividend");
  }

  // 3. High Growth
  const niHigh = item.niYoyPct != null && item.niYoyPct >= 20;
  const revHigh = item.revenueYoyPct != null && item.revenueYoyPct >= 15;
  if ((niHigh || revHigh) && (item.roe == null || item.roe >= 12)) {
    passes.push("growth");
  }

  // 4. Value
  const peCheap = item.pe != null && item.pe > 0 && item.pe <= 11;
  const pbCheap = item.pb != null && item.pb > 0 && item.pb <= 1.3;
  const roePositive = item.roe == null || item.roe >= 8;
  if (peCheap && pbCheap && roePositive) {
    passes.push("value");
  }

  // 5. Momentum Breakout
  const chgStrong = item.changePercent != null && item.changePercent >= 2.0;
  const volActive = item.volume != null && item.volume >= 100_000;
  if (chgStrong && volActive) {
    passes.push("breakout");
  }

  // 6. MA Crossover Strategy (Golden Cross / Bullish Alignment)
  const isMaBullish = item.maSignal === "GOLDEN_CROSS" || item.maSignal === "BULLISH_ALIGN";
  const volValid = item.volume != null && item.volume >= 80_000;
  const priceValid = item.price != null && item.price >= 8;
  if (isMaBullish && volValid && priceValid) {
    passes.push("ma_cross");
  }

  return passes;
}

/**
 * Fetch and aggregate master stock screener snapshot.
 * Runs multi-source parallel race for quotes and 3-tier cascade for valuation.
 */
export async function getMasterScreenerSnapshot(): Promise<{
  items: ScreenerStockItem[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
  };
  meta: Meta;
}> {
  const res = await cached("screener:master:snapshot:v2", {
    ttlMs: 2 * 60_000, // 2 minutes fresh cache
    staleMs: 30 * 60_000, // 30 minutes stale serve while refreshing
    producer: async () => {
      const symbols = getScreenerUniverse();
      let failoverCount = 0;

      // 1. Multi-source parallel race for realtime quotes (VPS + SSI + VNDirect + Vietcap)
      const multiQuotesRes = await getMultiQuotes(symbols).catch(() => ({
        quotes: [],
        sources: ["vps-fallback"],
        sourceTs: Date.now(),
        latencies: {},
        conflicts: 0,
      }));

      const quotesMap = new Map<string, { price: number; change: number; changePercent: number; volume: number; name?: string }>();
      for (const q of multiQuotesRes.quotes ?? []) {
        if (!q.symbol) continue;
        quotesMap.set(q.symbol.toUpperCase(), {
          price: typeof q.price === "number" ? q.price : 0,
          change: typeof q.change === "number" ? q.change : 0,
          changePercent: typeof q.changePercent === "number" ? q.changePercent : 0,
          volume: typeof q.volume === "number" ? q.volume : (typeof q.quoteVolume === "number" ? q.quoteVolume : 0),
          name: q.name ?? undefined,
        });
      }

      // 2. Fetch fundamentals in controlled concurrency
      const fundResult = await getFundamentalSnapshots(symbols, { concurrency: 8 }).catch(() => ({ snapshots: [] }));
      const fundMap = new Map<string, FundamentalSnapshot>();
      for (const f of fundResult.snapshots ?? []) {
        fundMap.set(f.symbol.toUpperCase(), f);
      }

      // 3. Multi-source valuation multiples: Primary VNDirect + Secondary Vietcap IQ + Tertiary Autonomous Computed
      const valMap = new Map<string, VndValuationRatios>();
      const vietcapMap = new Map<string, VietcapProfile>();

      await mapPool(
        symbols,
        8,
        async (sym) => {
          try {
            // Tier 1: VNDirect ratios
            const v = await getVndValuationRatios(sym);
            if (v && (v.pe != null || v.pb != null)) {
              valMap.set(sym, v);
            } else {
              // Tier 2: Vietcap IQ failover
              const vc = await getVietcapCompany(sym).catch(() => null);
              if (vc) {
                vietcapMap.set(sym, vc);
                failoverCount++;
              }
            }
          } catch {
            // Tier 2 catch fallback
            const vc = await getVietcapCompany(sym).catch(() => null);
            if (vc) {
              vietcapMap.set(sym, vc);
              failoverCount++;
            }
          }
        },
      );

      // 3b. Batch OHLCV for technical Moving Average analysis (MA10, MA20, MA50)
      const ohlcvMap = await batchVnOhlcv(symbols, {
        bars: 65,
        concurrency: 4,
        perSymbolMs: 800,
        deadlineMs: 3_500,
        resilient: false,
      }).catch(() => new Map());

      // 4. Assemble merged items with 3-tier failover & MA analysis
      const items: ScreenerStockItem[] = [];

      for (const sym of symbols) {
        const sec = getSecurity(sym);
        const q = quotesMap.get(sym);
        const f = fundMap.get(sym);
        const v = valMap.get(sym);
        const vc = vietcapMap.get(sym);

        const price = q?.price && q.price > 0 ? q.price : (vc?.price && vc.price > 0 ? vc.price : null);
        const change = q?.change ?? null;
        const changePercent = q?.changePercent ?? null;
        const volume = q?.volume ?? null;

        // Resolve P/E: Tier 1 (VNDirect) -> Tier 2 (Computed from EPS TTM)
        let pe = v?.pe ?? null;
        if (pe == null && f?.epsTtm && price && f.epsTtm > 0) {
          pe = Number((price / (f.epsTtm / 1000)).toFixed(2));
          failoverCount++;
        }

        // Resolve P/B: Tier 1 (VNDirect) -> Tier 2 (Computed from Equity / Shares)
        let pb = v?.pb ?? null;
        if (pb == null && f?.equity && f?.shares && price && f.shares > 0) {
          const bvps = (f.equity / f.shares) / 1000;
          if (bvps > 0) {
            pb = Number((price / bvps).toFixed(2));
            failoverCount++;
          }
        }

        const ps = v?.ps ?? null;
        const evEbitda = v?.evEbitda ?? null;
        const dividendYield = v?.dividendYield != null ? Number((v.dividendYield * 100).toFixed(2)) : null;

        // Resolve Market Cap: Tier 1 (VNDirect) -> Tier 2 (Vietcap) -> Tier 3 (Price * Shares)
        let marketCapRaw = v?.marketCap ?? (vc?.marketCap != null ? vc.marketCap : null);
        if (marketCapRaw == null && (f?.shares ?? vc?.sharesOutstanding) && price) {
          const shares = f?.shares ?? vc?.sharesOutstanding!;
          marketCapRaw = price * 1000 * shares;
          failoverCount++;
        }
        const marketCap = marketCapRaw != null ? Math.round(marketCapRaw / 1_000_000_000) : null; // in Billion VND

        const roe = f?.roe != null ? Number(f.roe.toFixed(2)) : (v?.roe != null ? Number((v.roe * 100).toFixed(2)) : null);
        const roa = f?.roa != null ? Number(f.roa.toFixed(2)) : (v?.roa != null ? Number((v.roa * 100).toFixed(2)) : null);
        const grossMargin = f?.grossMargin != null ? Number(f.grossMargin.toFixed(2)) : null;
        const netMargin = f?.netMargin != null ? Number(f.netMargin.toFixed(2)) : null;
        const debtEquity = f?.debtEquity != null ? Number(f.debtEquity.toFixed(2)) : null;
        const currentRatio = f?.currentRatio != null ? Number(f.currentRatio.toFixed(2)) : null;
        const revenueYoyPct = f?.revenueYoyPct != null ? Number(f.revenueYoyPct.toFixed(2)) : null;
        const niYoyPct = f?.niYoyPct != null ? Number(f.niYoyPct.toFixed(2)) : null;
        const fcfTtm = f?.fcfTtm ? Math.round(f.fcfTtm / 1_000_000_000) : null; // in Billion VND

        const qualityScore = f?.qualityScore ?? 70;
        const healthScore = f?.healthScore ?? 70;

        const compositeScore = calculateCompositeScore(qualityScore, roe, netMargin, pe, pb, debtEquity);

        const ohlcvBars = ohlcvMap.get(sym)?.bars ?? [];
        const maFeatures = analyzeMaFeatures(ohlcvBars, price);

        const presetsPassed = detectPresets({
          roe,
          revenueYoyPct,
          niYoyPct,
          price,
          changePercent,
          dividendYield,
          debtEquity,
          pe,
          pb,
          netMargin,
          volume,
          maSignal: maFeatures.maSignal,
        });

        items.push({
          symbol: sym,
          name: q?.name ?? vc?.name ?? sec?.name ?? null,
          sector: sec?.sector ?? sectorOf(sym) ?? vc?.sector ?? "Khác",
          exchange: sec?.exchange ?? vc?.exchange ?? "HOSE",
          price,
          change,
          changePercent,
          volume,
          marketCap,
          pe,
          pb,
          ps,
          evEbitda,
          dividendYield,
          roe,
          roa,
          grossMargin,
          netMargin,
          debtEquity,
          currentRatio,
          revenueYoyPct,
          niYoyPct,
          fcfTtm,
          qualityScore,
          healthScore,
          ma10: maFeatures.ma10,
          ma20: maFeatures.ma20,
          ma50: maFeatures.ma50,
          maSignal: maFeatures.maSignal,
          volRatio20: maFeatures.volRatio20,
          presetsPassed,
          compositeScore,
        });
      }

      const quoteProviders = multiQuotesRes.sources?.length ? multiQuotesRes.sources : ["vps", "ssi", "vndirect"];
      const valuationProviders = ["vndirect-finfo", "vietcap-iq", "orca-ratio-engine"];
      const allSourcesUsed = Array.from(new Set([...quoteProviders, ...valuationProviders]));

      return {
        items,
        sourcesUsed: allSourcesUsed,
        redundancyInfo: {
          quoteProviders,
          valuationProviders,
          failoverCount,
          healthStatus: quoteProviders.length >= 2 ? ("OPTIMAL" as const) : ("HIGH_AVAILABILITY" as const),
        },
      };
    },
  });

  const snapshotData = res.value as {
    items: ScreenerStockItem[];
    sourcesUsed: string[];
    redundancyInfo: {
      quoteProviders: string[];
      valuationProviders: string[];
      failoverCount: number;
      healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
    };
  };

  return {
    items: snapshotData?.items ?? [],
    sourcesUsed: snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"],
    redundancyInfo: snapshotData?.redundancyInfo ?? {
      quoteProviders: ["vps", "ssi", "vndirect"],
      valuationProviders: ["vndirect-finfo", "vietcap-iq", "ratio-engine"],
      failoverCount: 0,
      healthStatus: "OPTIMAL",
    },
    meta: buildMeta({
      source: (snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"]).join("+"),
      sourceTimestampMs: Date.now(),
      cached: res.cached,
      stale: res.stale,
      note: `Multi-Source Screener (${snapshotData?.items?.length ?? 0} mã · ${snapshotData?.sourcesUsed?.length ?? 4} nguồn)`,
    }),
  };
}

/**
 * Filter, sort, and paginate stocks from the master screener snapshot.
 */
export async function queryScreenerStocks(params: ScreenerFilterParams): Promise<ScreenerResponseData> {
  const { items: allItems, sourcesUsed, redundancyInfo, meta } = await getMasterScreenerSnapshot();

  const presetsCount: Record<ScreenerPreset, number> = {
    all: allItems.length,
    canslim: 0,
    dividend: 0,
    growth: 0,
    value: 0,
    breakout: 0,
    ma_cross: 0,
  };

  const sectorSet = new Set<string>();

  for (const item of allItems) {
    if (item.sector) sectorSet.add(item.sector);
    for (const p of item.presetsPassed) {
      if (p !== "all") presetsCount[p] += 1;
    }
  }

  let filtered = allItems;

  // Filter: Preset
  if (params.preset && params.preset !== "all") {
    filtered = filtered.filter((x) => x.presetsPassed.includes(params.preset!));
  }

  // Filter: Search query
  if (params.q) {
    const qUpper = params.q.trim().toUpperCase();
    filtered = filtered.filter(
      (x) => x.symbol.includes(qUpper) || (x.name && x.name.toUpperCase().includes(qUpper)),
    );
  }

  // Filter: Exchange
  if (params.exchange && params.exchange !== "ALL") {
    filtered = filtered.filter((x) => x.exchange === params.exchange);
  }

  // Filter: Sector
  if (params.sector) {
    filtered = filtered.filter((x) => x.sector === params.sector);
  }

  // Range filters
  if (params.minPrice != null) filtered = filtered.filter((x) => x.price != null && x.price >= params.minPrice!);
  if (params.maxPrice != null) filtered = filtered.filter((x) => x.price != null && x.price <= params.maxPrice!);
  if (params.minChg != null) filtered = filtered.filter((x) => x.changePercent != null && x.changePercent >= params.minChg!);
  if (params.maxChg != null) filtered = filtered.filter((x) => x.changePercent != null && x.changePercent <= params.maxChg!);
  if (params.minVol != null) filtered = filtered.filter((x) => x.volume != null && x.volume >= params.minVol!);
  if (params.maxVol != null) filtered = filtered.filter((x) => x.volume != null && x.volume <= params.maxVol!);

  if (params.minMarketCap != null) filtered = filtered.filter((x) => x.marketCap != null && x.marketCap >= params.minMarketCap!);
  if (params.maxMarketCap != null) filtered = filtered.filter((x) => x.marketCap != null && x.marketCap <= params.maxMarketCap!);

  if (params.minPe != null) filtered = filtered.filter((x) => x.pe != null && x.pe >= params.minPe!);
  if (params.maxPe != null) filtered = filtered.filter((x) => x.pe != null && x.pe <= params.maxPe!);
  if (params.minPb != null) filtered = filtered.filter((x) => x.pb != null && x.pb >= params.minPb!);
  if (params.maxPb != null) filtered = filtered.filter((x) => x.pb != null && x.pb <= params.maxPb!);

  if (params.minRoe != null) filtered = filtered.filter((x) => x.roe != null && x.roe >= params.minRoe!);
  if (params.maxRoe != null) filtered = filtered.filter((x) => x.roe != null && x.roe <= params.maxRoe!);
  if (params.minRoa != null) filtered = filtered.filter((x) => x.roa != null && x.roa >= params.minRoa!);
  if (params.maxRoa != null) filtered = filtered.filter((x) => x.roa != null && x.roa <= params.maxRoa!);

  if (params.minDivYield != null) filtered = filtered.filter((x) => x.dividendYield != null && x.dividendYield >= params.minDivYield!);
  if (params.maxDivYield != null) filtered = filtered.filter((x) => x.dividendYield != null && x.dividendYield <= params.maxDivYield!);

  if (params.maxDe != null) filtered = filtered.filter((x) => x.debtEquity != null && x.debtEquity <= params.maxDe!);
  if (params.minQualityScore != null) filtered = filtered.filter((x) => x.qualityScore != null && x.qualityScore >= params.minQualityScore!);
  if (params.minRevenueYoy != null) filtered = filtered.filter((x) => x.revenueYoyPct != null && x.revenueYoyPct >= params.minRevenueYoy!);
  if (params.minNiYoy != null) filtered = filtered.filter((x) => x.niYoyPct != null && x.niYoyPct >= params.minNiYoy!);

  // Filter: MA Signal
  if (params.maSignal && params.maSignal !== "ALL") {
    filtered = filtered.filter((x) => x.maSignal === params.maSignal);
  }

  // Sorting
  const sortKey = (params.sort ?? "marketCap") as keyof ScreenerStockItem;
  const isAsc = params.order === "asc";

  filtered.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }
    return isAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const total = filtered.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const paginated = filtered.slice(offset, offset + limit);

  return {
    items: paginated,
    total,
    totalUniverse: allItems.length,
    offset,
    limit,
    presetsCount,
    sectorsAvailable: Array.from(sectorSet).sort(),
    sourcesUsed,
    redundancyInfo,
    meta,
  };
}
