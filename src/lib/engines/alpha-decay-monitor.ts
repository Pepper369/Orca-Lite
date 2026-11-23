/**
 * Edge Discovery & Alpha Decay Monitor Engine
 * (mphinance/alpha-skills Parity)
 *
 * Implements quantitative edge surveillance, factor decay dynamics, and adaptive weight rebalancing:
 * 1. Rolling 30-Day vs 60-Day Rank-IC Decay Slope & Information Coefficient Information Ratio (ICIR).
 * 2. Alpha Half-Life (t_1/2) estimation via exponential decay parameter lambda.
 * 3. Dynamic Factor Weight Rebalancing (prunes decaying alphas, boosts emerging robust factors).
 * 4. Real-time Strategy Throttle Sentinel (EDGE_ROBUST, EDGE_STABLE, DECAY_WARNING, EDGE_EXHAUSTED).
 */

import type { OhlcvBar } from "../types";
import {
  computeSpearmanRankCorr,
  computeForwardReturns,
  extractQlibFormulaicAlphas,
  type QlibAlphaSet,
} from "./formulaic-alpha-qlib";

// ============================================================================
// Types & Interfaces
// ============================================================================

export type EdgeHealthState =
  | "EDGE_ROBUST"
  | "EDGE_STABLE"
  | "DECAY_WARNING"
  | "EDGE_EXHAUSTED";

export interface FactorDecayProfile {
  factorName: string;
  historicalRankIc: number; // e.g. 60-day baseline
  recentRankIc: number; // e.g. 30-day recent
  deltaRankIc: number; // recent - historical
  decayRatePct: number; // % change in IC
  recentIcir: number;
  halfLifeBars: number; // estimated bars/periods until factor power halves
  isDecaying: boolean;
  status: "EXPANDING" | "STABLE" | "DECAYING" | "EXHAUSTED";
  statusVi: string;
  rebalancedWeight: number; // dynamic adaptive weight in [0, 1]
}

export interface AlphaDecayMonitoringReport {
  symbol: string;
  evaluatedBarsCount: number;
  evaluatedAt: string;
  overallEdgeHealth: EdgeHealthState;
  overallEdgeHealthVi: string;
  strategyThrottleMultiplier: number; // [0.40, 1.25]
  aggregateMeanRankIc: number;
  aggregateIcir: number;
  factorProfiles: FactorDecayProfile[];
  topEmergingFactors: string[];
  prunedDecayedFactors: string[];
  cockpitTelemetryVi: string;
  actionableRecommendationVi: string;
}

// ============================================================================
// 1. Alpha Half-Life & Decay Mathematics
// ============================================================================

/**
 * Estimates the Half-Life (t_1/2) of an alpha factor from consecutive lag autocorrelations.
 * Model: Autocorr(k) = exp(-lambda * k)
 * Half-life t_1/2 = -ln(2) / lambda = ln(2) / (-ln(rho)) where rho = lag-1 autocorrelation.
 */
export function estimateAlphaHalfLife(factorValues: number[]): number {
  const n = factorValues.length;
  if (n < 10) return 20; // default 20 periods

  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < n - 1; i++) {
    sum1 += factorValues[i]!;
    sum2 += factorValues[i + 1]!;
  }
  const mean1 = sum1 / (n - 1);
  const mean2 = sum2 / (n - 1);

  let cov = 0;
  let var1 = 0;
  let var2 = 0;
  for (let i = 0; i < n - 1; i++) {
    const d1 = factorValues[i]! - mean1;
    const d2 = factorValues[i + 1]! - mean2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  const denom = Math.sqrt(var1 * var2);
  const rho = denom > 1e-8 ? Math.max(0.01, Math.min(0.99, cov / denom)) : 0.5;

  // lambda = -ln(rho)
  const lambda = -Math.log(rho);
  if (lambda <= 1e-4) return 60; // very persistent
  const halfLife = Math.LN2 / lambda;
  return Number(Math.max(1.0, Math.min(100.0, halfLife)).toFixed(1));
}

/**
 * Computes rolling Rank-IC series for a factor vector against forward returns.
 */
export function computeRollingRankIcSeries(
  factor: number[],
  forwardReturns: number[],
  windowSize = 20,
): number[] {
  const n = Math.min(factor.length, forwardReturns.length);
  const out: number[] = [];
  if (n < windowSize) return out;

  for (let i = windowSize; i <= n; i++) {
    const subFactor = factor.slice(i - windowSize, i);
    const subRet = forwardReturns.slice(i - windowSize, i);
    const ic = computeSpearmanRankCorr(subFactor, subRet);
    if (Number.isFinite(ic)) {
      out.push(ic);
    }
  }
  return out;
}

