/**
 * Formulaic Alpha & Systematic Factor Quality Assessment Engine (Microsoft Qlib Parity)
 *
 * Implements the AI-oriented quantitative investment principles from `microsoft/qlib`:
 * 1. Formulaic Alpha Extraction (vectorized Alpha158/Alpha360 subset for cross-asset analysis)
 * 2. Systematic Quality Gate: Pearson IC, Spearman Rank-IC, ICIR, and T-Statistics
 * 3. Quantile Monotonicity & Long-Short Decile Spread Evaluation
 * 4. ICIR-Weighted Multi-Factor Composite Scoring
 */

import type { OhlcvBar } from "../types";
import { normCdf } from "./advanced-quant-math";

// ============================================================================
// 1. Statistical Primitives for Alpha Analysis
// ============================================================================

/**
 * Computes standard Pearson correlation coefficient between two numeric vectors.
 */
export function computePearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]!;
    sumY += y[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom <= 1e-12 || !Number.isFinite(denom)) return 0;
  const r = cov / denom;
  return Number(Math.max(-1.0, Math.min(1.0, r)).toFixed(5));
}

/**
 * Computes Spearman Rank Correlation coefficient using fractional ranking for ties.
 * Allocation-light implementation using Int32Array index sorting & Float64Array rank buffers
 * (avoids per-element `{ val, idx }` heap object churn in rolling Rank-IC windows).
 */
export function computeSpearmanRankCorr(
  x: number[],
  y: number[],
  start = 0,
  length?: number,
): number {
  const maxLen = Math.min(x.length, y.length) - start;
  const n = length != null ? Math.min(length, maxLen) : maxLen;
  if (n < 3) return 0;

  const idxBuf = new Int32Array(n);
  const rankX = new Float64Array(n);
  const rankY = new Float64Array(n);

  const fillRanks = (src: number[], out: Float64Array) => {
    for (let i = 0; i < n; i++) idxBuf[i] = i;
    idxBuf.sort((a, b) => {
      const va = src[start + a]!;
      const vb = src[start + b]!;
      const fa = Number.isFinite(va) ? va : 0;
      const fb = Number.isFinite(vb) ? vb : 0;
      return fa - fb;
    });
    let i = 0;
    while (i < n) {
      const v0 = src[start + idxBuf[i]!]!;
      const f0 = Number.isFinite(v0) ? v0 : 0;
      let j = i;
      while (j < n - 1) {
        const vj = src[start + idxBuf[j + 1]!]!;
        const fj = Number.isFinite(vj) ? vj : 0;
        if (fj !== f0) break;
        j++;
      }
      const avgRank = (i + j + 2) * 0.5;
      for (let k = i; k <= j; k++) {
        out[idxBuf[k]!] = avgRank;
      }
      i = j + 1;
    }
  };

  fillRanks(x, rankX);
  fillRanks(y, rankY);

  // Direct Pearson on Float64Array rank buffers (mean of 1..n ranks is always (n + 1) / 2)
  const meanR = (n + 1) * 0.5;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rankX[i]! - meanR;
    const dy = rankY[i]! - meanR;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  if (denom <= 1e-12 || !Number.isFinite(denom)) return 0;
  const r = cov / denom;
  return Number(Math.max(-1.0, Math.min(1.0, r)).toFixed(5));
}

/**
 * Computes forward future returns for horizon h bars (e.g. h = 1, 5, 20).
 * Return[t] = (Close[t + h] - Close[t]) / Close[t].
 */
export function computeForwardReturns(bars: OhlcvBar[], horizon = 1): number[] {
  const n = bars.length;
  const returns: number[] = new Array(n).fill(Number.NaN);
  if (n === 0) return returns;
  const h = Math.max(1, Math.min(horizon, n));

  for (let i = 0; i < n; i++) {
    if (i + h < n) {
      const pCurrent = bars[i]!.close;
      const pFuture = bars[i + h]!.close;
      if (Number.isFinite(pCurrent) && pCurrent > 0 && Number.isFinite(pFuture)) {
        returns[i] = Number(((pFuture - pCurrent) / pCurrent).toFixed(6));
      }
    }
  }
  return returns;
}

// ============================================================================
// 2. Qlib Formulaic Alpha Extraction (Vectorized Alpha158/Alpha360 subset)
// ============================================================================

export interface QlibAlphaSet {
  [key: string]: number[];
  // Price / Return Momentum
  KMID: number[];
  KLEN: number[];
  KMID2: number[];
  KUP: number[];
  KLOW: number[];
  ROC5: number[];
  ROC10: number[];
  ROC20: number[];
  MA5_Ratio: number[];
  MA20_Ratio: number[];

