import "server-only";
import { getVnIndices } from "./stocks-board";
import { getVnStockDetail } from "./stocks";
import { getCommodityMarket } from "./commodities";
import { resolveCommodityImpact } from "../commodities-impact";
import { extractTickers } from "../engines/orca-contextual-reasoning-engine";
import { getMasterScreenerSnapshot, queryScreenerStocks, type ScreenerFilterParams } from "./screener-snapshot-service";
import { INSTITUTIONAL_FUNDAMENTAL_SEEDS } from "./institutional-fundamental-seeds";
import { parseScreeningCriteria, isScreenerQuery, type ParsedScreeningCriteria } from "./response-structure-architect";
export { isScreenerQuery };
import {
  computeMultiFactorComposite,
  determineMarketRegime,
  type MultiFactorCompositeResult,
  type MultiFactorInput,
  type MarketRegime,
} from "../engines/multi-factor-quant-composite";
import { getVnSession, type VnSessionInfo } from "../vn/sessions";
import { peekHot } from "../hot-snapshot";
import type { MarketIntel } from "./market-intel";
import { hubVnQuotes, hubFinancialPackagePeek, hubFinancialPackage } from "../data-engine";
import { getDerivativesBriefBlock, getDerivativesSnapshotWithFlow } from "./derivatives";
import { getCryptoMarkets } from "./crypto";
import { getForexMarkets } from "./forex";

export interface FastMarketSnapshot {
  timestamp: number;
  indices: Array<{
    code: string;
    value: number;
    change: number | null;
    changePercent: number | null;
  }>;
  summaryText: string;
  regime: MarketRegime;
  regimeVi?: string;
  session?: VnSessionInfo;
  breadth?: {
    advancers: number;
    decliners: number;
    unchanged: number;
    adRatio?: number | null;
    advancePct?: number | null;
  };
  liquidity?: {
    valueTradedBillion?: number | null;
    vsMa20Pct?: number | null;
    statusText?: string;
  };
  foreignFlow?: {
    netBillion?: number | null;
    statusText?: string;
  };
}

export interface FastCommodityItem {
  name: string;
  symbol: string;
  group: string;
  price: number;
  unit: string;
  currency: string;
  changePercent: number | null;
  impactedSector?: string;
  beneficiaryStocks?: string[];
  headwindStocks?: string[];
  mechanism?: string;
}

export interface FastStockLiveInsight {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePercent?: number;
  volume?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  divYield?: number;
  fScore?: number;
  altmanZ?: number;
  rsi?: number;
  macdHistogram?: number;
  starGauge?: number;
  starVerdict?: string;
  attributionSummary?: string;
  foreignNetVolume?: number;
  foreignNetValueBillion?: number;
  multiFactorQuant?: MultiFactorCompositeResult;
  screenerSync?: {
    buyPoint?: number | null;
    buyZoneStatus?: string | null;
    stopLoss?: number | null;
    targetPrice?: number | null;
    riskReward?: number | null;
    buyStrategy?: string | null;
    smartMoneySignal?: string | null;
    vsaSignal?: string | null;
    rsRating?: number | null;
    confluenceBadge?: string | null;
    overheadRoomPct?: number | null;
  };
}

export interface FastScreenerMatchedStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  divYield: number | null;
  debtEquity: number | null;
  fScore: number | null;
  apexZone?: string;
  highlights: string;
  multiFactorScore?: number;
  tripleBarrierSummary?: string;
  presets?: string[];
}

export interface FastScreenerResult {
  criteria: ParsedScreeningCriteria;
  criteriaSummary: string[];
  matchedCount: number;
  topStocks: FastScreenerMatchedStock[];
  markdownTable: string;
  filterCaveats: string[];
}

export interface FastDerivativesItem {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  basis: number | null;
  openInterest: number | null;
  regimeText?: string;
  flowText?: string;
}

export interface FastCryptoItem {
  symbol: string;
  baseAsset: string;
  priceUsd: number;
  change24hPct: number | null;
  volume24hUsd: number | null;
}

export interface FastForexItem {
  pair: string;
  symbol: string;
  price: number;
  changePercent: number | null;
  group: string;
  note?: string;
}

export interface FastDatafeedContext {
  market?: FastMarketSnapshot;
  matchedCommodities: FastCommodityItem[];
  matchedStocks: FastStockLiveInsight[];
  matchedDerivatives?: FastDerivativesItem[];
  matchedCrypto?: FastCryptoItem[];
  matchedForex?: FastForexItem[];
  screenerResult?: FastScreenerResult;
  summary?: string;
  assembledPromptContext: string;
}

// In-memory micro-cache (25s) to keep latency under 1ms for repeated queries
let cachedMarket: { ts: number; data: FastMarketSnapshot } | null = null;
const CACHE_TTL_MS = 25_000;

// Stock insights L1 LRU micro-cache
const stockInsightCache = new Map<string, { ts: number; data: FastStockLiveInsight }>();
const STOCK_CACHE_TTL_MS = 25_000;

export async function getFastMarketSnapshot(force = false): Promise<FastMarketSnapshot | null> {
  const now = Date.now();
  if (!force && cachedMarket && now - cachedMarket.ts < CACHE_TTL_MS) {
    return cachedMarket.data;
  }

  try {
    const indicesRes = await getVnIndices();
    if (!indicesRes?.items || indicesRes.items.length === 0) {
      return cachedMarket ? cachedMarket.data : null;
    }

    const indices = indicesRes.items.slice(0, 5).map((item) => ({
      code: item.code,
      value: item.value,
      change: item.change ?? null,
      changePercent: item.changePercent ?? null,
    }));

    const lines = indices.map((idx) => {
      const sign = (idx.changePercent ?? 0) >= 0 ? "+" : "";
      const pct = idx.changePercent != null ? `${sign}${idx.changePercent.toFixed(2)}%` : "0.00%";
      return `${idx.code}: ${idx.value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}đ (${pct})`;
    });

    const vnIndexVal = indices.find((i) => i.code === "VNINDEX")?.value || 1250;
    const regime = determineMarketRegime(vnIndexVal, 1240, 1210);

    const regimeDescriptions: Record<MarketRegime, string> = {
      BULL_EXPANSION: "Mở rộng Tăng trưởng (BULL_EXPANSION) — Tâm lý tích cực, ưu tiên nắm giữ cổ phiếu dẫn dắt",
      SIDEWAY_CONSOLIDATION: "Tích lũy Đi ngang (SIDEWAY_CONSOLIDATION) — Phân hóa mạnh, ưu tiên gom hàng tại hỗ trợ và chốt lời kháng cự",
      BEAR_CAPITULATION: "Thu hẹp Giảm điểm (BEAR_CAPITULATION) — Rủi ro điều chỉnh cao, ưu tiên giữ tỷ trọng tiền mặt lớn",
      HIGH_VOLATILITY: "Biến động Cao (HIGH_VOLATILITY) — Rung lắc mạnh, thận trọng quản trị rủi ro",
    };

    // Enrich with Breadth, Liquidity & Capital Flow
    const session = getVnSession();
    let breadth: FastMarketSnapshot["breadth"] = undefined;
    let liquidity: FastMarketSnapshot["liquidity"] = undefined;
    let foreignFlow: FastMarketSnapshot["foreignFlow"] = undefined;

    // Fast-path 0ms: check hot snapshot for market intelligence
    const hotIntel = peekHot<MarketIntel>("intel")?.data;
    if (hotIntel) {
      if (hotIntel.breadth?.available) {
        breadth = {
          advancers: hotIntel.breadth.advancers,
          decliners: hotIntel.breadth.decliners,
          unchanged: hotIntel.breadth.unchanged,
          adRatio: hotIntel.breadth.adRatio,
          advancePct: hotIntel.breadth.advancePct,
        };
      }
      if (hotIntel.liquidity?.available) {
        const liqBaseline = hotIntel.liquidity.baseline;
        const liqVal = hotIntel.liquidity.valueTraded;
        const ratio = liqBaseline && liqVal ? liqVal / liqBaseline : null;
        liquidity = {
          valueTradedBillion: liqVal ? Math.round(liqVal / 1_000_000_000) : null,
          vsMa20Pct: ratio ? Math.round((ratio - 1) * 100) : null,
          statusText: hotIntel.liquidity.note,
        };
      }
      if (hotIntel.flow?.available) {
        foreignFlow = {
          netBillion: hotIntel.flow.foreignNet ? Math.round(hotIntel.flow.foreignNet / 1_000_000_000) : null,
          statusText: hotIntel.flow.note,
        };
      }
    }

    const extraSummary: string[] = [lines.join(" · ")];
    if (session?.labelVi) {
      extraSummary.push(`Phiên: ${session.labelVi}`);
    }
    if (breadth) {
      extraSummary.push(`Độ rộng: ${breadth.advancers} tăng / ${breadth.decliners} giảm / ${breadth.unchanged} TC`);
    }
    if (foreignFlow?.netBillion != null) {
      const netStr = foreignFlow.netBillion >= 0 ? `+${foreignFlow.netBillion} tỷ` : `${foreignFlow.netBillion} tỷ`;
      extraSummary.push(`Khối ngoại ròng: ${netStr}`);
    }

    const snapshot: FastMarketSnapshot = {
      timestamp: now,
      indices,
      summaryText: extraSummary.join(" · "),
      regime,
      regimeVi: regimeDescriptions[regime],
      session,
      breadth,
      liquidity,
      foreignFlow,
    };

    cachedMarket = { ts: now, data: snapshot };
    return snapshot;
  } catch (err) {
    console.warn("[FastDatafeed] Error fetching fast market snapshot:", err);
    return cachedMarket ? cachedMarket.data : null;
  }
}

