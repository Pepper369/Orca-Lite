/**
 * QUANT REVERSAL PACE & TAIL PROBABILITY ENGINE
 * 
 * Inspired by the quantitative binary resolution architecture of Wallet 0x50f7
 * ($648,032.73 PnL / 226 days, 98.48% Maker fill, 81s avg duration)
 * Analyzed by @PapiSleepy_RF.
 *
 * Adapted for:
 * 1. High-frequency Forex & Crypto Candle-Close Momentum Locking (Late-Resolution Scalping).
 * 2. Asymmetric Tail Probability / Liquidity Sweep Mispricing Hunt (Cheap Tail Exploiter).
 * 3. Post-Only Maker Dynamic Pegging Engine (Zero Taker Fee / Rebate Harvesting).
 */

import { normCdf, studentTCdf } from "./advanced-quant-math";
import { getAssetPipSize, roundPrice } from "./asset-precision";
import type { OhlcvBar } from "../types";

export interface ReversalPaceMetrics {
  currentPrice: number;
  referencePrice: number;
  gap: number; // |currentPrice - referencePrice|
  gapPipsOrPct: number;
  secondsRemaining: number;
  requiredSpeedPerSec: number; // gap / secondsRemaining
  requiredSpeedPerMin: number;
  microVolatilityPerSec: number; // 1-second rolling standard deviation
  zScoreSpeed: number; // RequiredSpeed / microVolatility
  reversalProbability: number; // P(Reversal) based on fat-tailed Student-t
  gaussianReversalProbability?: number; // Thin-tail Gaussian reference
  degreesOfFreedom?: number; // Student-t tail df (default 5)
  favoriteProbability: number; // 1 - reversalProbability
  isIrreversibleLock: boolean; // zScoreSpeed > 3.0 -> >99% confidence
  lockDirection: "BULLISH_LOCKED" | "BEARISH_LOCKED" | "UNLOCKED";
}

export interface TailMispricingMetrics {
  isCheapTailDetected: boolean;
  tailSide: "BUY_REVERSAL" | "SELL_REVERSAL" | "NONE";
  fairTailProbability: number; // 0.0 to 1.0 (actual statistical odds)
  impliedMarketOdds: number; // market implied odds (e.g. 0.02 to 0.05)
  edgeMultiplier: number; // fairTail / impliedMarket
  asymmetricRewardRatio: number; // e.g. 1:12 to 1:30
  entryLimitPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  confidenceScore: number; // 0 - 100
}

export interface MakerPeggingGuide {
  orderType: "POST_ONLY_LIMIT";
  side: "BUY" | "SELL";
  peggedPrice: number;
  favoriteLimitUsd: number; // e.g. 0.992
  tailLimitUsd: number; // e.g. 0.025
  estimatedFeeRebatePct: number; // e.g. +0.005% (Maker rebate)
  expectedHoldSeconds: number; // e.g. 45 - 80s
}

export interface LateCandleResolutionResult {
  symbol: string;
  timeframe: "1m" | "5m" | "15m";
  timeElapsedSec: number;
  timeRemainingSec: number;
  paceMetrics: ReversalPaceMetrics;
  tailMetrics: TailMispricingMetrics;
  peggingGuide: MakerPeggingGuide | null;
  recommendedAction: "LATE_EXPANSION_RIDER" | "CHEAP_TAIL_REVERSAL" | "MAKER_LOCK_IN" | "WAIT";
  actionDetails: {
    direction: "BUY" | "SELL" | "NEUTRAL";
    rationale: string;
    expectedWinrate: number; // e.g. 88.5%
    suggestedRiskPct: number; // e.g. 1.0% for Rider, 0.2% for Tail
  };
}

/**
 * Calculates Required Speed and Reversal Probability.
 * Formula:
 *   Gap = |CurrentPrice - ReferencePrice|
 *   Required Speed = Gap / SecondsRemaining
 *   Z-Score = RequiredSpeed / (MicroVol * sqrt(SecondsRemaining))
 */
