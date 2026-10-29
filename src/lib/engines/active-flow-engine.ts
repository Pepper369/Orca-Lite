import "server-only";
import { httpJson } from "../http";
import { cached } from "../cache";

/**
 * FireAnt Pro-grade Active Buy vs. Active Sell (Mua/Bán chủ động) Order Flow Engine.
 *
 * Core Concept:
 * - Active Buy (PB / Proactive Buy): Buyer crosses spread, matches at Ask. Aggressive demand.
 * - Active Sell (PS / Proactive Sell): Seller dumps into Bid. Aggressive supply.
 * - Auction / Neutral (ATO / ATC): Periodic call auction match.
 *
 * Provides:
 * 1. Global intraday active volume & value breakdown (Buy % vs Sell % vs Neutral %)
 * 2. Order Size Tier Distribution (Whale / Shark >= 30k vs Mid 5k-30k vs Retail < 5k)
 * 3. Price Level Distribution (Volume per price tick)
 * 4. Intraday Cumulative Delta Timeline (Lũy kế dòng tiền qua các khung giờ)
 */

export interface ActiveFlowOrderSizeTier {
  tier: "whale" | "medium" | "retail";
  label: string;
  minShares: number;
  maxShares: number;
  buyVolume: number;
  sellVolume: number;
  neutralVolume: number;
  netVolume: number;
  buyCount: number;
  sellCount: number;
  buyPercent: number;
  sellPercent: number;
}

export interface ActiveFlowPriceLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  neutralVolume: number;
  totalVolume: number;
  netVolume: number;
  buyPercent: number;
}

export interface ActiveFlowTimelinePoint {
  time: string;
  timestamp: number;
  price: number;
  activeBuyVol: number;
  activeSellVol: number;
  neutralVol: number;
  intervalNetVol: number;
  cumulativeNetVol: number;
}

export interface ActiveFlowAnalysis {
  symbol: string;
  tradingDate: string;
  lastPrice: number;
  totalMatchedVolume: number;
  totalMatchedValue: number;
  activeBuyVolume: number;
  activeSellVolume: number;
  neutralVolume: number;
  activeBuyValue: number;
  activeSellValue: number;
  neutralValue: number;
  activeBuyPercent: number;
  activeSellPercent: number;
  neutralPercent: number;
  netActiveVolume: number;
  netActiveValue: number;
  buySellRatio: number;
  pressureStatus: "STRONG_BUY" | "BUY_DOMINANT" | "BALANCED" | "SELL_DOMINANT" | "STRONG_SELL";
  smartMoneySignal: {
    bias: "ACCUMULATING" | "DISTRIBUTING" | "NEUTRAL";
    summary: string;
    whaleNetVolume: number;
    retailNetVolume: number;
  };
  tiers: ActiveFlowOrderSizeTier[];
  priceLevels: ActiveFlowPriceLevel[];
  timeline: ActiveFlowTimelinePoint[];
  lastUpdated: string;
}

interface VndTick {
  code?: string;
  tradingDate?: string;
  time?: string;
  last?: number;
  lastVol?: number;
  side?: string;
  accumulatedVal?: number;
  accumulatedVol?: number;
}

interface VndIntradayResponse {
  data?: VndTick[];
  totalElements?: number;
}

const VNDIRECT_API_BASE = "https://api-finfo.vndirect.com.vn";

/** Normalizes stock price to VND (e.g. 52.7 -> 52700) */
function normalizePrice(p: number | undefined | null): number {
  if (p == null || !Number.isFinite(p) || p <= 0) return 0;
  return p < 500 ? Math.round(p * 1000) : Math.round(p);
}

/**
 * Fetch and process real tick-by-tick order flow for a given VN stock.
 */
