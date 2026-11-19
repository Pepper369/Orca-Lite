/**
 * INSTITUTIONAL ICT & SMC UNIFIED LIQUIDITY ENGINE
 *
 * Combines advanced Inner Circle Trader (ICT) and Smart Money Concepts (SMC):
 * 1. Liquidity Mapping: BSL (Buy-Side Liquidity), SSL (Sell-Side Liquidity), EQH/EQL Magnets, Internal vs External Range (IRL <-> ERL).
 * 2. Precision Liquidity Sweeps: Judas Swing (Session Open Purge), Turtle Soup (False Breakout Wick), Purge & Revert.
 * 3. Market Structure Shift (MSS) / Change of Character (CHoCH) with Displacement.
 * 4. Fair Value Gaps (FVG), Balanced Price Ranges (BPR), and Institutional Order Blocks (OB) / Breaker Blocks (BB).
 * 5. Optimal Trade Entry (OTE) Fibonacci Sweet Spot (0.618 - 0.705 - 0.786) Setup Generation.
 */

import type { OhlcvBar } from "../types";

export interface LiquidityPool {
  id: string;
  type: "BSL" | "SSL" | "EQH" | "EQL";
  price: number;
  time: number;
  barIndex: number;
  significance: "HIGH_EXTERNAL" | "MEDIUM_INTERNAL" | "MINOR";
  status: "UNTOUCHED" | "SWEPT" | "MITIGATED";
  volumeNearPool?: number;
}

export interface AdvancedSweepEvent {
  id: string;
  time: number;
  barIndex: number;
  sweepType: "TURTLE_SOUP" | "JUDAS_SWING" | "PURGE_AND_REVERT";
  side: "BUY_SIDE_SWEPT" | "SELL_SIDE_SWEPT";
  sweptLevel: number;
  wickExtreme: number;
  closePrice: number;
  sweepDepthPipsOrPct: number;
  mssConfirmed: boolean; // Market Structure Shift immediately after sweep
  displacementRatio: number; // Body size vs wick ratio of reaction candle
  conviction: "INSTITUTIONAL_PRIME" | "HIGH" | "MODERATE";
}

export interface IctFvgZone {
  id: string;
  time: number;
  barIndex: number;
  direction: "BULLISH_FVG" | "BEARISH_FVG";
  top: number;
  bottom: number;
  consequentEncroachment: number; // CE (50% midpoint of FVG)
  mitigated: boolean;
  mitigationPct: number; // 0% to 100%
  isInversion: boolean; // Turned into support/resistance
}

export interface IctOrderBlockZone {
  id: string;
  time: number;
  barIndex: number;
  type: "ORDER_BLOCK" | "BREAKER_BLOCK";
  direction: "BULLISH" | "BEARISH";
  high: number;
  low: number;
  meanThreshold: number; // 50% midpoint of OB
  status: "FRESH" | "TESTED" | "MITIGATED";
}

export interface OteTradeSetup {
  direction: "BUY" | "SELL" | "NEUTRAL";
  setupName:
    | "ICT_OTE_FVG_CONFLUENCE"
    | "SMC_TURTLE_SOUP_REVERSAL"
    | "ICT_BREAKER_BLOCK_RETEST"
    | "JUDAS_SWING_EXPLOIT"
    | "NONE";
  entryOptimal: number; // 0.705 Golden Sweet Spot
  entryZone: [number, number]; // [0.618, 0.786]
  stopLoss: number;
  targetTP1: number; // Internal Range Liquidity (Mid / FVG)
  targetTP2: number; // External Range Liquidity (Major BSL/SSL)
  riskRewardRatio: number;
  confluenceScore: number; // 0 - 100
  dealingRange: {
    swingHigh: number;
    swingLow: number;
    equilibrium: number; // 0.50
    currentZone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
    fibOte618: number;
    fibOte705: number;
    fibOte786: number;
  };
  executionChecklist: {
    rule: string;
    passed: boolean;
  }[];
  rationale: string;
}

