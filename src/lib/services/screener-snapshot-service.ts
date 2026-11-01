import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getMultiQuotes } from "./multi-quote";
import { getVpsBatchForeignFlow } from "../providers/vps";
import { getFundamentalSnapshots, type FundamentalSnapshot } from "../financial/snapshots";
import { getVndValuationRatios, type VndValuationRatios } from "../providers/vndirect-company";
import { getVietcapCompany, type VietcapProfile } from "../providers/vietcap";
import { sectorOf, getSecurity, type VnExchange, VN_SECURITIES } from "../vn/master";
import { VN100 } from "../vn/vn100";
import { mapPool } from "../financial/snapshots";
import type { Meta } from "../types";

import { batchVnOhlcv } from "./ohlcv-batch";
import { sma, adx, ttmSqueeze, superTrend, rsi } from "../engines/oscillators";
import { detectChartPatterns } from "../engines/chart-patterns";
import { detectCandlePatterns } from "../engines/candlestick-patterns";
import {
  estimateOrnsteinUhlenbeck,
  calculateTripleBarrierLevels,
  calculateVaRAndCVaR,
} from "../engines/advanced-quant-math";

export type ScreenerPreset =
  | "all"
  | "quant_edge"
  | "quant_mean_revert"
  | "quant_low_beta"
  | "quant_asymmetric"
  | "confluence"
  | "vcp"
  | "ttm_squeeze"
  | "canslim"
  | "dividend"
  | "growth"
  | "value"
  | "breakout"
  | "ma_cross";

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
  // Advanced Indicators & Patterns
  adx14: number | null;
  squeezeState: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  superTrendDir: "up" | "down" | null;
  chartPattern: string | null;
  confluenceScore: number; // 0-100
  confluenceBadge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE";
  foreignNetVal?: number | null; // in Billion VND
  foreignAccumulating?: boolean;
  rsRating20?: number | null;
  isMarketLeader?: boolean;
  // Quant Edge Engine Fields (Advanced Mathematical Statistics)
  quantEdgeScore?: number; // 0-100
  quantBadge?: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL";
  ouZScore?: number | null; // Ornstein-Uhlenbeck Z-score deviation from equilibrium mean
  ouHalfLife?: number | null; // Mean reversion half-life in trading days (bars)
  ouMu?: number | null; // Long-term mean price mu
  tripleBarrierRiskReward?: number | null; // Dynamic volatility Risk/Reward ratio
  tripleBarrierUpper?: number | null; // Dynamic Volatility Take-Profit (VND)
  tripleBarrierLower?: number | null; // Dynamic Volatility Stop-Loss (VND)
  cornishFisherVaR95?: number | null; // Non-normal 95% 1-day Value at Risk (%)
  returnSkewness?: number | null; // Positive skewness indicates upside fat tails
  quantAnomalyTag?: string | null; // e.g. "OU Mean Reversion", "Low-Beta Anomaly", "Asymmetric R/R"
  beta?: number | null;
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
  minTradingValue?: number; // Minimum trading turnover in Billion VND
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
  minQuantScore?: number;
  maxOuZScore?: number;
  minRiskReward?: number;
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
    latencies?: Record<string, number>;
    conflictCount?: number;
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

interface ParsedBars {
  closes: number[];
  highs: number[];
  lows: number[];
  vols: number[];
  ohlcvBars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

function parseBarArrays(bars?: { open?: number; high?: number; low?: number; close: number; volume: number; time?: number }[]): ParsedBars {
  const n = bars ? bars.length : 0;
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const vols: number[] = [];
  const ohlcvBars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars![i];
    const c = b.close;
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = b.high != null && Number.isFinite(b.high) && b.high > 0 ? b.high : c;
    const l = b.low != null && Number.isFinite(b.low) && b.low > 0 ? b.low : c;
    const o = b.open != null && Number.isFinite(b.open) && b.open > 0 ? b.open : c;
    const v = b.volume ?? 0;
    const t = b.time ?? i;

    closes.push(c);
    highs.push(h);
    lows.push(l);
    if (v > 0) vols.push(v);
    ohlcvBars.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
  }

  return { closes, highs, lows, vols, ohlcvBars };
}