// ============================================================================
// 2. Dynamic Factor Weight Rebalancing
// ============================================================================

/**
 * Rebalances factor weights dynamically:
 * - Prunes factors where ICIR < 0.20 or Rank-IC is negative.
 * - Scales admitted factors proportionally to ICIR * (1 + deltaRankIc).
 * - Normalizes sum of weights to 1.0.
 */
export function rebalanceFactorWeights(
  rawProfiles: Omit<FactorDecayProfile, "rebalancedWeight">[],
): FactorDecayProfile[] {
  const scores: number[] = [];

  for (const p of rawProfiles) {
    if (p.recentIcir < 0.20 || p.recentRankIc <= 0 || p.status === "EXHAUSTED") {
      scores.push(0);
    } else {
      // Reward high ICIR and positive delta momentum
      const momentumMult = Math.max(0.2, 1.0 + p.deltaRankIc * 5.0);
      const score = Math.max(0, p.recentIcir * momentumMult);
      scores.push(score);
    }
  }

  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const out: FactorDecayProfile[] = [];

  for (let i = 0; i < rawProfiles.length; i++) {
    const p = rawProfiles[i]!;
    const weight =
      totalScore > 0 ? Number((scores[i]! / totalScore).toFixed(4)) : 0;
    out.push({
      ...p,
      rebalancedWeight: weight,
    });
  }

  return out;
}

// ============================================================================
// 3. Bar-Keyed TTL Cache & Master Edge Surveillance
// ============================================================================

const ALPHA_DECAY_CACHE_TTL_MS = 5 * 60 * 1000;
const ALPHA_DECAY_CACHE_MAX = 128;
const alphaDecayCache = new Map<string, { report: AlphaDecayMonitoringReport; expiresAt: number }>();
const latestAlphaWeightMapBySymbol = new Map<string, Record<string, number>>();

export function clearAlphaDecayCache(): void {
  alphaDecayCache.clear();
  latestAlphaWeightMapBySymbol.clear();
}

export function getCachedAlphaDecayWeightMap(symbol: string): Record<string, number> | null {
  return latestAlphaWeightMapBySymbol.get(symbol.toUpperCase()) ?? null;
}