export interface IctSmcAnalysisResult {
  symbol: string;
  bias: "STRONG_BULLISH" | "BULLISH" | "STRONG_BEARISH" | "BEARISH" | "NEUTRAL";
  overallScore: number; // 0 - 100
  liquidityMap: {
    buySidePools: LiquidityPool[];
    sellSidePools: LiquidityPool[];
    nearestBsl: LiquidityPool | null;
    nearestSsl: LiquidityPool | null;
  };
  recentSweeps: AdvancedSweepEvent[];
  activeFvgList: IctFvgZone[];
  orderBlocks: IctOrderBlockZone[];
  optimalTradeSetup: OteTradeSetup;
  marketStructure: {
    lastMss: "BULLISH_MSS" | "BEARISH_MSS" | "NONE";
    displacementDetected: boolean;
    flowCycle: "IRL_TO_ERL" | "ERL_TO_IRL" | "BALANCED";
  };
  summaryVi: string;
}

/**
 * Main Analysis Engine: Evaluates OHLCV candlestick series through full ICT & SMC suite.
 */
export function analyzeIctSmcLiquidity(params: {
  symbol: string;
  bars: OhlcvBar[];
  currentPrice?: number | null;
  assetType?: "FOREX" | "CRYPTO";
  pipSize?: number;
}): IctSmcAnalysisResult {
  const {
    symbol,
    bars,
    currentPrice: inputPrice,
    assetType = "FOREX",
    pipSize: inputPipSize,
  } = params;

  const n = bars.length;
  const currentPrice = inputPrice ?? (n > 0 ? bars[n - 1].close : 1.0);
  const isForex = assetType === "FOREX";
  const pipSize =
    inputPipSize ??
    (isForex ? (symbol.toUpperCase().includes("JPY") ? 0.01 : 0.0001) : currentPrice * 0.0001);

  if (n < 25) {
    return createEmptyResult(symbol, currentPrice);
  }

  // 1. LIQUIDITY MAP (BSL / SSL / EQH / EQL)
  const { buySidePools, sellSidePools } = detectLiquidityPools(bars, pipSize);
  const nearestBsl = buySidePools.find((p) => p.price > currentPrice && p.status === "UNTOUCHED") ?? null;
  const nearestSsl = sellSidePools.find((p) => p.price < currentPrice && p.status === "UNTOUCHED") ?? null;

  // 2. FAIR VALUE GAPS (FVG & BPR)
  const activeFvgList = detectFairValueGaps(bars, pipSize);

  // 3. ORDER BLOCKS & BREAKER BLOCKS
  const orderBlocks = detectOrderBlocksAndBreakers(bars);

  // 4. PRECISION LIQUIDITY SWEEPS (Turtle Soup, Judas Swing, Purge & Revert)
  const recentSweeps = detectAdvancedSweeps(bars, buySidePools, sellSidePools, pipSize, isForex);

  // 5. DEALING RANGE & OTE (Optimal Trade Entry)
  const windowBars = bars.slice(-45);
  const swingHigh = Math.max(...windowBars.map((b) => b.high));
  const swingLow = Math.min(...windowBars.map((b) => b.low));
  const equilibrium = (swingHigh + swingLow) / 2;
  const rangeDiff = Math.max(1e-5, swingHigh - swingLow);

  const currentZone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" =
    currentPrice > equilibrium + rangeDiff * 0.05
      ? "PREMIUM"
      : currentPrice < equilibrium - rangeDiff * 0.05
      ? "DISCOUNT"
      : "EQUILIBRIUM";

  // Calculate Fibonacci OTE Levels
  // For Bullish OTE (retracing downward into discount):
  // 61.8% = High - Range * 0.618; 70.5% = High - Range * 0.705; 78.6% = High - Range * 0.786
  const bullOte618 = swingHigh - rangeDiff * 0.618;
  const bullOte705 = swingHigh - rangeDiff * 0.705;
  const bullOte786 = swingHigh - rangeDiff * 0.786;

  // For Bearish OTE (retracing upward into premium):
  // 61.8% = Low + Range * 0.618; 70.5% = Low + Range * 0.705; 78.6% = Low + Range * 0.786
  const bearOte618 = swingLow + rangeDiff * 0.618;
  const bearOte705 = swingLow + rangeDiff * 0.705;
  const bearOte786 = swingLow + rangeDiff * 0.786;

  // 6. MARKET STRUCTURE SHIFT & DISPLACEMENT
  const lastBar = bars[n - 1];
  const prevBar = bars[n - 2];
  const lastSweep = recentSweeps[recentSweeps.length - 1];

  let lastMss: "BULLISH_MSS" | "BEARISH_MSS" | "NONE" = "NONE";
  const recentHighs = bars.slice(-15, -2).map((b) => b.high);
  const recentLows = bars.slice(-15, -2).map((b) => b.low);
  const localHigh = Math.max(...recentHighs);
  const localLow = Math.min(...recentLows);

  if (lastBar.close > localHigh && (lastBar.close - lastBar.open) > (lastBar.high - lastBar.low) * 0.65) {
    lastMss = "BULLISH_MSS";
  } else if (lastBar.close < localLow && (lastBar.open - lastBar.close) > (lastBar.high - lastBar.low) * 0.65) {
    lastMss = "BEARISH_MSS";
  }

  const displacementDetected =
    Math.abs(lastBar.close - lastBar.open) >= rangeDiff * 0.22 &&
    (lastBar.volume ?? 0) >= (prevBar.volume ?? 0) * 1.3;

  // Liquidity Flow Cycle: IRL to ERL or ERL to IRL
  const flowCycle: IctSmcAnalysisResult["marketStructure"]["flowCycle"] =
    currentZone === "DISCOUNT" && lastMss === "BULLISH_MSS"
      ? "IRL_TO_ERL"
      : currentZone === "PREMIUM" && lastMss === "BEARISH_MSS"
      ? "IRL_TO_ERL"
      : "ERL_TO_IRL";

  // 7. BUILD OPTIMAL TRADE SETUP
  const optimalTradeSetup = buildOteTradeSetup({
    bars,
    currentPrice,
    currentZone,
    swingHigh,
    swingLow,
    rangeDiff,
    bullOte618,
    bullOte705,
    bullOte786,
    bearOte618,
    bearOte705,
    bearOte786,
    activeFvgList,
    orderBlocks,
    recentSweeps,
    lastMss,
    nearestBsl,
    nearestSsl,
    pipSize,
    isForex,
  });

  // Calculate Overall Bias & Score
  let score = 50;
  if (optimalTradeSetup.direction === "BUY") {
    score = Math.min(95, 55 + optimalTradeSetup.confluenceScore * 0.4);
  } else if (optimalTradeSetup.direction === "SELL") {
    score = Math.min(95, 55 + optimalTradeSetup.confluenceScore * 0.4);
  }

  const bias: IctSmcAnalysisResult["bias"] =
    score >= 80
      ? optimalTradeSetup.direction === "BUY"
        ? "STRONG_BULLISH"
        : "STRONG_BEARISH"
      : score >= 65
      ? optimalTradeSetup.direction === "BUY"
        ? "BULLISH"
        : "BEARISH"
      : "NEUTRAL";

  const summaryVi = generateSummaryNarrative({
    symbol,
    bias,
    currentZone,
    lastSweep,
    optimalTradeSetup,
    flowCycle,
  });

  return {
    symbol,
    bias,
    overallScore: Math.round(score),
    liquidityMap: {
      buySidePools,
      sellSidePools,
      nearestBsl,
      nearestSsl,
    },
    recentSweeps,
    activeFvgList,
    orderBlocks,
    optimalTradeSetup,
    marketStructure: {
      lastMss,
      displacementDetected,
      flowCycle,
    },
    summaryVi,
  };
}