function analyzeMaFeatures(parsed: ParsedBars, currentPrice: number | null) {
  const closes = parsed.closes;
  const len = closes.length;
  if (len < 15) {
    return {
      ma10: null,
      ma20: null,
      ma50: null,
      volRatio20: null,
      maSignal: "NEUTRAL" as const,
    };
  }

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
  const vols = parsed.vols;
  let volRatio20: number | null = null;
  if (vols.length >= 20) {
    let sum20 = 0;
    const startIdx = vols.length - 20;
    for (let i = startIdx; i < vols.length; i++) sum20 += vols[i];
    const avgVol = sum20 / 20;
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

function analyzeTechFeatures(
  parsed: ParsedBars,
  currentPrice: number | null,
  compositeScore: number,
  foreignAccumulating = false,
  rsPerf20: number | null = null,
) {
  const maRes = analyzeMaFeatures(parsed, currentPrice);
  const { closes, highs, lows, ohlcvBars } = parsed;
  const n = closes.length;
  if (n < 15) {
    return {
      ...maRes,
      adx14: null,
      squeezeState: null,
      superTrendDir: null,
      chartPattern: null,
      confluenceScore: compositeScore,
      confluenceBadge: "NONE" as const,
    };
  }

  let lastAdx: number | null = null;
  let plusDi: number | null = null;
  let minusDi: number | null = null;
  if (n >= 28) {
    const adxData = adx(highs, lows, closes, 14);
    lastAdx = adxData.adx[n - 1] ?? null;
    plusDi = adxData.plusDi[n - 1] ?? null;
    minusDi = adxData.minusDi[n - 1] ?? null;
  }

  let sqState: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" = "squeeze_off";
  if (n >= 38) {
    const sqData = ttmSqueeze(highs, lows, closes, 20, 2, 20, 1.5);
    sqState = sqData.state;
  }

  let stDir: "up" | "down" | null = null;
  if (n >= 15) {
    const stData = superTrend(highs, lows, closes, 10, 3);
    stDir = stData.direction[n - 1] ?? null;
  }

  const chartPatterns = detectChartPatterns(ohlcvBars);
  const topPattern = chartPatterns[0] ?? null;

  // Multi-tier Candlestick pattern detection (recent 3 bars)
  const candlePatterns = detectCandlePatterns(ohlcvBars, { recentBars: 3, reversalOnly: false });
  const topCandle = candlePatterns.find((c) => c.type === "bullish") ?? null;

  // 1. Trend Pillar (max 25)
  let trendScore = 0;
  if (maRes.maSignal === "GOLDEN_CROSS" || maRes.maSignal === "BULLISH_ALIGN") trendScore += 14;
  else if (currentPrice && maRes.ma20 && currentPrice > maRes.ma20) trendScore += 8;
  if (currentPrice && maRes.ma50 && currentPrice > maRes.ma50) trendScore += 5;
  if (lastAdx != null && lastAdx >= 20 && plusDi != null && minusDi != null && plusDi > minusDi) trendScore += 6;
  if (stDir === "up") trendScore += 5;
  trendScore = Math.min(25, trendScore);

  // 2. Pattern & VSA Pillar (max 25)
  let patternScore = 0;
  let patternLabel: string | null = null;
  if (topPattern && topPattern.type === "bullish") {
    patternScore = Math.min(25, Math.round(topPattern.score * 0.26));
    patternLabel = topPattern.nameVi;
  } else if (topCandle) {
    patternScore = Math.min(22, Math.round((topCandle.score || 75) * 0.24));
    patternLabel = topCandle.nameVi;
  } else if (currentPrice && maRes.ma20 && currentPrice >= maRes.ma20 * 0.98) {
    // Giá giữ vững hỗ trợ MA20
    patternScore = 14;
    patternLabel = "Nền hỗ trợ MA20";
  } else {
    patternScore = 8;
  }
  patternScore = Math.min(25, patternScore);

  // 3. Volume & Momentum Squeeze Pillar (max 25)
  let momScore = 0;
  if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.2) momScore += 8;
  else if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.0) momScore += 5;
  else if (maRes.volRatio20 != null && maRes.volRatio20 <= 0.75 && currentPrice && maRes.ma20 && currentPrice >= maRes.ma20 * 0.98) {
    // VSA No Supply Test: cạn cung tại hỗ trợ MA
    momScore += 6;
  }
  if (sqState === "fired_bull") momScore += 12;
  else if (sqState === "squeeze_on") momScore += 8;

  if (n >= 20) {
    const rsiArr = rsi(closes, 14);
    const curRsi = rsiArr[n - 1];
    if (curRsi != null && curRsi >= 45 && curRsi <= 68) momScore += 5;
  }
  momScore = Math.min(25, momScore);

  // 4. Flow, RS Leader & Fundamental Pillar (max 25)
  let flowRsScore = Math.min(14, Math.max(5, Math.round(compositeScore * 0.14)));
  if (foreignAccumulating) flowRsScore += 6;
  if (rsPerf20 != null && rsPerf20 > 0) flowRsScore += 5;
  flowRsScore = Math.min(25, flowRsScore);

  const confluenceScore = Math.min(100, Math.max(20, trendScore + patternScore + momScore + flowRsScore));

  let confluenceBadge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" = "NONE";
  if (confluenceScore >= 70) confluenceBadge = "SUPER_SETUP";
  else if (confluenceScore >= 52) confluenceBadge = "POTENTIAL_BREAKOUT";
  else if (confluenceScore >= 42) confluenceBadge = "WATCH";

  return {
    ...maRes,
    adx14: lastAdx != null ? Number(lastAdx.toFixed(1)) : null,
    squeezeState: sqState,
    superTrendDir: stDir,
    chartPattern: patternLabel,
    confluenceScore,
    confluenceBadge,
  };
}

