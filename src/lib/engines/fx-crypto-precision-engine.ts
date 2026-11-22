import type { OhlcvBar } from "../types";
import { ema, sma, supportResistance } from "../technical";
import {
  estimateClvOrderFlowImbalance,
  getAssetPipSize,
  resampleOhlcvBars,
  roundPrice,
} from "./asset-precision";
import {
  analyzeIctSmcLiquidity,
  type ExternalLiquidityMagnet,
  type ForwardLiquidityForecast,
} from "./ict-smc-liquidity-engine";
import {
  applySymmetricCusumFilter,
  computeScenarioDynamicExitPolicy,
  computeYangZhangVolatility,
  estimateTailDegreesOfFreedom,
  evaluateMarketScenarioVector,
  filterOnlineRegimeHmm,
  forecastHarRealizedVolatility,
  type HmmRegimeState,
  type MarketScenarioVectorResult,
  type ScenarioDynamicExitPolicy,
} from "./advanced-quant-math";
import { evaluateHighWinrateGate } from "./high-winrate-gate";
import {
  getLiveTrainedMetaModel,
  predictMetaLabelProbability,
  type TrainedMetaLabelModel,
} from "./meta-labeling-calibration";
import { calculateRequiredSpeedPace } from "./quant-reversal-pace";
import { buildSharedBarContext, type SharedBarContext } from "./unified-ta-kernel";

export type SetupGrade = "A+" | "A" | "B" | "NO_TRADE";

export interface PrecisionSetupInput {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  barsExecution: OhlcvBar[];
  barsHtf?: OhlcvBar[] | null;
  barsMacro?: OhlcvBar[] | null;
  candidateDirection?: "BUY" | "SELL" | "AUTO";
  candidateEntry?: number | null;
  candidateStopLoss?: number | null;
  spreadPipsOrPct?: number | null;
  orderBookImbalance?: number | null;
  fundingRate?: number | null;
  csmBaseMinusQuote?: number | null;
  flowIntensityIndex?: number | null;
  absorptionType?: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE" | null;
  volumeDeltaDivergence?: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" | null;
  liquidationClusterAligned?: "LONG_SQUEEZE_UP" | "SHORT_SQUEEZE_UP" | "LONG_FLUSH_DOWN" | "BALANCED" | null;
  externalMagnets?: ExternalLiquidityMagnet[] | null;
  sessionLabel?: string | null;
  isNewsOrCascadeLockout?: boolean;
  lockoutReason?: string | null;
  timeframeSec?: number;
  secondsRemaining?: number;
  sharedCtx?: SharedBarContext | null;
  trainedMetaModel?: TrainedMetaLabelModel | null;
  /** Realized execution Implementation Shortfall override from live fills (in R units) */
  empiricalFrictionROverride?: number | null;
}

export interface PrecisionTradeSetup {
  direction: "BUY" | "SELL" | "NEUTRAL";
  action: "BUY" | "SELL" | "WAIT";
  grade: SetupGrade;
  precisionScore: number; // 0 - 100
  calibratedWinRatePct: number; // 38 - 84
  expectancyR: number;
  recommendedSizeMultiplier: number; // 1.0 (A+), 0.85 (A), 0.5 (B), 0 (NO_TRADE)
  entryMode: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  entry: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  grossRiskReward: number | null;
  netRiskReward: number | null;
  frictionR: number;
  regime: {
    state: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "CHOPPY" | "EXTREME_VOL";
    adx14: number;
    efficiencyRatio: number;
    atrRatio: number;
    hmmState?: HmmRegimeState;
    hmmProbabilities?: {
      trendExpansion: number;
      meanRevertLowVol: number;
      crisisHighVol: number;
    };
    cusumBreak?: "BULL_BREAK" | "BEAR_BREAK" | "NONE";
    yangZhangVolPct?: number;
    harForecastVolPct?: number;
  };
  metaLabelProbability?: number;
  scenario?: MarketScenarioVectorResult;
  exitPolicy?: ScenarioDynamicExitPolicy;
  gatesPassed: string[];
  gatesFailed: string[];
  vetoReasons: string[];
  breakevenPlan: {
    tp1ClosePct: number;
    tp2ClosePct?: number;
    tp3ClosePct?: number;
    moveSlToBeAtTp1: boolean;
    trailingAtrMult: number;
  };
  isHighWinrateVerified: boolean;
  winrateScore: number;
  liquiditySweepDetected: boolean;
  forwardLiquidity?: ForwardLiquidityForecast | null;
  summaryVi: string;
}

function emptyPrecisionSetup(reason: string): PrecisionTradeSetup {
  return {
    direction: "NEUTRAL",
    action: "WAIT",
    grade: "NO_TRADE",
    precisionScore: 30,
    calibratedWinRatePct: 40,
    expectancyR: 0,
    recommendedSizeMultiplier: 0,
    entryMode: "WAIT",
    entry: null,
    entryZone: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    grossRiskReward: null,
    netRiskReward: null,
    frictionR: 0,
    regime: { state: "RANGING", adx14: 0, efficiencyRatio: 0, atrRatio: 1 },
    gatesPassed: [],
    gatesFailed: [reason],
    vetoReasons: [reason],
    breakevenPlan: { tp1ClosePct: 50, moveSlToBeAtTp1: true, trailingAtrMult: 1.0 },
    isHighWinrateVerified: false,
    winrateScore: 40,
    liquiditySweepDetected: false,
    summaryVi: reason,
  };
}

function biasFromEmaArrays(
  closes: number[],
  fastArr: (number | null)[],
  slowArr: (number | null)[],
  atr14?: number | null,
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const n = closes.length;
  if (n < 10) return "NEUTRAL";
  const f = fastArr[n - 1];
  const s = slowArr[n - 1];
  const prevS = slowArr[n - 2];
  const lastClose = closes[n - 1]!;
  if (f == null || s == null) return "NEUTRAL";
  const slopeUp = prevS == null || s >= prevS * 0.9998;
  const slopeDown = prevS == null || s <= prevS * 1.0002;
  // Preserve trend bias on controlled healthy pullbacks below EMA21 instead of dropping immediately to NEUTRAL
  const pullbackTol = atr14 != null && atr14 > 0 ? atr14 * 0.42 : lastClose * 0.0025;
  if (f > s && lastClose >= s - pullbackTol && slopeUp) return "BULLISH";
  if (f < s && lastClose <= s + pullbackTol && slopeDown) return "BEARISH";
  return "NEUTRAL";
}

function inferEmaBias(bars: OhlcvBar[], fastP = 9, slowP = 21): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (bars.length < 10) return "NEUTRAL";
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const sP = Math.max(6, Math.min(slowP, n - 1));
  const fP = Math.max(3, Math.min(fastP, sP - 2));
  let rangeSum = 0;
  const start = Math.max(0, n - 10);
  for (let i = start; i < n; i++) rangeSum += bars[i]!.high - bars[i]!.low;
  const avgRange = rangeSum / Math.max(1, n - start);
  return biasFromEmaArrays(closes, ema(closes, fP), ema(closes, sP), avgRange);
}

/**
 * Strictly causal microstructure detectors: RSI divergence, volatility squeeze expansion, and EMA pullback reclaim.
 */