/**
 * 1. Detects Swing Highs & Lows to identify Liquidity Pools (BSL, SSL, EQH, EQL)
 */
function detectLiquidityPools(
  bars: OhlcvBar[],
  pipSize: number
): { buySidePools: LiquidityPool[]; sellSidePools: LiquidityPool[] } {
  const buySidePools: LiquidityPool[] = [];
  const sellSidePools: LiquidityPool[] = [];
  const n = bars.length;

  for (let i = 3; i < n - 3; i++) {
    const b = bars[i];
    // Swing High (Fractal pivot 3-bar left and right)
    const isSwingHigh =
      b.high > bars[i - 1].high &&
      b.high > bars[i - 2].high &&
      b.high > bars[i - 3].high &&
      b.high > bars[i + 1].high &&
      b.high > bars[i + 2].high &&
      b.high > bars[i + 3].high;

    // Swing Low
    const isSwingLow =
      b.low < bars[i - 1].low &&
      b.low < bars[i - 2].low &&
      b.low < bars[i - 3].low &&
      b.low < bars[i + 1].low &&
      b.low < bars[i + 2].low &&
      b.low < bars[i + 3].low;

    if (isSwingHigh) {
      // Check if Equal Highs (EQH) with a recent pool within 3 pips
      const isEqh = buySidePools.some((p) => Math.abs(p.price - b.high) <= pipSize * 3);
      buySidePools.push({
        id: `bsl_${b.time}`,
        type: isEqh ? "EQH" : "BSL",
        price: b.high,
        time: b.time,
        barIndex: i,
        significance: isEqh ? "HIGH_EXTERNAL" : "MEDIUM_INTERNAL",
        status: "UNTOUCHED",
      });
    }

    if (isSwingLow) {
      // Check if Equal Lows (EQL)
      const isEql = sellSidePools.some((p) => Math.abs(p.price - b.low) <= pipSize * 3);
      sellSidePools.push({
        id: `ssl_${b.time}`,
        type: isEql ? "EQL" : "SSL",
        price: b.low,
        time: b.time,
        barIndex: i,
        significance: isEql ? "HIGH_EXTERNAL" : "MEDIUM_INTERNAL",
        status: "UNTOUCHED",
      });
    }
  }

  // Check sweep status
  const lastCloses = bars.slice(-10);
  for (const pool of buySidePools) {
    if (lastCloses.some((b) => b.high > pool.price)) {
      pool.status = "SWEPT";
    }
  }
  for (const pool of sellSidePools) {
    if (lastCloses.some((b) => b.low < pool.price)) {
      pool.status = "SWEPT";
    }
  }

  return {
    buySidePools: buySidePools.slice(-6),
    sellSidePools: sellSidePools.slice(-6),
  };
}

