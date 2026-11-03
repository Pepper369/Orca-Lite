import type { OhlcvBar } from "../types";

/**
 * William O'Neil Relative Strength (RS) Rating Engine (1 - 99)
 *
 * Evaluates the price performance of every stock relative to the entire market universe
 * over the past 1 year (approx 252 trading days), with heavy weighting on the most recent quarter:
 *
 * Raw RS Score = 0.40 * Q1 (last 63 bars)
 *              + 0.20 * Q2 (bars 63 - 126)
 *              + 0.20 * Q3 (bars 126 - 189)
 *              + 0.20 * Q4 (bars 189 - 252)
 *
 * Then scaled into a percentile rank from 1 (weakest laggard) to 99 (strongest market leader).
 * A stock with an RS Rating of 80 or higher has outperformed 80% of all stocks in the market.
 */

export type RsCategory =
  | "ELITE_LEADER" // RS 90 - 99 (Top 10% of the entire market)
  | "STRONG_LEADER" // RS 80 - 89 (CANSLIM institutional buying criteria)
  | "ABOVE_AVERAGE" // RS 60 - 79
  | "MEDIOCRE" // RS 40 - 59
  | "LAGGARD"; // RS 1 - 39 (Underperforming, avoid)

export interface StockRsResult {
  symbol: string;
  rsRating: number; // 1 - 99
  rawScore: number;
  category: RsCategory;
  q1PerfPct: number; // Last 63 days performance (%)
  q2PerfPct: number; // 63 - 126 days (%)
  q3PerfPct: number; // 126 - 189 days (%)
  q4PerfPct: number; // 189 - 252 days (%)
  oneYearPerfPct: number; // 1-year total change (%)
  rsTrend: "IMPROVING" | "WEAKENING" | "NEUTRAL";
  isMarketLeader: boolean; // RS >= 80
}

/**
 * Calculates raw weighted performance score for a single stock from historical daily bars.
 */
export function calculateRawRsScore(bars: OhlcvBar[]): {
  rawScore: number;
  q1PerfPct: number;
  q2PerfPct: number;
  q3PerfPct: number;
  q4PerfPct: number;
  oneYearPerfPct: number;
  rsTrend: "IMPROVING" | "WEAKENING" | "NEUTRAL";
} {
  const n = bars.length;
  if (n < 5) {
    return {
      rawScore: 0,
      q1PerfPct: 0,
      q2PerfPct: 0,
      q3PerfPct: 0,
      q4PerfPct: 0,
      oneYearPerfPct: 0,
      rsTrend: "NEUTRAL",
    };
  }

  const currentClose = bars[n - 1]!.close;
  if (currentClose <= 0) {
    return {
      rawScore: 0,
      q1PerfPct: 0,
      q2PerfPct: 0,
      q3PerfPct: 0,
      q4PerfPct: 0,
      oneYearPerfPct: 0,
      rsTrend: "NEUTRAL",
    };
  }

  // Safe bar index accessor
  const getCloseAt = (lookback: number): number => {
    const idx = Math.max(0, n - 1 - lookback);
    return bars[idx]?.close ?? currentClose;
  };

  // 1 Quarter = approx 63 trading days
  const close63 = getCloseAt(63);
  const close126 = getCloseAt(126);
  const close189 = getCloseAt(189);
  const close252 = getCloseAt(252);

  const q1 = close63 > 0 ? (currentClose - close63) / close63 : 0;
  const q2 = close126 > 0 ? (close63 - close126) / close126 : 0;
  const q3 = close189 > 0 ? (close126 - close189) / close189 : 0;
  const q4 = close252 > 0 ? (close189 - close252) / close252 : 0;

  // Adapt weights if stock is newly listed (< 252 bars)
  let rawScore = 0;
  if (n >= 250) {
    rawScore = 0.4 * q1 + 0.2 * q2 + 0.2 * q3 + 0.2 * q4;
  } else if (n >= 120) {
    // ~6 months
    rawScore = 0.6 * q1 + 0.4 * q2;
  } else {
    // Young stock
    rawScore = q1;
  }

  // RS Trend: compare performance of last 20 days vs previous 20 days
  const close20 = getCloseAt(20);
  const close40 = getCloseAt(40);
  const shortMom = close20 > 0 ? (currentClose - close20) / close20 : 0;
  const prevShortMom = close40 > 0 && close20 > 0 ? (close20 - close40) / close40 : 0;

  let rsTrend: "IMPROVING" | "WEAKENING" | "NEUTRAL" = "NEUTRAL";
  if (shortMom > prevShortMom + 0.03) {
    rsTrend = "IMPROVING";
  } else if (shortMom < prevShortMom - 0.03) {
    rsTrend = "WEAKENING";
  }

  const oneYearPerf = close252 > 0 ? ((currentClose - close252) / close252) * 100 : q1 * 100;

  return {
    rawScore,
    q1PerfPct: Math.round(q1 * 1000) / 10,
    q2PerfPct: Math.round(q2 * 1000) / 10,
    q3PerfPct: Math.round(q3 * 1000) / 10,
    q4PerfPct: Math.round(q4 * 1000) / 10,
    oneYearPerfPct: Math.round(oneYearPerf * 10) / 10,
    rsTrend,
  };
}