  // Volatility & Dispersion
  STD5: number[];
  STD20: number[];
  ShadowRatio: number[];

  // Volume & Liquidity Flow
  VMA5_Ratio: number[];
  VMA20_Ratio: number[];
  VWAP_Spread: number[];
  MoneyFlowRatio20: number[];
  TurnoverOscillator: number[];
  PriceVolumeCorr10: number[];
}

/**
 * Extracts a compact, high-efficiency suite of formulaic alphas inspired by Microsoft Qlib.
 * Vectorized over the given OHLCV bars.
 */
export function extractQlibFormulaicAlphas(bars: OhlcvBar[]): QlibAlphaSet {
  const n = bars.length;
  const empty = (): number[] => new Array(n).fill(0);

  const alphas: QlibAlphaSet = {
    KMID: empty(),
    KLEN: empty(),
    KMID2: empty(),
    KUP: empty(),
    KLOW: empty(),
    ROC5: empty(),
    ROC10: empty(),
    ROC20: empty(),
    MA5_Ratio: empty(),
    MA20_Ratio: empty(),
    STD5: empty(),
    STD20: empty(),
    ShadowRatio: empty(),
    VMA5_Ratio: empty(),
    VMA20_Ratio: empty(),
    VWAP_Spread: empty(),
    MoneyFlowRatio20: empty(),
    TurnoverOscillator: empty(),
    PriceVolumeCorr10: empty(),
  };

  if (n === 0) return alphas;

  // Running cumulative state for rolling metrics
  let cumVol = 0;
  let cumVolPrice = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    const open = Math.max(1e-8, b.open);
    const close = b.close;
    const high = b.high;
    const low = b.low;
    const volume = Math.max(0, b.volume);
    const range = Math.max(1e-8, high - low);

    // Single-bar candle geometry
    alphas.KMID[i] = Number(((close - open) / open).toFixed(6));
    alphas.KLEN[i] = Number((range / open).toFixed(6));
    alphas.KMID2[i] = Number(((close - open) / range).toFixed(6));
    alphas.KUP[i] = Number(((high - Math.max(open, close)) / open).toFixed(6));
    alphas.KLOW[i] = Number(((Math.min(open, close) - low) / open).toFixed(6));

    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    alphas.ShadowRatio[i] = Number(((upperShadow - lowerShadow) / range).toFixed(6));

    // VWAP
    cumVol += volume;
    cumVolPrice += volume * ((high + low + close) / 3.0);
    const vwap = cumVol > 0 ? cumVolPrice / cumVol : close;
    alphas.VWAP_Spread[i] = Number(((close - vwap) / Math.max(1e-8, vwap)).toFixed(6));

    // ROC (Rate of Change)
    if (i >= 5) {
      const prev5 = Math.max(1e-8, bars[i - 5]!.close);
      alphas.ROC5[i] = Number(((close - prev5) / prev5).toFixed(6));
    }
    if (i >= 10) {
      const prev10 = Math.max(1e-8, bars[i - 10]!.close);
      alphas.ROC10[i] = Number(((close - prev10) / prev10).toFixed(6));
    }
    if (i >= 20) {
      const prev20 = Math.max(1e-8, bars[i - 20]!.close);
      alphas.ROC20[i] = Number(((close - prev20) / prev20).toFixed(6));
    }

    // Moving Averages & Moving Volumes
    if (i >= 4) {
      let sumP5 = 0;
      let sumV5 = 0;
      for (let k = i - 4; k <= i; k++) {
        sumP5 += bars[k]!.close;
        sumV5 += bars[k]!.volume;
      }
      const ma5 = sumP5 / 5;
      const vma5 = sumV5 / 5;
      alphas.MA5_Ratio[i] = Number(((close - ma5) / ma5).toFixed(6));
      alphas.VMA5_Ratio[i] = Number(((volume - vma5) / Math.max(1, vma5)).toFixed(6));

      // Rolling Return STD5
      let sumSq = 0;
      for (let k = i - 4; k <= i; k++) {
        const ret = (bars[k]!.close - bars[k]!.open) / Math.max(1e-8, bars[k]!.open);
        sumSq += ret * ret;
      }
      alphas.STD5[i] = Number(Math.sqrt(sumSq / 5).toFixed(6));
    }

    if (i >= 19) {
      let sumP20 = 0;
      let sumV20 = 0;
      let upVol20 = 0;
      for (let k = i - 19; k <= i; k++) {
        sumP20 += bars[k]!.close;
        sumV20 += bars[k]!.volume;
        if (bars[k]!.close >= bars[k]!.open) {
          upVol20 += bars[k]!.volume;
        }
      }
      const ma20 = sumP20 / 20;
      const vma20 = sumV20 / 20;
      alphas.MA20_Ratio[i] = Number(((close - ma20) / ma20).toFixed(6));
      alphas.VMA20_Ratio[i] = Number(((volume - vma20) / Math.max(1, vma20)).toFixed(6));
      alphas.MoneyFlowRatio20[i] = Number((upVol20 / Math.max(1, sumV20)).toFixed(6));

      // Turnover Oscillator: VMA5 / VMA20 - 1.0
      let sumV5 = 0;
      for (let k = i - 4; k <= i; k++) sumV5 += bars[k]!.volume;
      const vma5 = sumV5 / 5;
      alphas.TurnoverOscillator[i] = Number(((vma5 - vma20) / Math.max(1, vma20)).toFixed(6));

      // Rolling Return STD20
      let sumSq20 = 0;
      for (let k = i - 19; k <= i; k++) {
        const ret = (bars[k]!.close - bars[k]!.open) / Math.max(1e-8, bars[k]!.open);
        sumSq20 += ret * ret;
      }
      alphas.STD20[i] = Number(Math.sqrt(sumSq20 / 20).toFixed(6));
    }

    // Price-Volume Correlation over 10 bars
    if (i >= 9) {
      const pDiff: number[] = [];
      const vDiff: number[] = [];
      for (let k = i - 8; k <= i; k++) {
        pDiff.push(bars[k]!.close - bars[k - 1]!.close);
        vDiff.push(bars[k]!.volume - bars[k - 1]!.volume);
      }
      alphas.PriceVolumeCorr10[i] = computePearsonCorr(pDiff, vDiff);
    }
  }

  return alphas;
}