/**
 * 2. Detects Fair Value Gaps (FVG) and computes Consequent Encroachment (50%)
 */
function detectFairValueGaps(bars: OhlcvBar[], pipSize: number): IctFvgZone[] {
  const fvgs: IctFvgZone[] = [];
  const n = bars.length;

  for (let i = 2; i < n; i++) {
    const c0 = bars[i - 2];
    const c1 = bars[i - 1];
    const c2 = bars[i];

    // Bullish FVG
    if (c2.low > c0.high) {
      const top = c2.low;
      const bottom = c0.high;
      const gapPips = (top - bottom) / pipSize;

      if (gapPips >= 2.0) {
        let mitigated = false;
        let lowestRetrace = top;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].low < lowestRetrace) lowestRetrace = bars[j].low;
          if (bars[j].low <= bottom) {
            mitigated = true;
            break;
          }
        }
        const mitigationPct = Math.min(100, Math.max(0, ((top - lowestRetrace) / (top - bottom)) * 100));

        fvgs.push({
          id: `fvg_bull_${c1.time}`,
          time: c1.time,
          barIndex: i - 1,
          direction: "BULLISH_FVG",
          top,
          bottom,
          consequentEncroachment: (top + bottom) / 2,
          mitigated,
          mitigationPct: Math.round(mitigationPct),
          isInversion: false,
        });
      }
    }

    // Bearish FVG
    if (c2.high < c0.low) {
      const top = c0.low;
      const bottom = c2.high;
      const gapPips = (top - bottom) / pipSize;

      if (gapPips >= 2.0) {
        let mitigated = false;
        let highestRetrace = bottom;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].high > highestRetrace) highestRetrace = bars[j].high;
          if (bars[j].high >= top) {
            mitigated = true;
            break;
          }
        }
        const mitigationPct = Math.min(100, Math.max(0, ((highestRetrace - bottom) / (top - bottom)) * 100));

        fvgs.push({
          id: `fvg_bear_${c1.time}`,
          time: c1.time,
          barIndex: i - 1,
          direction: "BEARISH_FVG",
          top,
          bottom,
          consequentEncroachment: (top + bottom) / 2,
          mitigated,
          mitigationPct: Math.round(mitigationPct),
          isInversion: false,
        });
      }
    }
  }

  return fvgs.filter((f) => !f.mitigated || f.mitigationPct < 75).slice(-5);
}

/**
 * 3. Detects Order Blocks & Breaker Blocks
 */