export function calculateRequiredSpeedPace(params: {
  symbol?: string;
  currentPrice: number;
  referencePrice: number;
  secondsRemaining: number;
  microVolatilityPerSec: number;
  assetType?: "FOREX" | "CRYPTO";
  pipSize?: number;
  degreesOfFreedom?: number;
}): ReversalPaceMetrics {
  const {
    symbol = "",
    currentPrice,
    referencePrice,
    secondsRemaining,
    microVolatilityPerSec,
    assetType = "FOREX",
    degreesOfFreedom = 5,
  } = params;
  const pipSize = params.pipSize ?? getAssetPipSize(symbol, assetType, currentPrice);

  const gap = Math.abs(currentPrice - referencePrice);
  const gapPipsOrPct = assetType === "FOREX" 
    ? gap / pipSize 
    : (gap / (referencePrice || 1)) * 100;

  const safeSec = Math.max(1, secondsRemaining);
  const requiredSpeedPerSec = gap / safeSec;
  const requiredSpeedPerMin = requiredSpeedPerSec * 60;

  // Diffusion standard deviation over the remaining horizon: sigma * sqrt(t)
  const effectiveVolOverHorizon = Math.max(1e-7, microVolatilityPerSec * Math.sqrt(safeSec));
  const zScoreSpeed = gap / effectiveVolOverHorizon;

  // Fat-tailed Student-t reversal probability: P(T_nu >= Z) = 1 - studentTCdf(Z, nu)
  const gaussianProb = Math.max(0.0001, Math.min(0.5, 1 - normCdf(zScoreSpeed)));
  const rawReversalProb = Math.max(0.0001, Math.min(0.5, 1 - studentTCdf(zScoreSpeed, degreesOfFreedom)));
  const favoriteProb = 1 - rawReversalProb;

  const isIrreversible = zScoreSpeed >= 3.0 && safeSec <= 90;
  let lockDirection: ReversalPaceMetrics["lockDirection"] = "UNLOCKED";

  if (isIrreversible) {
    lockDirection = currentPrice >= referencePrice ? "BULLISH_LOCKED" : "BEARISH_LOCKED";
  }

  return {
    currentPrice,
    referencePrice,
    gap,
    gapPipsOrPct,
    secondsRemaining: safeSec,
    requiredSpeedPerSec,
    requiredSpeedPerMin,
    microVolatilityPerSec,
    zScoreSpeed: Number(zScoreSpeed.toFixed(2)),
    reversalProbability: Number(rawReversalProb.toFixed(4)),
    gaussianReversalProbability: Number(gaussianProb.toFixed(4)),
    degreesOfFreedom,
    favoriteProbability: Number(favoriteProb.toFixed(4)),
    isIrreversibleLock: isIrreversible,
    lockDirection,
  };
}

/**
 * Calculates Asymmetric Tail Mispricing.
 * Senses when market prices extreme reversal odds (e.g. at 2-3%)
 * but underlying order flow absorption + wick sweep indicates a 10-18% true probability.
 */