// ============================================================================
// 3. Systematic Factor Quality Assessment (IC, Rank-IC, ICIR & Monotonicity)
// ============================================================================

export interface FactorQualityOptions {
  /** Minimum Spearman Rank-IC to pass quality gate (default: 0.035) */
  minRankIc?: number;
  /** Minimum Information Ratio of IC to pass quality gate (default: 0.50) */
  minIcir?: number;
  /** Minimum Quantile Monotonicity rank correlation (default: 0.70) */
  minMonotonicity?: number;
  /** Rolling window size for rolling IC evaluation (default: 30) */
  rollingWindow?: number;
}

export interface FactorQualityReport {
  factorName: string;
  meanPearsonIc: number;
  meanRankIc: number;
  stdRankIc: number;
  icir: number;
  tStat: number;
  pValue: number;
  monotonicityScore: number;
  quantileReturns: [number, number, number, number, number]; // Q1 (lowest) to Q5 (highest)
  longShortSpreadPct: number; // Q5 - Q1
  autocorrLag1: number;
  isAdmitted: boolean;
  rejectionReason?: "LOW_RANK_IC" | "LOW_ICIR" | "POOR_MONOTONICITY" | "HIGH_TURNOVER";
  rationaleVi: string;
}

/**
 * Evaluates an individual factor against forward returns based on Microsoft Qlib standards.
 * Computes IC, Rank-IC, ICIR, T-Statistic, and Quantile Monotonicity.
 */