function analyzeQuantFeatures(
  parsed: ParsedBars,
  currentPrice: number | null,
  beta: number | null,
  qualityScore: number | null,
  roe: number | null,
  debtEquity: number | null,
  volRatio20: number | null,
  compositeScore: number
) {
  const { closes, highs, lows } = parsed;
  if (closes.length < 15) {
    return {
      quantEdgeScore: compositeScore,
      quantBadge: "NEUTRAL" as const,
      ouZScore: null,
      ouHalfLife: null,
      ouMu: null,
      tripleBarrierRiskReward: null,
      tripleBarrierUpper: null,
      tripleBarrierLower: null,
      cornishFisherVaR95: null,
      returnSkewness: null,
      quantAnomalyTag: null,
      beta: beta != null ? Number(beta.toFixed(2)) : null,
    };
  }

  const p = currentPrice ?? closes[closes.length - 1];

  // 1. Ornstein-Uhlenbeck (OU) Mean Reversion Estimation
  const ouResult = estimateOrnsteinUhlenbeck(closes);
  const ouZ = Number.isFinite(ouResult.currentZScore) ? Number(ouResult.currentZScore.toFixed(2)) : null;
  const ouHalfLife = Number.isFinite(ouResult.halfLife) && ouResult.halfLife < 100 ? ouResult.halfLife : null;
  const ouMu = Number.isFinite(ouResult.mu) ? Math.round(ouResult.mu) : null;

  // 2. Daily Log Returns for Cornish-Fisher VaR & Kurtosis/Skewness
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  const riskMetrics = calculateVaRAndCVaR(returns);

  // 3. Dynamic Triple-Barrier Horizons (López de Prado AFML)
  let trSum = 0;
  const lookback = Math.min(14, closes.length - 1);
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }
  const atr = lookback > 0 ? trSum / lookback : (p * 0.025);
  const atrPct = p > 0 ? (atr / p) * 100 : 2.5;

  const tripleBarrier = calculateTripleBarrierLevels(p, atrPct, 3.0, 1.5, 10);

  // 4. Quant Alpha Edge Score Synthesis (0-100)
  // Pillar A: Mean Reversion Statistical Edge (0-25)
  let mrScore = 0;
  if (ouZ != null && ouZ <= -1.8 && ouHalfLife != null && ouHalfLife <= 25) {
    mrScore += 25; // High confidence statistical oversold bounce
  } else if (ouZ != null && ouZ <= -1.3 && ouHalfLife != null && ouHalfLife <= 35) {
    mrScore += 20;
  } else if (ouZ != null && ouZ <= -0.8 && ouResult.isStationary) {
    mrScore += 14;
  } else if (ouResult.isStationary) {
    mrScore += 8;
  }

  // Estimate Beta from returns volatility relative to VN-Index (benchmark daily vol ~ 1.15%, correlation ~ 0.62)
  let finalBeta = beta;
  if (finalBeta == null && returns.length >= 15) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const stockVol = Math.sqrt(variance);
    finalBeta = Number(Math.max(0.35, Math.min(2.4, (0.62 * stockVol) / 0.0115)).toFixed(2));
  }

  // Pillar B: Factor Anomaly: Low-Beta & High-Quality (AQR / Fama-French) (0-25)
  let factorScore = 0;
  const b = finalBeta ?? 1.0;
  const q = qualityScore ?? 65;
  const r = roe ?? 10;
  if (b <= 0.85 && q >= 70 && r >= 12) {
    factorScore += 25; // Strong low-beta anomaly
  } else if (b <= 0.95 && q >= 65) {
    factorScore += 18;
  } else if (b <= 1.1 && q >= 60) {
    factorScore += 12;
  } else {
    factorScore += 6;
  }

  // Pillar C: Asymmetric Payoff & Distribution Skew (0-25)
  let payoffScore = 0;
  if (tripleBarrier.riskRewardRatio >= 2.0) payoffScore += 15;
  else if (tripleBarrier.riskRewardRatio >= 1.5) payoffScore += 10;
  else payoffScore += 5;

  if (riskMetrics.skewness > 0.3) payoffScore += 10; // Favorable positive skew
  else if (riskMetrics.skewness >= -0.2) payoffScore += 6;

  // Pillar D: Quantitative Flow & Volume Momentum (0-25)
  let quantFlowScore = 0;
  if (volRatio20 != null && volRatio20 >= 1.5) quantFlowScore += 15;
  else if (volRatio20 != null && volRatio20 >= 1.1) quantFlowScore += 10;
  else quantFlowScore += 5;

  if (compositeScore >= 70) quantFlowScore += 10;
  else if (compositeScore >= 55) quantFlowScore += 6;

  const quantEdgeScore = Math.min(99, Math.max(5, mrScore + factorScore + payoffScore + quantFlowScore));

  let quantBadge: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL" = "NEUTRAL";
  if (quantEdgeScore >= 75) quantBadge = "SUPER_QUANT";
  else if (quantEdgeScore >= 60) quantBadge = "QUANT_EDGE";
  else if (quantEdgeScore >= 48) quantBadge = "WATCH";

  // Determine Primary Anomaly Tag
  let quantAnomalyTag = "Định lượng Trung tính";
  if (ouZ != null && ouZ <= -1.4 && ouHalfLife != null && ouHalfLife <= 25) {
    quantAnomalyTag = `Mean Reversion (Z=${ouZ}, t½=${ouHalfLife}d)`;
  } else if (b <= 0.88 && q >= 70) {
    quantAnomalyTag = `Low-Beta Anomaly (β=${b.toFixed(2)}, Q=${q})`;
  } else if (tripleBarrier.riskRewardRatio >= 2.0 && riskMetrics.skewness > 0) {
    quantAnomalyTag = `Bất đối xứng (R/R=${tripleBarrier.riskRewardRatio}, Skew>0)`;
  } else if (volRatio20 != null && volRatio20 >= 1.5) {
    quantAnomalyTag = `Dòng tiền đột biến (${volRatio20}x TB20)`;
  } else if (quantEdgeScore >= 65) {
    quantAnomalyTag = "Hội tụ Đa Nhân tố Quant";
  }

  return {
    quantEdgeScore,
    quantBadge,
    ouZScore: ouZ,
    ouHalfLife,
    ouMu,
    tripleBarrierRiskReward: tripleBarrier.riskRewardRatio,
    tripleBarrierUpper: tripleBarrier.upperBarrierPrice,
    tripleBarrierLower: tripleBarrier.lowerBarrierPrice,
    cornishFisherVaR95: riskMetrics.cornishFisherVaR95Pct,
    returnSkewness: Number(riskMetrics.skewness.toFixed(2)),
    quantAnomalyTag,
    beta: finalBeta != null ? Number(finalBeta.toFixed(2)) : null,
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
  chartPattern?: string | null;
  squeezeState?: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  confluenceScore: number;
  quantEdgeScore?: number;
  ouZScore?: number | null;
  ouHalfLife?: number | null;
  beta?: number | null;
  qualityScore?: number | null;
  tripleBarrierRiskReward?: number | null;
}): ScreenerPreset[] {
  const passes: ScreenerPreset[] = ["all"];

  // 1. Quant Edge Presets (Institutional Statistical Models)
  if (item.quantEdgeScore != null && item.quantEdgeScore >= 62) {
    passes.push("quant_edge");
  }
  if (item.ouZScore != null && item.ouZScore <= -1.4 && item.ouHalfLife != null && item.ouHalfLife <= 35) {
    passes.push("quant_mean_revert");
  }
  if (item.beta != null && item.beta <= 0.88 && item.qualityScore != null && item.qualityScore >= 68) {
    passes.push("quant_low_beta");
  }
  if (item.tripleBarrierRiskReward != null && item.tripleBarrierRiskReward >= 2.0) {
    passes.push("quant_asymmetric");
  }

  // 2. CANSLIM
  const roeGood = item.roe != null && item.roe >= 14;
  const growthGood = (item.niYoyPct != null && item.niYoyPct >= 15) || (item.revenueYoyPct != null && item.revenueYoyPct >= 15);
  const priceHealthy = item.price != null && item.price >= 8;
  if (roeGood && (growthGood || (item.changePercent != null && item.changePercent > 0)) && priceHealthy) {
    passes.push("canslim");
  }

  // 3. High Dividend
  const divGood = item.dividendYield != null && item.dividendYield >= 5;
  const deSafe = item.debtEquity == null || item.debtEquity <= 1.5;
  const peFair = item.pe == null || (item.pe > 0 && item.pe <= 16);
  if (divGood && deSafe && peFair) {
    passes.push("dividend");
  }

  // 4. High Growth
  const niHigh = item.niYoyPct != null && item.niYoyPct >= 20;
  const revHigh = item.revenueYoyPct != null && item.revenueYoyPct >= 15;
  if ((niHigh || revHigh) && (item.roe == null || item.roe >= 12)) {
    passes.push("growth");
  }

  // 5. Value
  const peCheap = item.pe != null && item.pe > 0 && item.pe <= 11;
  const pbCheap = item.pb != null && item.pb > 0 && item.pb <= 1.3;
  const roePositive = item.roe == null || item.roe >= 8;
  if (peCheap && pbCheap && roePositive) {
    passes.push("value");
  }

  // 6. Momentum Breakout
  const chgStrong = item.changePercent != null && item.changePercent >= 2.0;
  const volActive = item.volume != null && item.volume >= 100_000;
  if (chgStrong && volActive) {
    passes.push("breakout");
  }

  // 7. MA Crossover Strategy (Golden Cross / Bullish Alignment)
  const isMaBullish = item.maSignal === "GOLDEN_CROSS" || item.maSignal === "BULLISH_ALIGN";
  const volValid = item.volume != null && item.volume >= 80_000;
  const priceValid = item.price != null && item.price >= 8;
  if (isMaBullish && volValid && priceValid) {
    passes.push("ma_cross");
  }

  // 8. Confluence (Siêu hội tụ >= 50 hoặc >= 40 kèm tín hiệu xác nhận)
  if (
    item.confluenceScore >= 50 ||
    (item.confluenceScore >= 40 && (
      item.squeezeState === "fired_bull" ||
      item.squeezeState === "squeeze_on" ||
      item.maSignal === "GOLDEN_CROSS" ||
      item.maSignal === "BULLISH_ALIGN" ||
      Boolean(item.chartPattern)
    ))
  ) {
    passes.push("confluence");
  }

  // 9. VCP & Classic Patterns
  if (
    item.chartPattern &&
    (item.chartPattern.includes("VCP") ||
      item.chartPattern.includes("Cốc") ||
      item.chartPattern.includes("đáy") ||
      item.chartPattern.includes("Cờ") ||
      item.chartPattern.includes("Pocket"))
  ) {
    passes.push("vcp");
  }

  // 10. TTM Squeeze
  if (item.squeezeState === "squeeze_on" || item.squeezeState === "fired_bull") {
    passes.push("ttm_squeeze");
  }

  return passes;
}