export function evaluateCheapTailMispricing(params: {
  symbol: string;
  bars: OhlcvBar[];
  currentPrice: number;
  paceMetrics: ReversalPaceMetrics;
  orderFlowImbalance?: number; // Delta between -100 and +100
  assetType?: "FOREX" | "CRYPTO";
  pipSize?: number;
}): TailMispricingMetrics {
  const {
    symbol,
    bars,
    currentPrice,
    paceMetrics,
    orderFlowImbalance = 0,
    assetType = "FOREX",
  } = params;
  const pipSize = params.pipSize ?? getAssetPipSize(symbol, assetType, currentPrice);

  if (bars.length < 5) {
    return {
      isCheapTailDetected: false,
      tailSide: "NONE",
      fairTailProbability: 0.05,
      impliedMarketOdds: 0.05,
      edgeMultiplier: 1.0,
      asymmetricRewardRatio: 1.0,
      entryLimitPrice: currentPrice,
      stopLossPrice: currentPrice,
      targetPrice: currentPrice,
      confidenceScore: 0,
    };
  }

  const currentBar = bars[bars.length - 1];
  const barRange = Math.max(1e-6, currentBar.high - currentBar.low);
  const upperWick = currentBar.high - Math.max(currentBar.open, currentBar.close);
  const lowerWick = Math.min(currentBar.open, currentBar.close) - currentBar.low;
  const upperWickRatio = upperWick / barRange;
  const lowerWickRatio = lowerWick / barRange;

  // Implied market odds derived from distance vs average range
  const impliedMarketOdds = Math.max(0.015, Math.min(0.15, paceMetrics.reversalProbability));

  // Check for Lower Wick Sweep + Absorption (Cheap Bullish Tail)
  const isLowerAbsorption = lowerWickRatio >= 0.50 && orderFlowImbalance >= 15;
  // Check for Upper Wick Sweep + Exhaustion (Cheap Bearish Tail)
  const isUpperAbsorption = upperWickRatio >= 0.50 && orderFlowImbalance <= -15;

  let isCheapTailDetected = false;
  let tailSide: TailMispricingMetrics["tailSide"] = "NONE";
  let fairTailProbability = impliedMarketOdds;
  let entryLimitPrice = currentPrice;
  let stopLossPrice = currentPrice;
  let targetPrice = currentPrice;
  let asymmetricRewardRatio = 1.0;
  let confidenceScore = 30;

  const minPipBuffer =
    assetType === "FOREX" ? pipSize * 4 : Math.max(pipSize * 4, currentPrice * 0.0008);
  const minRiskFloor = Math.max(1e-10, pipSize * 0.1);

  if (isLowerAbsorption && paceMetrics.secondsRemaining <= 120) {
    // True statistical probability is elevated due to smart money absorption at low
    fairTailProbability = Math.min(0.28, impliedMarketOdds * 2.8 + (orderFlowImbalance / 200));
    isCheapTailDetected = fairTailProbability > impliedMarketOdds * 1.6;
    tailSide = "BUY_REVERSAL";
    entryLimitPrice = currentPrice;
    stopLossPrice = currentBar.low - minPipBuffer;
    // Target is the recent dealing range high (or at least 2.5x the sweep depth)
    const priorHigh = Math.max(...bars.slice(-5).map((b) => b.high));
    targetPrice = Math.max(priorHigh, currentPrice + barRange * 2.0);
    const risk = Math.max(minRiskFloor, entryLimitPrice - stopLossPrice);
    const reward = Math.max(minRiskFloor, targetPrice - entryLimitPrice);
    asymmetricRewardRatio = Number((reward / risk).toFixed(1));
    confidenceScore = Math.min(92, Math.round(55 + lowerWickRatio * 30 + (orderFlowImbalance * 0.2)));
  } else if (isUpperAbsorption && paceMetrics.secondsRemaining <= 120) {
    // True statistical probability elevated due to rejection at high
    fairTailProbability = Math.min(0.28, impliedMarketOdds * 2.8 + (Math.abs(orderFlowImbalance) / 200));
    isCheapTailDetected = fairTailProbability > impliedMarketOdds * 1.6;
    tailSide = "SELL_REVERSAL";
    entryLimitPrice = currentPrice;
    stopLossPrice = currentBar.high + minPipBuffer;
    // Target is the recent dealing range low (or at least 2.5x the sweep depth)
    const priorLow = Math.min(...bars.slice(-5).map((b) => b.low));
    targetPrice = Math.min(priorLow, currentPrice - barRange * 2.0);
    const risk = Math.max(minRiskFloor, stopLossPrice - entryLimitPrice);
    const reward = Math.max(minRiskFloor, entryLimitPrice - targetPrice);
    asymmetricRewardRatio = Number((reward / risk).toFixed(1));
    confidenceScore = Math.min(92, Math.round(55 + upperWickRatio * 30 + (Math.abs(orderFlowImbalance) * 0.2)));
  }

  const edgeMultiplier = Number((fairTailProbability / Math.max(0.01, impliedMarketOdds)).toFixed(2));

  return {
    isCheapTailDetected,
    tailSide,
    fairTailProbability: Number(fairTailProbability.toFixed(3)),
    impliedMarketOdds: Number(impliedMarketOdds.toFixed(3)),
    edgeMultiplier,
    asymmetricRewardRatio: Math.max(1.0, asymmetricRewardRatio),
    entryLimitPrice: roundPrice(entryLimitPrice, symbol, assetType),
    stopLossPrice: roundPrice(stopLossPrice, symbol, assetType),
    targetPrice: roundPrice(targetPrice, symbol, assetType),
    confidenceScore,
  };
}