export function evaluateFactorQualityQlib(
  factorName: string,
  factorValues: number[],
  forwardReturns: number[],
  options?: FactorQualityOptions
): FactorQualityReport {
  const minRankIc = options?.minRankIc ?? 0.035;
  const minIcir = options?.minIcir ?? 0.50;
  const minMonotonicity = options?.minMonotonicity ?? 0.70;
  const rollingWindow = Math.max(10, options?.rollingWindow ?? 30);

  const n = Math.min(factorValues.length, forwardReturns.length);
  if (n < 20) {
    return {
      factorName,
      meanPearsonIc: 0,
      meanRankIc: 0,
      stdRankIc: 0,
      icir: 0,
      tStat: 0,
      pValue: 1.0,
      monotonicityScore: 0,
      quantileReturns: [0, 0, 0, 0, 0],
      longShortSpreadPct: 0,
      autocorrLag1: 0,
      isAdmitted: false,
      rejectionReason: "LOW_RANK_IC",
      rationaleVi: `Số mẫu quá ngắn (N = ${n} < 20) để kiểm định nhân tố.`,
    };
  }

  // 1. Overall Pearson IC & Spearman Rank-IC
  const validX: number[] = [];
  const validY: number[] = [];
  for (let i = 0; i < n; i++) {
    const fx = factorValues[i]!;
    const fy = forwardReturns[i]!;
    if (Number.isFinite(fx) && Number.isFinite(fy)) {
      validX.push(fx);
      validY.push(fy);
    }
  }

  const overallPearsonIc = computePearsonCorr(validX, validY);
  const overallRankIc = computeSpearmanRankCorr(validX, validY);

  // 2. Rolling Rank-IC series to compute volatility and ICIR (zero-slice window indexing)
  const rollingRankIcs: number[] = [];
  for (let i = rollingWindow; i <= validX.length; i++) {
    const rIc = computeSpearmanRankCorr(validX, validY, i - rollingWindow, rollingWindow);
    if (Number.isFinite(rIc)) {
      rollingRankIcs.push(rIc);
    }
  }

  let meanRollingRankIc = overallRankIc;
  let stdRankIc = 0.05;

  if (rollingRankIcs.length >= 5) {
    const sum = rollingRankIcs.reduce((acc, v) => acc + v, 0);
    meanRollingRankIc = sum / rollingRankIcs.length;
    const varSum = rollingRankIcs.reduce((acc, v) => acc + (v - meanRollingRankIc) ** 2, 0);
    stdRankIc = Math.sqrt(Math.max(1e-8, varSum / (rollingRankIcs.length - 1)));
  }

  const icir = Number((meanRollingRankIc / Math.max(1e-4, stdRankIc)).toFixed(3));
  const tStat = Number((icir * Math.sqrt(Math.max(1, rollingRankIcs.length || validX.length))).toFixed(3));
  // Approximate two-tailed normal p-value from t-stat
  const pValue = Number((2.0 * (1.0 - normCdf(Math.abs(tStat)))).toFixed(4));

  // 3. Quantile Analysis (5 Quantiles: Q1 to Q5)
  const paired = validX.map((fVal, idx) => ({ fVal, ret: validY[idx]! }));
  paired.sort((a, b) => a.fVal - b.fVal);

  const qSize = Math.floor(paired.length / 5);
  const quantileReturns: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (let q = 0; q < 5; q++) {
    const start = q * qSize;
    const end = q === 4 ? paired.length : (q + 1) * qSize;
    let retSum = 0;
    const count = end - start;
    for (let k = start; k < end; k++) {
      retSum += paired[k]!.ret;
    }
    quantileReturns[q] = count > 0 ? Number(((retSum / count) * 100).toFixed(3)) : 0;
  }

  const longShortSpreadPct = Number((quantileReturns[4] - quantileReturns[0]).toFixed(3));
  // Monotonicity score: Rank correlation between quantile indices [1,2,3,4,5] and quantile returns
  const qRanks = [1, 2, 3, 4, 5];
  const monotonicityScore = Number(computeSpearmanRankCorr(qRanks, quantileReturns).toFixed(3));

  // 4. Autocorrelation lag-1 for turnover estimation
  let autocorrLag1 = 0;
  if (validX.length >= 2) {
    autocorrLag1 = computePearsonCorr(validX.slice(0, -1), validX.slice(1));
  }

  // 5. Quality Gate Verdict
  let isAdmitted = true;
  let rejectionReason: FactorQualityReport["rejectionReason"];

  if (Math.abs(meanRollingRankIc) < minRankIc) {
    isAdmitted = false;
    rejectionReason = "LOW_RANK_IC";
  } else if (Math.abs(icir) < minIcir) {
    isAdmitted = false;
    rejectionReason = "LOW_ICIR";
  } else if (monotonicityScore < minMonotonicity) {
    isAdmitted = false;
    rejectionReason = "POOR_MONOTONICITY";
  }

  const rationaleVi =
    `Qlib Factor Quality [${factorName}]: Rank-IC = ${(meanRollingRankIc * 100).toFixed(2)}%, ` +
    `ICIR = ${icir}, T-Stat = ${tStat} (p = ${pValue}), Độ đơn điệu Quantile = ${monotonicityScore}, ` +
    `Long-Short Spread = ${longShortSpreadPct >= 0 ? "+" : ""}${longShortSpreadPct}%. ` +
    `Kết luận: ${isAdmitted ? "CHẤP THUẬN (ADMITTED)" : `TỪ CHỐI (${rejectionReason})`}.`;

  return {
    factorName,
    meanPearsonIc: Number(overallPearsonIc.toFixed(4)),
    meanRankIc: Number(meanRollingRankIc.toFixed(4)),
    stdRankIc: Number(stdRankIc.toFixed(4)),
    icir,
    tStat,
    pValue,
    monotonicityScore,
    quantileReturns,
    longShortSpreadPct,
    autocorrLag1: Number(autocorrLag1.toFixed(3)),
    isAdmitted,
    rejectionReason,
    rationaleVi,
  };
}

