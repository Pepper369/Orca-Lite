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
import { atr, ema } from "../technical";
import {
  filterOnlineRegimeHmm,
  forecastHarRealizedVolatility,
  normCdf,
} from "./advanced-quant-math";
import { estimateClvOrderFlowImbalance, getAssetPipSize, normalizeEpochMs, roundPrice } from "./asset-precision";

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

export interface ExternalLiquidityMagnet {
  price: number;
  side: "BUY_SIDE" | "SELL_SIDE";
  type: "SHORT_LIQ_CLUSTER" | "LONG_LIQ_CLUSTER";
  notionalUsd: number;
  isDominant?: boolean;
}

export interface LiquidityMagnetTarget {
  id: string;
  side: "BUY_SIDE" | "SELL_SIDE";
  poolType: "BSL" | "SSL" | "EQH" | "EQL" | "SHORT_LIQ_CLUSTER" | "LONG_LIQ_CLUSTER";
  price: number;
  distanceAtr: number;
  distancePipsOrPct: number;
  poolStrength: number; // 0 - 100
  pathImpedance: number; // 0 - 0.85 (obstacle density from opposing OB/FVG)
  gravityScore: number;
  reachProbabilityPct: number; // 5 - 95% first-passage barrier reach estimate
  etaBars: number; // 1 - 24 bars
  expectedReaction: "SWEEP_REVERSAL" | "EXPANSION_BREAKOUT" | "ABSORPTION_STALL";
  rationaleVi: string;
}

export interface ForwardLiquidityForecast {
  horizonBars: number;
  directionalFlowThrust: number; // -100 to +100
  flowBias: "BULLISH_MAGNET_PULL" | "BEARISH_MAGNET_PULL" | "BALANCED_RANGE";
  primaryTarget: LiquidityMagnetTarget | null;
  aboveTarget: LiquidityMagnetTarget | null;
  belowTarget: LiquidityMagnetTarget | null;
  candidates: LiquidityMagnetTarget[];
  summaryVi: string;
}

export interface IctBprZone {
  id: string;
  barIndex: number;
  direction: "BULLISH_BPR" | "BEARISH_BPR";
  top: number;
  bottom: number;
  midpoint: number;
}

export interface HtfPoiContext {
  alignedSide: "BUY" | "SELL" | "NONE";
  poiType: "HTF_FVG" | "HTF_ORDER_BLOCK" | "HTF_BREAKER" | "HTF_OTE_ZONE" | "NONE";
  zoneLow: number;
  zoneHigh: number;
  rationaleVi: string;
}

export interface IctAmdPowerOf3Context {
  phase: "ACCUMULATION" | "MANIPULATION_JUDAS" | "DISTRIBUTION_EXPANSION" | "NEUTRAL";
  manipulationSide: "BEAR_TRAP_LOW_SWEEP" | "BULL_TRAP_HIGH_SWEEP" | "NONE";
  favoredDirection: "BUY" | "SELL" | "NEUTRAL";
  boxHigh: number;
  boxLow: number;
  targetOppositeEdge: number | null;
  rationaleVi: string;
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
  forwardLiquidityForecast?: ForwardLiquidityForecast;
  recentSweeps: AdvancedSweepEvent[];
  activeFvgList: IctFvgZone[];
  bprZones?: IctBprZone[];
  htfPoiContext?: HtfPoiContext | null;
  amdPowerOf3?: IctAmdPowerOf3Context;
  orderBlocks: IctOrderBlockZone[];
  optimalTradeSetup: OteTradeSetup;
  marketStructure: {
    lastMss: "BULLISH_MSS" | "BEARISH_MSS" | "NONE";
    displacementDetected: boolean;
    flowCycle: "IRL_TO_ERL" | "ERL_TO_IRL" | "BALANCED";
  };
  summaryVi: string;
}

export interface LiquidityFlowContext {
  flowIntensityIndex?: number | null;
  orderBookImbalance?: number | null;
  fundingRate?: number | null;
  csmBaseMinusQuote?: number | null;
  externalMagnets?: ExternalLiquidityMagnet[] | null;
}

/**
 * Main Analysis Engine: Evaluates OHLCV candlestick series through full ICT & SMC suite
 * plus causal Forward Liquidity Pool Money-Flow forecasting.
 */