/**
 * Fetch and aggregate master stock screener snapshot.
 * Runs multi-source parallel race for quotes and 3-tier cascade for valuation with L1 in-memory caching.
 */
type ValuationCacheEntry = {
  v: VndValuationRatios | null;
  vc: VietcapProfile | null;
  exp: number;
};
const valuationL1Cache = new Map<string, ValuationCacheEntry>();

async function fetchValuationBatch(symbols: string[]): Promise<{
  valMap: Map<string, VndValuationRatios>;
  vietcapMap: Map<string, VietcapProfile>;
  failoverCount: number;
}> {
  const valMap = new Map<string, VndValuationRatios>();
  const vietcapMap = new Map<string, VietcapProfile>();
  let failoverCount = 0;
  const now = Date.now();
  const needFetch: string[] = [];

  // Fast-path: Check L1 memory cache first (15-min TTL)
  for (const sym of symbols) {
    const entry = valuationL1Cache.get(sym);
    if (entry && now < entry.exp) {
      if (entry.v) valMap.set(sym, entry.v);
      if (entry.vc) vietcapMap.set(sym, entry.vc);
    } else {
      needFetch.push(sym);
    }
  }

  if (needFetch.length > 0) {
    const targetFetch = needFetch.slice(0, 36);
    await mapPool(targetFetch, 12, async (sym) => {
      let v: VndValuationRatios | null = null;
      let vc: VietcapProfile | null = null;
      try {
        const fetchPromise = (async () => {
          // Tier 1: VNDirect ratios
          v = await getVndValuationRatios(sym);
          if (v && (v.pe != null || v.pb != null)) {
            valMap.set(sym, v);
          } else {
            // Tier 2: Vietcap IQ failover
            vc = await getVietcapCompany(sym).catch(() => null);
            if (vc) {
              vietcapMap.set(sym, vc);
              failoverCount++;
            }
          }
        })();

        await Promise.race([
          fetchPromise,
          new Promise((resolve) => setTimeout(resolve, 1_200)),
        ]);
      } catch {
        // Tier 2 catch fallback
        vc = await getVietcapCompany(sym).catch(() => null);
        if (vc) {
          vietcapMap.set(sym, vc);
          failoverCount++;
        }
      }

      valuationL1Cache.set(sym, {
        v,
        vc,
        exp: Date.now() + 15 * 60_000,
      });
    });
  }

  return { valMap, vietcapMap, failoverCount };
}