function detectCausalMicroSignals(params: {
  bars: OhlcvBar[];
  rsiSeries: (number | null)[];
  atr14: number;
  pip: number;
  execBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  e9: number;
  e21: number;
  isDeadChop: boolean;
}) {
  const { bars, rsiSeries, atr14, pip, execBias, e9, e21, isDeadChop } = params;
  const n = bars.length;
  const lastBar = bars[n - 1]!;
  const currentPrice = lastBar.close;
  const lastRsi = rsiSeries[n - 1] ?? 50;
  const barRange = Math.max(1e-12, lastBar.high - lastBar.low);

  // 1. Causal 18-bar RSI Divergence: earlier [n-18..n-5] vs recent [n-4..n-1]
  let bullRsiDiv = false;
  let bearRsiDiv = false;
  if (n >= 18) {
    const eStart = Math.max(0, n - 18);
    const eEnd = n - 5;
    let earlierLow = Infinity;
    let earlierLowIdx = -1;
    let earlierHigh = -Infinity;
    let earlierHighIdx = -1;
    for (let i = eStart; i <= eEnd; i++) {
      if (bars[i]!.low < earlierLow) {
        earlierLow = bars[i]!.low;
        earlierLowIdx = i;
      }
      if (bars[i]!.high > earlierHigh) {
        earlierHigh = bars[i]!.high;
        earlierHighIdx = i;
      }
    }
    let recentLow = Infinity;
    let recentLowIdx = -1;
    let recentHigh = -Infinity;
    let recentHighIdx = -1;
    for (let i = n - 4; i < n; i++) {
      if (bars[i]!.low < recentLow) {
        recentLow = bars[i]!.low;
        recentLowIdx = i;
      }
      if (bars[i]!.high > recentHigh) {
        recentHigh = bars[i]!.high;
        recentHighIdx = i;
      }
    }
    const eRsiLow = earlierLowIdx >= 0 ? rsiSeries[earlierLowIdx] : null;
    const rRsiLow = recentLowIdx >= 0 ? rsiSeries[recentLowIdx] : null;
    const eRsiHigh = earlierHighIdx >= 0 ? rsiSeries[earlierHighIdx] : null;
    const rRsiHigh = recentHighIdx >= 0 ? rsiSeries[recentHighIdx] : null;
    const tol = pip * 2 + currentPrice * 0.0008;

    if (eRsiLow != null && rRsiLow != null) {
      const bullCandle = lastBar.close > lastBar.open || (lastBar.close - lastBar.low) / barRange >= 0.48;
      if (recentLow <= earlierLow + tol && rRsiLow >= eRsiLow + 3.2 && lastRsi <= 54 && bullCandle) {
        bullRsiDiv = true;
      }
    }
    if (eRsiHigh != null && rRsiHigh != null) {
      const bearCandle = lastBar.close < lastBar.open || (lastBar.high - lastBar.close) / barRange >= 0.48;
      if (recentHigh >= earlierHigh - tol && rRsiHigh <= eRsiHigh - 3.2 && lastRsi >= 46 && bearCandle) {
        bearRsiDiv = true;
      }
    }
  }

  // 2. Volatility Squeeze Compression Breakout
  let bullBreakout = false;
  let bearBreakout = false;
  if (n >= 10) {
    let priorRangeSum = 0;
    let priorHigh = -Infinity;
    let priorLow = Infinity;
    for (let i = n - 9; i <= n - 2; i++) {
      priorRangeSum += bars[i]!.high - bars[i]!.low;
      if (i >= n - 6) {
        if (bars[i]!.high > priorHigh) priorHigh = bars[i]!.high;
        if (bars[i]!.low < priorLow) priorLow = bars[i]!.low;
      }
    }
    const priorAvgRange = priorRangeSum / 8;
    const body = Math.abs(lastBar.close - lastBar.open);
    if (priorAvgRange <= atr14 * 0.94 && body >= atr14 * 0.48 && barRange >= priorAvgRange * 1.18) {
      if (lastBar.close > lastBar.open && lastBar.close > priorHigh - atr14 * 0.08) bullBreakout = true;
      if (lastBar.close < lastBar.open && lastBar.close < priorLow + atr14 * 0.08) bearBreakout = true;
    }
  }

  // 3. Trend Pullback Reclaim into EMA9/EMA21 Pocket
  let bullPullbackReclaim = false;
  let bearPullbackReclaim = false;
  if (!isDeadChop && n >= 4) {
    const minLow3 = Math.min(bars[n - 1]!.low, bars[n - 2]!.low, bars[n - 3]!.low);
    const maxHigh3 = Math.max(bars[n - 1]!.high, bars[n - 2]!.high, bars[n - 3]!.high);
    const prevClose = bars[n - 2]!.close;
    const closeLocBull = (lastBar.close - lastBar.low) / barRange;
    const closeLocBear = (lastBar.high - lastBar.close) / barRange;

    if (
      execBias === "BULLISH" &&
      minLow3 <= e9 + atr14 * 0.2 &&
      minLow3 >= e21 - atr14 * 0.65 &&
      lastBar.close >= lastBar.open &&
      (lastBar.close >= prevClose || closeLocBull >= 0.5) &&
      closeLocBull >= 0.42
    ) {
      bullPullbackReclaim = true;
    }
    if (
      execBias === "BEARISH" &&
      maxHigh3 >= e9 - atr14 * 0.2 &&
      maxHigh3 <= e21 + atr14 * 0.65 &&
      lastBar.close <= lastBar.open &&
      (lastBar.close <= prevClose || closeLocBear >= 0.5) &&
      closeLocBear >= 0.42
    ) {
      bearPullbackReclaim = true;
    }
  }

  return {
    bullRsiDiv,
    bearRsiDiv,
    bullBreakout,
    bearBreakout,
    bullPullbackReclaim,
    bearPullbackReclaim,
  };
}

function computeSessionVwap(bars: OhlcvBar[]): number | null {
  const slice = bars.slice(-96);
  let pv = 0;
  let vv = 0;
  for (const b of slice) {
    const v = b.volume > 0 ? b.volume : 1;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vv += v;
  }
  return vv > 0 ? pv / vv : null;
}

/**
 * Evaluates Forex or Crypto OHLCV setups through a unified 7-Gate Causal Precision Engine.
 * Assigns setup grades (A+, A, B, NO_TRADE), cost-adjusted net R:R, calibrated win rate, and expectancy E[R].
 */