export function analyzeIctSmcLiquidity(params: {
  symbol: string;
  bars: OhlcvBar[];
  htfBars?: OhlcvBar[] | null;
  currentPrice?: number | null;
  assetType?: "FOREX" | "CRYPTO" | "STOCK";
  pipSize?: number;
  flowContext?: LiquidityFlowContext;
  precomputed?: {
    closes?: number[];
    ema9?: (number | null)[];
    ema21?: (number | null)[];
    atrVal?: number | null;
  };
}): IctSmcAnalysisResult {
  const {
    symbol,
    bars,
    htfBars,
    currentPrice: inputPrice,
    assetType = "FOREX",
    pipSize: inputPipSize,
    flowContext,
    precomputed,
  } = params;

  const n = bars.length;
  const currentPrice = inputPrice ?? (n > 0 ? bars[n - 1].close : 1.0);
  const isForex = assetType === "FOREX";
  const pipSize = inputPipSize ?? getAssetPipSize(symbol, assetType, currentPrice);

  if (n < 25) {
    return createEmptyResult(symbol, currentPrice);
  }

  // 1. LIQUIDITY MAP (BSL / SSL / EQH / EQL)
  const { allBslPools, allSslPools, buySidePools, sellSidePools } = detectLiquidityPools(bars, pipSize);
  const bslAbove = allBslPools.filter((p) => p.price > currentPrice && p.status === "UNTOUCHED");
  const sslBelow = allSslPools.filter((p) => p.price < currentPrice && p.status === "UNTOUCHED");
  const nearestBsl = bslAbove.length > 0 ? bslAbove.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const nearestSsl = sslBelow.length > 0 ? sslBelow.reduce((a, b) => (b.price > a.price ? b : a)) : null;

  // 2. FAIR VALUE GAPS (FVG, IFVG & BPR)
  const { activeFvgs: activeFvgList, bprZones } = detectFairValueGapsAndBpr(bars, pipSize);

  // 3. ORDER BLOCKS & BREAKER BLOCKS
  const orderBlocks = detectOrderBlocksAndBreakers(bars);

  // 3b. MULTI-TIMEFRAME HTF POI CONFLUENCE (strictly causal)
  const htfPoiContext =
    htfBars && htfBars.length >= 16
      ? evaluateHtfPoiConfluence(htfBars, currentPrice, pipSize, assetType, symbol)
      : null;

  // 4. PRECISION LIQUIDITY SWEEPS (Turtle Soup, Judas Swing, Purge & Revert) - strictly causal
  const recentSweeps = detectAdvancedSweeps(bars, allBslPools, allSslPools, pipSize, isForex);

  // 5. DEALING RANGE & OTE (Optimal Trade Entry)
  const winStart = Math.max(0, n - 45);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (let i = winStart; i < n; i++) {
    if (bars[i]!.high > swingHigh) swingHigh = bars[i]!.high;
    if (bars[i]!.low < swingLow) swingLow = bars[i]!.low;
  }
  const equilibrium = (swingHigh + swingLow) / 2;
  const rangeDiff = Math.max(1e-12, swingHigh - swingLow);

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
  let localHigh = -Infinity;
  let localLow = Infinity;
  for (let i = Math.max(0, n - 15); i < n - 2; i++) {
    if (bars[i]!.high > localHigh) localHigh = bars[i]!.high;
    if (bars[i]!.low < localLow) localLow = bars[i]!.low;
  }

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
  const atrVal = precomputed?.atrVal ?? atr(bars, 14) ?? rangeDiff * 0.15;
  const closes = precomputed?.closes ?? bars.map((b) => b.close);
  const e9 = (precomputed?.ema9 ? precomputed.ema9[n - 1] : ema(closes, 9)[n - 1]) ?? currentPrice;
  const e21 = (precomputed?.ema21 ? precomputed.ema21[n - 1] : ema(closes, 21)[n - 1]) ?? currentPrice;
  const trendDir: 1 | -1 | 0 = e9 > e21 && currentPrice >= e21 ? 1 : e9 < e21 && currentPrice <= e21 ? -1 : 0;

  const optimalTradeSetup = buildOteTradeSetup({
    symbol,
    assetType,
    bars,
    currentPrice,
    currentZone,
    swingHigh,
    swingLow,
    rangeDiff,
    atr14: atrVal,
    trendDir,
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

  const forwardLiquidityForecast = forecastForwardLiquidityFlow({
    symbol,
    assetType,
    bars,
    currentPrice,
    pipSize,
    atr14: atrVal,
    trendDir,
    allBslPools,
    allSslPools,
    activeFvgList,
    orderBlocks,
    flowContext,
  });

  const summaryVi = generateSummaryNarrative({
    symbol,
    bias,
    currentZone,
    lastSweep,
    optimalTradeSetup,
    flowCycle,
  });

  const amdPowerOf3 = detectIctAmdPowerOf3({
    bars,
    currentPrice,
    atr14: atrVal,
    recentSweeps,
    lastMss,
    displacementDetected,
    pipSize,
    symbol,
    assetType: isForex ? "FOREX" : "CRYPTO",
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
    forwardLiquidityForecast,
    recentSweeps,
    activeFvgList,
    bprZones,
    htfPoiContext,
    amdPowerOf3,
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
 * Computes causal Forward Liquidity Pool Money-Flow Forecast (Draw on Liquidity):
 * Estimates magnetic pull gravity, path impedance (opposing OB/FVG vs FVG vacuum),
 * First-Passage barrier reach probability over H=12 bars, and Sweep-Reversal vs Breakout reaction.
 */
export function forecastForwardLiquidityFlow(params: {
  symbol: string;
  assetType: "FOREX" | "CRYPTO" | "STOCK";
  bars: OhlcvBar[];
  currentPrice: number;
  pipSize: number;
  atr14: number;
  trendDir: 1 | -1 | 0;
  allBslPools: LiquidityPool[];
  allSslPools: LiquidityPool[];
  activeFvgList: IctFvgZone[];
  orderBlocks: IctOrderBlockZone[];
  flowContext?: LiquidityFlowContext;
}): ForwardLiquidityForecast {
  const {
    symbol,
    assetType,
    bars,
    currentPrice,
    pipSize,
    atr14,
    trendDir,
    allBslPools,
    allSslPools,
    activeFvgList,
    orderBlocks,
    flowContext,
  } = params;

  const n = bars.length;
  const horizonBars = 12;
  const effAtr = Math.max(pipSize * 2, atr14 > 0 ? atr14 : currentPrice * 0.005);
  const fmtP = (p: number) => roundPrice(p, symbol, assetType);

  // 1. Strictly causal directional money-flow thrust [-100 .. +100]
  const clv12 = estimateClvOrderFlowImbalance(bars, 12);
  const clv4 = estimateClvOrderFlowImbalance(bars, 4);

  let recentDeltaSum = 0;
  let totalRecentVol = 0;
  for (let i = Math.max(0, n - 5); i < n; i++) {
    const b = bars[i]!;
    const v = b.volume > 0 ? b.volume : 1;
    const rng = Math.max(1e-12, b.high - b.low);
    const barClv = ((b.close - b.low) - (b.high - b.close)) / rng;
    recentDeltaSum += v * barClv;
    totalRecentVol += v;
  }
  const cvdSlopeNorm = totalRecentVol > 0 ? Math.max(-100, Math.min(100, (recentDeltaSum / totalRecentVol) * 120)) : 0;

  let rawThrust = clv12 * 0.35 + clv4 * 0.28 + cvdSlopeNorm * 0.22 + trendDir * 15;
  if (flowContext?.flowIntensityIndex != null) {
    rawThrust = rawThrust * 0.72 + flowContext.flowIntensityIndex * 0.28;
  }
  if (flowContext?.orderBookImbalance != null) {
    rawThrust += Math.max(-22, Math.min(22, flowContext.orderBookImbalance * 0.22));
  }
  if (assetType === "FOREX" && flowContext?.csmBaseMinusQuote != null) {
    rawThrust += Math.max(-16, Math.min(16, flowContext.csmBaseMinusQuote * 4));
  }
  if (assetType === "CRYPTO" && flowContext?.fundingRate != null) {
    // Deep negative funding accelerates upside short-squeeze pull; extreme positive threatens downside long flush
    rawThrust -= Math.tanh(flowContext.fundingRate / 0.0005) * 12;
  }
  const directionalFlowThrust = Math.round(Math.max(-100, Math.min(100, rawThrust)));

  const flowBias: ForwardLiquidityForecast["flowBias"] =
    directionalFlowThrust >= 14
      ? "BULLISH_MAGNET_PULL"
      : directionalFlowThrust <= -14
        ? "BEARISH_MAGNET_PULL"
        : "BALANCED_RANGE";

  // Reference volume for pool normalization
  const vols = bars.map((b) => (b.volume > 0 ? b.volume : 1)).sort((a, b) => a - b);
  const medianVol = vols[Math.floor(vols.length / 2)] || 1;

  // Build candidate pool records above and below currentPrice
  interface RawPoolCandidate {
    id: string;
    side: "BUY_SIDE" | "SELL_SIDE";
    poolType: LiquidityMagnetTarget["poolType"];
    price: number;
    baseStrength: number;
    recencyBonus: number;
    volBoost: number;
    isExternalSqueeze: boolean;
  }

  const rawCandidates: RawPoolCandidate[] = [];
  for (const p of allBslPools) {
    if (p.status !== "UNTOUCHED" || p.price <= currentPrice + pipSize * 0.5) continue;
    const base = p.significance === "HIGH_EXTERNAL" ? 72 : p.significance === "MEDIUM_INTERNAL" ? 56 : 45;
    const recency = Math.exp(-Math.max(0, n - 1 - p.barIndex) / 45) * 10;
    const volBoost = p.volumeNearPool != null ? Math.min(18, (p.volumeNearPool / Math.max(1, medianVol * 2.5)) * 12) : 0;
    rawCandidates.push({
      id: p.id,
      side: "BUY_SIDE",
      poolType: p.type === "EQH" ? "EQH" : "BSL",
      price: p.price,
      baseStrength: base,
      recencyBonus: recency,
      volBoost,
      isExternalSqueeze: false,
    });
  }

  for (const p of allSslPools) {
    if (p.status !== "UNTOUCHED" || p.price >= currentPrice - pipSize * 0.5) continue;
    const base = p.significance === "HIGH_EXTERNAL" ? 72 : p.significance === "MEDIUM_INTERNAL" ? 56 : 45;
    const recency = Math.exp(-Math.max(0, n - 1 - p.barIndex) / 45) * 10;
    const volBoost = p.volumeNearPool != null ? Math.min(18, (p.volumeNearPool / Math.max(1, medianVol * 2.5)) * 12) : 0;
    rawCandidates.push({
      id: p.id,
      side: "SELL_SIDE",
      poolType: p.type === "EQL" ? "EQL" : "SSL",
      price: p.price,
      baseStrength: base,
      recencyBonus: recency,
      volBoost,
      isExternalSqueeze: false,
    });
  }

  if (flowContext?.externalMagnets?.length) {
    for (const m of flowContext.externalMagnets) {
      if (m.price <= 0 || Math.abs(m.price - currentPrice) < pipSize) continue;
      const validSide =
        (m.side === "BUY_SIDE" && m.price > currentPrice) ||
        (m.side === "SELL_SIDE" && m.price < currentPrice);
      if (!validSide) continue;
      const sizeBoost = m.notionalUsd > 0 ? Math.min(18, Math.max(0, Math.log10(m.notionalUsd) * 2)) : 6;
      rawCandidates.push({
        id: `ext_${m.type}_${Math.round(m.price * 1e6)}`,
        side: m.side,
        poolType: m.type,
        price: m.price,
        baseStrength: m.isDominant ? 76 : 60,
        recencyBonus: 8,
        volBoost: sizeBoost,
        isExternalSqueeze: Boolean(m.isDominant),
      });
    }
  }

  const harVol = forecastHarRealizedVolatility(bars, assetType === "CRYPTO" ? 365 : 252);
  const hmmRegime = filterOnlineRegimeHmm(bars);
  const regimeDriftScale =
    1 + 0.12 * (hmmRegime.probabilities.trendExpansion - hmmRegime.probabilities.meanRevertLowVol);
  const harDiffusionScale = Math.max(0.85, Math.min(1.25, harVol.expansionRatio));

  const scored: LiquidityMagnetTarget[] = [];
  for (const c of rawCandidates) {
    const isAbove = c.side === "BUY_SIDE";
    const dirSign = isAbove ? 1 : -1;
    const rawDist = Math.abs(c.price - currentPrice);
    const distanceAtr = rawDist / effAtr;
    if (distanceAtr > 8.5) continue; // Ignore remote historical outliers beyond realistic 12-bar horizon

    // Path Impedance: opposing unmitigated Order Blocks & FVGs between currentPrice and pool slow flow down,
    // while same-direction unmitigated FVGs act as low-resistance liquidity vacuums.
    const loP = Math.min(currentPrice, c.price);
    const hiP = Math.max(currentPrice, c.price);
    let impedance = 0;
    for (const ob of orderBlocks) {
      if (ob.meanThreshold <= loP || ob.meanThreshold >= hiP) continue;
      if ((isAbove && ob.direction === "BEARISH") || (!isAbove && ob.direction === "BULLISH")) {
        impedance += ob.status === "FRESH" ? 0.22 : 0.12;
      }
    }
    for (const fvg of activeFvgList) {
      if (fvg.consequentEncroachment <= loP || fvg.consequentEncroachment >= hiP) continue;
      if ((isAbove && fvg.direction === "BEARISH_FVG") || (!isAbove && fvg.direction === "BULLISH_FVG")) {
        impedance += 0.15;
      } else {
        impedance -= 0.08;
      }
    }
    const pathImpedance = Number(Math.max(0, Math.min(0.85, impedance)).toFixed(2));
    const poolStrength = Math.round(Math.min(100, c.baseStrength + c.recencyBonus + c.volBoost));

    // Stochastic First-Passage Barrier Reach Probability over H = 12 bars
    // Scaled causally by online HMM regime drift and HAR-RV realized volatility expansion
    const alignedThrust = (dirSign * directionalFlowThrust) / 100;
    const mu = alignedThrust * 0.42 * regimeDriftScale * (1 - 0.45 * pathImpedance);
    const d = Math.max(0.12, distanceAtr);
    const rootH = Math.sqrt(horizonBars) * harDiffusionScale;
    const z1 = (mu * horizonBars - d) / rootH;
    const z2 = (-mu * horizonBars - d) / rootH;
    const expTerm = Math.exp(
      Math.max(-12, Math.min(4, (2 * mu * d) / Math.max(0.5, harDiffusionScale * harDiffusionScale))),
    );
    const pReach = Math.max(0.05, Math.min(0.95, normCdf(z1) + expTerm * normCdf(z2)));
    const reachProbabilityPct = Math.round(pReach * 100);

    const etaBars = Math.max(
      1,
      Math.min(24, Math.round(d / Math.max(0.18, 0.36 + mu))),
    );

    const flowAlignFactor = 1 + 0.55 * Math.max(0, alignedThrust) - 0.25 * Math.max(0, -alignedThrust);
    const gravityScore = Number(
      ((poolStrength * flowAlignFactor) / (Math.pow(Math.max(0.45, distanceAtr), 1.1) * (1 + pathImpedance))).toFixed(1),
    );

    let expectedReaction: LiquidityMagnetTarget["expectedReaction"] = "ABSORPTION_STALL";
    if (
      dirSign * directionalFlowThrust >= 24 &&
      pathImpedance <= 0.30 &&
      (trendDir === dirSign || c.isExternalSqueeze)
    ) {
      expectedReaction = "EXPANSION_BREAKOUT";
    } else if (
      (c.poolType === "EQH" || c.poolType === "EQL" || poolStrength >= 68) &&
      (trendDir !== dirSign || pathImpedance >= 0.25 || distanceAtr >= 1.15)
    ) {
      expectedReaction = "SWEEP_REVERSAL";
    }

    const distancePipsOrPct =
      assetType === "CRYPTO"
        ? Number(((rawDist / Math.max(1e-12, currentPrice)) * 100).toFixed(2))
        : Number((rawDist / pipSize).toFixed(1));
    const unitLabel = assetType === "CRYPTO" ? "%" : " pips";
    const reactionText =
      expectedReaction === "SWEEP_REVERSAL"
        ? "Khả năng quét râu đảo chiều"
        : expectedReaction === "EXPANSION_BREAKOUT"
          ? "Dòng tiền thuận pha dễ xuyên thủng"
          : "Có vùng cản hấp thụ trung gian";

    scored.push({
      id: c.id,
      side: c.side,
      poolType: c.poolType,
      price: fmtP(c.price),
      distanceAtr: Number(distanceAtr.toFixed(2)),
      distancePipsOrPct,
      poolStrength,
      pathImpedance,
      gravityScore,
      reachProbabilityPct,
      etaBars,
      expectedReaction,
      rationaleVi: `${c.poolType} @ ${fmtP(c.price)} (${isAbove ? "+" : "-"}${distancePipsOrPct}${unitLabel}, ${distanceAtr.toFixed(1)} ATR): P(chạm)=${reachProbabilityPct}% trong ~${etaBars} nến — ${reactionText}.`,
    });
  }

  scored.sort((a, b) => b.gravityScore - a.gravityScore);
  const aboveTarget = scored.find((t) => t.side === "BUY_SIDE") ?? null;
  const belowTarget = scored.find((t) => t.side === "SELL_SIDE") ?? null;
  const primaryTarget = scored[0] ?? null;

  const summaryVi = primaryTarget
    ? `Nam châm thanh khoản ưu tiên: ${primaryTarget.poolType} @ ${primaryTarget.price} (${primaryTarget.reachProbabilityPct}% chạm trong ~${primaryTarget.etaBars} nến · ${primaryTarget.expectedReaction === "SWEEP_REVERSAL" ? "Cảnh báo quét đảo chiều" : primaryTarget.expectedReaction === "EXPANSION_BREAKOUT" ? "Kịch bản bứt phá" : "Hấp thụ dần"}).`
    : "Chưa có bể thanh khoản gần trong bán kính biến động dự báo.";

  return {
    horizonBars,
    directionalFlowThrust,
    flowBias,
    primaryTarget,
    aboveTarget,
    belowTarget,
    candidates: scored.slice(0, 6),
    summaryVi,
  };
}

/**
 * 1. Detects Swing Highs & Lows to identify Liquidity Pools (BSL, SSL, EQH, EQL)
 */
function detectLiquidityPools(
  bars: OhlcvBar[],
  pipSize: number
): {
  allBslPools: LiquidityPool[];
  allSslPools: LiquidityPool[];
  buySidePools: LiquidityPool[];
  sellSidePools: LiquidityPool[];
} {
  const buySidePools: LiquidityPool[] = [];
  const sellSidePools: LiquidityPool[] = [];
  const n = bars.length;

  for (let i = 2; i < n - 2; i++) {
    const b = bars[i];
    const hasLeft3 = i >= 3;
    const hasRight3 = i < n - 3;

    // 2-bar causal minor fractal (strictly confirmed by bars [i-2..i+2] before bar i+3 opens)
    const isMinorHigh =
      b.high > bars[i - 1].high &&
      b.high > bars[i - 2].high &&
      b.high > bars[i + 1].high &&
      b.high > bars[i + 2].high;
    const isSwingHigh =
      hasLeft3 &&
      hasRight3 &&
      isMinorHigh &&
      b.high > bars[i - 3].high &&
      b.high > bars[i + 3].high;

    const isMinorLow =
      b.low < bars[i - 1].low &&
      b.low < bars[i - 2].low &&
      b.low < bars[i + 1].low &&
      b.low < bars[i + 2].low;
    const isSwingLow =
      hasLeft3 &&
      hasRight3 &&
      isMinorLow &&
      b.low < bars[i - 3].low &&
      b.low < bars[i + 3].low;

    if (isSwingHigh || isMinorHigh) {
      // Check if Equal Highs (EQH) with a recent pool within 3 pips
      const isEqh = buySidePools.some((p) => Math.abs(p.price - b.high) <= pipSize * 3);
      buySidePools.push({
        id: `bsl_${b.time}`,
        type: isEqh ? "EQH" : "BSL",
        price: b.high,
        time: b.time,
        barIndex: i,
        significance: isEqh ? "HIGH_EXTERNAL" : isSwingHigh ? "MEDIUM_INTERNAL" : "MINOR",
        status: "UNTOUCHED",
      });
    }

    if (isSwingLow || isMinorLow) {
      // Check if Equal Lows (EQL)
      const isEql = sellSidePools.some((p) => Math.abs(p.price - b.low) <= pipSize * 3);
      sellSidePools.push({
        id: `ssl_${b.time}`,
        type: isEql ? "EQL" : "SSL",
        price: b.low,
        time: b.time,
        barIndex: i,
        significance: isEql ? "HIGH_EXTERNAL" : isSwingLow ? "MEDIUM_INTERNAL" : "MINOR",
        status: "UNTOUCHED",
      });
    }
  }

  // Extract causal Previous Day High/Low (PDH/PDL) & Asian Session High/Low (00:00-06:00 UTC) from closed sessions (i < n - 3)
  if (n >= 24) {
    const lastDayKey = Math.floor(normalizeEpochMs(bars[n - 1]!.time) / 86_400_000);
    let pdh = -Infinity;
    let pdhIdx = -1;
    let pdl = Infinity;
    let pdlIdx = -1;
    let asianHigh = -Infinity;
    let asianHighIdx = -1;
    let asianLow = Infinity;
    let asianLowIdx = -1;

    for (let i = 0; i < n - 3; i++) {
      const b = bars[i]!;
      const ms = normalizeEpochMs(b.time);
      if (ms <= 0) continue;
      const dayKey = Math.floor(ms / 86_400_000);
      const utcHour = new Date(ms).getUTCHours();

      if (dayKey === lastDayKey - 1) {
        if (b.high > pdh) {
          pdh = b.high;
          pdhIdx = i;
        }
        if (b.low < pdl) {
          pdl = b.low;
          pdlIdx = i;
        }
      }
      if (dayKey === lastDayKey && utcHour >= 0 && utcHour < 6) {
        if (b.high > asianHigh) {
          asianHigh = b.high;
          asianHighIdx = i;
        }
        if (b.low < asianLow) {
          asianLow = b.low;
          asianLowIdx = i;
        }
      }
    }

    const lastCurrentHour = new Date(normalizeEpochMs(bars[n - 1]!.time)).getUTCHours();
    if (pdhIdx >= 0 && Number.isFinite(pdh) && !buySidePools.some((p) => Math.abs(p.price - pdh) <= pipSize * 3)) {
      buySidePools.push({
        id: `bsl_pdh_${bars[pdhIdx]!.time}`,
        type: "BSL",
        price: pdh,
        time: bars[pdhIdx]!.time,
        barIndex: pdhIdx,
        significance: "HIGH_EXTERNAL",
        status: "UNTOUCHED",
      });
    }
    if (pdlIdx >= 0 && Number.isFinite(pdl) && !sellSidePools.some((p) => Math.abs(p.price - pdl) <= pipSize * 3)) {
      sellSidePools.push({
        id: `ssl_pdl_${bars[pdlIdx]!.time}`,
        type: "SSL",
        price: pdl,
        time: bars[pdlIdx]!.time,
        barIndex: pdlIdx,
        significance: "HIGH_EXTERNAL",
        status: "UNTOUCHED",
      });
    }
    if (
      lastCurrentHour >= 6 &&
      asianHighIdx >= 0 &&
      Number.isFinite(asianHigh) &&
      !buySidePools.some((p) => Math.abs(p.price - asianHigh) <= pipSize * 3)
    ) {
      buySidePools.push({
        id: `bsl_ash_${bars[asianHighIdx]!.time}`,
        type: "BSL",
        price: asianHigh,
        time: bars[asianHighIdx]!.time,
        barIndex: asianHighIdx,
        significance: "HIGH_EXTERNAL",
        status: "UNTOUCHED",
      });
    }
    if (
      lastCurrentHour >= 6 &&
      asianLowIdx >= 0 &&
      Number.isFinite(asianLow) &&
      !sellSidePools.some((p) => Math.abs(p.price - asianLow) <= pipSize * 3)
    ) {
      sellSidePools.push({
        id: `ssl_asl_${bars[asianLowIdx]!.time}`,
        type: "SSL",
        price: asianLow,
        time: bars[asianLowIdx]!.time,
        barIndex: asianLowIdx,
        significance: "HIGH_EXTERNAL",
        status: "UNTOUCHED",
      });
    }
  }

  // Strictly causal sweep status: only mark SWEPT from bars AFTER the pivot confirmed (j > pool.barIndex + 3)
  let rangeSum = 0;
  const rngStart = Math.max(0, n - 20);
  for (let k = rngStart; k < n; k++) rangeSum += Math.max(pipSize, bars[k]!.high - bars[k]!.low);
  const avgRange = rangeSum / Math.max(1, n - rngStart);
  const proxBand = Math.max(pipSize * 3, avgRange * 0.35);

  const annotatePool = (pool: LiquidityPool, isBsl: boolean) => {
    for (let j = pool.barIndex + 4; j < n; j++) {
      if (isBsl ? bars[j].high > pool.price : bars[j].low < pool.price) {
        pool.status = "SWEPT";
        break;
      }
    }
    let volSum = 0;
    for (let k = 0; k < n; k++) {
      const b = bars[k]!;
      if (b.high >= pool.price - proxBand && b.low <= pool.price + proxBand) {
        volSum += b.volume > 0 ? b.volume : 1;
      }
    }
    pool.volumeNearPool = Math.round(volSum);
  };

    for (const pool of buySidePools) annotatePool(pool, true);
    for (const pool of sellSidePools) annotatePool(pool, false);

    buySidePools.sort((a, b) => a.barIndex - b.barIndex);
    sellSidePools.sort((a, b) => a.barIndex - b.barIndex);

    return {
      allBslPools: buySidePools,
      allSslPools: sellSidePools,
      buySidePools: buySidePools.slice(-6),
      sellSidePools: sellSidePools.slice(-6),
    };
  }

  export const extractCausalLiquidityPools = detectLiquidityPools;

  /**
   * 2. Detects Fair Value Gaps (FVG), Inversion FVGs (IFVG), Balanced Price Ranges (BPR)
   *    and computes Consequent Encroachment (50%)
   */
  function detectFairValueGapsAndBpr(
    bars: OhlcvBar[],
    pipSize: number,
  ): { activeFvgs: IctFvgZone[]; bprZones: IctBprZone[] } {
    const fvgs: IctFvgZone[] = [];
    const n = bars.length;
    const minGapPips = 2;

  for (let i = 2; i < n; i++) {
    const c0 = bars[i - 2];
    const c1 = bars[i - 1];
    const c2 = bars[i];

    // Bullish FVG
    if (c2.low > c0.high) {
      const top = c2.low;
      const bottom = c0.high;
      const gapPips = (top - bottom) / Math.max(1e-12, pipSize);

      if (gapPips >= minGapPips) {
        let mitigated = false;
        let isInversion = false;
        let lowestRetrace = top;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].low < lowestRetrace) lowestRetrace = bars[j].low;
          if (bars[j].low <= bottom) {
            mitigated = true;
          }
          if (mitigated && bars[j].close < bottom - pipSize * 0.5) {
            isInversion = true;
            break;
          }
        }
        const mitigationPct = Math.min(100, Math.max(0, ((top - lowestRetrace) / Math.max(1e-12, top - bottom)) * 100));

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
          isInversion,
        });
      }
    }

    // Bearish FVG
    if (c2.high < c0.low) {
      const top = c0.low;
      const bottom = c2.high;
      const gapPips = (top - bottom) / Math.max(1e-12, pipSize);

      if (gapPips >= minGapPips) {
        let mitigated = false;
        let isInversion = false;
        let highestRetrace = bottom;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].high > highestRetrace) highestRetrace = bars[j].high;
          if (bars[j].high >= top) {
            mitigated = true;
          }
          if (mitigated && bars[j].close > top + pipSize * 0.5) {
            isInversion = true;
            break;
          }
        }
        const mitigationPct = Math.min(100, Math.max(0, ((highestRetrace - bottom) / Math.max(1e-12, top - bottom)) * 100));

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
          isInversion,
        });
      }
    }
  }

  // Detect Balanced Price Ranges (BPR: overlapping Bullish FVG and Bearish FVG)
  const bprZones: IctBprZone[] = [];
  const recentFvgs = fvgs.slice(-12);
  for (let a = 0; a < recentFvgs.length; a++) {
    for (let b = a + 1; b < recentFvgs.length; b++) {
      const f1 = recentFvgs[a]!;
      const f2 = recentFvgs[b]!;
      if (f1.direction === f2.direction) continue;
      if (Math.abs(f2.barIndex - f1.barIndex) > 18) continue;
      const overlapTop = Math.min(f1.top, f2.top);
      const overlapBottom = Math.max(f1.bottom, f2.bottom);
      if (overlapTop > overlapBottom + pipSize * 0.5) {
        bprZones.push({
          id: `bpr_${f1.barIndex}_${f2.barIndex}`,
          barIndex: f2.barIndex,
          direction: f2.direction === "BULLISH_FVG" ? "BULLISH_BPR" : "BEARISH_BPR",
          top: overlapTop,
          bottom: overlapBottom,
          midpoint: (overlapTop + overlapBottom) / 2,
        });
      }
    }
  }

    const activeFvgs = fvgs.filter((f) => !f.mitigated || f.mitigationPct < 75).slice(-5);

    return { activeFvgs, bprZones: bprZones.slice(-3) };
  }

