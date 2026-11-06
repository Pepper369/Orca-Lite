import type { OhlcvBar } from "../types";
import { findSwings, type SwingPoint } from "./money-flow";

export interface FiboLevel {
  ratio: number;
  price: number;
  label: string;
  isGoldenPocket?: boolean;
}

export interface FiboCluster {
  price: number;
  low: number;
  high: number;
  levels: Array<{
    swingIndex: number;
    type: "RETRACEMENT" | "EXTENSION";
    ratio: number;
    price: number;
    label: string;
  }>;
  strength: number; // 2 or more confluent fibo levels
  descriptionVi: string;
}

export interface FiboConfluenceResult {
  trend: "bullish" | "bearish" | "neutral";
  currentPrice: number;
  swingLow: number | null;
  swingHigh: number | null;
  
  // Golden Pocket zone (0.618 - 0.65 retracement)
  goldenPocket: {
    lower: number;
    upper: number;
    inPocket: boolean;
    distancePct: number;
  } | null;

  // Active Retracement Levels
  retracements: FiboLevel[];

  // Projected Extension Levels (Target / Take Profit)
  extensions: FiboLevel[];

  // Multi-Swing Fibonacci Confluence Clusters
  clusters: FiboCluster[];

  // Confluence Signals
  isGoldenPocketBounce: boolean;
  hasFiboClusterConfluence: boolean;
  nearestConfluenceLevel: number | null;
  nearestConfluenceDistPct: number | null;
  summaryVi: string;
}

export const FIBO_RETRACEMENT_RATIOS = [
  { ratio: 0.236, label: "Fibo 23.6%" },
  { ratio: 0.382, label: "Fibo 38.2%" },
  { ratio: 0.5, label: "Equilibrium 50%" },
  { ratio: 0.618, label: "Golden Ratio 61.8%", isGoldenPocket: true },
  { ratio: 0.65, label: "Golden Pocket 65.0%", isGoldenPocket: true },
  { ratio: 0.786, label: "Deep Retracement 78.6%" },
  { ratio: 0.886, label: "Harmonic 88.6%" },
];

export const FIBO_EXTENSION_RATIOS = [
  { ratio: 1.0, label: "Fibo Ext 100%" },
  { ratio: 1.272, label: "Fibo Ext 127.2% (TP1)" },
  { ratio: 1.414, label: "Fibo Ext 141.4%" },
  { ratio: 1.618, label: "Golden Ext 161.8% (TP2)" },
  { ratio: 2.0, label: "Fibo Ext 200% (TP3)" },
  { ratio: 2.618, label: "Major Ext 261.8%" },
];

/**
 * Calculates Fibonacci Retracement levels for a given price swing (from start to end).
 */
export function calculateRetracements(
  startPrice: number,
  endPrice: number,
  isBullish: boolean
): FiboLevel[] {
  const diff = Math.abs(endPrice - startPrice);
  if (diff <= 0) return [];

  return FIBO_RETRACEMENT_RATIOS.map((item) => {
    // In bullish swing (low -> high): retracement pulls down from high
    // In bearish swing (high -> low): retracement pulls up from low
    const price = isBullish
      ? endPrice - diff * item.ratio
      : endPrice + diff * item.ratio;

    return {
      ratio: item.ratio,
      price: Number(price.toFixed(2)),
      label: item.label,
      isGoldenPocket: item.isGoldenPocket,
    };
  });
}

/**
 * Calculates Fibonacci Extension levels from a swing (A -> B) projected from pull-back C.
 */
export function calculateExtensions(
  swingA: number,
  swingB: number,
  pullbackC: number,
  isBullish: boolean
): FiboLevel[] {
  const impulse = Math.abs(swingB - swingA);
  if (impulse <= 0) return [];

  return FIBO_EXTENSION_RATIOS.map((item) => {
    const price = isBullish
      ? pullbackC + impulse * item.ratio
      : pullbackC - impulse * item.ratio;

    return {
      ratio: item.ratio,
      price: Number(price.toFixed(2)),
      label: item.label,
    };
  });
}

/**
 * Finds Fibonacci Clusters: detects price zones where independent Fibonacci levels
 * from different swings intersect within a tolerance threshold (default: 0.8%).
 */