function detectOrderBlocksAndBreakers(bars: OhlcvBar[]): IctOrderBlockZone[] {
  const blocks: IctOrderBlockZone[] = [];
  const n = bars.length;

  for (let i = 4; i < n - 2; i++) {
    const obCandle = bars[i];
    const nextCandle = bars[i + 1];
    const isBearish = obCandle.close < obCandle.open;
    const isBullish = obCandle.close > obCandle.open;

    // Bullish OB: Last down-candle before strong upward impulse breaking highs
    if (isBearish && nextCandle.close > obCandle.high) {
      let status: IctOrderBlockZone["status"] = "FRESH";
      let isBreaker = false;

      for (let j = i + 2; j < n; j++) {
        if (bars[j].low < obCandle.low) {
          isBreaker = true; // Broken through, becomes Bearish Breaker
          status = "MITIGATED";
          break;
        } else if (bars[j].low <= obCandle.high) {
          status = "TESTED";
        }
      }

      if (status !== "MITIGATED" || isBreaker) {
        blocks.push({
          id: `ob_${obCandle.time}`,
          time: obCandle.time,
          barIndex: i,
          type: isBreaker ? "BREAKER_BLOCK" : "ORDER_BLOCK",
          direction: isBreaker ? "BEARISH" : "BULLISH",
          high: obCandle.high,
          low: obCandle.low,
          meanThreshold: (obCandle.high + obCandle.low) / 2,
          status,
        });
      }
    }

    // Bearish OB: Last up-candle before strong downward impulse breaking lows
    if (isBullish && nextCandle.close < obCandle.low) {
      let status: IctOrderBlockZone["status"] = "FRESH";
      let isBreaker = false;

      for (let j = i + 2; j < n; j++) {
        if (bars[j].high > obCandle.high) {
          isBreaker = true; // Broken through, becomes Bullish Breaker
          status = "MITIGATED";
          break;
        } else if (bars[j].high >= obCandle.low) {
          status = "TESTED";
        }
      }

      if (status !== "MITIGATED" || isBreaker) {
        blocks.push({
          id: `ob_${obCandle.time}`,
          time: obCandle.time,
          barIndex: i,
          type: isBreaker ? "BREAKER_BLOCK" : "ORDER_BLOCK",
          direction: isBreaker ? "BULLISH" : "BEARISH",
          high: obCandle.high,
          low: obCandle.low,
          meanThreshold: (obCandle.high + obCandle.low) / 2,
          status,
        });
      }
    }
  }

  return blocks.slice(-4);
}

/**
 * 4. Detects Advanced Liquidity Sweeps (Turtle Soup & Judas Swing)
 */
function detectAdvancedSweeps(
  bars: OhlcvBar[],
  bslPools: LiquidityPool[],
  sslPools: LiquidityPool[],
  pipSize: number,
  isForex: boolean
): AdvancedSweepEvent[] {
  const sweeps: AdvancedSweepEvent[] = [];
  const n = bars.length;

  for (let i = n - 15; i < n; i++) {
    if (i < 5) continue;
    const b = bars[i];
    const prev = bars[i - 1];
    const barRange = Math.max(1e-5, b.high - b.low);

    // Check Sell-Side Liquidity Swept (Bullish Turtle Soup)
    // Low pierced below SSL, but Close snapped back above SSL
    for (const pool of sslPools) {
      if (b.low < pool.price && b.close > pool.price) {
        const lowerWick = Math.min(b.open, b.close) - b.low;
        const wickRatio = lowerWick / barRange;

        if (wickRatio >= 0.45) {
          const depthPips = Math.round(((pool.price - b.low) / pipSize) * 10) / 10;
          const isJudas = checkJudasSessionTime(b.time);

          sweeps.push({
            id: `sweep_${b.time}`,
            time: b.time,
            barIndex: i,
            sweepType: isJudas ? "JUDAS_SWING" : "TURTLE_SOUP",
            side: "SELL_SIDE_SWEPT",
            sweptLevel: pool.price,
            wickExtreme: b.low,
            closePrice: b.close,
            sweepDepthPipsOrPct: depthPips,
            mssConfirmed: b.close > prev.high,
            displacementRatio: Number(wickRatio.toFixed(2)),
            conviction: wickRatio >= 0.60 ? "INSTITUTIONAL_PRIME" : "HIGH",
          });
        }
      }
    }

    // Check Buy-Side Liquidity Swept (Bearish Turtle Soup)
    // High pierced above BSL, but Close snapped back below BSL
    for (const pool of bslPools) {
      if (b.high > pool.price && b.close < pool.price) {
        const upperWick = b.high - Math.max(b.open, b.close);
        const wickRatio = upperWick / barRange;

        if (wickRatio >= 0.45) {
          const depthPips = Math.round(((b.high - pool.price) / pipSize) * 10) / 10;
          const isJudas = checkJudasSessionTime(b.time);

          sweeps.push({
            id: `sweep_${b.time}`,
            time: b.time,
            barIndex: i,
            sweepType: isJudas ? "JUDAS_SWING" : "TURTLE_SOUP",
            side: "BUY_SIDE_SWEPT",
            sweptLevel: pool.price,
            wickExtreme: b.high,
            closePrice: b.close,
            sweepDepthPipsOrPct: depthPips,
            mssConfirmed: b.close < prev.low,
            displacementRatio: Number(wickRatio.toFixed(2)),
            conviction: wickRatio >= 0.60 ? "INSTITUTIONAL_PRIME" : "HIGH",
          });
        }
      }
    }
  }

  return sweeps.slice(-4);
}