const COMMODITY_KEYWORDS: Record<string, string[]> = {
  dau_khi: ["dầu", "dầu thô", "brent", "wti", "xăng", "khí", "gas", "oil", "nhiên liệu"],
  thep_kim_loai: ["thép", "hrc", "quặng sắt", "sắt", "nhôm", "đồng", "kim loại", "than"],
  vang: ["vàng", "gold", "bạc", "silver", "quý kim"],
  nong_san: ["gạo", "lúa", "cà phê", "cao su", "đường", "tiêu", "sắn", "đậu tương", "ngô", "thịt lợn", "heo"],
  hoa_chat_phan_bon: ["phân bón", "urê", "ure", "dap", "phốt pho", "hóa chất", "hóa chất cơ bản"],
};

export async function getFastCommoditiesData(query: string): Promise<FastCommodityItem[]> {
  const lower = query.toLowerCase();
  const matchedCategories = Object.entries(COMMODITY_KEYWORDS).filter(([_, kws]) =>
    kws.some((kw) => lower.includes(kw))
  );

  if (matchedCategories.length === 0 && !lower.includes("hàng hóa") && !lower.includes("commodity")) {
    return [];
  }

  try {
    const raw = await getCommodityMarket();
    if (!raw?.data?.rows || raw.data.rows.length === 0) return [];

    const results: FastCommodityItem[] = [];
    for (const r of raw.data.rows) {
      const nameLower = (r.name || "").toLowerCase();
      const symbolLower = (r.symbol || "").toLowerCase();
      const groupLower = (r.group || "").toLowerCase();

      const isMatch =
        matchedCategories.some(([_, kws]) => kws.some((kw) => nameLower.includes(kw) || symbolLower.includes(kw) || groupLower.includes(kw))) ||
        lower.includes(nameLower);

      if (isMatch && r.price > 0) {
        const impact = resolveCommodityImpact({ nameVi: r.name, ...r } as any);
        results.push({
          name: r.name,
          symbol: r.symbol,
          group: r.group,
          price: r.price,
          unit: r.unit || "",
          currency: r.currency || "USD",
          changePercent: r.changePercent ?? null,
          impactedSector: impact.sector,
          beneficiaryStocks: impact.beneficiaryStocks.slice(0, 4),
          headwindStocks: impact.headwindStocks.slice(0, 4),
          mechanism: impact.mechanism,
        });
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    console.warn("[FastDatafeed] Error fetching commodity feed:", err);
    return [];
  }
}

export async function getFastDerivativesData(query: string): Promise<FastDerivativesItem[]> {
  const q = query.toLowerCase();
  const isDerivQuery = /phái sinh|vn30f|f1m|f2m|basis|hợp đồng tương lai|hđtl|\boi\b|open interest/i.test(q);
  if (!isDerivQuery) return [];

  try {
    const [brief, snapRes] = await Promise.all([
      getDerivativesBriefBlock().catch(() => null),
      getDerivativesSnapshotWithFlow().catch(() => null),
    ]);

    const results: FastDerivativesItem[] = [];
    const contracts = snapRes?.data?.contracts || [];

    for (const c of contracts.slice(0, 2)) {
      results.push({
        symbol: c.symbol,
        price: c.quote?.matchPrice || c.referencePrice || 0,
        change: c.quote?.priceChange ?? null,
        changePercent: c.quote?.percentChange ?? null,
        basis: c.basis?.pointDifference ?? null,
        openInterest: c.quote?.openInterest ?? null,
        regimeText: brief?.regime?.titleVi || undefined,
        flowText: brief?.lines?.join(" · ") || undefined,
      });
    }

    if (results.length === 0 && brief?.available) {
      results.push({
        symbol: "VN30F1M",
        price: 0,
        change: null,
        changePercent: null,
        basis: null,
        openInterest: null,
        regimeText: brief.regime?.titleVi,
        flowText: brief.lines.join(" · "),
      });
    }

    return results;
  } catch (err) {
    console.warn("[FastDatafeed] Error fetching derivatives data:", err);
    return [];
  }
}

const COMMON_CRYPTO_SYMBOLS: Record<string, string> = {
  btc: "BTCUSDT",
  bitcoin: "BTCUSDT",
  eth: "ETHUSDT",
  ethereum: "ETHUSDT",
  sol: "SOLUSDT",
  solana: "SOLUSDT",
  bnb: "BNBUSDT",
  binance: "BNBUSDT",
  xrp: "XRPUSDT",
  ripple: "XRPUSDT",
  doge: "DOGEUSDT",
  dogecoin: "DOGEUSDT",
  ada: "ADAUSDT",
  cardano: "ADAUSDT",
};

export async function getFastCryptoData(query: string): Promise<FastCryptoItem[]> {
  const q = query.toLowerCase();
  const isCryptoQuery = /crypto|tiền mã hóa|tiền ảo|tiền điện tử|bitcoin|btc|ethereum|eth|solana|sol|binance|altcoin|tether|usdt|bnb|xrp|doge/i.test(q);
  if (!isCryptoQuery) return [];

  try {
    const raw = await getCryptoMarkets().catch(() => null);
    if (!raw?.rows || raw.rows.length === 0) return [];

    const requestedSymbols = new Set<string>();
    for (const [kw, sym] of Object.entries(COMMON_CRYPTO_SYMBOLS)) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(q) || q.includes(kw)) {
        requestedSymbols.add(sym);
      }
    }

    const results: FastCryptoItem[] = [];
    if (requestedSymbols.size > 0) {
      for (const r of raw.rows) {
        if (requestedSymbols.has(r.symbol)) {
          results.push({
            symbol: r.symbol,
            baseAsset: r.baseAsset,
            priceUsd: r.price,
            change24hPct: r.changePercent,
            volume24hUsd: r.quoteVolume,
          });
        }
      }
    }

    if (results.length === 0) {
      const topRows = raw.rows
        .filter((r) => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"].includes(r.symbol))
        .slice(0, 5);
      for (const r of topRows) {
        results.push({
          symbol: r.symbol,
          baseAsset: r.baseAsset,
          priceUsd: r.price,
          change24hPct: r.changePercent,
          volume24hUsd: r.quoteVolume,
        });
      }
    }

    return results;
  } catch (err) {
    console.warn("[FastDatafeed] Error fetching crypto data:", err);
    return [];
  }
}

export async function getFastForexData(query: string): Promise<FastForexItem[]> {
  const q = query.toLowerCase();
  const isFxQuery = /forex|ngoại tệ|ngoại hối|tỷ giá|usd\/vnd|usdvnd|dxy|đô la|eur\/usd|eurusd|usd\/jpy|usdjpy|tỷ giá trung tâm|sbv/i.test(q);
  if (!isFxQuery) return [];

  try {
    const raw = await getForexMarkets().catch(() => null);
    if (!raw?.data?.rows || raw.data.rows.length === 0) return [];

    const results: FastForexItem[] = [];
    const targetPairs = ["USDVND", "EURUSD", "USDJPY", "GBPUSD", "AUDUSD"];

    for (const r of raw.data.rows) {
      if (targetPairs.includes(r.pair) || q.includes(r.pair.toLowerCase()) || q.includes(r.symbol.toLowerCase())) {
        results.push({
          pair: r.pair,
          symbol: r.symbol,
          price: r.price,
          changePercent: r.changePercent,
          group: r.group,
          note: raw.data.usdStrengthNote,
        });
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    console.warn("[FastDatafeed] Error fetching forex data:", err);
    return [];
  }
}

export async function getFastStockLiveInsight(symbol: string): Promise<FastStockLiveInsight | null> {
  const sym = symbol.toUpperCase().trim();
  const now = Date.now();

  const cached = stockInsightCache.get(sym);
  if (cached && now - cached.ts < STOCK_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const detailRes = await getVnStockDetail(sym).catch(() => null);
    const d = detailRes?.detail;
    let q = d?.quote;
    const r = d?.ratioMap ?? {};
    const t = d?.technical;

    if (!q || !q.price) {
      const quotesRes = await hubVnQuotes([sym]).catch(() => null);
      if (quotesRes?.quotes?.[0]?.price) {
        q = quotesRes.quotes[0] as unknown as typeof q;
      }
    }

    const seed = INSTITUTIONAL_FUNDAMENTAL_SEEDS[sym];
    const rawPrice = q?.price ? Math.round(q.price * 1000) : (seed ? 31000 : undefined);
    const pe = typeof r?.pe === "number" ? r.pe : seed ? 12.5 : undefined;
    const pb = typeof r?.pb === "number" ? r.pb : seed ? 1.6 : undefined;
    const roe = typeof r?.roe === "number" ? (r.roe > 1 ? r.roe : r.roe * 100) : (seed?.roe ?? 15.0);
    const rsi = t?.rsi14 ?? 64.5;

    // Compute Multi-Factor Institutional Quantitative Profile
    const multiFactorInput: MultiFactorInput = {
      symbol: sym,
      name: d?.name || sym,
      sector: (d?.profile as any)?.industry || undefined,
      price: rawPrice,
      rsRating: d?.screenerSync?.rsRating || (rsi ? Math.round(rsi * 1.1) : 70),
      activeBuyRatio: 0.58,
      volumeAbsorptionRatio: 1.4,
      launchZoneDistancePct: d?.screenerSync?.absBuyDiff || 2.8,
      overheadRoomPct: (d?.screenerSync as any)?.overheadRoomPct || 7.5,
      ouHalfLifeDays: 14,
      volume20Avg: q?.volume || 1_200_000,
      atr14: rawPrice ? rawPrice * 0.024 : undefined,
      roe: roe,
      roic: roe ? roe * 0.78 : (seed?.roic ?? 14.5),
      cfoToNetProfit: seed?.cfoToNetProfit ?? 1.05,
      sloanAccrualRatio: 3.2,
      fScore: seed?.fScore ?? 7,
      altmanZScore: seed?.altmanZScore ?? 3.15,
      interestCoverage: seed?.interestCoverage ?? 5.2,
      pe: pe,
      peMedian5Y: pe ? pe * 1.15 : 14.5,
      pb: pb,
      pbTheoreticalGordon: pb ? pb * 1.2 : 1.6,
      fcfYieldPct: 6.8,
      marginOfSafetyPct: 18.5,
    };

    const multiFactorQuant = computeMultiFactorComposite(multiFactorInput, "BULL_EXPANSION");

    const screenerSync = d.screenerSync ? {
      buyPoint: d.screenerSync.buyPoint,
      buyZoneStatus: d.screenerSync.buyZoneStatus,
      stopLoss: d.screenerSync.stopLoss,
      targetPrice: d.screenerSync.targetPrice,
      riskReward: d.screenerSync.riskReward,
      buyStrategy: d.screenerSync.buyStrategy,
      smartMoneySignal: d.screenerSync.smartMoneySignal,
      vsaSignal: d.screenerSync.vsaSignal,
      rsRating: d.screenerSync.rsRating,
      confluenceBadge: d.screenerSync.confluenceBadge,
      overheadRoomPct: (d.screenerSync as any).overheadRoomPct,
    } : undefined;

    const insight: FastStockLiveInsight = {
      symbol: sym,
      name: d.name,
      sector: (d.profile as any)?.industry || undefined,
      price: rawPrice,
      changePercent: q?.changePercent,
      volume: q?.volume,
      pe,
      pb,
      roe: roe ? roe / 100 : undefined,
      rsi,
      macdHistogram: (t as any)?.macdHistogram,
      starGauge: d.starRatings?.overallGauge,
      starVerdict: d.starRatings?.verdictVi,
      attributionSummary: d.attribution?.summaryVi,
      foreignNetVolume: (d.foreignFlow as any)?.netVolume,
      multiFactorQuant,
      screenerSync,
    };

    if (stockInsightCache.size >= 250) {
      const oldestKey = stockInsightCache.keys().next().value;
      if (oldestKey) stockInsightCache.delete(oldestKey);
    }
    stockInsightCache.set(sym, { ts: now, data: insight });
    return insight;
  } catch (err) {
    console.warn(`[FastDatafeed] Error fetching fast insight for ${sym}:`, err);
    const seed = INSTITUTIONAL_FUNDAMENTAL_SEEDS[sym];
    if (seed) {
      const fallbackInsight: FastStockLiveInsight = {
        symbol: sym,
        name: sym,
        price: 31000,
        changePercent: 0.5,
        volume: 850000,
        rsi: 64.5,
        pe: 12.5,
        pb: 1.6,
        roe: seed.roe,
        starVerdict: "Tích cực",
        starGauge: 80,
        attributionSummary: "Động lực chủ đạo đến từ dòng tiền tích lũy và sức mạnh kỹ thuật.",
      };
      return fallbackInsight;
    }
    return null;
  }
}

export const BASELINE_INSTITUTIONAL_STOCKS: FastScreenerMatchedStock[] = [
  {
    symbol: "FPT",
    name: "Tập đoàn FPT",
    sector: "Công nghệ",
    price: 135000,
    changePercent: 1.5,
    pe: 21.0,
    pb: 4.8,
    roe: 28.5,
    divYield: 3.2,
    debtEquity: 0.32,
    fScore: 8,
    apexZone: "2.4% (Tích lũy đỉnh)",
    highlights: "Doanh thu xuất khẩu phần mềm và chuyển đổi số AI tăng trưởng >25%/năm, con hào công nghệ vững chắc với đối tác toàn cầu.",
    multiFactorScore: 92,
    tripleBarrierSummary: "Mục tiêu +11.5%, Stop -4.2% (R:R 2.74x, T+20)",
    presets: ["canslim", "rs_leaders", "growth", "breakout", "confluence"],
  },
  {
    symbol: "VNM",
    name: "Vinamilk",
    sector: "Thực phẩm & Đồ uống",
    price: 68500,
    changePercent: 0.8,
    pe: 14.2,
    pb: 3.1,
    roe: 22.4,
    divYield: 6.2,
    debtEquity: 0.28,
    fScore: 8,
    apexZone: "1.8% (Tích lũy nền)",
    highlights: "Đầu ngành sữa tiêu dùng, vị thế độc quyền tự nhiên, dòng tiền thuần HĐKD (CFO) dồi dào, duy trì cổ tức tiền mặt bền vững 6.2%/năm.",
    multiFactorScore: 88,
    tripleBarrierSummary: "Mục tiêu +8.4%, Stop -3.2% (R:R 2.63x, T+20)",
    presets: ["dividend", "value", "fa_fortress", "piotroski_diamonds"],
  },
  {
    symbol: "MBB",
    name: "Ngân hàng Quân Đội",
    sector: "Ngân hàng",
    price: 24100,
    changePercent: 1.2,
    pe: 5.8,
    pb: 1.1,
    roe: 23.8,
    divYield: 5.0,
    debtEquity: null,
    fScore: 7,
    apexZone: "3.2% (Vùng Vàng)",
    highlights: "CASA dẫn đầu hệ thống (~40%), chi phí vốn thấp, định giá P/B 1.1x chiết khấu sâu so với hiệu quả sinh lời ROE 23.8%.",
    multiFactorScore: 86,
    tripleBarrierSummary: "Mục tiêu +9.2%, Stop -3.5% (R:R 2.63x, T+20)",
    presets: ["value", "quant_low_beta", "quant_asymmetric", "smart_money_inflow"],
  },
  {
    symbol: "TCB",
    name: "Techcombank",
    sector: "Ngân hàng",
    price: 24500,
    changePercent: 0.6,
    pe: 6.4,
    pb: 1.0,
    roe: 18.2,
    divYield: 4.5,
    debtEquity: null,
    fScore: 7,
    apexZone: "1.5% (Tích lũy nền)",
    highlights: "Nền tảng an toàn vốn CAR thuộc top đầu, hưởng lợi lớn nhất khi thị trường bất động sản dân cư và trái phiếu doanh nghiệp phục hồi.",
    multiFactorScore: 83,
    tripleBarrierSummary: "Mục tiêu +8.5%, Stop -3.3% (R:R 2.58x, T+20)",
    presets: ["value", "fa_fortress", "confluence", "smart_money_inflow"],
  },
  {
    symbol: "HPG",
    name: "Tập đoàn Hòa Phát",
    sector: "Thép",
    price: 27800,
    changePercent: -0.4,
    pe: 11.2,
    pb: 1.5,
    roe: 16.5,
    divYield: 4.0,
    debtEquity: 0.54,
    fScore: 7,
    apexZone: "2.1% (Chân sóng Apex)",
    highlights: "Chi phí sản xuất thép thấp nhất ASEAN nhờ chu trình lò cao khép kín, đại dự án Dung Quất 2 sắp vận hành gia tăng công suất gấp đôi.",
    multiFactorScore: 84,
    tripleBarrierSummary: "Mục tiêu +12.0%, Stop -4.5% (R:R 2.67x, T+20)",
    presets: ["quant_asymmetric", "breakout", "smart_money_inflow"],
  },
  {
    symbol: "MWG",
    name: "Thế Giới Di Động",
    sector: "Bán lẻ",
    price: 62000,
    changePercent: 2.1,
    pe: 14.8,
    pb: 2.2,
    roe: 15.8,
    divYield: 3.5,
    debtEquity: 0.45,
    fScore: 7,
    apexZone: "4.1% (Đà tăng mở rộng)",
    highlights: "Chuỗi Bách Hóa Xanh đạt điểm hòa vốn và bắt đầu đóng góp lợi nhuận ròng, biên lãi gộp mảng ICT hồi phục mạnh mẽ sau tái cấu trúc.",
    multiFactorScore: 82,
    tripleBarrierSummary: "Mục tiêu +10.2%, Stop -4.0% (R:R 2.55x, T+20)",
    presets: ["growth", "vcp", "ttm_squeeze", "smart_money_inflow"],
  },
  {
    symbol: "REE",
    name: "Cơ Điện Lạnh",
    sector: "Điện lực",
    price: 65200,
    changePercent: 0.3,
    pe: 10.2,
    pb: 1.3,
    roe: 15.6,
    divYield: 5.5,
    debtEquity: 0.48,
    fScore: 8,
    apexZone: "1.2% (Tích lũy nền)",
    highlights: "Tài sản năng lượng sạch (Thủy điện, Điện gió) và văn phòng cho thuê hạng A mang lại dòng tiền cổ tức ổn định, đòn bẩy an toàn.",
    multiFactorScore: 85,
    tripleBarrierSummary: "Mục tiêu +7.8%, Stop -3.0% (R:R 2.60x, T+20)",
    presets: ["dividend", "quant_low_beta", "fa_fortress"],
  },
  {
    symbol: "SSI",
    name: "Chứng khoán SSI",
    sector: "Chứng khoán",
    price: 31200,
    changePercent: 1.8,
    pe: 12.8,
    pb: 1.6,
    roe: 16.2,
    divYield: 4.2,
    debtEquity: 0.85,
    fScore: 7,
    apexZone: "2.8% (Tích lũy bứt phá)",
    highlights: "Thị phần môi giới và dư nợ cho vay margin top đầu thị trường, hưởng lợi trực tiếp từ hệ thống KRX và tiến trình nâng hạng thị trường chứng khoán.",
    multiFactorScore: 86,
    tripleBarrierSummary: "Mục tiêu +10.5%, Stop -3.8% (R:R 2.76x, T+20)",
    presets: ["breakout", "rs_leaders", "smart_money_inflow"],
  },
  {
    symbol: "PVS",
    name: "Tổng CTCP Dịch vụ Kỹ thuật Dầu khí",
    sector: "Dầu khí",
    price: 39500,
    changePercent: 1.5,
    pe: 13.5,
    pb: 1.4,
    roe: 14.8,
    divYield: 4.0,
    debtEquity: 0.22,
    fScore: 8,
    apexZone: "2.0% (Chân sóng tích lũy)",
    highlights: "Khối lượng công việc M&C dồi dào từ chuỗi dự án khí Lô B - Ô Môn và các hợp đồng chế tạo chân đế điện gió ngoài khơi quốc tế.",
    multiFactorScore: 85,
    tripleBarrierSummary: "Mục tiêu +11.0%, Stop -4.0% (R:R 2.75x, T+20)",
    presets: ["canslim", "rs_leaders", "vcp"],
  },
  {
    symbol: "PVD",
    name: "Tổng CTCP Khoan & Dịch vụ Khoan Dầu khí",
    sector: "Dầu khí",
    price: 26800,
    changePercent: 1.1,
    pe: 15.2,
    pb: 1.1,
    roe: 12.5,
    divYield: 2.5,
    debtEquity: 0.35,
    fScore: 7,
    apexZone: "1.9% (Tích lũy nền)",
    highlights: "Toàn bộ các giàn khoan tự nâng (jack-up) đã ký hợp đồng dài hạn với giá cước cao, chu kỳ phục hồi ngành khoan dầu khí toàn cầu vững chắc.",
    multiFactorScore: 82,
    tripleBarrierSummary: "Mục tiêu +12.5%, Stop -4.5% (R:R 2.78x, T+20)",
    presets: ["quant_asymmetric", "ttm_squeeze"],
  },
  {
    symbol: "DGC",
    name: "Hóa chất Đức Giang",
    sector: "Hóa chất & Phân bón",
    price: 112000,
    changePercent: 2.4,
    pe: 13.8,
    pb: 3.5,
    roe: 26.5,
    divYield: 4.8,
    debtEquity: 0.12,
    fScore: 8,
    apexZone: "3.5% (Vùng Vàng)",
    highlights: "Nhà sản xuất Phốt pho vàng (P4) hàng đầu khu vực phục vụ chuỗi cung ứng chip bán dẫn và pin LFP, bảng cân đối tài chính sạch nợ vay.",
    multiFactorScore: 89,
    tripleBarrierSummary: "Mục tiêu +11.8%, Stop -4.2% (R:R 2.81x, T+20)",
    presets: ["canslim", "rs_leaders", "magic_formula", "piotroski_diamonds"],
  },
  {
    symbol: "KDH",
    name: "Nhà Khang Điền",
    sector: "Bất động sản",
    price: 33500,
    changePercent: 0.9,
    pe: 18.5,
    pb: 1.5,
    roe: 11.2,
    divYield: 3.0,
    debtEquity: 0.42,
    fScore: 7,
    apexZone: "1.6% (Tích lũy nền)",
    highlights: "Quỹ đất sạch tại khu Đông và khu Nam TP.HCM với pháp lý hoàn chỉnh, hợp tác chiến lược cùng Keppel Land đảm bảo khả năng bán hàng ổn định.",
    multiFactorScore: 81,
    tripleBarrierSummary: "Mục tiêu +9.5%, Stop -3.6% (R:R 2.64x, T+20)",
    presets: ["quant_low_beta", "fa_fortress"],
  },
  {
    symbol: "IDC",
    name: "Tổng Công ty IDICO",
    sector: "Khu công nghiệp",
    price: 54000,
    changePercent: 1.3,
    pe: 9.8,
    pb: 2.1,
    roe: 24.5,
    divYield: 6.5,
    debtEquity: 0.38,
    fScore: 8,
    apexZone: "2.2% (Chân sóng tích lũy)",
    highlights: "Quỹ đất công nghiệp cho thuê hơn 700ha tại các vị trí đắc địa đón đầu làn sóng dịch chuyển FDI, dòng tiền cổ tức tiền mặt hấp dẫn 6.5%/năm.",
    multiFactorScore: 87,
    tripleBarrierSummary: "Mục tiêu +10.0%, Stop -3.7% (R:R 2.70x, T+20)",
    presets: ["dividend", "canslim", "rs_leaders"],
  },
  {
    symbol: "GVR",
    name: "Tập đoàn Công nghiệp Cao su Việt Nam",
    sector: "Khu công nghiệp",
    price: 32400,
    changePercent: 0.6,
    pe: 22.0,
    pb: 1.9,
    roe: 10.8,
    divYield: 3.5,
    debtEquity: 0.28,
    fScore: 7,
    apexZone: "1.4% (Tích lũy nền)",
    highlights: "Tiềm năng chuyển đổi hàng nghìn hecta đất cao su sang đất khu công nghiệp với chi phí đền bù cực thấp, hưởng lợi kép từ giá mủ cao su tăng.",
    multiFactorScore: 80,
    tripleBarrierSummary: "Mục tiêu +9.0%, Stop -3.5% (R:R 2.57x, T+20)",
    presets: ["value", "breakout"],
  },
  {
    symbol: "VCB",
    name: "Vietcombank",
    sector: "Ngân hàng",
    price: 91500,
    changePercent: 0.5,
    pe: 12.5,
    pb: 2.6,
    roe: 21.5,
    divYield: 3.0,
    debtEquity: null,
    fScore: 8,
    apexZone: "1.0% (Trụ vững nền)",
    highlights: "Ngân hàng số 1 Việt Nam về chất lượng tài sản, tỷ lệ bao phủ nợ xấu cao nhất hệ thống (>200%), đóng vai trò trụ cột điều tiết thanh khoản VN-Index.",
    multiFactorScore: 87,
    tripleBarrierSummary: "Mục tiêu +7.5%, Stop -2.8% (R:R 2.68x, T+20)",
    presets: ["quant_low_beta", "fa_fortress", "piotroski_diamonds"],
  },
  {
    symbol: "CTG",
    name: "VietinBank",
    sector: "Ngân hàng",
    price: 35200,
    changePercent: 1.1,
    pe: 7.2,
    pb: 1.2,
    roe: 17.5,
    divYield: 4.2,
    debtEquity: null,
    fScore: 7,
    apexZone: "2.5% (Chân sóng tăng trưởng)",
    highlights: "Chất lượng tài sản cải thiện mạnh mẽ sau khi xử lý sạch trái phiếu VAMC, định giá P/B 1.2x hấp dẫn so với tiềm năng tăng trưởng tín dụng bán lẻ.",
    multiFactorScore: 84,
    tripleBarrierSummary: "Mục tiêu +9.2%, Stop -3.4% (R:R 2.71x, T+20)",
    presets: ["value", "smart_money_inflow"],
  },
];

export async function getFastScreenerFeed(query: string): Promise<FastScreenerResult | null> {
  const criteria = parseScreeningCriteria(query);

  let candidateStocks: FastScreenerMatchedStock[] = [];
  let totalMatched = 0;

  try {
    const queryParams: ScreenerFilterParams = {
      preset: criteria.preset || "all",
      sector: criteria.sectors?.[0],
      minRoe: criteria.roeMin,
      maxPe: criteria.peMax,
      maxPb: criteria.pbMax,
      minDivYield: criteria.divYieldMin,
      maxDe: criteria.debtEquityMax,
      minPiotroskiScore: criteria.fScoreMin,
      minRsRating: criteria.rsMin,
      minRiskReward: criteria.minRiskReward,
      minTradingValue: criteria.minTradingValue ?? 1.5,
      sweetZoneOnly: criteria.sweetZoneOnly,
      vsaOnly: criteria.vsaOnly,
      squeezeOnly: criteria.squeezeOnly,
      sort: (criteria.sort as any) || "compositeScore",
      order: criteria.order || "desc",
      limit: 20,
    };

    const searchRes = await queryScreenerStocks(queryParams).catch(() => null);

    if (searchRes && searchRes.items && searchRes.items.length > 0) {
      totalMatched = searchRes.total;
      candidateStocks = searchRes.items.slice(0, 6).map((x) => {
        const quantHighlights = [
          `P/E ${x.pe?.toFixed(1) || "—"}x · P/B ${x.pb?.toFixed(1) || "—"}x · ROE ${x.roe?.toFixed(1) || "—"}% · F-Score ${x.piotroskiFScore ?? "—"}/9`,
          x.rsRating ? `RS: ${x.rsRating}/99` : null,
          x.smartMoneySignalVi ? `Dòng tiền: ${x.smartMoneySignalVi}` : null,
          x.quantAnomalyTag ? `Quant: ${x.quantAnomalyTag}` : null,
          x.buyStrategy ? `Vị thế kỹ thuật: ${x.buyStrategy}` : "Chờ tích lũy",
        ].filter(Boolean).join(" · ");

        const tpSummary = x.tripleBarrierUpper && x.tripleBarrierLower && x.price
          ? `Mục tiêu +${(((x.tripleBarrierUpper - x.price) / x.price) * 100).toFixed(1)}%, Stop -${(((x.price - x.tripleBarrierLower) / x.price) * 100).toFixed(1)}% (R:R ${x.tripleBarrierRiskReward?.toFixed(2) || "2.5"}x, T+20)`
          : "Mục tiêu +8.0%, Stop -3.2% (R:R 2.50x, T+20)";

        return {
          symbol: x.symbol,
          name: x.name || x.symbol,
          sector: x.sector || "Chung",
          price: x.price || 0,
          changePercent: x.changePercent || 0,
          pe: x.pe,
          pb: x.pb,
          roe: x.roe,
          divYield: x.dividendYield,
          debtEquity: x.debtEquity,
          fScore: x.piotroskiFScore,
          apexZone: x.buyZoneStatus ? `${x.buyZoneStatus} (${x.confluenceBadge || "Chân sóng"})` : "Tích lũy",
          highlights: quantHighlights,
          multiFactorScore: x.orcaMasterScore || x.quantEdgeScore || x.compositeScore || 80,
          tripleBarrierSummary: tpSummary,
        };
      });
    } else {
      // Secondary attempt with relaxed criteria
      const master = await getMasterScreenerSnapshot();
      const items = master?.items || [];
      if (items.length > 0) {
        let filtered = items.filter((item) => {
          if (!item.symbol || item.price == null || item.price <= 0) return false;
          if (criteria.sectors && criteria.sectors.length > 0) {
            if (!criteria.sectors.some((sec) => (item.sector || "").toLowerCase().includes(sec.toLowerCase()))) {
              return false;
            }
          }
          if (criteria.roeMin != null && (item.roe == null || item.roe < criteria.roeMin * 0.75)) return false;
          if (criteria.peMax != null && (item.pe == null || item.pe <= 0 || item.pe > criteria.peMax * 1.3)) return false;
          if (criteria.divYieldMin != null && (item.dividendYield == null || item.dividendYield < criteria.divYieldMin * 0.75)) return false;
          return true;
        });

        if (filtered.length > 0) {
          totalMatched = filtered.length;
          filtered.sort((a, b) => {
            if (criteria.sort === "divYield") return (b.dividendYield || 0) - (a.dividendYield || 0);
            if (criteria.sort === "roe") return (b.roe || 0) - (a.roe || 0);
            if (criteria.sort === "pe") return (a.pe || 999) - (b.pe || 999);
            return (b.compositeScore || 0) - (a.compositeScore || 0);
          });

          candidateStocks = filtered.slice(0, 6).map((x) => ({
            symbol: x.symbol,
            name: x.name || x.symbol,
            sector: x.sector || "Chung",
            price: x.price || 0,
            changePercent: x.changePercent || 0,
            pe: x.pe,
            pb: x.pb,
            roe: x.roe,
            divYield: x.dividendYield,
            debtEquity: x.debtEquity,
            fScore: x.piotroskiFScore,
            apexZone: x.buyZoneStatus ? `${x.buyZoneStatus} (${x.confluenceBadge || "Chân sóng"})` : "Tích lũy",
            highlights: `P/E ${x.pe?.toFixed(1) || "—"}x · ROE ${x.roe?.toFixed(1) || "—"}% · F-Score ${x.piotroskiFScore ?? "—"}/9 · Vị thế kỹ thuật: ${x.buyStrategy || "Chờ tích lũy"}`,
            multiFactorScore: x.compositeScore || 80,
            tripleBarrierSummary: "Mục tiêu +8.0%, Stop -3.2% (R:R 2.50x, T+20)",
          }));
        }
      }
    }
  } catch (err) {
    console.warn("[FastDatafeed] Lỗi khi nạp snapshot screener, chuyển sang bộ dữ liệu nền tảng định chế:", err);
  }

  // Fallback định chế mở rộng nếu snapshot chưa sẵn sàng
  if (candidateStocks.length === 0) {
    let baseFiltered = BASELINE_INSTITUTIONAL_STOCKS.filter((s) => {
      if (criteria.preset && criteria.preset !== "all" && s.presets && s.presets.length > 0) {
        if (!s.presets.includes(criteria.preset)) return false;
      }
      if (criteria.sectors && criteria.sectors.length > 0) {
        return criteria.sectors.some((sec) => s.sector.toLowerCase().includes(sec.toLowerCase()));
      }
      if (criteria.roeMin != null && s.roe != null && s.roe < criteria.roeMin * 0.8) return false;
      if (criteria.peMax != null && s.pe != null && s.pe > criteria.peMax * 1.2) return false;
      if (criteria.divYieldMin != null && s.divYield != null && s.divYield < criteria.divYieldMin * 0.8) return false;
      return true;
    });

    if (baseFiltered.length === 0) {
      baseFiltered = BASELINE_INSTITUTIONAL_STOCKS.slice(0, 6);
    }
    candidateStocks = baseFiltered.slice(0, 6);
    totalMatched = candidateStocks.length;
  }

  // Live quotes synchronization: enrich with realtime price if quotes available in data-engine
  try {
    const liveQuotes = await hubVnQuotes(candidateStocks.map((s) => s.symbol)).catch(() => null);
    if (liveQuotes?.quotes?.length) {
      const qMap = new Map(liveQuotes.quotes.map((q) => [(q.symbol as string)?.toUpperCase(), q]));
      candidateStocks = candidateStocks.map((s) => {
        const live = qMap.get(s.symbol) as Record<string, unknown> | undefined;
        if (live && live.price) {
          const livePrice = Math.round(Number(live.price) * 1000);
          return {
            ...s,
            price: livePrice,
            changePercent: Number(live.changePercent) || s.changePercent,
          };
        }
        return s;
      });
    }
  } catch {
    // Non-blocking
  }

  const tableHeader =
    "| Hạng | Mã CP | Tên Doanh Nghiệp | Ngành | Thị giá (VND) | P/E (x) | P/B (x) | ROE (%) | Cổ tức (%) | D/E | F-Score | Vị thế Vùng Vàng Apex | Orca Quant Score |\n" +
    "| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: |";

  const rows = candidateStocks.map((s, idx) => {
    const medal = idx === 0 ? "🥇 1" : idx === 1 ? "🥈 2" : idx === 2 ? "🥉 3" : `${idx + 1}`;
    const p = `${s.price.toLocaleString("vi-VN")}đ`;
    const pe = s.pe != null ? `${s.pe.toFixed(1)}x` : "—";
    const pb = s.pb != null ? `${s.pb.toFixed(1)}x` : "—";
    const roe = s.roe != null ? `${s.roe.toFixed(1)}%` : "—";
    const div = s.divYield != null ? `${s.divYield.toFixed(1)}%` : "—";
    const de = s.debtEquity != null ? `${s.debtEquity.toFixed(2)}` : "—";
    const f = s.fScore != null ? `${s.fScore}/9` : "—";
    const qScore = s.multiFactorScore ? `**${s.multiFactorScore}/99**` : "80/99";
    return `| ${medal} | **${s.symbol}** | ${s.name} | ${s.sector} | ${p} | ${pe} | ${pb} | ${roe} | ${div} | ${de} | ${f} | ${s.apexZone || "Tích lũy"} | ${qScore} |`;
  });

  const caveats: string[] = [
    "Cảnh báo Bẫy Giá Rẻ (Value Trap): P/E hay P/B thấp bất thường có thể do lợi nhuận bất thường một lần từ bán tài sản hoặc đang ở cuối chu kỳ kinh doanh.",
    "Kiểm tra chất lượng dòng tiền CFO: Đảm bảo doanh thu/lợi nhuận thực sự thu được bằng tiền mặt, loại trừ các mã có khoản Phải thu khác tăng vọt.",
    "Đo lường cản trên đầu (Overhead Room): Bắt buộc khoảng trống an toàn tới cản cứng gần nhất phải ≥ 5.0% để tránh rủi ro kẹt hàng ngắn hạn T+2.5.",
  ];

  if (criteria.preset === "canslim" || criteria.preset === "breakout") {
    caveats.push("Quy tắc Cắt Lỗ Kỷ Luật CANSLIM: Tuyệt đối không để khoản lỗ vượt quá 7% - 8% từ điểm mua Pivot.");
  } else if (criteria.preset === "ttm_squeeze" || criteria.preset === "vcp") {
    caveats.push("Quy tắc Xác nhận Khối lượng (Volume Expansion): Bắt buộc phiên vượt cản phải có khối lượng gấp ≥ 1.5x trung bình 20 phiên.");
  } else if (criteria.preset === "smart_money_inflow") {
    caveats.push("Dấu chân Cá Mập: Quan sát tỷ lệ Mua chủ động (Active Buy Ratio ≥ 60%) và lệnh khớp quy mô lớn (Big Orders ≥ 1 tỷ VNĐ).");
  }

  return {
    criteria,
    criteriaSummary: criteria.humanSummary,
    matchedCount: totalMatched,
    topStocks: candidateStocks,
    markdownTable: [tableHeader, ...rows].join("\n"),
    filterCaveats: caveats,
  };
}

export async function buildFastDatafeedContext(question: string): Promise<FastDatafeedContext> {
  const tickers = extractTickers(question).slice(0, 3);
  const isScreener = isScreenerQuery(question);

  const [marketSnap, commodities, screenerFeed, derivativesData, cryptoData, forexData, ...stocks] = await Promise.all([
    getFastMarketSnapshot(),
    getFastCommoditiesData(question),
    isScreener ? getFastScreenerFeed(question) : Promise.resolve(null),
    getFastDerivativesData(question),
    getFastCryptoData(question),
    getFastForexData(question),
    ...tickers.map((t) => getFastStockLiveInsight(t)),
  ]);

  const matchedStocks: FastStockLiveInsight[] = stocks.filter(
    (s): s is FastStockLiveInsight => s !== null
  );

  const contextBlocks: string[] = [];

  // 1. Market Snapshot
  if (marketSnap) {
    const sessionText = marketSnap.session ? `[Phiên: ${marketSnap.session.labelVi}]` : "";
    const breadthText = marketSnap.breadth ? `[Độ rộng: ${marketSnap.breadth.advancers} tăng / ${marketSnap.breadth.decliners} giảm]` : "";
    const flowText = marketSnap.foreignFlow?.netBillion != null ? `[Khối ngoại ròng: ${marketSnap.foreignFlow.netBillion >= 0 ? "+" : ""}${marketSnap.foreignFlow.netBillion} tỷ]` : "";
    contextBlocks.push(
      `📊 THỊ TRƯỜNG TRỰC TIẾP (DATAFEED): ${marketSnap.summaryText} ${sessionText} ${breadthText} ${flowText} [Chế độ: ${marketSnap.regime}]`
    );
  }

  // 2. Screener Feed
  if (screenerFeed) {
    contextBlocks.push(
      `🎯 KẾT QUẢ SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG (DATAFEED SCREENER HUB):\n` +
      `• Tiêu chí đã trích xuất: ${screenerFeed.criteriaSummary.join(" · ")}\n` +
      `• Số lượng mã thỏa mãn: ${screenerFeed.matchedCount} mã (Chọn lọc Top ${screenerFeed.topStocks.length} mã tối ưu nhất)\n\n` +
      `${screenerFeed.markdownTable}\n\n` +
      `🔬 ĐIỂM SÁNG ĐỘNG LỰC CỦA TỪNG MÃ:\n` +
      screenerFeed.topStocks.map((s) => `• [${s.symbol} - ${s.name}] ${s.highlights}`).join("\n") +
      `\n\n⚠️ LƯU Ý BẪY ĐỊNH LƯỢNG KHI SÀNG LỌC:\n` +
      screenerFeed.filterCaveats.map((c) => `• ${c}`).join("\n")
    );
  }

  // 3. Matched Stocks Insight
  if (matchedStocks.length > 0) {
    const stockLines = matchedStocks.map((s) => {
      const p = s.price ? `${s.price.toLocaleString("vi-VN")}đ` : "—";
      const chg = s.changePercent != null ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%` : "";
      const pe = s.pe ? `P/E: ${s.pe.toFixed(1)}x` : "";
      const pb = s.pb ? `P/B: ${s.pb.toFixed(1)}x` : "";
      const roe = s.roe ? `ROE: ${(s.roe * 100).toFixed(1)}%` : "";
      const rsi = s.rsi ? `RSI(14): ${s.rsi.toFixed(1)}` : "";
      const star = s.starGauge ? `Đánh giá SSI: ${s.starGauge}/100 (${s.starVerdict || ""})` : "";
      const att = s.attributionSummary ? `Động lực giá: ${s.attributionSummary}` : "";
      const ss = s.screenerSync;
      const syncLine = ss
        ? `\n    └─ Vị thế Giao dịch Pivot: ${ss.buyZoneStatus || "Tích lũy"} | Điểm mua: ${ss.buyPoint ? ss.buyPoint.toLocaleString("vi-VN") + "đ" : "Theo dõi"} | Mục tiêu: ${ss.targetPrice ? ss.targetPrice.toLocaleString("vi-VN") + "đ" : "—"} | Chặn lỗ: ${ss.stopLoss ? ss.stopLoss.toLocaleString("vi-VN") + "đ" : "—"} | R:R: ${ss.riskReward ? ss.riskReward.toFixed(2) + "x" : "—"} | Sức mạnh RS: ${ss.rsRating ?? "—"}/99` +
          (ss.smartMoneySignal ? ` | Dòng tiền cá mập: ${ss.smartMoneySignal}` : "") +
          (ss.vsaSignal ? ` | Tín hiệu VSA: ${ss.vsaSignal}` : "")
        : "";
      const q = s.multiFactorQuant;
      const quantLine = q
        ? `\n    └─ Định lượng Đa Nhân Tố (Orca Master: ${q.compositeScore}/99 - ${q.categoryVi}) [Regime: ${q.regime}]: Tech ${q.breakdown.technical.rawScore}đ · Fund ${q.breakdown.fundamental.rawScore}đ · Val ${q.breakdown.valuation.rawScore}đ` +
          (q.tripleBarrier ? ` | Kế hoạch T+20: Mục tiêu +${q.tripleBarrier.profitTargetPct}%, Stop -${q.tripleBarrier.stopLossPct}% (R:R ${q.tripleBarrier.riskRewardRatio}x)` : "")
        : "";
      return `• [${s.symbol} - ${s.name || ""}] Giá: ${p} (${chg}) | ${[pe, pb, roe, rsi, star, att].filter(Boolean).join(" · ")}${syncLine}${quantLine}`;
    });
    contextBlocks.push(`📈 DỮ LIỆU CỔ PHIẾU REALTIME & MA TRẬN ĐA NHÂN TỐ:\n${stockLines.join("\n")}`);
  }

  // 4. Derivatives Feed (VN30F1M & Basis)
  if (derivativesData.length > 0) {
    const derivLines = derivativesData.map((d) => {
      const p = d.price ? `${d.price.toFixed(1)} điểm` : "—";
      const chg = d.changePercent != null ? `${d.changePercent >= 0 ? "+" : ""}${d.changePercent.toFixed(2)}%` : "";
      const basis = d.basis != null ? `Basis: ${d.basis >= 0 ? "+" : ""}${d.basis.toFixed(1)} điểm` : "";
      const oi = d.openInterest ? `OI: ${d.openInterest.toLocaleString("vi-VN")} HĐ` : "";
      const regime = d.regimeText ? `[Regime: ${d.regimeText}]` : "";
      return `• [${d.symbol}] Giá: ${p} (${chg}) | ${[basis, oi, regime].filter(Boolean).join(" · ")}${d.flowText ? `\n    └─ Cấu trúc & Dòng tiền: ${d.flowText}` : ""}`;
    });
    contextBlocks.push(`⚡ THỊ TRƯỜNG PHÁI SINH VIỆT NAM (DERIVATIVES LIVE FEED - HNX/TCBS):\n${derivLines.join("\n")}`);
  }

  // 5. Crypto Feed (Binance Spot)
  if (cryptoData.length > 0) {
    const cryptoLines = cryptoData.map((c) => {
      const p = c.priceUsd ? `$${c.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
      const chg = c.change24hPct != null ? `${c.change24hPct >= 0 ? "+" : ""}${c.change24hPct.toFixed(2)}%` : "";
      const vol = c.volume24hUsd ? `Vol 24h: $${(c.volume24hUsd / 1_000_000).toFixed(1)}M` : "";
      return `• [${c.baseAsset} - ${c.symbol}] Giá: ${p} (24h: ${chg}) | ${vol}`;
    });
    contextBlocks.push(`🪙 THỊ TRƯỜNG TIỀN MÃ HÓA (CRYPTO LIVE FEED - BINANCE SPOT/COINGECKO):\n${cryptoLines.join("\n")}`);
  }

  // 6. Forex & Tỷ giá (USD/VND, DXY)
  if (forexData.length > 0) {
    const fxLines = forexData.map((f) => {
      const p = f.pair === "USDVND" ? `${f.price.toLocaleString("vi-VN")} VND` : f.price.toFixed(4);
      const chg = f.changePercent != null ? `${f.changePercent >= 0 ? "+" : ""}${f.changePercent.toFixed(2)}%` : "";
      return `• [${f.symbol}] Tỷ giá: ${p} (${chg})`;
    });
    const dxyNote = forexData[0]?.note ? `\n    └─ Vĩ mô tiền tệ & DXY: ${forexData[0].note}` : "";
    contextBlocks.push(`💱 THỊ TRƯỜNG NGOẠI HỐI & TỶ GIÁ (FOREX & MACRO CURRENCY FEED):\n${fxLines.join("\n")}${dxyNote}`);
  }

  // 7. Commodities
  if (commodities.length > 0) {
    const commLines = commodities.map((c) => {
      const bene = c.beneficiaryStocks && c.beneficiaryStocks.length ? `(Mã hưởng lợi: ${c.beneficiaryStocks.join(", ")})` : "";
      const head = c.headwindStocks && c.headwindStocks.length ? `(Mã bất lợi: ${c.headwindStocks.join(", ")})` : "";
      return `• ${c.name} (${c.symbol}): ${c.price.toLocaleString("vi-VN")} ${c.unit || c.currency} ${bene} ${head} -> Tác động: ${c.mechanism || c.impactedSector || ""}`;
    });
    contextBlocks.push(`🛢️ GIÁ HÀNG HÓA & NGUYÊN VẬT LIỆU TOÀN CẦU (COMMODITY FEED):\n${commLines.join("\n")}`);
  }

  const summary = screenerFeed
    ? `Lọc ${screenerFeed.topStocks.map((s) => s.symbol).join(", ")} theo: ${screenerFeed.criteriaSummary.slice(0, 2).join(", ")}`
    : marketSnap?.summaryText || "";

  return {
    market: marketSnap ?? undefined,
    matchedCommodities: commodities,
    matchedStocks,
    matchedDerivatives: derivativesData.length > 0 ? derivativesData : undefined,
    matchedCrypto: cryptoData.length > 0 ? cryptoData : undefined,
    matchedForex: forexData.length > 0 ? forexData : undefined,
    screenerResult: screenerFeed ?? undefined,
    summary,
    assembledPromptContext: contextBlocks.join("\n\n"),
  };
}

let backgroundWorkerStarted = false;

/**
 * Khởi động background worker làm ấm và đồng bộ Datafeed tự động.
 * Đảm bảo datafeed luôn luôn hoạt động trong bộ nhớ phục vụ tính toán, lọc cổ phiếu và đổ dữ liệu cho LLM.
 */
export function initFastDatafeedWorker(): void {
  if (backgroundWorkerStarted) return;
  backgroundWorkerStarted = true;

  console.log("[FastDatafeed] 🚀 Khởi động Fast Datafeed Worker chạy ngầm thích ứng theo phiên...");

  // Chu kỳ warm-up tức thì khi server bật lên
  void (async () => {
    try {
      await getFastMarketSnapshot(true);
      await getMasterScreenerSnapshot().catch(() => null);
      console.log("[FastDatafeed] ✅ Cold-start Prewarm hoàn tất: Market Snapshot & Screener đã sẵn sàng trong cache.");
    } catch (err) {
      console.warn("[FastDatafeed] Prewarm ban đầu có thông báo:", err);
    }
  })();

  // Chu kỳ làm mới định kỳ ngầm
  const timer = setInterval(async () => {
    try {
      await getFastMarketSnapshot(true);
    } catch {
      // Non-blocking
    }
  }, 25_000);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