export function evaluatePrecisionTradeSetup(input: PrecisionSetupInput): PrecisionTradeSetup {
  const {
    symbol,
    assetType,
    barsExecution,
    barsHtf,
    barsMacro,
    candidateDirection = "AUTO",
    candidateEntry,
    candidateStopLoss,
    spreadPipsOrPct,
    orderBookImbalance,
    fundingRate,
    csmBaseMinusQuote,
    flowIntensityIndex = null,
    absorptionType = null,
    volumeDeltaDivergence = null,
    liquidationClusterAligned = null,
    externalMagnets = null,
    sessionLabel,
    isNewsOrCascadeLockout = false,
    lockoutReason,
    timeframeSec = 300,
    secondsRemaining = 60,
    sharedCtx,
  } = input;

  if (!barsExecution || barsExecution.length < 30) {
    return emptyPrecisionSetup("Thiếu dữ liệu nến (<30 nến) để thẩm định tín hiệu.");
  }

  const n = barsExecution.length;
  const lastBar = barsExecution[n - 1]!;
  const currentPrice = lastBar.close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return emptyPrecisionSetup("Dữ liệu giá không hợp lệ.");
  }

  const fmtP = (p: number) => roundPrice(p, symbol, assetType);
  const pip = getAssetPipSize(symbol, assetType, currentPrice);
  const execCtx = sharedCtx && sharedCtx.bars === barsExecution ? sharedCtx : buildSharedBarContext(barsExecution);
  const closes = execCtx.closes;

  // ------------------------------------------------------------------
  // 1. CAUSAL MULTI-TIMEFRAME RESAMPLING & REGIME DIAGNOSIS
  // ------------------------------------------------------------------
  const htf = barsHtf && barsHtf.length >= 16 ? barsHtf : resampleOhlcvBars(barsExecution, 4);
  const macro = barsMacro && barsMacro.length >= 12 ? barsMacro : resampleOhlcvBars(barsExecution, 12);

  const atr14 = execCtx.atr14 ?? Math.max(pip * 8, lastBar.high - lastBar.low);
  const longBaseline = barsExecution.length >= 40 ? barsExecution.slice(-65, -5) : barsExecution.slice(-30, -1);
  const histRanges = longBaseline.map((b) => Math.max(pip, b.high - b.low)).sort((a, b) => a - b);
  const medianRange = histRanges.length ? histRanges[Math.floor(histRanges.length / 2)]! : atr14;
  const lastRange = Math.max(0, lastBar.high - lastBar.low);
  const atrRatio = medianRange > 0 ? atr14 / medianRange : 1.0;

  const adxVal = execCtx.adx14 ?? 18;
  const erVal = execCtx.efficiencyRatio14;

  const e21Series = execCtx.ema21;
  let whipsawFlips = 0;
  let prevSign = 0;
  for (let i = Math.max(21, n - 14); i < n; i++) {
    const ev = e21Series[i];
    if (ev == null) continue;
    const sgn = closes[i]! > ev ? 1 : closes[i]! < ev ? -1 : 0;
    if (sgn !== 0 && prevSign !== 0 && sgn !== prevSign) whipsawFlips++;
    if (sgn !== 0) prevSign = sgn;
  }

  const execBias = biasFromEmaArrays(closes, execCtx.ema9, execCtx.ema21, atr14);
  const htfBias = htf.length >= 10 ? inferEmaBias(htf, 7, 16) : execBias;
  const macroBias = macro.length >= 10 ? inferEmaBias(macro, 5, 13) : htfBias;

  let minWickRatioSum5 = 0;
  const startW5 = Math.max(0, n - 5);
  for (let i = startW5; i < n; i++) {
    const b = barsExecution[i]!;
    const rng = Math.max(pip, b.high - b.low);
    const uw = Math.max(0, b.high - Math.max(b.open, b.close));
    const dw = Math.max(0, Math.min(b.open, b.close) - b.low);
    minWickRatioSum5 += Math.min(uw, dw) / rng;
  }
  const avgMinWickRatio5 = minWickRatioSum5 / Math.max(1, n - startW5);
  const isBidirectionalWickChop = avgMinWickRatio5 >= 0.27 && whipsawFlips >= 2;

  const isExtremeSpike =
    (atrRatio >= 2.2 && whipsawFlips >= 2) ||
    (atrRatio >= 2.35 && lastRange > atr14 * 2.2) ||
    lastRange > Math.max(atr14, medianRange) * 3.4;
  const isDeadChop =
    isBidirectionalWickChop ||
    (adxVal < 19 && erVal < 0.25) ||
    (whipsawFlips >= 4 && erVal < 0.30);

  let regimeState: PrecisionTradeSetup["regime"]["state"] = "RANGING";
  if (isExtremeSpike) {
    regimeState = "EXTREME_VOL";
  } else if (isDeadChop) {
    regimeState = "CHOPPY";
  } else if (execBias === "BULLISH" && (htfBias !== "BEARISH" || adxVal >= 20)) {
    regimeState = "TRENDING_UP";
  } else if (execBias === "BEARISH" && (htfBias !== "BULLISH" || adxVal >= 20)) {
    regimeState = "TRENDING_DOWN";
  }

  // Causal Online 3-State HMM, Symmetric CUSUM Filter, Yang-Zhang & HAR-RV Volatility
  const annualFactor = assetType === "CRYPTO" ? 365 : 252;
  const hmmRegime = filterOnlineRegimeHmm(barsExecution);
  const cusumFilter = applySymmetricCusumFilter(barsExecution);
  const yzVol = computeYangZhangVolatility(barsExecution, 20, annualFactor);
  const harVol = forecastHarRealizedVolatility(barsExecution, annualFactor);

  // ------------------------------------------------------------------
  // 2. ICT/SMC STRUCTURE, ORDER FLOW & MOMENTUM SIGNALS
  // ------------------------------------------------------------------
  const ict = analyzeIctSmcLiquidity({
    symbol,
    bars: barsExecution,
    htfBars: htf,
    currentPrice,
    assetType,
    pipSize: pip,
    flowContext: {
      flowIntensityIndex,
      orderBookImbalance: orderBookImbalance ?? null,
      fundingRate: fundingRate ?? null,
      csmBaseMinusQuote: csmBaseMinusQuote ?? null,
      externalMagnets,
    },
    precomputed: {
      closes,
      ema9: execCtx.ema9,
      ema21: execCtx.ema21,
      atrVal: atr14,
    },
  });

  const realImbalance = orderBookImbalance != null ? orderBookImbalance : estimateClvOrderFlowImbalance(barsExecution, 12);
  const e9 = execCtx.ema9[n - 1] ?? currentPrice;
  const e21 = execCtx.ema21[n - 1] ?? currentPrice;
  const rsi14 = execCtx.rsi14 ?? 50;
  const macdHist = execCtx.macdFull.histogram;
  const histLast = macdHist[n - 1] ?? 0;
  const vwap = computeSessionVwap(barsExecution);

  const microSignals = detectCausalMicroSignals({
    bars: barsExecution,
    rsiSeries: execCtx.rsi14Series,
    atr14,
    pip,
    execBias,
    e9,
    e21,
    isDeadChop,
  });

  const bullSweepRecent = ict.recentSweeps.some(
    (s) => s.side === "SELL_SIDE_SWEPT" && s.barIndex >= n - 4,
  );
  const bearSweepRecent = ict.recentSweeps.some(
    (s) => s.side === "BUY_SIDE_SWEPT" && s.barIndex >= n - 4,
  );
  const bullSweepWithConfirm = ict.recentSweeps.some(
    (s) => s.side === "SELL_SIDE_SWEPT" && s.barIndex >= n - 4 && (s.mssConfirmed || s.displacementRatio >= 0.52),
  );
  const bearSweepWithConfirm = ict.recentSweeps.some(
    (s) => s.side === "BUY_SIDE_SWEPT" && s.barIndex >= n - 4 && (s.mssConfirmed || s.displacementRatio >= 0.52),
  );
  const bullMss = ict.marketStructure.lastMss === "BULLISH_MSS" || bullSweepWithConfirm;
  const bearMss = ict.marketStructure.lastMss === "BEARISH_MSS" || bearSweepWithConfirm;
  const bullDivSignal = microSignals.bullRsiDiv || volumeDeltaDivergence === "BULLISH_DIVERGENCE";
  const bearDivSignal = microSignals.bearRsiDiv || volumeDeltaDivergence === "BEARISH_DIVERGENCE";

  let maxRsiWin10 = 0;
  let minRsiWin10 = 100;
  for (let i = Math.max(0, n - 12); i < n - 1; i++) {
    const rv = execCtx.rsi14Series[i];
    if (rv != null) {
      if (rv > maxRsiWin10) maxRsiWin10 = rv;
      if (rv < minRsiWin10) minRsiWin10 = rv;
    }
  }
  const prevBar = barsExecution[n - 2]!;
  const twoBarDrop = n >= 3 ? closes[n - 3]! - currentPrice : 0;
  const twoBarRise = n >= 3 ? currentPrice - closes[n - 3]! : 0;
  const twoRedCrash =
    lastBar.close < lastBar.open &&
    prevBar.close < prevBar.open &&
    twoBarDrop >= atr14 * 0.95;
  const twoGreenSurge =
    lastBar.close > lastBar.open &&
    prevBar.close > prevBar.open &&
    twoBarRise >= atr14 * 0.95;
  const isBearExhaustionBreakdown = maxRsiWin10 >= 73 && twoRedCrash && currentPrice < e9 && !bullSweepRecent;
  const isBullExhaustionRebound = minRsiWin10 <= 27 && twoGreenSurge && currentPrice > e9 && !bearSweepRecent;

  // ------------------------------------------------------------------
  // 3. SYMMETRICAL DIRECTIONAL SCORING (NO BLIND BULL BIAS)
  // ------------------------------------------------------------------
  let bullPts = 0;
  let bearPts = 0;

  if (execBias === "BULLISH") bullPts += 18;
  else if (execBias === "BEARISH") bearPts += 18;

  if (htfBias === "BULLISH") bullPts += 20;
  else if (htfBias === "BEARISH") bearPts += 20;

  if (macroBias === "BULLISH") bullPts += 14;
  else if (macroBias === "BEARISH") bearPts += 14;

  if (bullSweepRecent) bullPts += 20;
  if (bearSweepRecent) bearPts += 20;

  if (bullMss || ict.optimalTradeSetup.direction === "BUY") bullPts += 14;
  if (bearMss || ict.optimalTradeSetup.direction === "SELL") bearPts += 14;

  const bullIfvgOrBpr =
    ict.activeFvgList.some((f) => f.isInversion && f.direction === "BEARISH_FVG" && Math.abs(currentPrice - f.top) <= atr14 * 0.8) ||
    Boolean(ict.bprZones?.some((b) => b.direction === "BULLISH_BPR" && currentPrice >= b.bottom - atr14 * 0.5 && currentPrice <= b.top + atr14 * 0.5));
  const bearIfvgOrBpr =
    ict.activeFvgList.some((f) => f.isInversion && f.direction === "BULLISH_FVG" && Math.abs(currentPrice - f.bottom) <= atr14 * 0.8) ||
    Boolean(ict.bprZones?.some((b) => b.direction === "BEARISH_BPR" && currentPrice >= b.bottom - atr14 * 0.5 && currentPrice <= b.top + atr14 * 0.5));

  if (bullDivSignal) bullPts += 11;
  if (bearDivSignal) bearPts += 11;

  if (microSignals.bullBreakout) bullPts += 11;
  if (microSignals.bearBreakout) bearPts += 11;

  if (microSignals.bullPullbackReclaim) bullPts += 10;
  if (microSignals.bearPullbackReclaim) bearPts += 10;

  if (isBullExhaustionRebound) bullPts += 28;
  if (isBearExhaustionBreakdown) bearPts += 28;

  if (histLast > 0) bullPts += 8;
  else if (histLast < 0) bearPts += 8;

  if (vwap != null) {
    if (currentPrice > vwap) bullPts += 7;
    else if (currentPrice < vwap) bearPts += 7;
  }

  if (realImbalance >= 18) bullPts += 10;
  else if (realImbalance <= -18) bearPts += 10;

  if (flowIntensityIndex != null) {
    if (flowIntensityIndex >= 22) bullPts += 8;
    else if (flowIntensityIndex <= -22) bearPts += 8;
  }

  if (absorptionType === "BULLISH_ABSORPTION") bullPts += 9;
  else if (absorptionType === "BEARISH_ABSORPTION") bearPts += 9;

  if (liquidationClusterAligned === "SHORT_SQUEEZE_UP") bullPts += 7;
  else if (liquidationClusterAligned === "LONG_FLUSH_DOWN") bearPts += 7;

  if (csmBaseMinusQuote != null) {
    if (csmBaseMinusQuote >= 1.2) bullPts += 10;
    else if (csmBaseMinusQuote <= -1.2) bearPts += 10;
  }

  let resolvedDir: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (candidateDirection === "BUY" || candidateDirection === "SELL") {
    resolvedDir = candidateDirection;
  } else if (bullSweepRecent && !bearSweepRecent && (bullMss || ict.optimalTradeSetup.direction === "BUY")) {
    resolvedDir = "BUY";
  } else if (bearSweepRecent && !bullSweepRecent && (bearMss || ict.optimalTradeSetup.direction === "SELL")) {
    resolvedDir = "SELL";
  } else {
    const gap = Math.abs(bullPts - bearPts);
    const hasTrendPullbackEdge =
      (microSignals.bullPullbackReclaim && htfBias === "BULLISH") ||
      (microSignals.bearPullbackReclaim && htfBias === "BEARISH");
    const minGap =
      hasTrendPullbackEdge || bullSweepRecent || bearSweepRecent
        ? 6
        : microSignals.bullBreakout || microSignals.bearBreakout
          ? 8
          : 12;
    if (gap >= minGap) {
      resolvedDir = bullPts > bearPts ? "BUY" : "SELL";
    }
  }

  const vetoReasons: string[] = [];
  const gatesPassed: string[] = [];
  const gatesFailed: string[] = [];

  if (isNewsOrCascadeLockout) {
    vetoReasons.push(lockoutReason ?? "Khiên tin đỏ / biến động mạnh đang kích hoạt khóa giao dịch");
    gatesFailed.push("Gate 7 (News/Cascade Shield): Đóng băng mở vị thế mới");
  } else {
    gatesPassed.push("Gate 7: Không có khóa tin đỏ vĩ mô hoặc bão thanh lý");
  }

  if (resolvedDir === "NEUTRAL") {
    vetoReasons.push("Lực mua/bán cân bằng, thiếu ưu thế định hướng rõ ràng");
    gatesFailed.push("Thiếu ưu thế định hướng (Directional gap thấp)");
  }

  if (regimeState === "EXTREME_VOL") {
    vetoReasons.push("Biến động cực đoan bất thường (Extreme Volatility Spike) — rủi ro trượt giá");
    gatesFailed.push(`Regime Veto: Extreme volatility (range ${(lastRange / Math.max(1e-12, atr14)).toFixed(1)}x ATR)`);
  }

  const finalDir: "BUY" | "SELL" = resolvedDir === "SELL" ? "SELL" : "BUY";
  const isBuy = finalDir === "BUY";
  const hasSweep = isBuy ? bullSweepRecent : bearSweepRecent;
  const hasMss = isBuy ? bullMss : bearMss;
  const hasDiv = isBuy ? bullDivSignal : bearDivSignal;
  const hasBreakout = isBuy ? microSignals.bullBreakout : microSignals.bearBreakout;
  const hasPullbackReclaim = isBuy ? microSignals.bullPullbackReclaim : microSignals.bearPullbackReclaim;
  const hasExhaustionShift = isBuy ? isBullExhaustionRebound : isBearExhaustionBreakdown;

  // ------------------------------------------------------------------
  // 4. 7-GATE EVALUATION & HARD VETOES
  // ------------------------------------------------------------------
  let precisionScore = 44;

  // GATE 1: HTF Trend & Chop Regime
  const htfMatches = isBuy ? htfBias === "BULLISH" : htfBias === "BEARISH";
  const macroMatches = isBuy ? macroBias === "BULLISH" : macroBias === "BEARISH";
  const htfOpposes = isBuy ? htfBias === "BEARISH" : htfBias === "BULLISH";
  const macroOpposes = isBuy ? macroBias === "BEARISH" : macroBias === "BULLISH";

  if (htfMatches && macroMatches) {
    precisionScore += 18;
    gatesPassed.push(`Gate 1: Đồng thuận HTF (${htfBias}) + Macro (${macroBias})`);
  } else if (htfMatches || (macroMatches && !htfOpposes)) {
    precisionScore += 12;
    gatesPassed.push(`Gate 1: Thuận khung lớn (${htfBias}/${macroBias})`);
  } else if (htfOpposes && macroOpposes && !(hasSweep && hasMss) && !hasExhaustionShift) {
    precisionScore -= 20;
    vetoReasons.push(`Ngược xu hướng cả HTF lẫn Macro (${htfBias}/${macroBias}) mà chưa có Sweep+MSS đảo chiều`);
    gatesFailed.push("Gate 1: Bẫy bắt dao rơi ngược hoàn toàn HTF + Macro");
  } else if (hasExhaustionShift) {
    precisionScore += 10;
    gatesPassed.push("Gate 1: Đảo chiều phân phối sau đỉnh/đáy quá mua/quá bán (Post-Exhaustion Shift)");
  } else if (hasSweep && hasMss) {
    precisionScore += 4;
    gatesPassed.push("Gate 1: Đảo chiều cấu trúc Sweep+MSS tại vùng thanh khoản cực trị");
  } else if (htfOpposes) {
    precisionScore -= 8;
    gatesFailed.push(`Gate 1: HTF (${htfBias}) chưa đồng thuận`);
  }

  if (regimeState === "CHOPPY" && (!(hasSweep && hasMss) || isBidirectionalWickChop)) {
    vetoReasons.push(`Thị trường Sideway nhiễu (ADX ${adxVal.toFixed(1)}, ER ${(erVal * 100).toFixed(0)}%, flips ${whipsawFlips}) — đứng ngoài`);
    gatesFailed.push("Gate 1b (Chop Veto): Nhiễu whipsaw cao không có Sweep+MSS một chiều xác nhận");
  } else if (!isDeadChop && (adxVal >= 18 || erVal >= 0.28)) {
    precisionScore += 6;
    gatesPassed.push(`Gate 1b: Xu hướng sạch (ADX ${adxVal.toFixed(1)}, ER ${(erVal * 100).toFixed(0)}%)`);
  }

  // GATE 2: Liquidity Sweep, MSS, Divergence & Compression Breakout Confirmation
  if (hasSweep && (hasMss || hasBreakout || hasDiv)) {
    precisionScore += 17;
    gatesPassed.push("Gate 2: Quét thanh khoản Sweep + xác nhận MSS/Đà đảo chiều");
  } else if (hasSweep) {
    precisionScore += 13;
    gatesPassed.push("Gate 2: Quét thanh khoản 1-4 nến gần nhất");
  } else if (hasMss && (hasBreakout || hasPullbackReclaim || hasExhaustionShift)) {
    precisionScore += 11;
    gatesPassed.push("Gate 2: Phá vỡ cấu trúc vi mô (MSS) + Xung lực xác nhận");
  } else if (hasBreakout || hasDiv || hasPullbackReclaim || hasExhaustionShift) {
    precisionScore += 9;
    const labels: string[] = [];
    if (hasBreakout) labels.push("Bứt phá nén biến động");
    if (hasDiv) labels.push("Phân kỳ RSI/CVD");
    if (hasPullbackReclaim) labels.push("Pullback reclaim EMA9/21");
    if (hasExhaustionShift) labels.push("Đảo chiều sau Parabolic");
    gatesPassed.push(`Gate 2: Tín hiệu vi mô (${labels.join(" + ")})`);
  } else if (hasMss) {
    precisionScore += 7;
    gatesPassed.push("Gate 2: Phá vỡ cấu trúc vi mô (MSS)");
  } else {
    gatesFailed.push("Gate 2: Chưa có nhịp quét Sweep/MSS");
  }

  // Gate 2b: Multi-Timeframe ICT POI + Inversion FVG (IFVG) + Balanced Price Range (BPR) Confluence
  const htfPoiMatches =
    (isBuy && ict.htfPoiContext?.alignedSide === "BUY") ||
    (!isBuy && ict.htfPoiContext?.alignedSide === "SELL");
  const ifvgOrBprMatches = isBuy ? bullIfvgOrBpr : bearIfvgOrBpr;
  if (htfPoiMatches && ifvgOrBprMatches) {
    precisionScore += 6;
    gatesPassed.push(`Gate 2b (ICT Multi-TF): Hội tụ ${ict.htfPoiContext?.poiType} + IFVG/BPR`);
  } else if (htfPoiMatches) {
    precisionScore += 4;
    gatesPassed.push(`Gate 2b (HTF POI): ${ict.htfPoiContext?.rationaleVi}`);
  } else if (ifvgOrBprMatches) {
    precisionScore += 4;
    gatesPassed.push("Gate 2b (IFVG/BPR): Phản ứng tại vùng Inversion FVG / Balanced Price Range");
  }

  // GATE 3: Value Zone (OTE/FVG/Discount-Premium) + Parabolic Anti-Chase & Post-Exhaustion Knife Guard
  const sma20Arr = sma(closes, 20);
  const s20 = sma20Arr[n - 1] ?? currentPrice;
  const std20Slice = closes.slice(-20);
  const std20 = Math.sqrt(
    std20Slice.reduce((sum, c) => sum + (c - s20) ** 2, 0) / Math.max(1, std20Slice.length),
  );
  const bbZ = std20 > 1e-12 ? (currentPrice - s20) / std20 : 0;
  const distEma21Atr = atr14 > 0 ? Math.abs(currentPrice - e21) / atr14 : 0;
  const recent3Ret = n >= 4 ? Math.abs(currentPrice - closes[n - 4]!) : 0;
  const isParabolicExtended =
    distEma21Atr > 2.25 &&
    ((isBuy && currentPrice > e21 && rsi14 >= 74) || (!isBuy && currentPrice < e21 && rsi14 <= 26)) &&
    (Math.abs(bbZ) > 2.05 || recent3Ret > atr14 * 2.4);

  const isFallingKnifeTrap =
    (isBuy && maxRsiWin10 >= 73 && twoRedCrash && !hasSweep) ||
    (!isBuy && minRsiWin10 <= 27 && twoGreenSurge && !hasSweep);

  const lastBodySigned = lastBar.close - lastBar.open;
  const closeLocInBar = lastRange > 1e-12 ? (lastBar.close - lastBar.low) / lastRange : 0.5;
  const isCounterImpulseCandleTrap =
    !hasSweep &&
    ((isBuy && lastBodySigned <= -atr14 * 0.65 && closeLocInBar <= 0.28) ||
      (!isBuy && lastBodySigned >= atr14 * 0.65 && closeLocInBar >= 0.72));

  const dr = ict.optimalTradeSetup.dealingRange;
  const drSpan = Math.max(pip, dr.swingHigh - dr.swingLow);
  const dealingRangePos = (currentPrice - dr.swingLow) / drSpan;
  const isRangeExtremeOppositeTrap =
    adxVal < 21 &&
    !hasBreakout &&
    !hasSweep &&
    ((isBuy && dealingRangePos >= 0.88 && rsi14 >= 64) ||
      (!isBuy && dealingRangePos <= 0.12 && rsi14 <= 36));

  if (isParabolicExtended) {
    vetoReasons.push(`Chạy quá đà Parabolic (${distEma21Atr.toFixed(1)}x ATR từ EMA21, RSI ${rsi14.toFixed(0)}) — cấm đuổi lệnh`);
    gatesFailed.push("Gate 3 (Anti-Chase Veto): Quá mua/quá bán căng quá mức");
    precisionScore -= 16;
  } else if (isFallingKnifeTrap) {
    vetoReasons.push(
      isBuy
        ? `Bẫy bắt đáy rơi dao sau đỉnh quá mua (RSI đỉnh ${maxRsiWin10.toFixed(0)}, 2 nến xả mạnh) — chờ Sweep/Reclaim`
        : `Bẫy chặn đỉnh ngược sóng hồi sau đáy quá bán (RSI đáy ${minRsiWin10.toFixed(0)}) — chờ xác nhận`,
    );
    gatesFailed.push("Gate 3b (Falling-Knife Veto): Xả mạnh ngay sau cực trị quá mua/quá bán");
    precisionScore -= 18;
  } else if (isCounterImpulseCandleTrap) {
    vetoReasons.push(
      isBuy
        ? "Nến hiện tại đang xả mạnh đóng cửa sát đáy (Counter-Impulse Marubozu) — chặn vào nhầm lệnh BUY"
        : "Nến hiện tại đang kéo mạnh đóng cửa sát đỉnh (Counter-Impulse Marubozu) — chặn vào nhầm lệnh SELL",
    );
    gatesFailed.push("Gate 3d (Anti-Wrong-Entry Veto): Xung lực nến đóng cửa ngược hoàn toàn hướng lệnh");
    precisionScore -= 16;
  } else if (isRangeExtremeOppositeTrap) {
    vetoReasons.push(
      isBuy
        ? `Giá đang sát trần vùng sideway (${(dealingRangePos * 100).toFixed(0)}% Dealing Range) — chặn mua đỉnh vùng giá`
        : `Giá đang sát đáy vùng sideway (${(dealingRangePos * 100).toFixed(0)}% Dealing Range) — chặn bán đáy vùng giá`,
    );
    gatesFailed.push("Gate 3e (Range Ceiling/Floor Veto): Tránh mua đỉnh / bán đáy trong vùng tích lũy");
    precisionScore -= 14;
  }

  const inValuePullback =
    (isBuy && (ict.optimalTradeSetup.dealingRange.currentZone === "DISCOUNT" || (currentPrice >= e21 - atr14 * 0.65 && currentPrice <= e9 + atr14 * 0.45))) ||
    (!isBuy && (ict.optimalTradeSetup.dealingRange.currentZone === "PREMIUM" || (currentPrice <= e21 + atr14 * 0.65 && currentPrice >= e9 - atr14 * 0.45)));

  if ((inValuePullback || (hasBreakout && htfMatches)) && !isParabolicExtended && !isFallingKnifeTrap) {
    precisionScore += 10;
    gatesPassed.push(
      inValuePullback
        ? "Gate 3: Vùng giá trị tối ưu (Discount/Premium hoặc pullback EMA9/21)"
        : "Gate 3: Bứt phá từ vùng nén đồng thuận xu hướng HTF",
    );
  }

  // GATE 4: Order Flow + FII/Absorption + Liquidation Clusters + CSM + Crypto Funding
  if (isBuy && realImbalance >= 12) {
    precisionScore += 6;
    gatesPassed.push(`Gate 4: Dòng tiền/CLV ủng hộ mua (+${realImbalance}%)`);
  } else if (!isBuy && realImbalance <= -12) {
    precisionScore += 6;
    gatesPassed.push(`Gate 4: Dòng tiền/CLV ủng hộ bán (${realImbalance}%)`);
  } else if ((isBuy && realImbalance <= -35) || (!isBuy && realImbalance >= 35)) {
    precisionScore -= 8;
    gatesFailed.push(`Gate 4: Áp lực Order Flow ngược hướng (${realImbalance}%)`);
  }

  if (flowIntensityIndex != null) {
    if ((isBuy && flowIntensityIndex >= 22) || (!isBuy && flowIntensityIndex <= -22)) {
      precisionScore += 5;
      gatesPassed.push(`Gate 4 (FII): Dòng tiền tổ chức ${flowIntensityIndex > 0 ? "+" : ""}${flowIntensityIndex} đồng thuận`);
    } else if ((isBuy && flowIntensityIndex <= -38) || (!isBuy && flowIntensityIndex >= 38)) {
      precisionScore -= 6;
      gatesFailed.push(`Gate 4 (FII): Dòng tiền tổ chức nghịch pha (${flowIntensityIndex})`);
    }
  }

  if ((isBuy && absorptionType === "BULLISH_ABSORPTION") || (!isBuy && absorptionType === "BEARISH_ABSORPTION")) {
    precisionScore += 5;
    gatesPassed.push(`Gate 4 (Absorption): Phát hiện ${absorptionType} đỡ giá`);
  }

  if (
    assetType === "CRYPTO" &&
    ((isBuy && liquidationClusterAligned === "SHORT_SQUEEZE_UP") ||
      (!isBuy && liquidationClusterAligned === "LONG_FLUSH_DOWN"))
  ) {
    precisionScore += 4;
    gatesPassed.push(`Gate 4 (Liquidation Magnet): Cụm thanh lý ${liquidationClusterAligned} hút giá thuận chiều`);
  }

  // Forward Liquidity Pool Money-Flow Alignment & Stop-Hunt Ceiling Guard
  const fwdLiq = ict.forwardLiquidityForecast ?? null;
  const fwdSameSideTarget = isBuy ? fwdLiq?.aboveTarget : fwdLiq?.belowTarget;
  if (fwdLiq?.primaryTarget) {
    const primaryMatchesDir =
      (isBuy && fwdLiq.primaryTarget.side === "BUY_SIDE") ||
      (!isBuy && fwdLiq.primaryTarget.side === "SELL_SIDE");
    if (
      primaryMatchesDir &&
      fwdLiq.primaryTarget.reachProbabilityPct >= 62 &&
      ((isBuy && fwdLiq.directionalFlowThrust >= 18) || (!isBuy && fwdLiq.directionalFlowThrust <= -18))
    ) {
      precisionScore += 4;
      gatesPassed.push(
        `Gate 4 (Draw-on-Liquidity): Dòng tiền hướng tới ${fwdLiq.primaryTarget.poolType} (${fwdLiq.primaryTarget.reachProbabilityPct}% trong ~${fwdLiq.primaryTarget.etaBars} nến)`,
      );
    }
  }
  if (
    fwdSameSideTarget &&
    fwdSameSideTarget.distanceAtr > 0.05 &&
    fwdSameSideTarget.distanceAtr < 0.42 &&
    fwdSameSideTarget.expectedReaction === "SWEEP_REVERSAL" &&
    fwdSameSideTarget.poolStrength >= 70 &&
    fwdSameSideTarget.reachProbabilityPct >= 55 &&
    !hasSweep
  ) {
    precisionScore -= 8;
    gatesFailed.push(
      `Gate 3c: Cận kề bể thanh khoản ${fwdSameSideTarget.poolType} dễ quét râu đảo chiều (${fwdSameSideTarget.distanceAtr.toFixed(2)} ATR)`,
    );
  }

  if (assetType === "FOREX" && csmBaseMinusQuote != null) {
    if ((isBuy && csmBaseMinusQuote >= 1.2) || (!isBuy && csmBaseMinusQuote <= -1.2)) {
      precisionScore += 6;
      gatesPassed.push(`Gate 4b (CSM): Sức mạnh tiền tệ chênh lệch thuận chiều (${csmBaseMinusQuote.toFixed(1)})`);
    } else if ((isBuy && csmBaseMinusQuote <= -2.2) || (!isBuy && csmBaseMinusQuote >= 2.2)) {
      precisionScore -= 10;
      gatesFailed.push(`Gate 4b (CSM): Đồng tiền cơ sở yếu ngược chiều (${csmBaseMinusQuote.toFixed(1)})`);
    }
  }

  if (assetType === "CRYPTO" && fundingRate != null) {
    if (isBuy && fundingRate >= 0.0006) {
      vetoReasons.push(`Funding Rate quá nóng (${(fundingRate * 100).toFixed(3)}%) — rủi ro quét Long`);
      gatesFailed.push("Gate 4c (Funding Veto): Long crowding quá cao");
    } else if (!isBuy && fundingRate <= -0.0005) {
      vetoReasons.push(`Funding Rate âm sâu (${(fundingRate * 100).toFixed(3)}%) — rủi ro Short Squeeze`);
      gatesFailed.push("Gate 4c (Funding Veto): Short crowding quá cao");
    } else if ((isBuy && fundingRate <= -0.0002) || (!isBuy && fundingRate >= 0.0004)) {
      precisionScore += 6;
      gatesPassed.push("Gate 4c: Funding Rate hỗ trợ Squeeze thuận chiều");
    }
  }

  if (assetType === "FOREX" && sessionLabel && (sessionLabel === "WEEKEND" || sessionLabel === "ROLLOVER")) {
    precisionScore -= 12;
    gatesFailed.push(`Session Warning: Đang trong khung ${sessionLabel} giãn spread`);
  }

  // GATE 5: Direction-Aligned Reversal Pace (0x50f7)
  const avgRange = Math.max(pip * 2, medianRange);
  const microVol = Math.max(1e-10, avgRange / Math.sqrt(Math.max(30, timeframeSec)));
  const pace = calculateRequiredSpeedPace({
    currentPrice,
    referencePrice: lastBar.open,
    secondsRemaining,
    microVolatilityPerSec: microVol,
    assetType,
    pipSize: pip,
  });

  if (pace.isIrreversibleLock) {
    const lockMatch =
      (isBuy && pace.lockDirection === "BULLISH_LOCKED") ||
      (!isBuy && pace.lockDirection === "BEARISH_LOCKED");
    if (lockMatch) {
      precisionScore += 7;
      gatesPassed.push(`Gate 5 (Pace): Xung lực khóa ${pace.lockDirection} (${pace.zScoreSpeed}σ)`);
    } else {
      precisionScore -= 12;
      vetoReasons.push(`Xung lực nến khóa ${pace.lockDirection} ngược hướng ${finalDir}`);
      gatesFailed.push(`Gate 5 (Pace Conflict): ${pace.lockDirection} ngược lệnh`);
    }
  }

  // ------------------------------------------------------------------
  // 5. STRUCTURAL ENTRY, STOP LOSS, MULTI-TIER TP & FRICTION COST CHECK
  // ------------------------------------------------------------------
  let entryMode: PrecisionTradeSetup["entryMode"] = "MARKET_CONFIRMED";
  let rawEntry = candidateEntry != null && Number.isFinite(candidateEntry) && candidateEntry > 0
    ? candidateEntry
    : currentPrice;

  // Prefer pullback limit entry inside OTE/FVG only when close (<= 0.25x ATR) and NOT a fast expansion/breakout/sweep bar
  const oteEntry = ict.optimalTradeSetup.direction === finalDir ? ict.optimalTradeSetup.entryOptimal : null;
  const strongDisplacementCandle = Math.abs(lastBar.close - lastBar.open) >= atr14 * 0.45;
  if (
    oteEntry != null &&
    Math.abs(currentPrice - oteEntry) <= atr14 * 0.25 &&
    !hasBreakout &&
    !pace.isIrreversibleLock &&
    !(hasSweep && strongDisplacementCandle)
  ) {
    const betterPrice = isBuy ? oteEntry < currentPrice : oteEntry > currentPrice;
    if (betterPrice) {
      rawEntry = oteEntry;
      entryMode = "LIMIT_PULLBACK";
    }
  }

  // Compute friction ahead of SL clamping so compressed low-ATR setups don't place stops inside spread/fee noise
  let totalFrictionPrice: number;
  if (assetType === "FOREX") {
    const clean = symbol.toUpperCase();
    const defaultSpread = clean.startsWith("XAU") ? 2.5 : clean.includes("JPY") ? 1.2 : 1.0;
    const sp = spreadPipsOrPct != null && spreadPipsOrPct >= 0 ? spreadPipsOrPct : defaultSpread;
    totalFrictionPrice = (sp + 0.35) * pip;
  } else {
    const spDec = spreadPipsOrPct != null && spreadPipsOrPct >= 0 ? Math.min(spreadPipsOrPct, 0.02) : 0.0004;
    totalFrictionPrice = rawEntry * Math.max(0.0008, spDec + 0.0006);
  }

  const recentStructBars = barsExecution.slice(-5);
  const swingLow5 = Math.min(...recentStructBars.map((b) => b.low));
  const swingHigh5 = Math.max(...recentStructBars.map((b) => b.high));
  const structuralVolUnit = Math.max(atr14, medianRange * 1.15);
  const slBuffer = Math.max(pip * 3, structuralVolUnit * 0.30);

  let rawStopDist =
    candidateStopLoss != null && Number.isFinite(candidateStopLoss) && candidateStopLoss > 0
      ? Math.abs(rawEntry - candidateStopLoss)
      : isBuy
        ? rawEntry - (swingLow5 - slBuffer)
        : swingHigh5 + slBuffer - rawEntry;

  // Ensure stop is anchored outside recent 5-bar micro-swing & spread/fee noise while keeping fast capital turnover
  const minFrictionSafeStop =
    candidateStopLoss == null ? Math.min(structuralVolUnit * 2.1, totalFrictionPrice / 0.19) : 0;
  const upperStopCap = Math.max(structuralVolUnit * 1.6, minFrictionSafeStop);
  const stopDist = Math.min(
    structuralVolUnit * 2.2,
    upperStopCap,
    Math.max(structuralVolUnit * 0.90, Math.max(pip * 5, minFrictionSafeStop, rawStopDist)),
  );
  const rawSl = isBuy ? rawEntry - stopDist : rawEntry + stopDist;

  // Liquidity targets from Support/Resistance, ICT Pools & Forward Liquidity Forecast
  const sr = supportResistance(barsExecution, 72);
  let target2Dist = stopDist * 2.1;
  if (isBuy) {
    const fwdPrice =
      fwdSameSideTarget != null
        ? fwdSameSideTarget.expectedReaction === "EXPANSION_BREAKOUT"
          ? fwdSameSideTarget.price + atr14 * 0.35
          : fwdSameSideTarget.price - pip * 1.5
        : 0;
    const candidates = [...sr.resistance, ict.liquidityMap.nearestBsl?.price ?? 0, fwdPrice]
      .filter((p) => p > rawEntry + stopDist * 1.65 && p <= rawEntry + stopDist * 2.8)
      .sort((a, b) => a - b);
    if (candidates.length > 0) target2Dist = candidates[0]! - rawEntry;
  } else {
    const fwdPrice =
      fwdSameSideTarget != null
        ? fwdSameSideTarget.expectedReaction === "EXPANSION_BREAKOUT"
          ? fwdSameSideTarget.price - atr14 * 0.35
          : fwdSameSideTarget.price + pip * 1.5
        : 0;
    const candidates = [...sr.support, ict.liquidityMap.nearestSsl?.price ?? 0, fwdPrice]
      .filter((p) => p > 0 && p < rawEntry - stopDist * 1.65 && p >= rawEntry - stopDist * 2.8)
      .sort((a, b) => b - a);
    if (candidates.length > 0) target2Dist = rawEntry - candidates[0]!;
  }

  // Phase 4A & 4B: Synthesize 5-Scenario Probability Vector & Scenario-Conditioned Dynamic Exit Policy
  const tailReturns: number[] = [];
  const retStart = Math.max(1, n - 45);
  for (let i = retStart; i < n; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    if (prev > 0 && cur > 0) tailReturns.push(Math.log(cur / prev));
  }
  const tailNu = estimateTailDegreesOfFreedom(tailReturns);
  const hasExplicitOrderFlow = orderBookImbalance != null || flowIntensityIndex != null;
  const opposingFlow = hasExplicitOrderFlow && ((isBuy && realImbalance < -25) || (!isBuy && realImbalance > 25));
  const estVpinToxicity = hasExplicitOrderFlow
    ? Math.min(0.85, Math.max(0.22, 0.28 + (opposingFlow ? Math.abs(realImbalance) / 160 : 0)))
    : undefined;
  const estFundingExtremeZ =
    assetType === "CRYPTO" && fundingRate != null && Number.isFinite(fundingRate)
      ? Math.min(8, Math.abs(fundingRate) / 0.00025)
      : undefined;
  const scenarioVector = evaluateMarketScenarioVector({
    hmmProbabilities: hmmRegime.probabilities,
    efficiencyRatio: erVal,
    adx14: adxVal,
    harExpansionRatio: harVol.expansionRatio,
    tailDegreesOfFreedom: tailNu,
    vpinOrToxicity: estVpinToxicity,
    fundingExtremeZ: estFundingExtremeZ,
    spreadSpikeRatio:
      spreadPipsOrPct != null && spreadPipsOrPct > 0
        ? assetType === "FOREX"
          ? spreadPipsOrPct / 1.2
          : spreadPipsOrPct / 0.0005
        : 1.0,
    isNewsOrCascadeLockout,
  });

  const prelimGrossRr = Number((target2Dist / Math.max(1e-12, stopDist)).toFixed(2));
  const exitPolicy = computeScenarioDynamicExitPolicy(scenarioVector, prelimGrossRr);

  // Scenario-conditioned TP1 & TP3 distances (S1 extends runner TP3 while capping at 2.85R for fast capital turnover; S2 tightens TP1)
  const tp1Dist = stopDist * Math.min(1.05, Math.max(0.85, exitPolicy.tp1RMultiple));
  const cappedTp3R = Math.min(2.85, exitPolicy.tp3RMultiple);
  const tp3Dist = Math.max(target2Dist * 1.22, stopDist * cappedTp3R);

  const tp1Raw = isBuy ? rawEntry + tp1Dist : rawEntry - tp1Dist;
  const tp2Raw = isBuy ? rawEntry + target2Dist : rawEntry - target2Dist;
  const tp3Raw = isBuy ? rawEntry + tp3Dist : rawEntry - tp3Dist;

  const rawFrictionR = totalFrictionPrice / Math.max(1e-12, stopDist);
  const empFriction =
    input.empiricalFrictionROverride != null &&
    Number.isFinite(input.empiricalFrictionROverride) &&
    input.empiricalFrictionROverride > 0
      ? Math.min(0.35, input.empiricalFrictionROverride)
      : 0;
  const frictionR = Number(Math.max(rawFrictionR, empFriction).toFixed(3));
  const effectiveFrictionPrice = Math.max(totalFrictionPrice, frictionR * stopDist);
  const grossRiskReward = prelimGrossRr;
  const netRiskReward = Number(
    Math.max(0, (target2Dist - effectiveFrictionPrice) / Math.max(1e-12, stopDist)).toFixed(2),
  );

  if (frictionR > 0.22) {
    vetoReasons.push(`Chi phí spread/phí quá lớn (${(frictionR * 100).toFixed(0)}% rủi ro 1R)`);
    gatesFailed.push("Gate 6 (Friction Veto): Spread + fee ăn mòn biên lợi nhuận");
  } else if (netRiskReward < 1.35) {
    vetoReasons.push(`Net R:R=${netRiskReward} < 1.35 sau phí không đủ kỳ vọng dương`);
    gatesFailed.push("Gate 6 (R:R Veto): Tỷ lệ thưởng/rủi ro ròng quá thấp");
  } else {
    precisionScore += 6;
    gatesPassed.push(`Gate 6: SL cấu trúc & Net R:R 1:${netRiskReward} (Friction ${frictionR}R)`);
  }

  // Run High-Winrate Gate cross-check reusing SSOT ICT result (zero duplicate sweep/OTE computation)
  const gateCheck = evaluateHighWinrateGate({
    symbol,
    series: barsExecution,
    htfSeries: htf,
    candidateDirection: finalDir,
    entryPrice: rawEntry,
    stopLossPrice: rawSl,
    takeProfitPrice: tp2Raw,
    orderBookImbalance: realImbalance,
    assetType,
    secondsRemaining,
    timeframeSec,
    precomputed: execCtx,
    ictResult: ict,
  });

  if (gateCheck.isHighWinrateVerified) {
    precisionScore = Math.max(precisionScore, Math.round(gateCheck.winrateScore));
  }

  precisionScore = Math.max(25, Math.min(95, Math.round(precisionScore)));

  // Secondary Meta-Labeling & Isotonic Probability Calibration (López de Prado)
  const cusumAligned =
    (isBuy && cusumFilter.latestBreak === "BULL_BREAK") || (!isBuy && cusumFilter.latestBreak === "BEAR_BREAK")
      ? 1
      : (isBuy && cusumFilter.latestBreak === "BEAR_BREAK") || (!isBuy && cusumFilter.latestBreak === "BULL_BREAK")
        ? -1
        : 0;
  const activeMetaModel = input.trainedMetaModel ?? getLiveTrainedMetaModel(assetType);
  const metaPred = predictMetaLabelProbability(
    {
      primaryScoreNorm: precisionScore / 100,
      hmmTrendProb: hmmRegime.probabilities.trendExpansion,
      hmmCrisisProb: hmmRegime.probabilities.crisisHighVol,
      cusumAligned,
      efficiencyRatio: erVal,
      harVolExpansionRatio: harVol.expansionRatio,
      orderFlowAligned: Math.max(-1, Math.min(1, (isBuy ? realImbalance : -realImbalance) / 100)),
      liquiditySweepConfirmed: hasSweep && hasMss ? 1 : 0,
      frictionR,
    },
    activeMetaModel,
  );

  if (activeMetaModel && metaPred.calibratedProbability < 0.44 && !(hasSweep && hasMss)) {
    vetoReasons.push(
      `Meta-Labeling Gate: Xác suất hậu nghiệm (${(metaPred.calibratedProbability * 100).toFixed(1)}%) dưới ngưỡng 44%`,
    );
    gatesFailed.push("Gate 7b (Meta-Labeling Veto): Không đạt ngưỡng phê duyệt xác suất");
  }

  // Calibrated outcome probabilities & net Expectancy E[R] under scenario-conditioned TP1/TP2/TP3 scaling
  const linearPTp1 = Math.min(0.84, Math.max(0.38, 0.30 + (precisionScore / 100) * 0.56));
  const pTp1 = Math.min(0.86, Math.max(0.38, 0.72 * linearPTp1 + 0.28 * metaPred.calibratedProbability));
  const pTp2 = Math.max(0.24, pTp1 * 0.72);
  const pTp3 = Math.max(0.12, pTp1 * 0.44);
  const calibratedWinRatePct = Math.round(pTp1 * 100);
  const w1 = exitPolicy.tp1ClosePct / 100;
  const w2 = exitPolicy.tp2ClosePct / 100;
  const w3 = exitPolicy.tp3ClosePct / 100;
  const tp1R = tp1Dist / Math.max(1e-12, stopDist);
  const tp3R = tp3Dist / Math.max(1e-12, stopDist);
  const expectancyR = Number(
    (pTp1 * (w1 * tp1R) + pTp2 * (w2 * grossRiskReward) + pTp3 * (w3 * tp3R) - (1 - pTp1) * 1.0 - frictionR).toFixed(2),
  );

  // Enforce LIMIT_PULLBACK when scenario requires strict maker entry (S3 Squeeze / S4 Macro Shock)
  if (scenarioVector.requireLimitEntryOnly && entryMode === "MARKET_CONFIRMED") {
    entryMode = "LIMIT_PULLBACK";
  }

  // Assign final setup grade
  let grade: SetupGrade = "NO_TRADE";
  if (vetoReasons.length === 0 && resolvedDir !== "NEUTRAL" && !scenarioVector.isHardLockout) {
    if (precisionScore >= 78 && expectancyR >= 0.28) grade = "A+";
    else if (precisionScore >= 65 && expectancyR >= 0.14) grade = "A";
    else if (precisionScore >= 54 && expectancyR >= 0.03) grade = "B";
  }

  const enrichedRegime: PrecisionTradeSetup["regime"] = {
    state: regimeState,
    adx14: Number(adxVal.toFixed(1)),
    efficiencyRatio: Number(erVal.toFixed(2)),
    atrRatio: Number(atrRatio.toFixed(2)),
    hmmState: hmmRegime.dominantState,
    hmmProbabilities: hmmRegime.probabilities,
    cusumBreak: cusumFilter.latestBreak,
    yangZhangVolPct: Number((yzVol.annualizedVol * 100).toFixed(2)),
    harForecastVolPct: harVol.forecastAnnualVolPct,
  };

  const breakevenPlan: PrecisionTradeSetup["breakevenPlan"] = {
    tp1ClosePct: exitPolicy.tp1ClosePct,
    tp2ClosePct: exitPolicy.tp2ClosePct,
    tp3ClosePct: exitPolicy.tp3ClosePct,
    moveSlToBeAtTp1: exitPolicy.moveSlToBeAtTp1,
    trailingAtrMult: exitPolicy.trailingAtrMultiplier,
  };

  if (grade === "NO_TRADE") {
    if (vetoReasons.length === 0) {
      vetoReasons.push(`Điểm hợp lưu ${precisionScore}/100 (E[R] ${expectancyR}R) chưa đạt ngưỡng tối thiểu`);
    }
    return {
      direction: "NEUTRAL",
      action: "WAIT",
      grade: "NO_TRADE",
      precisionScore,
      calibratedWinRatePct,
      expectancyR,
      recommendedSizeMultiplier: 0,
      entryMode: "WAIT",
      entry: fmtP(rawEntry),
      entryZone: null,
      stopLoss: fmtP(rawSl),
      tp1: fmtP(tp1Raw),
      tp2: fmtP(tp2Raw),
      tp3: fmtP(tp3Raw),
      grossRiskReward,
      netRiskReward,
      frictionR,
      regime: enrichedRegime,
      metaLabelProbability: metaPred.calibratedProbability,
      scenario: scenarioVector,
      exitPolicy,
      gatesPassed,
      gatesFailed,
      vetoReasons,
      breakevenPlan,
      isHighWinrateVerified: gateCheck.isHighWinrateVerified,
      winrateScore: gateCheck.winrateScore,
      liquiditySweepDetected: gateCheck.liquiditySweepDetected,
      forwardLiquidity: fwdLiq,
      summaryVi: `${symbol}: NO_TRADE (${precisionScore}/100) — ${vetoReasons[0]}`,
    };
  }

  const baseGradeMult = grade === "A+" ? 1.0 : grade === "A" ? 0.85 : 0.5;
  const sizeMult = Number((baseGradeMult * scenarioVector.entropyDampener).toFixed(2));
  const entryZone: [number, number] = isBuy
    ? [fmtP(rawEntry - stopDist * 0.25), fmtP(rawEntry)]
    : [fmtP(rawEntry), fmtP(rawEntry + stopDist * 0.25)];

  return {
    direction: finalDir,
    action: finalDir,
    grade,
    precisionScore,
    calibratedWinRatePct,
    expectancyR,
    recommendedSizeMultiplier: sizeMult,
    entryMode,
    entry: fmtP(rawEntry),
    entryZone,
    stopLoss: fmtP(rawSl),
    tp1: fmtP(tp1Raw),
    tp2: fmtP(tp2Raw),
    tp3: fmtP(tp3Raw),
    grossRiskReward,
    netRiskReward,
    frictionR,
    regime: enrichedRegime,
    metaLabelProbability: metaPred.calibratedProbability,
    scenario: scenarioVector,
    exitPolicy,
    gatesPassed,
    gatesFailed,
    vetoReasons,
    breakevenPlan,
    isHighWinrateVerified: gateCheck.isHighWinrateVerified,
    winrateScore: gateCheck.winrateScore,
    liquiditySweepDetected: gateCheck.liquiditySweepDetected,
    forwardLiquidity: fwdLiq,
    summaryVi: `${symbol}: ${finalDir} [Grade ${grade} | ${scenarioVector.dominantScenario} | E[R] +${expectancyR}R | WinRate ~${calibratedWinRatePct}%] tại ${fmtP(rawEntry)}`,
  };
}