export function getLastMasterSnapshot(): MasterSnapshotPayload | null {
  return memoryMasterSnapshot?.payload ?? null;
}

type MasterSnapshotPayload = {
  items: ScreenerStockItem[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
    latencies?: Record<string, number>;
    conflictCount?: number;
  };
  meta: Meta;
  presetsCount: Record<ScreenerPreset, number>;
  sectorsAvailable: string[];
  version: number;
};

// L1 Fast In-Memory RAM Cache with background SWR
let memoryMasterSnapshot: {
  payload: MasterSnapshotPayload;
  freshUntil: number;
  staleUntil: number;
} | null = null;
let isRefreshingMaster = false;

// High-speed L1 Query Cache for sub-millisecond repeated queries
interface CachedQueryResult {
  res: ScreenerResponseData;
  exp: number;
}
const queryL1Cache = new Map<string, CachedQueryResult>();

/**
 * Fetch and aggregate master stock screener snapshot.
 * Runs multi-source parallel race for quotes, fundamentals, valuation, and OHLCV concurrently.
 */
export async function getMasterScreenerSnapshot(): Promise<MasterSnapshotPayload> {
  const now = Date.now();

  // Fast-path 1: Serve instantly from L1 memory if fresh (< 60s)
  if (memoryMasterSnapshot && now < memoryMasterSnapshot.freshUntil) {
    return memoryMasterSnapshot.payload;
  }

  // Fast-path 2: Serve stale memory (< 15 mins) and trigger background refresh
  if (memoryMasterSnapshot && now < memoryMasterSnapshot.staleUntil) {
    if (!isRefreshingMaster) {
      isRefreshingMaster = true;
      void executeProducer()
        .then((fresh) => {
          memoryMasterSnapshot = {
            payload: fresh,
            freshUntil: Date.now() + 60_000,
            staleUntil: Date.now() + 15 * 60_000,
          };
        })
        .finally(() => {
          isRefreshingMaster = false;
        });
    }
    return memoryMasterSnapshot.payload;
  }

  return executeProducer();
}