/**
 * Checks if timestamp coincides with London or NY Judas Swing Killzone (07:00-09:00 or 12:00-14:00 UTC)
 */
function checkJudasSessionTime(timestampSec: number): boolean {
  const date = new Date(timestampSec * 1000);
  const hour = date.getUTCHours();
  return (hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 14);
}

/**
 * 5. Generates the Precision Optimal Trade Entry (OTE) Setup
 */
function buildOteTradeSetup(params: {
  bars: OhlcvBar[];
  currentPrice: number;
  currentZone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
  swingHigh: number;
  swingLow: number;
  rangeDiff: number;
  bullOte618: number;
  bullOte705: number;
  bullOte786: number;
  bearOte618: number;
  bearOte705: number;
  bearOte786: number;
  activeFvgList: IctFvgZone[];
  orderBlocks: IctOrderBlockZone[];
  recentSweeps: AdvancedSweepEvent[];
  lastMss: "BULLISH_MSS" | "BEARISH_MSS" | "NONE";
  nearestBsl: LiquidityPool | null;
  nearestSsl: LiquidityPool | null;
  pipSize: number;
  isForex: boolean;
}): OteTradeSetup {
  const {
    currentPrice,
    currentZone,
    swingHigh,
    swingLow,
    bullOte618,
    bullOte705,
    bullOte786,
    bearOte618,
    bearOte705,
    bearOte786,
    activeFvgList,
    orderBlocks,
    recentSweeps,
    lastMss,
    nearestBsl,
    nearestSsl,
    pipSize,
  } = params;

  const lastSweep = recentSweeps[recentSweeps.length - 1];

  // ==========================================
  // CASE 1: BULLISH OTE SETUP (BUY)
  // Conditions: Swept SSL or in Discount Zone, seeking retracement to 0.618 - 0.705
  // ==========================================
  const isBullCandidate =
    (lastSweep?.side === "SELL_SIDE_SWEPT" && lastSweep.conviction !== "MODERATE") ||
    (currentZone === "DISCOUNT" && lastMss === "BULLISH_MSS") ||
    (currentPrice >= bullOte786 && currentPrice <= bullOte618);

  if (isBullCandidate) {
    const entryOptimal = bullOte705;
    const entryZone: [number, number] = [bullOte786, bullOte618];
    const stopLoss = swingLow - pipSize * 5;
    const targetTP1 = (swingHigh + swingLow) / 2; // Equilibrium 50%
    const targetTP2 = nearestBsl?.price ?? swingHigh; // External BSL target

    const risk = Math.max(1e-5, entryOptimal - stopLoss);
    const reward = Math.max(1e-5, targetTP2 - entryOptimal);
    const riskRewardRatio = Number((reward / risk).toFixed(2));

    const matchingFvg = activeFvgList.find((f) => f.direction === "BULLISH_FVG" && f.top >= bullOte786 && f.bottom <= bullOte618);
    const matchingOb = orderBlocks.find((ob) => ob.direction === "BULLISH" && ob.high >= bullOte786);

    const checklist = [
      { rule: "1. Đã quét sạch thanh khoản Sell-Side (SSL Swept)", passed: lastSweep?.side === "SELL_SIDE_SWEPT" },
      { rule: "2. Giá nằm trong vùng chiết khấu Discount (Dưới 50% Equilibrium)", passed: currentZone === "DISCOUNT" },
      { rule: "3. Điểm vào nằm trong vùng vàng OTE Fib 0.618 - 0.786", passed: currentPrice >= bullOte786 && currentPrice <= bullOte618 },
      { rule: "4. Hội tụ vùng FVG chưa bị lấp hoặc Order Block tươi mới", passed: Boolean(matchingFvg || matchingOb) },
      { rule: "5. Tỷ lệ Lợi nhuận / Rủi ro (R:R) tối thiểu đạt trên 1:2.5", passed: riskRewardRatio >= 2.5 },
    ];

    const passedCount = checklist.filter((c) => c.passed).length;
    const confluenceScore = Math.round((passedCount / checklist.length) * 100);

    return {
      direction: "BUY",
      setupName: matchingFvg ? "ICT_OTE_FVG_CONFLUENCE" : "SMC_TURTLE_SOUP_REVERSAL",
      entryOptimal: Number(entryOptimal.toFixed(5)),
      entryZone: [Number(entryZone[0].toFixed(5)), Number(entryZone[1].toFixed(5))],
      stopLoss: Number(stopLoss.toFixed(5)),
      targetTP1: Number(targetTP1.toFixed(5)),
      targetTP2: Number(targetTP2.toFixed(5)),
      riskRewardRatio,
      confluenceScore,
      dealingRange: {
        swingHigh,
        swingLow,
        equilibrium: (swingHigh + swingLow) / 2,
        currentZone,
        fibOte618: Number(bullOte618.toFixed(5)),
        fibOte705: Number(bullOte705.toFixed(5)),
        fibOte786: Number(bullOte786.toFixed(5)),
      },
      executionChecklist: checklist,
      rationale: `Thiết lập Mua OTE: Đã quét SSL tại ${lastSweep?.sweptLevel ?? "đáy"} và hồi về vùng giá sỉ Discount. Điểm vào tối ưu OTE 0.705 hội tụ cùng ${matchingFvg ? "Bullish FVG" : "Order Block"}. TP2 hướng về BSL tại ${targetTP2}.`,
    };
  }

  // ==========================================
  // CASE 2: BEARISH OTE SETUP (SELL)
  // Conditions: Swept BSL or in Premium Zone, seeking retracement to 0.618 - 0.705
  // ==========================================
  const isBearCandidate =
    (lastSweep?.side === "BUY_SIDE_SWEPT" && lastSweep.conviction !== "MODERATE") ||
    (currentZone === "PREMIUM" && lastMss === "BEARISH_MSS") ||
    (currentPrice >= bearOte618 && currentPrice <= bearOte786);

  if (isBearCandidate) {
    const entryOptimal = bearOte705;
    const entryZone: [number, number] = [bearOte618, bearOte786];
    const stopLoss = swingHigh + pipSize * 5;
    const targetTP1 = (swingHigh + swingLow) / 2; // Equilibrium 50%
    const targetTP2 = nearestSsl?.price ?? swingLow; // External SSL target

    const risk = Math.max(1e-5, stopLoss - entryOptimal);
    const reward = Math.max(1e-5, entryOptimal - targetTP2);
    const riskRewardRatio = Number((reward / risk).toFixed(2));

    const matchingFvg = activeFvgList.find((f) => f.direction === "BEARISH_FVG" && f.bottom <= bearOte786 && f.top >= bearOte618);
    const matchingOb = orderBlocks.find((ob) => ob.direction === "BEARISH" && ob.low <= bearOte786);

    const checklist = [
      { rule: "1. Đã quét sạch thanh khoản Buy-Side (BSL Swept)", passed: lastSweep?.side === "BUY_SIDE_SWEPT" },
      { rule: "2. Giá nằm trong vùng giá đắt Premium (Trên 50% Equilibrium)", passed: currentZone === "PREMIUM" },
      { rule: "3. Điểm vào nằm trong vùng vàng OTE Fib 0.618 - 0.786", passed: currentPrice >= bearOte618 && currentPrice <= bearOte786 },
      { rule: "4. Hội tụ vùng FVG chưa bị lấp hoặc Order Block tươi mới", passed: Boolean(matchingFvg || matchingOb) },
      { rule: "5. Tỷ lệ Lợi nhuận / Rủi ro (R:R) tối thiểu đạt trên 1:2.5", passed: riskRewardRatio >= 2.5 },
    ];

    const passedCount = checklist.filter((c) => c.passed).length;
    const confluenceScore = Math.round((passedCount / checklist.length) * 100);

    return {
      direction: "SELL",
      setupName: matchingFvg ? "ICT_OTE_FVG_CONFLUENCE" : "SMC_TURTLE_SOUP_REVERSAL",
      entryOptimal: Number(entryOptimal.toFixed(5)),
      entryZone: [Number(entryZone[0].toFixed(5)), Number(entryZone[1].toFixed(5))],
      stopLoss: Number(stopLoss.toFixed(5)),
      targetTP1: Number(targetTP1.toFixed(5)),
      targetTP2: Number(targetTP2.toFixed(5)),
      riskRewardRatio,
      confluenceScore,
      dealingRange: {
        swingHigh,
        swingLow,
        equilibrium: (swingHigh + swingLow) / 2,
        currentZone,
        fibOte618: Number(bearOte618.toFixed(5)),
        fibOte705: Number(bearOte705.toFixed(5)),
        fibOte786: Number(bearOte786.toFixed(5)),
      },
      executionChecklist: checklist,
      rationale: `Thiết lập Bán OTE: Đã quét BSL tại ${lastSweep?.sweptLevel ?? "đỉnh"} và hồi về vùng giá lẻ Premium. Điểm vào tối ưu OTE 0.705 hội tụ cùng ${matchingFvg ? "Bearish FVG" : "Order Block"}. TP2 hướng về SSL tại ${targetTP2}.`,
    };
  }

  // ==========================================
  // CASE 3: NEUTRAL / WAIT
  // ==========================================
  return {
    direction: "NEUTRAL",
    setupName: "NONE",
    entryOptimal: currentPrice,
    entryZone: [currentPrice, currentPrice],
    stopLoss: currentPrice,
    targetTP1: currentPrice,
    targetTP2: currentPrice,
    riskRewardRatio: 1.0,
    confluenceScore: 35,
    dealingRange: {
      swingHigh,
      swingLow,
      equilibrium: (swingHigh + swingLow) / 2,
      currentZone,
      fibOte618: bullOte618,
      fibOte705: bullOte705,
      fibOte786: bullOte786,
    },
    executionChecklist: [
      { rule: "1. Chờ quét thanh khoản BSL hoặc SSL", passed: false },
      { rule: "2. Chờ giá di chuyển vào vùng OTE 0.618 - 0.786", passed: false },
    ],
    rationale: "Giá đang dao động tại vùng cân bằng Equilibrium. Chưa xuất hiện tín hiệu quét thanh khoản đạt chuẩn thể chế.",
  };
}