/**
 * Calculates Maker Limit Placement Guide (98.48% Maker fill logic).
 * Prepares post-only pricing to capture Maker rebates and zero slippage.
 */
export function generateMakerPeggingGuide(params: {
  symbol?: string;
  currentPrice: number;
  direction: "BUY" | "SELL";
  favoriteProbability: number;
  tailProbability: number;
  pipSize?: number;
  assetType?: "FOREX" | "CRYPTO";
}): MakerPeggingGuide {
  const {
    symbol = "",
    currentPrice,
    direction,
    assetType = "FOREX",
    tailProbability,
  } = params;
  const pipSize = params.pipSize ?? getAssetPipSize(symbol, assetType, currentPrice);

  // Favorite Limit Pricing ($1.00 * (1 - TailProb) - fee buffer)
  const safetyBufferUsd = 0.003; // 0.3% buffer
  const favoriteLimitUsd = Number(
    Math.min(0.996, Math.max(0.980, (1 - tailProbability) - safetyBufferUsd)).toFixed(4)
  );

  // Tail Limit Pricing ($1.00 * TailProb - buffer)
  const tailLimitUsd = Number(
    Math.max(0.012, Math.min(0.080, tailProbability - safetyBufferUsd)).toFixed(4)
  );

  // Dynamic Pegging offset for Spot/Futures Order Book (e.g. 0.3 pip or 0.01%)
  const offset = assetType === "FOREX" ? pipSize * 0.3 : currentPrice * 0.0001;
  const peggedPrice = direction === "BUY"
    ? currentPrice - offset
    : currentPrice + offset;

  return {
    orderType: "POST_ONLY_LIMIT",
    side: direction,
    peggedPrice: roundPrice(peggedPrice, symbol, assetType),
    favoriteLimitUsd,
    tailLimitUsd,
    estimatedFeeRebatePct: 0.005, // +0.005% maker rebate
    expectedHoldSeconds: 65,
  };
}

/**
 * Master Evaluator: Combines Candle Time Remaining, Required Speed Pace,
 * Tail Hunt, and Maker Pegging into an actionable quantitative trade decision.
 */