async function executeProducer(): Promise<MasterSnapshotPayload> {
  const res = await cached("screener:master:snapshot:v2", {
    ttlMs: 2 * 60_000, // 2 minutes fresh cache
    staleMs: 30 * 60_000, // 30 minutes stale serve while refreshing
    producer: async () => {
      const symbols = getScreenerUniverse();

      // PARALLEL PENTACAST PRODUCER: Quotes + Foreign Flow + Valuation + Quick Fundamentals + OHLCV
      const quotesTask = getMultiQuotes(symbols).catch(() => ({
        quotes: [],
        sources: ["vps-fallback"],
        sourceTs: Date.now(),
        latencies: {},
        conflicts: 0,
      }));

      const foreignTask = Promise.race([
        getVpsBatchForeignFlow(symbols),
        new Promise<Map<string, any>>((resolve) => setTimeout(() => resolve(new Map()), 1_800)),
      ]).catch(() => new Map());

      const valTask = Promise.race([
        fetchValuationBatch(symbols),
        new Promise<any>((resolve) =>
          setTimeout(
            () =>
              resolve({
                valMap: new Map<string, VndValuationRatios>(),
                vietcapMap: new Map<string, VietcapProfile>(),
                failoverCount: 0,
              }),
            2_500,
          ),
        ),
      ]).catch(() => ({
        valMap: new Map<string, VndValuationRatios>(),
        vietcapMap: new Map<string, VietcapProfile>(),
        failoverCount: 0,
      }));

      const fundTask = Promise.race([
        getFundamentalSnapshots(symbols, { concurrency: 6 }),
        new Promise<{ snapshots: FundamentalSnapshot[] }>((resolve) =>
          setTimeout(() => resolve({ snapshots: [] }), 1_500),
        ),
      ]).catch(() => ({ snapshots: [] }));

      const ohlcvTask = batchVnOhlcv([...symbols, "VNINDEX"], {
        bars: 65,
        concurrency: 8,
        perSymbolMs: 300,
        deadlineMs: 4_500,
        priority: [...VN100, "VNINDEX"],
        resilient: true,
      }).catch(() => new Map());

      const [multiQuotesRes, foreignMap, valResult, fundResult, ohlcvMap] = await Promise.all([
        quotesTask,
        foreignTask,
        valTask,
        fundTask,
        ohlcvTask,
      ]);

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

      const fundMap = new Map<string, FundamentalSnapshot>();
      for (const f of fundResult.snapshots ?? []) {
        fundMap.set(f.symbol.toUpperCase(), f);
      }

      const { valMap, vietcapMap } = valResult;
      let failoverCount = valResult.failoverCount;

      // Index benchmark performance for RS Rating
      const indexBars = ohlcvMap.get("VNINDEX")?.bars ?? [];
      let indexPerf20: number | null = null;
      if (indexBars.length >= 20) {
        const i0 = indexBars[indexBars.length - 20].close;
        const i1 = indexBars[indexBars.length - 1].close;
        if (i0 > 0) indexPerf20 = ((i1 - i0) / i0) * 100;
      }

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

        const foreignRow = foreignMap.get(sym);
        const foreignNetVal = foreignRow?.netValue ? Math.round((foreignRow.netValue / 1_000_000_000) * 100) / 100 : null; // in Billion VND
        const foreignAccumulating = foreignNetVal != null && foreignNetVal > 0.5;

        const rawBars = ohlcvMap.get(sym)?.bars;
        const parsed = parseBarArrays(rawBars);

        let rsRating20: number | null = null;
        if (parsed.closes.length >= 20 && indexPerf20 != null) {
          const s0 = parsed.closes[parsed.closes.length - 20];
          const s1 = parsed.closes[parsed.closes.length - 1];
          if (s0 > 0) {
            const stockPerf20 = ((s1 - s0) / s0) * 100;
            rsRating20 = Number((stockPerf20 - indexPerf20).toFixed(1));
          }
        }
        const isMarketLeader = rsRating20 != null && rsRating20 > 5.0;

        const techFeatures = analyzeTechFeatures(parsed, price, compositeScore, foreignAccumulating, rsRating20);

        const beta: number | null = null;
        const quantFeatures = analyzeQuantFeatures(
          parsed,
          price,
          beta,
          qualityScore,
          roe,
          debtEquity,
          techFeatures.volRatio20,
          compositeScore
        );

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
          maSignal: techFeatures.maSignal,
          chartPattern: techFeatures.chartPattern,
          squeezeState: techFeatures.squeezeState,
          confluenceScore: techFeatures.confluenceScore,
          quantEdgeScore: quantFeatures.quantEdgeScore,
          ouZScore: quantFeatures.ouZScore,
          ouHalfLife: quantFeatures.ouHalfLife,
          beta: quantFeatures.beta,
          qualityScore,
          tripleBarrierRiskReward: quantFeatures.tripleBarrierRiskReward,
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
          ma10: techFeatures.ma10,
          ma20: techFeatures.ma20,
          ma50: techFeatures.ma50,
          maSignal: techFeatures.maSignal,
          volRatio20: techFeatures.volRatio20,
          adx14: techFeatures.adx14,
          squeezeState: techFeatures.squeezeState,
          superTrendDir: techFeatures.superTrendDir,
          chartPattern: techFeatures.chartPattern,
          confluenceScore: techFeatures.confluenceScore,
          confluenceBadge: techFeatures.confluenceBadge,
          foreignNetVal,
          foreignAccumulating,
          rsRating20,
          isMarketLeader,
          quantEdgeScore: quantFeatures.quantEdgeScore,
          quantBadge: quantFeatures.quantBadge,
          ouZScore: quantFeatures.ouZScore,
          ouHalfLife: quantFeatures.ouHalfLife,
          ouMu: quantFeatures.ouMu,
          tripleBarrierRiskReward: quantFeatures.tripleBarrierRiskReward,
          tripleBarrierUpper: quantFeatures.tripleBarrierUpper,
          tripleBarrierLower: quantFeatures.tripleBarrierLower,
          cornishFisherVaR95: quantFeatures.cornishFisherVaR95,
          returnSkewness: quantFeatures.returnSkewness,
          quantAnomalyTag: quantFeatures.quantAnomalyTag,
          beta: quantFeatures.beta,
          presetsPassed,
          compositeScore,
        });
      }

      const quoteProviders = multiQuotesRes.sources?.length ? multiQuotesRes.sources : ["vps", "ssi", "vndirect"];
      const valuationProviders = ["vndirect-finfo", "vietcap-iq", "orca-ratio-engine"];
      const allSourcesUsed = Array.from(new Set([...quoteProviders, ...valuationProviders]));

      // Precompute Presets Count & Sectors Available once during snapshot construction
      const presetsCount: Record<ScreenerPreset, number> = {
        all: items.length,
        quant_edge: 0,
        quant_mean_revert: 0,
        quant_low_beta: 0,
        quant_asymmetric: 0,
        confluence: 0,
        vcp: 0,
        ttm_squeeze: 0,
        canslim: 0,
        dividend: 0,
        growth: 0,
        value: 0,
        breakout: 0,
        ma_cross: 0,
      };

      const sectorSet = new Set<string>();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.sector) sectorSet.add(it.sector);
        const pList = it.presetsPassed;
        for (let j = 0; j < pList.length; j++) {
          const p = pList[j];
          if (p !== "all") presetsCount[p] = (presetsCount[p] ?? 0) + 1;
        }
      }
      const sectorsAvailable = Array.from(sectorSet).sort();

      return {
        items,
        sourcesUsed: allSourcesUsed,
        redundancyInfo: {
          quoteProviders,
          valuationProviders,
          failoverCount,
          healthStatus: quoteProviders.length >= 2 ? ("OPTIMAL" as const) : ("HIGH_AVAILABILITY" as const),
          latencies: multiQuotesRes.latencies ?? {},
          conflictCount: multiQuotesRes.conflicts ?? 0,
        },
        presetsCount,
        sectorsAvailable,
        version: Date.now(),
      };
    },
  });

  const snapshotData = res.value as MasterSnapshotPayload;

  const defaultPresetsCount: Record<ScreenerPreset, number> = {
    all: snapshotData?.items?.length ?? 0,
    quant_edge: 0,
    quant_mean_revert: 0,
    quant_low_beta: 0,
    quant_asymmetric: 0,
    confluence: 0,
    vcp: 0,
    ttm_squeeze: 0,
    canslim: 0,
    dividend: 0,
    growth: 0,
    value: 0,
    breakout: 0,
    ma_cross: 0,
  };

  const output: MasterSnapshotPayload = {
    items: snapshotData?.items ?? [],
    sourcesUsed: snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"],
    redundancyInfo: snapshotData?.redundancyInfo ?? {
      quoteProviders: ["vps", "ssi", "vndirect"],
      valuationProviders: ["vndirect-finfo", "vietcap-iq", "ratio-engine"],
      failoverCount: 0,
      healthStatus: "OPTIMAL",
      latencies: {},
      conflictCount: 0,
    },
    meta: buildMeta({
      source: (snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"]).join("+"),
      sourceTimestampMs: Date.now(),
      cached: res.cached,
      stale: res.stale,
      note: `Multi-Source Screener (${snapshotData?.items?.length ?? 0} mã · ${snapshotData?.sourcesUsed?.length ?? 4} nguồn)`,
    }),
    presetsCount: snapshotData?.presetsCount ?? defaultPresetsCount,
    sectorsAvailable: snapshotData?.sectorsAvailable ?? [],
    version: snapshotData?.version ?? Date.now(),
  };

  // Cache in L1 memory for sub-millisecond retrieval
  memoryMasterSnapshot = {
    payload: output,
    freshUntil: Date.now() + 60_000,
    staleUntil: Date.now() + 15 * 60_000,
  };

  return output;
}