export async function getActiveFlowAnalysis(symbol: string): Promise<ActiveFlowAnalysis | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  return cached(`active-flow:${sym}`, {
    ttlMs: 15_000, // 15s intraday cache
    staleMs: 60_000,
    producer: async () => {
      try {
        const url = `${VNDIRECT_API_BASE}/v4/stock_intraday_latest?sort=time:desc&q=code:${sym}&size=1000`;
        const res = await httpJson<VndIntradayResponse>(url, {
          provider: "vndirect-active-flow",
          timeoutMs: 6_000,
          retries: 1,
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          },
        });

        const ticks = res.data?.data;
        if (!ticks || !Array.isArray(ticks) || ticks.length === 0) {
          return null;
        }

        return computeActiveFlowFromTicks(sym, ticks);
      } catch (err) {
        console.error(`[active-flow-engine] Failed to compute active flow for ${sym}:`, err);
        return null;
      }
    },
  }).then((r) => r.value);
}

/**
 * Core analytical function to parse ticks into institutional flow, tiers, prices, and timeline.
 */
export function computeActiveFlowFromTicks(sym: string, ticks: VndTick[]): ActiveFlowAnalysis {
  // Chronological order (oldest to newest) for timeline delta computation
  const chronological = [...ticks].reverse();

  let activeBuyVolume = 0;
  let activeSellVolume = 0;
  let neutralVolume = 0;

  let activeBuyValue = 0;
  let activeSellValue = 0;
  let neutralValue = 0;

  // Order size buckets
  // Whale: >= 30,000 shares
  // Mid: 5,000 - 30,000 shares
  // Retail: < 5,000 shares
  const whaleStats = { buyVol: 0, sellVol: 0, neutVol: 0, buyCount: 0, sellCount: 0 };
  const midStats = { buyVol: 0, sellVol: 0, neutVol: 0, buyCount: 0, sellCount: 0 };
  const retailStats = { buyVol: 0, sellVol: 0, neutVol: 0, buyCount: 0, sellCount: 0 };

  const priceMap = new Map<number, { buy: number; sell: number; neutral: number }>();

  // 15-minute time bucket aggregation for cumulative curve
  const timelineMap = new Map<string, { buy: number; sell: number; neutral: number; lastPrice: number; ts: number }>();

  const latestTick = ticks[0] ?? {};
  const lastPrice = normalizePrice(latestTick.last);
  const tradingDate = latestTick.tradingDate ?? new Date().toISOString().slice(0, 10);

  for (const t of ticks) {
    const vol = t.lastVol && Number.isFinite(t.lastVol) ? t.lastVol : 0;
    if (vol <= 0) continue;

    const price = normalizePrice(t.last);
    const val = (price * vol);
    const side = (t.side ?? "").toUpperCase();

    const isBuy = side === "PB" || side === "B";
    const isSell = side === "PS" || side === "S";
    const isNeutral = !isBuy && !isSell; // ATO, ATC, or unknown

    if (isBuy) {
      activeBuyVolume += vol;
      activeBuyValue += val;
    } else if (isSell) {
      activeSellVolume += vol;
      activeSellValue += val;
    } else {
      neutralVolume += vol;
      neutralValue += val;
    }

    // Tiers
    if (vol >= 30_000) {
      if (isBuy) {
        whaleStats.buyVol += vol;
        whaleStats.buyCount += 1;
      } else if (isSell) {
        whaleStats.sellVol += vol;
        whaleStats.sellCount += 1;
      } else {
        whaleStats.neutVol += vol;
      }
    } else if (vol >= 5_000) {
      if (isBuy) {
        midStats.buyVol += vol;
        midStats.buyCount += 1;
      } else if (isSell) {
        midStats.sellVol += vol;
        midStats.sellCount += 1;
      } else {
        midStats.neutVol += vol;
      }
    } else {
      if (isBuy) {
        retailStats.buyVol += vol;
        retailStats.buyCount += 1;
      } else if (isSell) {
        retailStats.sellVol += vol;
        retailStats.sellCount += 1;
      } else {
        retailStats.neutVol += vol;
      }
    }

    // Price level
    if (price > 0) {
      const pEntry = priceMap.get(price) ?? { buy: 0, sell: 0, neutral: 0 };
      if (isBuy) pEntry.buy += vol;
      else if (isSell) pEntry.sell += vol;
      else pEntry.neutral += vol;
      priceMap.set(price, pEntry);
    }
  }

  // Build timeline from chronological ticks
  let runningNet = 0;
  for (const t of chronological) {
    const vol = t.lastVol && Number.isFinite(t.lastVol) ? t.lastVol : 0;
    if (vol <= 0) continue;

    const price = normalizePrice(t.last);
    const side = (t.side ?? "").toUpperCase();
    const isBuy = side === "PB" || side === "B";
    const isSell = side === "PS" || side === "S";
    const isNeutral = !isBuy && !isSell;

    const rawTime = t.time ?? "09:00:00";
    // Bucket by 15 minutes: HH:00, HH:15, HH:30, HH:45
    const parts = rawTime.split(":");
    const hh = parts[0] || "09";
    const mm = Number(parts[1] || "0");
    const bucketMin = Math.floor(mm / 15) * 15;
    const bucketKey = `${hh}:${bucketMin.toString().padStart(2, "0")}`;

    const existing = timelineMap.get(bucketKey) ?? {
      buy: 0,
      sell: 0,
      neutral: 0,
      lastPrice: price,
      ts: new Date(`${tradingDate}T${rawTime}+07:00`).getTime() || Date.now(),
    };

    if (isBuy) existing.buy += vol;
    else if (isSell) existing.sell += vol;
    else existing.neutral += vol;
    existing.lastPrice = price;
    timelineMap.set(bucketKey, existing);
  }

  const timeline: ActiveFlowTimelinePoint[] = [];
  const sortedBucketKeys = Array.from(timelineMap.keys()).sort();
  for (const k of sortedBucketKeys) {
    const b = timelineMap.get(k)!;
    const intervalNet = b.buy - b.sell;
    runningNet += intervalNet;
    timeline.push({
      time: k,
      timestamp: b.ts,
      price: b.lastPrice,
      activeBuyVol: b.buy,
      activeSellVol: b.sell,
      neutralVol: b.neutral,
      intervalNetVol: intervalNet,
      cumulativeNetVol: runningNet,
    });
  }

  const totalMatchedVolume = activeBuyVolume + activeSellVolume + neutralVolume;
  const totalMatchedValue = activeBuyValue + activeSellValue + neutralValue;

  const activeBuyPercent = totalMatchedVolume > 0 ? (activeBuyVolume / totalMatchedVolume) * 100 : 0;
  const activeSellPercent = totalMatchedVolume > 0 ? (activeSellVolume / totalMatchedVolume) * 100 : 0;
  const neutralPercent = totalMatchedVolume > 0 ? (neutralVolume / totalMatchedVolume) * 100 : 0;

  const netActiveVolume = activeBuyVolume - activeSellVolume;
  const netActiveValue = activeBuyValue - activeSellValue;
  const buySellRatio = activeSellVolume > 0 ? Number((activeBuyVolume / activeSellVolume).toFixed(2)) : 1;

  // Pressure indicator
  let pressureStatus: ActiveFlowAnalysis["pressureStatus"] = "BALANCED";
  const activeTotal = activeBuyVolume + activeSellVolume;
  if (activeTotal > 0) {
    const buyOfActive = (activeBuyVolume / activeTotal) * 100;
    if (buyOfActive >= 60) pressureStatus = "STRONG_BUY";
    else if (buyOfActive >= 53) pressureStatus = "BUY_DOMINANT";
    else if (buyOfActive <= 40) pressureStatus = "STRONG_SELL";
    else if (buyOfActive <= 47) pressureStatus = "SELL_DOMINANT";
  }

  // Tiers calculation
  const makeTier = (
    tier: "whale" | "medium" | "retail",
    label: string,
    minShares: number,
    maxShares: number,
    s: { buyVol: number; sellVol: number; neutVol: number; buyCount: number; sellCount: number },
  ): ActiveFlowOrderSizeTier => {
    const tot = s.buyVol + s.sellVol + s.neutVol;
    return {
      tier,
      label,
      minShares,
      maxShares,
      buyVolume: s.buyVol,
      sellVolume: s.sellVol,
      neutralVolume: s.neutVol,
      netVolume: s.buyVol - s.sellVol,
      buyCount: s.buyCount,
      sellCount: s.sellCount,
      buyPercent: tot > 0 ? Number(((s.buyVol / tot) * 100).toFixed(1)) : 0,
      sellPercent: tot > 0 ? Number(((s.sellVol / tot) * 100).toFixed(1)) : 0,
    };
  };

  const tiers: ActiveFlowOrderSizeTier[] = [
    makeTier("whale", "Cá mập / Lệnh lớn (≥30K)", 30_000, Infinity, whaleStats),
    makeTier("medium", "Lệnh vừa (5K - 30K)", 5_000, 30_000, midStats),
    makeTier("retail", "Nhỏ lẻ (<5K)", 0, 5_000, retailStats),
  ];

  // Smart Money signal summary
  const whaleNet = whaleStats.buyVol - whaleStats.sellVol;
  const retailNet = retailStats.buyVol - retailStats.sellVol;
  let smartMoneyBias: "ACCUMULATING" | "DISTRIBUTING" | "NEUTRAL" = "NEUTRAL";
  let smartSummary = "Dòng tiền lớn đang ở trạng thái cân bằng thăm dò.";

  if (whaleNet > 50_000) {
    smartMoneyBias = "ACCUMULATING";
    smartSummary = retailNet < 0
      ? "Cá mập gom mạnh trong khi nhỏ lẻ xả hàng (Hấp thụ cung vượt trội)."
      : "Cá mập và dòng tiền lớn đang chủ động mua gom vào bước giá lên.";
  } else if (whaleNet < -50_000) {
    smartMoneyBias = "DISTRIBUTING";
    smartSummary = retailNet > 0
      ? "Cá mập đang chốt lời/phân phối trong khi nhỏ lẻ mua đối ứng (Bẫy thanh khoản)."
      : "Áp lực bán chủ động mạnh từ các lệnh quy mô lớn.";
  }

  // Price levels (sorted descending by price)
  const priceLevels: ActiveFlowPriceLevel[] = Array.from(priceMap.entries())
    .map(([p, v]) => {
      const tot = v.buy + v.sell + v.neutral;
      return {
        price: p,
        buyVolume: v.buy,
        sellVolume: v.sell,
        neutralVolume: v.neutral,
        totalVolume: tot,
        netVolume: v.buy - v.sell,
        buyPercent: tot > 0 ? Number(((v.buy / tot) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.price - a.price)
    .slice(0, 10);

  return {
    symbol: sym,
    tradingDate,
    lastPrice,
    totalMatchedVolume,
    totalMatchedValue,
    activeBuyVolume,
    activeSellVolume,
    neutralVolume,
    activeBuyValue,
    activeSellValue,
    neutralValue,
    activeBuyPercent: Number(activeBuyPercent.toFixed(1)),
    activeSellPercent: Number(activeSellPercent.toFixed(1)),
    neutralPercent: Number(neutralPercent.toFixed(1)),
    netActiveVolume,
    netActiveValue,
    buySellRatio,
    pressureStatus,
    smartMoneySignal: {
      bias: smartMoneyBias,
      summary: smartSummary,
      whaleNetVolume: whaleNet,
      retailNetVolume: retailNet,
    },
    tiers,
    priceLevels,
    timeline,
    lastUpdated: new Date().toISOString(),
  };
}
