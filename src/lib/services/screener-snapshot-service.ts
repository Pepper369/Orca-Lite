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
import { sma, adx, ttmSqueeze, superTrend } from "../engines/oscillators";
import { detectChartPatterns } from "../engines/chart-patterns";
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

function analyzeTechFeatures(
  bars: { open?: number; high?: number; low?: number; close: number; volume: number; time?: number }[],
  currentPrice: number | null,
  compositeScore: number,
) {
  const maRes = analyzeMaFeatures(bars, currentPrice);
  if (!bars || bars.length < 15) {
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

  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  const highs = bars.map((b) => b.high ?? b.close).filter((h) => Number.isFinite(h) && h > 0);
  const lows = bars.map((b) => b.low ?? b.close).filter((l) => Number.isFinite(l) && l > 0);
  const n = closes.length;

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

  const ohlcvBars = bars.map((b, idx) => ({
    time: b.time ?? idx,
    open: b.open ?? b.close,
    high: b.high ?? b.close,
    low: b.low ?? b.close,
    close: b.close,
    volume: b.volume ?? 0,
  }));
  const chartPatterns = detectChartPatterns(ohlcvBars);
  const topPattern = chartPatterns[0] ?? null;

  // 1. Trend Pillar (max 25)
  let trendScore = 0;
  if (maRes.maSignal === "GOLDEN_CROSS" || maRes.maSignal === "BULLISH_ALIGN") trendScore += 14;
  else if (currentPrice && maRes.ma20 && currentPrice > maRes.ma20) trendScore += 7;
  if (lastAdx != null && lastAdx >= 25 && plusDi != null && minusDi != null && plusDi > minusDi) trendScore += 6;
  if (stDir === "up") trendScore += 5;

  // 2. Pattern & VSA Pillar (max 25)
  let patternScore = 0;
  if (topPattern && topPattern.type === "bullish") {
    patternScore = Math.min(25, Math.round(topPattern.score * 0.26));
  }

  // 3. Volume & Momentum Squeeze Pillar (max 25)
  let momScore = 0;
  if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.2) momScore += 10;
  else if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.0) momScore += 5;
  if (sqState === "fired_bull") momScore += 15;
  else if (sqState === "squeeze_on") momScore += 10;

  // 4. Fundamental Pillar (max 25)
  const fundScore = Math.min(25, Math.round(compositeScore * 0.25));

  const confluenceScore = Math.min(100, Math.max(5, trendScore + patternScore + momScore + fundScore));

  let confluenceBadge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" = "NONE";
  if (confluenceScore >= 78) confluenceBadge = "SUPER_SETUP";
  else if (confluenceScore >= 65) confluenceBadge = "POTENTIAL_BREAKOUT";
  else if (confluenceScore >= 50) confluenceBadge = "WATCH";

  return {
    ...maRes,
    adx14: lastAdx != null ? Number(lastAdx.toFixed(1)) : null,
    squeezeState: sqState,
    superTrendDir: stDir,
    chartPattern: topPattern ? `${topPattern.nameVi}` : null,
    confluenceScore,
    confluenceBadge,
  };
}

function analyzeQuantFeatures(
  bars: { open?: number; high?: number; low?: number; close: number; volume: number; time?: number }[],
  currentPrice: number | null,
  beta: number | null,
  qualityScore: number | null,
  roe: number | null,
  debtEquity: number | null,
  volRatio20: number | null,
  compositeScore: number
) {
  if (!bars || bars.length < 15) {
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

  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  const highs = bars.map((b) => b.high ?? b.close).filter((h) => Number.isFinite(h) && h > 0);
  const lows = bars.map((b) => b.low ?? b.close).filter((l) => Number.isFinite(l) && l > 0);
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

  // 8. Confluence (Siêu hội tụ >= 65)
  if (item.confluenceScore >= 65) {
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
 * Runs multi-source parallel race for quotes and 3-tier cascade for valuation.
 */
async function fetchValuationBatch(symbols: string[]): Promise<{
  valMap: Map<string, VndValuationRatios>;
  vietcapMap: Map<string, VietcapProfile>;
  failoverCount: number;
}> {
  const valMap = new Map<string, VndValuationRatios>();
  const vietcapMap = new Map<string, VietcapProfile>();
  let failoverCount = 0;

  await mapPool(symbols, 12, async (sym) => {
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
  });

  return { valMap, vietcapMap, failoverCount };
}

type MasterSnapshotPayload = {
  items: ScreenerStockItem[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
  };
  meta: Meta;
};

// L1 Fast In-Memory RAM Cache with background SWR
let memoryMasterSnapshot: {
  payload: MasterSnapshotPayload;
  freshUntil: number;
  staleUntil: number;
} | null = null;
let isRefreshingMaster = false;

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

      // PARALLEL QUAD-CORE PRODUCER: Run all 4 independent data sources simultaneously!
      const [multiQuotesRes, fundResult, valResult, ohlcvMap] = await Promise.all([
        // 1. Realtime multi-source quote race (VPS + SSI + VNDirect + Vietcap)
        getMultiQuotes(symbols).catch(() => ({
          quotes: [],
          sources: ["vps-fallback"],
          sourceTs: Date.now(),
          latencies: {},
          conflicts: 0,
        })),
        // 2. Fundamental balance sheet snapshots (10 concurrent workers)
        getFundamentalSnapshots(symbols, { concurrency: 10 }).catch(() => ({ snapshots: [] })),
        // 3. Valuation multiples (12 concurrent workers with 3-tier cascade)
        fetchValuationBatch(symbols).catch(() => ({
          valMap: new Map<string, VndValuationRatios>(),
          vietcapMap: new Map<string, VietcapProfile>(),
          failoverCount: 0,
        })),
        // 4. Batch OHLCV technical moving averages (6 concurrent workers)
        batchVnOhlcv(symbols, {
          bars: 65,
          concurrency: 6,
          perSymbolMs: 600,
          deadlineMs: 3_000,
          resilient: false,
        }).catch(() => new Map()),
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
        const techFeatures = analyzeTechFeatures(ohlcvBars, price, compositeScore);

        const beta: number | null = null;
        const quantFeatures = analyzeQuantFeatures(
          ohlcvBars,
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

  const output: MasterSnapshotPayload = {
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
 */
export async function queryScreenerStocks(params: ScreenerFilterParams): Promise<ScreenerResponseData> {
  const { items: allItems, sourcesUsed, redundancyInfo, meta } = await getMasterScreenerSnapshot();

  const presetsCount: Record<ScreenerPreset, number> = {
    all: allItems.length,
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

  // Quant Edge filters
  if (params.minQuantScore != null) filtered = filtered.filter((x) => x.quantEdgeScore != null && x.quantEdgeScore >= params.minQuantScore!);
  if (params.maxOuZScore != null) filtered = filtered.filter((x) => x.ouZScore != null && x.ouZScore <= params.maxOuZScore!);
  if (params.minRiskReward != null) filtered = filtered.filter((x) => x.tripleBarrierRiskReward != null && x.tripleBarrierRiskReward >= params.minRiskReward!);

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