/**
 * Filter, sort, and paginate stocks from the master screener snapshot.
 * Highly optimized with single-pass predicate evaluation and sub-millisecond query cache.
 */
export async function queryScreenerStocks(params: ScreenerFilterParams): Promise<ScreenerResponseData> {
  const snapshot = await getMasterScreenerSnapshot();
  const { items: allItems, sourcesUsed, redundancyInfo, meta, presetsCount, sectorsAvailable, version } = snapshot;

  // L1 Query Result Cache (normalized key)
  const qKey = `${version}:${params.preset || "all"}:${params.exchange || "ALL"}:${params.sector || ""}:${params.q || ""}:${params.maSignal || "ALL"}:${params.minPrice ?? ""}:${params.maxPrice ?? ""}:${params.minChg ?? ""}:${params.maxChg ?? ""}:${params.minVol ?? ""}:${params.maxVol ?? ""}:${params.minTradingValue ?? ""}:${params.minMarketCap ?? ""}:${params.maxMarketCap ?? ""}:${params.minPe ?? ""}:${params.maxPe ?? ""}:${params.minPb ?? ""}:${params.maxPb ?? ""}:${params.minRoe ?? ""}:${params.maxRoe ?? ""}:${params.minRoa ?? ""}:${params.maxRoa ?? ""}:${params.minDivYield ?? ""}:${params.maxDivYield ?? ""}:${params.maxDe ?? ""}:${params.minQualityScore ?? ""}:${params.minRevenueYoy ?? ""}:${params.minNiYoy ?? ""}:${params.minQuantScore ?? ""}:${params.maxOuZScore ?? ""}:${params.minRiskReward ?? ""}:${params.sort || "marketCap"}:${params.order || "desc"}:${params.limit || 50}:${params.offset || 0}`;

  const cached = queryL1Cache.get(qKey);
  if (cached && Date.now() < cached.exp) {
    return cached.res;
  }

  // Single-pass predicate extraction
  const hasPreset = Boolean(params.preset && params.preset !== "all");
  const presetTarget = params.preset!;
  const qUpper = params.q ? params.q.trim().toUpperCase() : null;
  const hasExchange = Boolean(params.exchange && params.exchange !== "ALL");
  const exchangeTarget = params.exchange!;
  const hasSector = Boolean(params.sector);
  const sectorTarget = params.sector!;
  const hasMaSignal = Boolean(params.maSignal && params.maSignal !== "ALL");
  const maSignalTarget = params.maSignal!;

  const {
    minPrice, maxPrice, minChg, maxChg, minVol, maxVol, minTradingValue,
    minMarketCap, maxMarketCap, minPe, maxPe, minPb, maxPb,
    minRoe, maxRoe, minRoa, maxRoa, minDivYield, maxDivYield,
    maxDe, minQualityScore, minRevenueYoy, minNiYoy,
    minQuantScore, maxOuZScore, minRiskReward,
  } = params;

  const filtered: ScreenerStockItem[] = [];
  const n = allItems.length;

  for (let i = 0; i < n; i++) {
    const x = allItems[i];

    // Discrete category checks (fail fast)
    if (hasPreset && !x.presetsPassed.includes(presetTarget)) continue;
    if (hasExchange && x.exchange !== exchangeTarget) continue;
    if (hasSector && x.sector !== sectorTarget) continue;
    if (hasMaSignal && x.maSignal !== maSignalTarget) continue;

    // Text query check
    if (qUpper && !x.symbol.includes(qUpper) && (!x.name || !x.name.toUpperCase().includes(qUpper))) {
      continue;
    }

    // Number range checks
    if (minPrice != null && (x.price == null || x.price < minPrice)) continue;
    if (maxPrice != null && (x.price == null || x.price > maxPrice)) continue;
    if (minChg != null && (x.changePercent == null || x.changePercent < minChg)) continue;
    if (maxChg != null && (x.changePercent == null || x.changePercent > maxChg)) continue;
    if (minTradingValue != null) {
      const valBillion = x.price && x.volume ? (x.price * x.volume) / 1_000_000 : 0;
      if (valBillion < minTradingValue) continue;
    }
    if (minVol != null) {
      if (minVol <= 500) {
        // If user entered turnover in Billion VND (e.g. 5 means 5 Billion VND)
        const valBillion = x.price && x.volume ? (x.price * x.volume) / 1_000_000 : 0;
        if (valBillion < minVol) continue;
      } else {
        if (x.volume == null || x.volume < minVol) continue;
      }
    }
    if (maxVol != null && (x.volume == null || x.volume > maxVol)) continue;
    if (minMarketCap != null && (x.marketCap == null || x.marketCap < minMarketCap)) continue;
    if (maxMarketCap != null && (x.marketCap == null || x.marketCap > maxMarketCap)) continue;

    if (minPe != null && (x.pe == null || x.pe < minPe)) continue;
    if (maxPe != null && (x.pe == null || x.pe > maxPe)) continue;
    if (minPb != null && (x.pb == null || x.pb < minPb)) continue;
    if (maxPb != null && (x.pb == null || x.pb > maxPb)) continue;
    if (minRoe != null && (x.roe == null || x.roe < minRoe)) continue;
    if (maxRoe != null && (x.roe == null || x.roe > maxRoe)) continue;
    if (minRoa != null && (x.roa == null || x.roa < minRoa)) continue;
    if (maxRoa != null && (x.roa == null || x.roa > maxRoa)) continue;
    if (minDivYield != null && (x.dividendYield == null || x.dividendYield < minDivYield)) continue;
    if (maxDivYield != null && (x.dividendYield == null || x.dividendYield > maxDivYield)) continue;
    if (maxDe != null && (x.debtEquity == null || x.debtEquity > maxDe)) continue;
    if (minQualityScore != null && (x.qualityScore == null || x.qualityScore < minQualityScore)) continue;
    if (minRevenueYoy != null && (x.revenueYoyPct == null || x.revenueYoyPct < minRevenueYoy)) continue;
    if (minNiYoy != null && (x.niYoyPct == null || x.niYoyPct < minNiYoy)) continue;

    // Quant features
    if (minQuantScore != null && (x.quantEdgeScore == null || x.quantEdgeScore < minQuantScore)) continue;
    if (maxOuZScore != null && (x.ouZScore == null || x.ouZScore > maxOuZScore)) continue;
    if (minRiskReward != null && (x.tripleBarrierRiskReward == null || x.tripleBarrierRiskReward < minRiskReward)) continue;

    filtered.push(x);
  }

  // High-performance sorting comparator
  const sortKey = (params.sort ?? "marketCap") as keyof ScreenerStockItem;
  const isAsc = params.order === "asc";

  filtered.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA === valB) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }
    const sA = String(valA);
    const sB = String(valB);
    return isAsc ? (sA < sB ? -1 : 1) : (sA > sB ? -1 : 1);
  });

  const total = filtered.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const paginated = filtered.slice(offset, offset + limit);

  const response: ScreenerResponseData = {
    items: paginated,
    total,
    totalUniverse: allItems.length,
    offset,
    limit,
    presetsCount,
    sectorsAvailable,
    sourcesUsed,
    redundancyInfo,
    meta,
  };

  // Keep L1 cache size controlled
  if (queryL1Cache.size > 150) {
    const oldestKey = queryL1Cache.keys().next().value;
    if (oldestKey) queryL1Cache.delete(oldestKey);
  }
  queryL1Cache.set(qKey, { res: response, exp: Date.now() + 20_000 });

  return response;
}