/**
 * Evaluates Higher-Timeframe (HTF) Point of Interest (POI) Confluence causally.
 */
function evaluateHtfPoiConfluence(
  htfBars: OhlcvBar[],
  currentPrice: number,
  pipSize: number,
  assetType: "FOREX" | "CRYPTO" | "STOCK",
  symbol: string,
): HtfPoiContext | null {
  if (!htfBars || htfBars.length < 16) return null;
  const htfAtr = atr(htfBars, 14) ?? Math.max(pipSize * 15, currentPrice * 0.004);
  const prox = Math.max(pipSize * 4, htfAtr * 0.35);
  const fmtP = (p: number) => roundPrice(p, symbol, assetType);

  const { activeFvgs } = detectFairValueGapsAndBpr(htfBars, pipSize);
  const htfObs = detectOrderBlocksAndBreakers(htfBars);

  for (let i = activeFvgs.length - 1; i >= 0; i--) {
    const f = activeFvgs[i]!;
    if (f.isInversion) continue;
    if (currentPrice >= f.bottom - prox && currentPrice <= f.top + prox) {
      const side = f.direction === "BULLISH_FVG" ? "BUY" : "SELL";
      return {
        alignedSide: side,
        poiType: "HTF_FVG",
        zoneLow: fmtP(f.bottom),
        zoneHigh: fmtP(f.top),
        rationaleVi: `Giá đang chạm vùng HTF ${f.direction} [${fmtP(f.bottom)} - ${fmtP(f.top)}]`,
      };
    }
  }

  for (let i = htfObs.length - 1; i >= 0; i--) {
    const ob = htfObs[i]!;
    if (currentPrice >= ob.low - prox && currentPrice <= ob.high + prox) {
      const side = ob.direction === "BULLISH" ? "BUY" : "SELL";
      const poiType = ob.type === "BREAKER_BLOCK" ? "HTF_BREAKER" : "HTF_ORDER_BLOCK";
      return {
        alignedSide: side,
        poiType,
        zoneLow: fmtP(ob.low),
        zoneHigh: fmtP(ob.high),
        rationaleVi: `Giá đang phản ứng tại ${poiType} (${ob.direction}) [${fmtP(ob.low)} - ${fmtP(ob.high)}]`,
      };
    }
  }

  const win = htfBars.slice(-24);
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of win) {
    if (b.high > hi) hi = b.high;
    if (b.low < lo) lo = b.low;
  }
  const rng = Math.max(1e-12, hi - lo);
  const bull618 = hi - rng * 0.618;
  const bull786 = hi - rng * 0.786;
  const bear618 = lo + rng * 0.618;
  const bear786 = lo + rng * 0.786;
  if (currentPrice >= bull786 - prox * 0.5 && currentPrice <= bull618 + prox * 0.5) {
    return {
      alignedSide: "BUY",
      poiType: "HTF_OTE_ZONE",
      zoneLow: fmtP(bull786),
      zoneHigh: fmtP(bull618),
      rationaleVi: `Giá nằm trong vùng chiết khấu HTF OTE Discount [${fmtP(bull786)} - ${fmtP(bull618)}]`,
    };
  }
  if (currentPrice >= bear618 - prox * 0.5 && currentPrice <= bear786 + prox * 0.5) {
    return {
      alignedSide: "SELL",
      poiType: "HTF_OTE_ZONE",
      zoneLow: fmtP(bear618),
      zoneHigh: fmtP(bear786),
      rationaleVi: `Giá nằm trong vùng HTF OTE Premium [${fmtP(bear618)} - ${fmtP(bear786)}]`,
    };
  }
  return null;
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
  _isForex: boolean
): AdvancedSweepEvent[] {
  const sweeps: AdvancedSweepEvent[] = [];
  const n = bars.length;

  for (let i = Math.max(5, n - 15); i < n; i++) {
    const b = bars[i];
    const prev = bars[i - 1];
    const barRange = Math.max(1e-12, b.high - b.low);

    // Check Sell-Side Liquidity Swept (Bullish Turtle Soup / Judas Swing / Displacement Reclaim) - strictly causal
    let bestSslSweep: AdvancedSweepEvent | null = null;
    for (const pool of sslPools) {
      if (pool.barIndex + 3 > i) continue; // Zero look-ahead: minor/major pivot exists strictly before bar i
      if (b.low < pool.price && b.close > pool.price) {
        const lowerWick = Math.min(b.open, b.close) - b.low;
        const wickRatio = lowerWick / barRange;
        const bullBodyRatio = Math.max(0, b.close - b.open) / barRange;
        const hasVolumeOrStrongReclaim =
          (b.volume ?? 0) >= (prev.volume ?? 0) * 1.1 || b.close > pool.price + pipSize;
        const isWickSweep = wickRatio >= 0.42 || (wickRatio >= 0.30 && hasVolumeOrStrongReclaim);
        const isDisplacementReclaim =
          bullBodyRatio >= 0.45 &&
          b.close > pool.price + pipSize * 0.5 &&
          (b.close > prev.high || (b.volume ?? 0) >= (prev.volume ?? 0) * 1.15);

        if (isWickSweep || isDisplacementReclaim) {
          const depthPips = Math.round(((pool.price - b.low) / Math.max(1e-12, pipSize)) * 10) / 10;
          const isJudas = checkJudasSessionTime(b.time);
          const dispRatio = Math.max(wickRatio, bullBodyRatio);
          const candidate: AdvancedSweepEvent = {
            id: `sweep_ssl_${b.time}`,
            time: b.time,
            barIndex: i,
            sweepType: isJudas ? "JUDAS_SWING" : isWickSweep ? "TURTLE_SOUP" : "PURGE_AND_REVERT",
            side: "SELL_SIDE_SWEPT",
            sweptLevel: pool.price,
            wickExtreme: b.low,
            closePrice: b.close,
            sweepDepthPipsOrPct: depthPips,
            mssConfirmed: b.close > prev.high,
            displacementRatio: Number(dispRatio.toFixed(2)),
            conviction: dispRatio >= 0.58 ? "INSTITUTIONAL_PRIME" : dispRatio >= 0.42 ? "HIGH" : "MODERATE",
          };
          if (!bestSslSweep || pool.price < bestSslSweep.sweptLevel) {
            bestSslSweep = candidate;
          }
        }
      }
    }
    if (bestSslSweep) sweeps.push(bestSslSweep);

    // Check Buy-Side Liquidity Swept (Bearish Turtle Soup / Judas Swing / Displacement Reclaim) - strictly causal
    let bestBslSweep: AdvancedSweepEvent | null = null;
    for (const pool of bslPools) {
      if (pool.barIndex + 3 > i) continue; // Zero look-ahead
      if (b.high > pool.price && b.close < pool.price) {
        const upperWick = b.high - Math.max(b.open, b.close);
        const wickRatio = upperWick / barRange;
        const bearBodyRatio = Math.max(0, b.open - b.close) / barRange;
        const hasVolumeOrStrongReclaim =
          (b.volume ?? 0) >= (prev.volume ?? 0) * 1.1 || b.close < pool.price - pipSize;
        const isWickSweep = wickRatio >= 0.42 || (wickRatio >= 0.30 && hasVolumeOrStrongReclaim);
        const isDisplacementReclaim =
          bearBodyRatio >= 0.45 &&
          b.close < pool.price - pipSize * 0.5 &&
          (b.close < prev.low || (b.volume ?? 0) >= (prev.volume ?? 0) * 1.15);

        if (isWickSweep || isDisplacementReclaim) {
          const depthPips = Math.round(((b.high - pool.price) / Math.max(1e-12, pipSize)) * 10) / 10;
          const isJudas = checkJudasSessionTime(b.time);
          const dispRatio = Math.max(wickRatio, bearBodyRatio);
          const candidate: AdvancedSweepEvent = {
            id: `sweep_bsl_${b.time}`,
            time: b.time,
            barIndex: i,
            sweepType: isJudas ? "JUDAS_SWING" : isWickSweep ? "TURTLE_SOUP" : "PURGE_AND_REVERT",
            side: "BUY_SIDE_SWEPT",
            sweptLevel: pool.price,
            wickExtreme: b.high,
            closePrice: b.close,
            sweepDepthPipsOrPct: depthPips,
            mssConfirmed: b.close < prev.low,
            displacementRatio: Number(dispRatio.toFixed(2)),
            conviction: dispRatio >= 0.58 ? "INSTITUTIONAL_PRIME" : dispRatio >= 0.42 ? "HIGH" : "MODERATE",
          };
          if (!bestBslSweep || pool.price > bestBslSweep.sweptLevel) {
            bestBslSweep = candidate;
          }
        }
      }
    }
    if (bestBslSweep) sweeps.push(bestBslSweep);
  }

  return sweeps.slice(-4);
}