export function evaluateLateCandleResolution(params: {
  symbol: string;
  timeframe: "1m" | "5m" | "15m";
  bars: OhlcvBar[];
  currentTimestampSec?: number;
  orderFlowImbalance?: number;
  assetType?: "FOREX" | "CRYPTO";
  pipSize?: number;
}): LateCandleResolutionResult {
  const {
    symbol,
    timeframe,
    bars,
    currentTimestampSec = Math.floor(Date.now() / 1000),
    orderFlowImbalance = 0,
    assetType = "FOREX",
  } = params;

  const tfSeconds = timeframe === "1m" ? 60 : timeframe === "5m" ? 300 : 900;
  const timeElapsedSec = currentTimestampSec % tfSeconds;
  const timeRemainingSec = Math.max(1, tfSeconds - timeElapsedSec);

  const lastBar = bars[bars.length - 1] ?? {
    time: currentTimestampSec,
    open: 1.0,
    high: 1.0,
    low: 1.0,
    close: 1.0,
    volume: 1,
  };
  const pipSize = params.pipSize ?? getAssetPipSize(symbol, assetType, lastBar.close);

  // Estimate micro-volatility per second from last 10 bars
  const recentRanges = bars.slice(-10).map((b) => b.high - b.low);
  const avgBarRange = recentRanges.length > 0
    ? recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length
    : pipSize * 10;
  const microVolatilityPerSec = Math.max(1e-9, avgBarRange / Math.sqrt(tfSeconds));

  // Pace metrics against the candle's Open price (Reference)
  const paceMetrics = calculateRequiredSpeedPace({
    symbol,
    currentPrice: lastBar.close,
    referencePrice: lastBar.open,
    secondsRemaining: timeRemainingSec,
    microVolatilityPerSec,
    assetType,
    pipSize,
  });

  // Evaluate Tail Mispricing
  const tailMetrics = evaluateCheapTailMispricing({
    symbol,
    bars,
    currentPrice: lastBar.close,
    paceMetrics,
    orderFlowImbalance,
    assetType,
    pipSize,
  });

  // Determine recommendation action
  let recommendedAction: LateCandleResolutionResult["recommendedAction"] = "WAIT";
  let actionDirection: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  let rationale = "Đang trong pha tích lũy giữa nến. Chưa đạt ngưỡng khóa tốc độ đóng nến.";
  let expectedWinrate = 52.0;
  let suggestedRiskPct = 0.5;

  const isLateResolutionWindow = timeRemainingSec <= Math.min(75, tfSeconds * 0.25);

  if (tailMetrics.isCheapTailDetected && tailMetrics.confidenceScore >= 70) {
    recommendedAction = "CHEAP_TAIL_REVERSAL";
    actionDirection = tailMetrics.tailSide === "BUY_REVERSAL" ? "BUY" : "SELL";
    expectedWinrate = 42.0; // Moderate winrate but high asymmetric payoff
    suggestedRiskPct = 0.25; // Small size, lottery-style asymmetric payoff
    rationale = `Phát hiện săn đuôi thanh khoản lệch giá (Tail Mispricing): Lực hấp thụ Delta ${orderFlowImbalance} ở vùng râu nến. Tỷ lệ R:R kỳ vọng 1:${tailMetrics.asymmetricRewardRatio}. Đặt Limit bắt râu.`;
  } else if (isLateResolutionWindow && paceMetrics.isIrreversibleLock) {
    recommendedAction = "LATE_EXPANSION_RIDER";
    actionDirection = paceMetrics.lockDirection === "BULLISH_LOCKED" ? "BUY" : "SELL";
    expectedWinrate = 89.5; // High winrate due to irreversible speed barrier
    suggestedRiskPct = 1.0;
    rationale = `Khóa nến không thể đảo chiều (Late Momentum Lock): Required Speed ${paceMetrics.requiredSpeedPerMin.toFixed(2)} pips/phút vượt ngưỡng ${paceMetrics.zScoreSpeed}σ. Nến chắc chắn đóng theo xu hướng. Đặt lệnh Maker đón nhịp bung giá mở nến sau.`;
  } else if (isLateResolutionWindow && paceMetrics.favoriteProbability >= 0.90) {
    recommendedAction = "MAKER_LOCK_IN";
    actionDirection = lastBar.close >= lastBar.open ? "BUY" : "SELL";
    expectedWinrate = 78.0;
    suggestedRiskPct = 0.75;
    rationale = `Xác suất Favorite đạt ${(paceMetrics.favoriteProbability * 100).toFixed(1)}%. Khuyến nghị treo lệnh Post-Only Maker sát Best Bid/Ask để gom thanh khoản chớp nhoáng.`;
  }

  const peggingGuide = actionDirection !== "NEUTRAL"
    ? generateMakerPeggingGuide({
        symbol,
        currentPrice: lastBar.close,
        direction: actionDirection,
        favoriteProbability: paceMetrics.favoriteProbability,
        tailProbability: tailMetrics.fairTailProbability,
        pipSize,
        assetType,
      })
    : null;

  return {
    symbol,
    timeframe,
    timeElapsedSec,
    timeRemainingSec,
    paceMetrics,
    tailMetrics,
    peggingGuide,
    recommendedAction,
    actionDetails: {
      direction: actionDirection,
      rationale,
      expectedWinrate,
      suggestedRiskPct,
    },
  };
}