export function monitorAlphaDecayAndRebalance(params: {
  symbol: string;
  bars: OhlcvBar[];
  horizon?: number;
  recentWindow?: number; // default 30
  historicalWindow?: number; // default 60
}): AlphaDecayMonitoringReport {
  const {
    symbol,
    bars,
    horizon = 1,
    recentWindow = 30,
    historicalWindow = 60,
  } = params;

  const n = bars.length;
  const lastBar = n > 0 ? bars[n - 1]! : null;
  const cacheKey = `${symbol.toUpperCase()}_${n}_${lastBar?.time ?? 0}_${lastBar?.close ?? 0}_${horizon}_${recentWindow}_${historicalWindow}`;
  const nowMs = Date.now();
  const cached = alphaDecayCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.report;
  }
  if (n < 40) {
    // Insufficient history fallback
    return {
      symbol,
      evaluatedBarsCount: n,
      evaluatedAt: new Date().toISOString(),
      overallEdgeHealth: "EDGE_STABLE",
      overallEdgeHealthVi: "ỔN ĐỊNH (Thiếu mẫu dài để xác định suy giảm)",
      strategyThrottleMultiplier: 1.0,
      aggregateMeanRankIc: 0.05,
      aggregateIcir: 0.45,
      factorProfiles: [],
      topEmergingFactors: [],
      prunedDecayedFactors: [],
      cockpitTelemetryVi: `[AlphaMonitor] ${symbol}: Chưa đủ dữ liệu n=${n} < 40 bars để phân tích suy giảm.`,
      actionableRecommendationVi: "Duy trì tham số mặc định cho đến khi tích lũy đủ 40 nến.",
    };
  }

  const forwardReturns = computeForwardReturns(bars, horizon);
  const alphas = extractQlibFormulaicAlphas(bars);

  // Focus on core representative factor types from Qlib:
  const candidateKeys: Array<keyof QlibAlphaSet> = [
    "KMID",
    "ROC5",
    "ROC10",
    "VWAP_Spread",
    "TurnoverOscillator",
    "ShadowRatio",
    "MA5_Ratio",
    "STD5",
  ];

  const rawProfiles: Omit<FactorDecayProfile, "rebalancedWeight">[] = [];

  for (const key of candidateKeys) {
    const factorVals = alphas[key];
    if (!factorVals || factorVals.length < historicalWindow) continue;

    const validX: number[] = [];
    const validY: number[] = [];
    for (let i = 0; i < n; i++) {
      const fx = factorVals[i]!;
      const fy = forwardReturns[i]!;
      if (Number.isFinite(fx) && Number.isFinite(fy)) {
        validX.push(fx);
        validY.push(fy);
      }
    }

    if (validX.length < historicalWindow) continue;

    // Historical window (e.g. earlier portion or full 60)
    const histX = validX.slice(-historicalWindow, -recentWindow);
    const histY = validY.slice(-historicalWindow, -recentWindow);
    const historicalRankIc =
      histX.length >= 10 ? computeSpearmanRankCorr(histX, histY) : 0.03;

    // Recent window (e.g. latest 30)
    const recX = validX.slice(-recentWindow);
    const recY = validY.slice(-recentWindow);
    const recentRankIc = computeSpearmanRankCorr(recX, recY);

    const deltaRankIc = Number((recentRankIc - historicalRankIc).toFixed(4));
    const decayRatePct =
      Math.abs(historicalRankIc) > 1e-4
        ? Number(((deltaRankIc / Math.abs(historicalRankIc)) * 100).toFixed(1))
        : 0;

    // Recent rolling ICIR
    const rollingIcs = computeRollingRankIcSeries(recX, recY, 10);
    let meanIc = recentRankIc;
    let stdIc = 0.05;
    if (rollingIcs.length >= 4) {
      const sum = rollingIcs.reduce((a, b) => a + b, 0);
      meanIc = sum / rollingIcs.length;
      const vSum = rollingIcs.reduce((a, b) => a + (b - meanIc) ** 2, 0);
      stdIc = Math.sqrt(Math.max(1e-8, vSum / (rollingIcs.length - 1)));
    }
    const recentIcir = Number((meanIc / Math.max(1e-4, stdIc)).toFixed(3));
    const halfLifeBars = estimateAlphaHalfLife(recX);

    let status: FactorDecayProfile["status"] = "STABLE";
    let statusVi = "Ổn định";

    if (deltaRankIc <= -0.025 || recentIcir < 0.15 || recentRankIc <= -0.01) {
      status = "EXHAUSTED";
      statusVi = "Kiệt quệ / Âm Alpha (Loại bỏ)";
    } else if (deltaRankIc <= -0.012 || recentIcir < 0.30) {
      status = "DECAYING";
      statusVi = "Đang suy giảm (Hạ tỷ trọng)";
    } else if (deltaRankIc >= 0.015 && recentIcir >= 0.50) {
      status = "EXPANDING";
      statusVi = "Mở rộng hiệu quả (Tăng tỷ trọng)";
    }

    rawProfiles.push({
      factorName: String(key),
      historicalRankIc: Number(historicalRankIc.toFixed(4)),
      recentRankIc: Number(recentRankIc.toFixed(4)),
      deltaRankIc,
      decayRatePct,
      recentIcir,
      halfLifeBars,
      isDecaying: status === "DECAYING" || status === "EXHAUSTED",
      status,
      statusVi,
    });
  }

  // Apply dynamic rebalancing
  const factorProfiles = rebalanceFactorWeights(rawProfiles);

  // Aggregate Metrics across active factors
  const activeProfiles = factorProfiles.filter((p) => p.status !== "EXHAUSTED");
  const meanRankIc =
    activeProfiles.length > 0
      ? activeProfiles.reduce((s, p) => s + p.recentRankIc, 0) / activeProfiles.length
      : 0;
  const meanIcir =
    activeProfiles.length > 0
      ? activeProfiles.reduce((s, p) => s + p.recentIcir, 0) / activeProfiles.length
      : 0;

  const topEmergingFactors = factorProfiles
    .filter((p) => p.status === "EXPANDING" || (p.recentIcir >= 0.50 && p.rebalancedWeight > 0.15))
    .map((p) => p.factorName);

  const prunedDecayedFactors = factorProfiles
    .filter((p) => p.status === "EXHAUSTED" || p.rebalancedWeight === 0)
    .map((p) => p.factorName);

  // Overall Edge Health Determination
  let overallEdgeHealth: EdgeHealthState = "EDGE_STABLE";
  let overallEdgeHealthVi = "ỔN ĐỊNH (Lợi thế định lượng duy trì mức tiêu chuẩn)";
  let strategyThrottleMultiplier = 1.0;

  const decayingRatio =
    factorProfiles.length > 0
      ? factorProfiles.filter((p) => p.isDecaying).length / factorProfiles.length
      : 0;

  if (meanIcir >= 0.50 && decayingRatio <= 0.25) {
    overallEdgeHealth = "EDGE_ROBUST";
    overallEdgeHealthVi = "MẠNH MẼ (Alpha mở rộng, độ suy giảm tối thiểu)";
    strategyThrottleMultiplier = 1.20;
  } else if (decayingRatio >= 0.60 || meanIcir < 0.20 || meanRankIc <= 0) {
    overallEdgeHealth = "EDGE_EXHAUSTED";
    overallEdgeHealthVi = "KIỆT QUỆ ALPHA (Đa số nhân tố suy thoái nặng)";
    strategyThrottleMultiplier = 0.40;
  } else if (decayingRatio >= 0.40 || meanIcir < 0.32) {
    overallEdgeHealth = "DECAY_WARNING";
    overallEdgeHealthVi = "CẢNH BÁO SUY GIẢM (Alpha đang bão hòa)";
    strategyThrottleMultiplier = 0.70;
  }

  const cockpitTelemetryVi =
    `[AlphaDecay] ${symbol}: Trạng thái Edge [${overallEdgeHealth}] | ICIR TB: ${meanIcir.toFixed(2)} | ` +
    `Nhân tố mở rộng: ${topEmergingFactors.length > 0 ? topEmergingFactors.join(", ") : "Không có"} | ` +
    `Nhân tố bị loại bỏ: ${prunedDecayedFactors.length > 0 ? prunedDecayedFactors.join(", ") : "Không có"} | ` +
    `Throttle: x${strategyThrottleMultiplier.toFixed(2)}.`;

  const actionableRecommendationVi =
    overallEdgeHealth === "EDGE_ROBUST"
      ? `Lợi thế định lượng đang trong giai đoạn vàng (ICIR ${meanIcir.toFixed(2)}). Cho phép giải ngân tối đa x${strategyThrottleMultiplier} khối lượng chuẩn.`
      : overallEdgeHealth === "DECAY_WARNING"
        ? `Phát hiện ${prunedDecayedFactors.length} nhân tố bị xói mòn Alpha. Hạ tỷ trọng chiến lược xuống x${strategyThrottleMultiplier} và tái phân bổ sang nhóm nhân tố Momentum/Volume mới.`
        : overallEdgeHealth === "EDGE_EXHAUSTED"
          ? `Lợi thế Alpha kiệt quệ nghiêm trọng. Kích hoạt Sentinel bảo vệ vốn, siết chặt khối lượng còn x${strategyThrottleMultiplier} để tránh overtrading.`
          : `Lợi thế ổn định ở mức tiêu chuẩn. Duy trì khối lượng chuẩn x${strategyThrottleMultiplier}.`;

  const report: AlphaDecayMonitoringReport = {
    symbol,
    evaluatedBarsCount: n,
    evaluatedAt: new Date().toISOString(),
    overallEdgeHealth,
    overallEdgeHealthVi,
    strategyThrottleMultiplier,
    aggregateMeanRankIc: Number(meanRankIc.toFixed(4)),
    aggregateIcir: Number(meanIcir.toFixed(3)),
    factorProfiles,
    topEmergingFactors,
    prunedDecayedFactors,
    cockpitTelemetryVi,
    actionableRecommendationVi,
  };

  if (alphaDecayCache.size >= ALPHA_DECAY_CACHE_MAX) {
    const oldestKey = alphaDecayCache.keys().next().value;
    if (oldestKey) alphaDecayCache.delete(oldestKey);
  }
  alphaDecayCache.set(cacheKey, { report, expiresAt: nowMs + ALPHA_DECAY_CACHE_TTL_MS });

  const weightMap: Record<string, number> = {};
  for (const p of factorProfiles) {
    weightMap[p.factorName] = p.rebalancedWeight;
  }
  latestAlphaWeightMapBySymbol.set(symbol.toUpperCase(), weightMap);

  return report;
}