// ============================================================================
// 4. ICIR-Weighted Multi-Factor Composite Allocator
// ============================================================================

export interface CompositeAlphaParams {
  factors: Record<string, number[]>;
  reports: Record<string, FactorQualityReport>;
  useOnlyAdmitted?: boolean;
}

export interface CompositeAlphaResult {
  compositeScoreSeries: number[];
  weights: Record<string, number>;
  latestScore: number;
  latestPercentileRank: number;
  totalFactorsUsed: number;
  admittedFactorCount: number;
  rationaleVi: string;
}

/**
 * Synthesizes multiple validated alpha factors into an optimal ICIR-weighted composite alpha score.
 * Follows Microsoft Qlib's standard multi-factor aggregation methodology.
 */
export function buildQlibCompositeAlpha(params: CompositeAlphaParams): CompositeAlphaResult {
  const { factors, reports, useOnlyAdmitted = true } = params;

  const factorKeys = Object.keys(factors);
  if (factorKeys.length === 0) {
    return {
      compositeScoreSeries: [],
      weights: {},
      latestScore: 0,
      latestPercentileRank: 50,
      totalFactorsUsed: 0,
      admittedFactorCount: 0,
      rationaleVi: "Không có nhân tố hợp lệ để tạo composite alpha.",
    };
  }

  const n = factors[factorKeys[0]!]?.length ?? 0;
  if (n === 0) {
    return {
      compositeScoreSeries: [],
      weights: {},
      latestScore: 0,
      latestPercentileRank: 50,
      totalFactorsUsed: 0,
      admittedFactorCount: 0,
      rationaleVi: "Dữ liệu nhân tố trống.",
    };
  }

  // 1. Filter factors based on admission gate
  const eligibleKeys = factorKeys.filter((k) => {
    const rep = reports[k];
    if (!rep) return false;
    return useOnlyAdmitted ? rep.isAdmitted : true;
  });

  const activeKeys = eligibleKeys.length > 0 ? eligibleKeys : factorKeys;

  // 2. Compute weights proportional to absolute ICIR
  let sumIcir = 0;
  const rawWeights: Record<string, number> = {};
  for (const k of activeKeys) {
    const icir = Math.max(0.1, Math.abs(reports[k]?.icir ?? 0.5));
    rawWeights[k] = icir;
    sumIcir += icir;
  }

  const weights: Record<string, number> = {};
  for (const k of activeKeys) {
    weights[k] = Number((rawWeights[k]! / Math.max(1e-8, sumIcir)).toFixed(4));
  }

  // 3. Normalize each factor cross-sectionally / across time via Z-Score
  const zScoreMatrix: Record<string, number[]> = {};
  for (const k of activeKeys) {
    const raw = factors[k]!;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += raw[i]!;
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) varSum += (raw[i]! - mean) ** 2;
    const std = Math.sqrt(Math.max(1e-8, varSum / Math.max(1, n - 1)));

    zScoreMatrix[k] = raw.map((val) => {
      const z = (val - mean) / std;
      // Windsorize between -3.0 and +3.0
      return Math.max(-3.0, Math.min(3.0, z));
    });
  }

  // 4. Combine into composite score: Composite[t] = sum(w_k * sign(RankIC_k) * Z_k[t])
  const compositeScoreSeries: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (const k of activeKeys) {
      const dir = (reports[k]?.meanRankIc ?? 1) >= 0 ? 1 : -1;
      score += weights[k]! * dir * zScoreMatrix[k]![i]!;
    }
    compositeScoreSeries[i] = Number(score.toFixed(4));
  }

  // 5. Percentile Rank of the latest score
  const latestScore = compositeScoreSeries[n - 1] ?? 0;
  let lessCount = 0;
  for (let i = 0; i < n; i++) {
    if (compositeScoreSeries[i]! < latestScore) lessCount++;
  }
  const latestPercentileRank = Number(((lessCount / Math.max(1, n)) * 100).toFixed(1));

  const admittedCount = factorKeys.filter((k) => reports[k]?.isAdmitted).length;
  const rationaleVi =
    `Qlib Multi-Factor Composite: Kết hợp ${activeKeys.length}/${factorKeys.length} nhân tố ` +
    `(${admittedCount} đạt chuẩn Qlib). Điểm Composite mới nhất = ${latestScore} (Phân vị ${latestPercentileRank}%).`;

  return {
    compositeScoreSeries,
    weights,
    latestScore,
    latestPercentileRank,
    totalFactorsUsed: activeKeys.length,
    admittedFactorCount: admittedCount,
    rationaleVi,
  };
}