/**
 * Computes William O'Neil 1 - 99 Relative Strength Percentile Ratings across a full stock universe.
 */
export function calculateUniverseRsRatings(
  stockHistories: Record<string, OhlcvBar[]>,
): Map<string, StockRsResult> {
  const symbols = Object.keys(stockHistories);
  if (symbols.length === 0) return new Map();

  // 1. Calculate raw score for each stock
  const scoredItems: {
    symbol: string;
    raw: ReturnType<typeof calculateRawRsScore>;
  }[] = [];

  for (const sym of symbols) {
    const bars = stockHistories[sym];
    if (!bars || bars.length < 5) continue;
    const raw = calculateRawRsScore(bars);
    scoredItems.push({ symbol: sym, raw });
  }

  const total = scoredItems.length;
  const resultMap = new Map<string, StockRsResult>();
  if (total === 0) return resultMap;

  // 2. Sort ascending by raw score (lowest to highest)
  scoredItems.sort((a, b) => a.raw.rawScore - b.raw.rawScore);

  // 3. Map into 1 - 99 percentile (with tie handling)
  let lastScore: number | null = null;
  let lastRating = 1;
  scoredItems.forEach((item, index) => {
    // Percentile rank: index 0 -> 1, index (total - 1) -> 99
    let rsRating = 1;
    if (total > 1) {
      if (lastScore !== null && Math.abs(item.raw.rawScore - lastScore) < 1e-9) {
        rsRating = lastRating;
      } else {
        rsRating = Math.round(1 + (98 * index) / (total - 1));
        lastScore = item.raw.rawScore;
        lastRating = rsRating;
      }
    }
    rsRating = Math.max(1, Math.min(99, rsRating));

    let category: RsCategory = "MEDIOCRE";
    if (rsRating >= 90) category = "ELITE_LEADER";
    else if (rsRating >= 80) category = "STRONG_LEADER";
    else if (rsRating >= 60) category = "ABOVE_AVERAGE";
    else if (rsRating < 40) category = "LAGGARD";

    resultMap.set(item.symbol, {
      symbol: item.symbol,
      rsRating,
      rawScore: item.raw.rawScore,
      category,
      q1PerfPct: item.raw.q1PerfPct,
      q2PerfPct: item.raw.q2PerfPct,
      q3PerfPct: item.raw.q3PerfPct,
      q4PerfPct: item.raw.q4PerfPct,
      oneYearPerfPct: item.raw.oneYearPerfPct,
      rsTrend: item.raw.rsTrend,
      isMarketLeader: rsRating >= 80,
    });
  });

  return resultMap;
}