/**
 * Checks if timestamp coincides with London or NY Judas Swing Killzone (07:00-09:00 or 12:00-14:00 UTC)
 * Normalizes both Unix seconds and milliseconds safely.
 */
export function checkJudasSessionTime(timestamp: number): boolean {
  const ms = normalizeEpochMs(timestamp);
  if (ms <= 0) return false;
  const date = new Date(ms);
  const hour = date.getUTCHours();
  return (hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 14);
}

/**
 * 5. Generates the Precision Optimal Trade Entry (OTE) Setup (symmetrical bull/bear evaluation)
 */
function buildOteTradeSetup(params: {
  symbol: string;
  assetType: "FOREX" | "CRYPTO" | "STOCK";
  bars: OhlcvBar[];
  currentPrice: number;
  currentZone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
  swingHigh: number;
  swingLow: number;
  rangeDiff: number;
  atr14: number;
  trendDir: 1 | -1 | 0;
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
    symbol,
    assetType,
    currentPrice,
    currentZone,
    swingHigh,
    swingLow,
    atr14,
    trendDir,
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

  const fmtP = (p: number) => roundPrice(p, symbol, assetType);
  const stopBuffer = Math.max(pipSize * 4, atr14 * 0.25);

  const bullSweep = [...recentSweeps].reverse().find((s) => s.side === "SELL_SIDE_SWEPT");
  const bearSweep = [...recentSweeps].reverse().find((s) => s.side === "BUY_SIDE_SWEPT");

  const matchingBullFvg = activeFvgList.find(
    (f) => f.direction === "BULLISH_FVG" && f.top >= bullOte786 && f.bottom <= bullOte618,
  );
  const matchingBullOb = orderBlocks.find((ob) => ob.direction === "BULLISH" && ob.high >= bullOte786);
  const inBullOte = currentPrice >= bullOte786 && currentPrice <= bullOte618;

  const matchingBearFvg = activeFvgList.find(
    (f) => f.direction === "BEARISH_FVG" && f.bottom <= bearOte786 && f.top >= bearOte618,
  );
  const matchingBearOb = orderBlocks.find((ob) => ob.direction === "BEARISH" && ob.low <= bearOte786);
  const inBearOte = currentPrice >= bearOte618 && currentPrice <= bearOte786;

  // Require real catalyst (Sweep / MSS / FVG+OB+Trend in OTE) — no blind OTE triggers
  const hasBullCatalyst =
    Boolean(bullSweep && bullSweep.conviction !== "MODERATE") ||
    (currentZone === "DISCOUNT" && lastMss === "BULLISH_MSS") ||
    (inBullOte && Boolean(matchingBullFvg || matchingBullOb) && trendDir >= 0);

  const hasBearCatalyst =
    Boolean(bearSweep && bearSweep.conviction !== "MODERATE") ||
    (currentZone === "PREMIUM" && lastMss === "BEARISH_MSS") ||
    (inBearOte && Boolean(matchingBearFvg || matchingBearOb) && trendDir <= 0);

  const buildBull = (): OteTradeSetup => {
    const entryOptimal = bullOte705;
    const structLow = bullSweep ? Math.min(swingLow, bullSweep.wickExtreme) : swingLow;
    const stopLoss = structLow - stopBuffer;
    const targetTP1 = (swingHigh + swingLow) / 2;
    const targetTP2 = nearestBsl?.price ?? swingHigh;
    const risk = Math.max(1e-12, entryOptimal - stopLoss);
    const reward = Math.max(1e-12, targetTP2 - entryOptimal);
    const riskRewardRatio = Number((reward / risk).toFixed(2));

    const checklist = [
      { rule: "1. Đã quét sạch thanh khoản Sell-Side (SSL Swept)", passed: Boolean(bullSweep) },
      { rule: "2. Giá nằm trong vùng chiết khấu Discount (Dưới 50% Equilibrium)", passed: currentZone === "DISCOUNT" },
      { rule: "3. Điểm vào nằm trong vùng vàng OTE Fib 0.618 - 0.786", passed: inBullOte },
      { rule: "4. Hội tụ vùng FVG chưa bị lấp hoặc Order Block tươi mới", passed: Boolean(matchingBullFvg || matchingBullOb) },
      { rule: "5. Tỷ lệ Lợi nhuận / Rủi ro (R:R) tối thiểu đạt trên 1:2.0", passed: riskRewardRatio >= 2.0 },
    ];
    const passedCount = checklist.filter((c) => c.passed).length;
    const confluenceScore = Math.round((passedCount / checklist.length) * 100);

    return {
      direction: "BUY",
      setupName: bullSweep?.sweepType === "JUDAS_SWING"
        ? "JUDAS_SWING_EXPLOIT"
        : matchingBullFvg
          ? "ICT_OTE_FVG_CONFLUENCE"
          : "SMC_TURTLE_SOUP_REVERSAL",
      entryOptimal: fmtP(entryOptimal),
      entryZone: [fmtP(bullOte786), fmtP(bullOte618)],
      stopLoss: fmtP(stopLoss),
      targetTP1: fmtP(targetTP1),
      targetTP2: fmtP(targetTP2),
      riskRewardRatio,
      confluenceScore,
      dealingRange: {
        swingHigh: fmtP(swingHigh),
        swingLow: fmtP(swingLow),
        equilibrium: fmtP((swingHigh + swingLow) / 2),
        currentZone,
        fibOte618: fmtP(bullOte618),
        fibOte705: fmtP(bullOte705),
        fibOte786: fmtP(bullOte786),
      },
      executionChecklist: checklist,
      rationale: `Thiết lập Mua OTE: Đã quét SSL tại ${bullSweep?.sweptLevel ? fmtP(bullSweep.sweptLevel) : "đáy"} và hồi về vùng giá sỉ Discount. Điểm vào tối ưu OTE 0.705 hội tụ cùng ${matchingBullFvg ? "Bullish FVG" : "Order Block"}. TP2 hướng về BSL tại ${fmtP(targetTP2)}.`,
    };
  };

  const buildBear = (): OteTradeSetup => {
    const entryOptimal = bearOte705;
    const structHigh = bearSweep ? Math.max(swingHigh, bearSweep.wickExtreme) : swingHigh;
    const stopLoss = structHigh + stopBuffer;
    const targetTP1 = (swingHigh + swingLow) / 2;
    const targetTP2 = nearestSsl?.price ?? swingLow;
    const risk = Math.max(1e-12, stopLoss - entryOptimal);
    const reward = Math.max(1e-12, entryOptimal - targetTP2);
    const riskRewardRatio = Number((reward / risk).toFixed(2));

    const checklist = [
      { rule: "1. Đã quét sạch thanh khoản Buy-Side (BSL Swept)", passed: Boolean(bearSweep) },
      { rule: "2. Giá nằm trong vùng giá đắt Premium (Trên 50% Equilibrium)", passed: currentZone === "PREMIUM" },
      { rule: "3. Điểm vào nằm trong vùng vàng OTE Fib 0.618 - 0.786", passed: inBearOte },
      { rule: "4. Hội tụ vùng FVG chưa bị lấp hoặc Order Block tươi mới", passed: Boolean(matchingBearFvg || matchingBearOb) },
      { rule: "5. Tỷ lệ Lợi nhuận / Rủi ro (R:R) tối thiểu đạt trên 1:2.0", passed: riskRewardRatio >= 2.0 },
    ];
    const passedCount = checklist.filter((c) => c.passed).length;
    const confluenceScore = Math.round((passedCount / checklist.length) * 100);

    return {
      direction: "SELL",
      setupName: bearSweep?.sweepType === "JUDAS_SWING"
        ? "JUDAS_SWING_EXPLOIT"
        : matchingBearFvg
          ? "ICT_OTE_FVG_CONFLUENCE"
          : "SMC_TURTLE_SOUP_REVERSAL",
      entryOptimal: fmtP(entryOptimal),
      entryZone: [fmtP(bearOte618), fmtP(bearOte786)],
      stopLoss: fmtP(stopLoss),
      targetTP1: fmtP(targetTP1),
      targetTP2: fmtP(targetTP2),
      riskRewardRatio,
      confluenceScore,
      dealingRange: {
        swingHigh: fmtP(swingHigh),
        swingLow: fmtP(swingLow),
        equilibrium: fmtP((swingHigh + swingLow) / 2),
        currentZone,
        fibOte618: fmtP(bearOte618),
        fibOte705: fmtP(bearOte705),
        fibOte786: fmtP(bearOte786),
      },
      executionChecklist: checklist,
      rationale: `Thiết lập Bán OTE: Đã quét BSL tại ${bearSweep?.sweptLevel ? fmtP(bearSweep.sweptLevel) : "đỉnh"} và hồi về vùng giá lẻ Premium. Điểm vào tối ưu OTE 0.705 hội tụ cùng ${matchingBearFvg ? "Bearish FVG" : "Order Block"}. TP2 hướng về SSL tại ${fmtP(targetTP2)}.`,
    };
  };

  const bullCandidate = hasBullCatalyst ? buildBull() : null;
  const bearCandidate = hasBearCatalyst ? buildBear() : null;

  if (bullCandidate && bearCandidate) {
    const bullRank = bullCandidate.confluenceScore + (trendDir > 0 ? 10 : 0) + (bullSweep?.barIndex ?? 0);
    const bearRank = bearCandidate.confluenceScore + (trendDir < 0 ? 10 : 0) + (bearSweep?.barIndex ?? 0);
    return bearRank > bullRank ? bearCandidate : bullCandidate;
  }
  if (bullCandidate) return bullCandidate;
  if (bearCandidate) return bearCandidate;

  // ==========================================
  // CASE 3: NEUTRAL / WAIT
  // ==========================================
  return {
    direction: "NEUTRAL",
    setupName: "NONE",
    entryOptimal: fmtP(currentPrice),
    entryZone: [fmtP(currentPrice), fmtP(currentPrice)],
    stopLoss: fmtP(currentPrice),
    targetTP1: fmtP(currentPrice),
    targetTP2: fmtP(currentPrice),
    riskRewardRatio: 1.0,
    confluenceScore: 35,
    dealingRange: {
      swingHigh: fmtP(swingHigh),
      swingLow: fmtP(swingLow),
      equilibrium: fmtP((swingHigh + swingLow) / 2),
      currentZone,
      fibOte618: fmtP(bullOte618),
      fibOte705: fmtP(bullOte705),
      fibOte786: fmtP(bullOte786),
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
    bprZones: [],
    htfPoiContext: null,
    amdPowerOf3: {
      phase: "NEUTRAL",
      manipulationSide: "NONE",
      favoredDirection: "NEUTRAL",
      boxHigh: price,
      boxLow: price,
      targetOppositeEdge: null,
      rationaleVi: "Chưa đủ dữ liệu nến để phân tích chu kỳ ICT AMD.",
    },
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

/**
 * Phase 1 Upgrade: Causal ICT Power-of-3 (AMD: Accumulation -> Manipulation Judas -> Distribution Expansion)
 * Evaluates the prior 16-bar compression/Asian box [n-18..n-4] and checks whether bars [n-3..n-1]
 * executed a false-breakout Judas Manipulation sweep or entered Distribution Expansion.
 */
function detectIctAmdPowerOf3(params: {
  bars: OhlcvBar[];
  currentPrice: number;
  atr14: number;
  recentSweeps: AdvancedSweepEvent[];
  lastMss: "BULLISH_MSS" | "BEARISH_MSS" | "NONE";
  displacementDetected: boolean;
  pipSize: number;
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
}): IctAmdPowerOf3Context {
  const { bars, currentPrice, atr14, recentSweeps, lastMss, displacementDetected, symbol, assetType } = params;
  const n = bars.length;
  const fmt = (p: number) => roundPrice(p, symbol, assetType);
  if (n < 18) {
    return {
      phase: "NEUTRAL",
      manipulationSide: "NONE",
      favoredDirection: "NEUTRAL",
      boxHigh: fmt(currentPrice),
      boxLow: fmt(currentPrice),
      targetOppositeEdge: null,
      rationaleVi: "Chưa đủ mẫu nến cho chu kỳ AMD.",
    };
  }

  const boxStart = Math.max(0, n - 18);
  const boxEnd = n - 4;
  let boxHigh = -Infinity;
  let boxLow = Infinity;
  for (let i = boxStart; i <= boxEnd; i++) {
    const b = bars[i]!;
    if (b.high > boxHigh) boxHigh = b.high;
    if (b.low < boxLow) boxLow = b.low;
  }
  const boxSpan = Math.max(1e-12, boxHigh - boxLow);
  const isCompressedBox = boxSpan <= Math.max(1e-12, atr14 * 3.4);

  let recentMinLow = Infinity;
  let recentMaxHigh = -Infinity;
  for (let i = n - 3; i < n; i++) {
    const b = bars[i]!;
    if (b.low < recentMinLow) recentMinLow = b.low;
    if (b.high > recentMaxHigh) recentMaxHigh = b.high;
  }

  const sweptBelowBox =
    (recentMinLow < boxLow && currentPrice > boxLow) ||
    recentSweeps.some((s) => s.side === "SELL_SIDE_SWEPT" && s.barIndex >= n - 4);
  const sweptAboveBox =
    (recentMaxHigh > boxHigh && currentPrice < boxHigh) ||
    recentSweeps.some((s) => s.side === "BUY_SIDE_SWEPT" && s.barIndex >= n - 4);

  if (sweptBelowBox && !sweptAboveBox) {
    const inDist = lastMss === "BULLISH_MSS" || displacementDetected;
    return {
      phase: inDist ? "DISTRIBUTION_EXPANSION" : "MANIPULATION_JUDAS",
      manipulationSide: "BEAR_TRAP_LOW_SWEEP",
      favoredDirection: "BUY",
      boxHigh: fmt(boxHigh),
      boxLow: fmt(boxLow),
      targetOppositeEdge: fmt(boxHigh),
      rationaleVi: `ICT Power-of-3 (${inDist ? "Distribution" : "Judas Manipulation"}): Đã quét thanh khoản đáy hộp ${fmt(boxLow)} (Bear Trap) và rút chân hướng lên biên đối diện ${fmt(boxHigh)}.`,
    };
  }

  if (sweptAboveBox && !sweptBelowBox) {
    const inDist = lastMss === "BEARISH_MSS" || displacementDetected;
    return {
      phase: inDist ? "DISTRIBUTION_EXPANSION" : "MANIPULATION_JUDAS",
      manipulationSide: "BULL_TRAP_HIGH_SWEEP",
      favoredDirection: "SELL",
      boxHigh: fmt(boxHigh),
      boxLow: fmt(boxLow),
      targetOppositeEdge: fmt(boxLow),
      rationaleVi: `ICT Power-of-3 (${inDist ? "Distribution" : "Judas Manipulation"}): Đã quét thanh khoản đỉnh hộp ${fmt(boxHigh)} (Bull Trap) và rút chân hướng xuống biên đối diện ${fmt(boxLow)}.`,
    };
  }

  if (currentPrice > boxHigh && (lastMss === "BULLISH_MSS" || displacementDetected)) {
    return {
      phase: "DISTRIBUTION_EXPANSION",
      manipulationSide: "NONE",
      favoredDirection: "BUY",
      boxHigh: fmt(boxHigh),
      boxLow: fmt(boxLow),
      targetOppositeEdge: fmt(boxHigh + boxSpan * 0.618),
      rationaleVi: `ICT Power-of-3 (Distribution): Phá vỡ hộp tích lũy ${fmt(boxHigh)} với xung lực mở rộng tăng.`,
    };
  }

  if (currentPrice < boxLow && (lastMss === "BEARISH_MSS" || displacementDetected)) {
    return {
      phase: "DISTRIBUTION_EXPANSION",
      manipulationSide: "NONE",
      favoredDirection: "SELL",
      boxHigh: fmt(boxHigh),
      boxLow: fmt(boxLow),
      targetOppositeEdge: fmt(boxLow - boxSpan * 0.618),
      rationaleVi: `ICT Power-of-3 (Distribution): Phá vỡ hộp tích lũy ${fmt(boxLow)} với xung lực mở rộng giảm.`,
    };
  }

  if (isCompressedBox && currentPrice >= boxLow && currentPrice <= boxHigh) {
    return {
      phase: "ACCUMULATION",
      manipulationSide: "NONE",
      favoredDirection: "NEUTRAL",
      boxHigh: fmt(boxHigh),
      boxLow: fmt(boxLow),
      targetOppositeEdge: null,
      rationaleVi: `ICT Power-of-3 (Accumulation): Giá đang nén thanh khoản trong hộp [${fmt(boxLow)} – ${fmt(boxHigh)}].`,
    };
  }

  return {
    phase: "NEUTRAL",
    manipulationSide: "NONE",
    favoredDirection: "NEUTRAL",
    boxHigh: fmt(boxHigh),
    boxLow: fmt(boxLow),
    targetOppositeEdge: null,
    rationaleVi: "Chu kỳ ICT AMD trung tính.",
  };
}