export function detectFiboClusters(
  levelSets: Array<{
    swingIndex: number;
    levels: Array<{ type: "RETRACEMENT" | "EXTENSION"; ratio: number; price: number; label: string }>;
  }>,
  tolerancePct = 0.008
): FiboCluster[] {
  const allLevels: Array<{
    swingIndex: number;
    type: "RETRACEMENT" | "EXTENSION";
    ratio: number;
    price: number;
    label: string;
  }> = [];

  for (const set of levelSets) {
    for (const lvl of set.levels) {
      allLevels.push({
        swingIndex: set.swingIndex,
        type: lvl.type,
        ratio: lvl.ratio,
        price: lvl.price,
        label: lvl.label,
      });
    }
  }

  const clusters: FiboCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allLevels.length; i++) {
    if (used.has(i)) continue;
    const base = allLevels[i]!;
    const group = [base];

    for (let j = i + 1; j < allLevels.length; j++) {
      if (used.has(j)) continue;
      const candidate = allLevels[j]!;

      // Cluster must come from different swings or different calculations
      if (candidate.swingIndex === base.swingIndex && candidate.type === base.type) {
        continue;
      }

      const diffPct = Math.abs(candidate.price - base.price) / base.price;
      if (diffPct <= tolerancePct) {
        group.push(candidate);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      used.add(i);
      const prices = group.map((g) => g.price);
      const avgPrice = Number((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      const labels = group.map((g) => `${g.label} (Swing #${g.swingIndex})`).join(" + ");
      clusters.push({
        price: avgPrice,
        low: Number(minPrice.toFixed(2)),
        high: Number(maxPrice.toFixed(2)),
        levels: group,
        strength: group.length,
        descriptionVi: `Hợp lưu Fibo ${group.length} yếu tố: ${labels}`,
      });
    }
  }

  // Sort by cluster strength descending
  return clusters.sort((a, b) => b.strength - a.strength);
}

/**
 * Main Fibonacci Confluence Analyzer:
 * Combines Swings, Golden Pocket, Retracements, Extensions and Clusters.
 */
export function analyzeFibonacciConfluence(
  bars: OhlcvBar[],
  swingsInput?: SwingPoint[]
): FiboConfluenceResult {
  const currentBar = bars.at(-1);
  const currentPrice = currentBar?.close ?? 0;

  if (bars.length < 15 || currentPrice <= 0) {
    return {
      trend: "neutral",
      currentPrice,
      swingLow: null,
      swingHigh: null,
      goldenPocket: null,
      retracements: [],
      extensions: [],
      clusters: [],
      isGoldenPocketBounce: false,
      hasFiboClusterConfluence: false,
      nearestConfluenceLevel: null,
      nearestConfluenceDistPct: null,
      summaryVi: "Chưa đủ dữ liệu nến để phân tích Fibonacci",
    };
  }

  // Use provided swings or detect automatically
  const swings = swingsInput ?? findSwings(bars, 3, "external");
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  const lastHigh = highs.at(-1)?.price ?? null;
  const lastLow = lows.at(-1)?.price ?? null;

  // Determine primary swing trend
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  let isBullishSwing = false;

  if (lastHigh != null && lastLow != null) {
    const lastHighIdx = highs.at(-1)!.index;
    const lastLowIdx = lows.at(-1)!.index;
    if (lastLowIdx < lastHighIdx) {
      trend = "bullish";
      isBullishSwing = true;
    } else {
      trend = "bearish";
      isBullishSwing = false;
    }
  }

  let retracements: FiboLevel[] = [];
  let extensions: FiboLevel[] = [];
  let goldenPocket: FiboConfluenceResult["goldenPocket"] = null;
  let isGoldenPocketBounce = false;

  if (lastHigh != null && lastLow != null && lastHigh > lastLow) {
    if (isBullishSwing) {
      // Swing UP: Low to High -> Retracement down
      retracements = calculateRetracements(lastLow, lastHigh, true);
      const fib618 = retracements.find((r) => r.ratio === 0.618)?.price ?? 0;
      const fib65 = retracements.find((r) => r.ratio === 0.65)?.price ?? 0;
      const pocketLow = Math.min(fib618, fib65);
      const pocketHigh = Math.max(fib618, fib65);

      const inPocket = currentPrice >= pocketLow * 0.995 && currentPrice <= pocketHigh * 1.005;
      const distancePct = Number((((currentPrice - (pocketLow + pocketHigh) / 2) / currentPrice) * 100).toFixed(2));

      goldenPocket = {
        lower: pocketLow,
        upper: pocketHigh,
        inPocket,
        distancePct,
      };

      // Check bounce: Bar low touched Golden Pocket, but close rebounded above it
      if (currentBar && currentBar.low <= pocketHigh && currentBar.close > pocketLow && currentBar.close >= currentBar.open) {
        isGoldenPocketBounce = true;
      }

      // Extension from pull-back C (using currentPrice or recent local low)
      const pullbackC = Math.min(currentPrice, currentBar?.low ?? currentPrice);
      extensions = calculateExtensions(lastLow, lastHigh, pullbackC, true);
    } else {
      // Swing DOWN: High to Low -> Retracement up
      retracements = calculateRetracements(lastHigh, lastLow, false);
      const fib618 = retracements.find((r) => r.ratio === 0.618)?.price ?? 0;
      const fib65 = retracements.find((r) => r.ratio === 0.65)?.price ?? 0;
      const pocketLow = Math.min(fib618, fib65);
      const pocketHigh = Math.max(fib618, fib65);

      const inPocket = currentPrice >= pocketLow * 0.995 && currentPrice <= pocketHigh * 1.005;
      const distancePct = Number((((currentPrice - (pocketLow + pocketHigh) / 2) / currentPrice) * 100).toFixed(2));

      goldenPocket = {
        lower: pocketLow,
        upper: pocketHigh,
        inPocket,
        distancePct,
      };

      if (currentBar && currentBar.high >= pocketLow && currentBar.close < pocketHigh && currentBar.close <= currentBar.open) {
        isGoldenPocketBounce = true;
      }

      const pullbackC = Math.max(currentPrice, currentBar?.high ?? currentPrice);
      extensions = calculateExtensions(lastHigh, lastLow, pullbackC, false);
    }
  }

  // Detect Multi-Swing Fibo Clusters if we have prior swings
  const levelSets: Array<{
    swingIndex: number;
    levels: Array<{ type: "RETRACEMENT" | "EXTENSION"; ratio: number; price: number; label: string }>;
  }> = [];

  if (retracements.length > 0) {
    levelSets.push({
      swingIndex: 1,
      levels: retracements.map((r) => ({ type: "RETRACEMENT", ratio: r.ratio, price: r.price, label: r.label })),
    });
  }

  // Check prior swing pair for cluster
  if (highs.length >= 2 && lows.length >= 2) {
    const priorHigh = highs.at(-2)!.price;
    const priorLow = lows.at(-2)!.price;
    if (priorHigh > priorLow) {
      const priorRetr = calculateRetracements(priorLow, priorHigh, true);
      levelSets.push({
        swingIndex: 2,
        levels: priorRetr.map((r) => ({ type: "RETRACEMENT", ratio: r.ratio, price: r.price, label: r.label })),
      });
    }
  }

  const clusters = detectFiboClusters(levelSets, 0.012);

  // Check nearest cluster to current price
  let nearestConfluenceLevel: number | null = null;
  let nearestConfluenceDistPct: number | null = null;
  let hasFiboClusterConfluence = false;

  if (clusters.length > 0) {
    let minDiff = Infinity;
    for (const c of clusters) {
      const diff = Math.abs(currentPrice - c.price);
      if (diff < minDiff) {
        minDiff = diff;
        nearestConfluenceLevel = c.price;
      }
    }
    if (nearestConfluenceLevel != null) {
      nearestConfluenceDistPct = Number((((currentPrice - nearestConfluenceLevel) / currentPrice) * 100).toFixed(2));
      if (Math.abs(nearestConfluenceDistPct) <= 1.5) {
        hasFiboClusterConfluence = true;
      }
    }
  }

  let summaryVi = "Dao động ngoài vùng hợp lưu Fibo chính";
  if (isGoldenPocketBounce) {
    summaryVi = "Bật tăng mạnh mẽ tại Golden Pocket Fibo (0.618 - 0.65) - Tín hiệu đảo chiều xác suất cao";
  } else if (goldenPocket?.inPocket) {
    summaryVi = "Giá đang kiểm định vùng Golden Pocket Fibo (0.618 - 0.65)";
  } else if (hasFiboClusterConfluence) {
    summaryVi = `Hội tụ Fibonacci Cluster đa chu kỳ tại vùng ${nearestConfluenceLevel} (Sai số ${nearestConfluenceDistPct}%)`;
  }

  return {
    trend,
    currentPrice,
    swingLow: lastLow,
    swingHigh: lastHigh,
    goldenPocket,
    retracements,
    extensions,
    clusters,
    isGoldenPocketBounce,
    hasFiboClusterConfluence,
    nearestConfluenceLevel,
    nearestConfluenceDistPct,
    summaryVi,
  };
}