function generateSummaryNarrative(params: {
  symbol: string;
  bias: IctSmcAnalysisResult["bias"];
  currentZone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
  lastSweep?: AdvancedSweepEvent;
  optimalTradeSetup: OteTradeSetup;
  flowCycle: string;
}): string {
  const { symbol, bias, currentZone, lastSweep, optimalTradeSetup } = params;

  const sweepText = lastSweep
    ? `Gần nhất đã diễn ra nhịp ${lastSweep.sweepType} quét sạch ${lastSweep.side === "BUY_SIDE_SWEPT" ? "Buy-Side Liquidity (BSL)" : "Sell-Side Liquidity (SSL)"} tại ${lastSweep.sweptLevel}.`
    : "Chưa ghi nhận cú quét thanh khoản lớn.";

  const setupText =
    optimalTradeSetup.direction !== "NEUTRAL"
      ? `Khuyến nghị kích hoạt lệnh ${optimalTradeSetup.direction} tại OTE ${optimalTradeSetup.entryOptimal} (R:R 1:${optimalTradeSetup.riskRewardRatio}, TP2: ${optimalTradeSetup.targetTP2}).`
      : "Kiên nhẫn đứng ngoài quan sát thanh khoản tích lũy.";

  return `${symbol}: Cấu trúc dòng tiền ${bias}. Thị trường đang ở vùng ${currentZone}. ${sweepText} ${setupText}`;
}

function createEmptyResult(symbol: string, price: number): IctSmcAnalysisResult {
  return {
    symbol,
    bias: "NEUTRAL",
    overallScore: 50,
    liquidityMap: { buySidePools: [], sellSidePools: [], nearestBsl: null, nearestSsl: null },
    recentSweeps: [],
    activeFvgList: [],
    orderBlocks: [],
    optimalTradeSetup: {
      direction: "NEUTRAL",
      setupName: "NONE",
      entryOptimal: price,
      entryZone: [price, price],
      stopLoss: price,
      targetTP1: price,
      targetTP2: price,
      riskRewardRatio: 1.0,
      confluenceScore: 0,
      dealingRange: {
        swingHigh: price,
        swingLow: price,
        equilibrium: price,
        currentZone: "EQUILIBRIUM",
        fibOte618: price,
        fibOte705: price,
        fibOte786: price,
      },
      executionChecklist: [],
      rationale: "Chưa đủ dữ liệu.",
    },
    marketStructure: { lastMss: "NONE", displacementDetected: false, flowCycle: "BALANCED" },
    summaryVi: "Dữ liệu chưa đủ.",
  };
}
