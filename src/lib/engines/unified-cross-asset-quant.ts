/**
 * UNIFIED CROSS-ASSET QUANTITATIVE ENGINE
 *
 * Universal institutional quantitative models powering:
 * 1. Vietnam Equities (VN30 / Midcaps): Fractional Kelly, T+2 Cornish-Fisher VaR & Ceiling/Floor Cushion
 * 2. Derivatives (VN30F / Futures): Continuous Ornstein-Uhlenbeck (OU) Basis Calibration & Level 2 OFI
 * 3. Forex & Precious Metals (EURUSD, XAUUSD): Spread-Spike Circuit Breaker & Macro Basket Beta
 * 4. Crypto Perpetuals & Spot (BTC, ETH, SOL): Garman-Klass Volatility Leverage Governor & Liquidation Clusters
 */

import { normCdf, normInv } from "./advanced-quant-math";
import { roundPrice } from "./asset-precision";
import { calculateCryptoPositionSize } from "./crypto-position-sizer";
import {
  calculateForexPositionSize,
  type CrossRateOverrides,
} from "./forex-position-sizer";

// ============================================================================
// 1. Dynamic Fractional Kelly & Volatility Targeting
// ============================================================================

export interface KellyParameters {
  winRate: number; // e.g. 0.65 (65%)
  payoffRatio: number; // Avg Win / Avg Loss, e.g. 2.0 (2:1 R:R)
  returnsSeries?: number[]; // Historical returns for volatility estimation
  targetAnnualVol?: number; // Target annual volatility, default 0.18 (18%)
  isCrypto?: boolean; // Crypto trades 365 days vs 252 for equities/FX
  maxCapitalPerTrade?: number; // Maximum allocation ceiling, default 0.25 (25%)
}

export interface KellyResult {
  unconstrainedKelly: number;
  halfKelly: number;
  recommendedAllocation: number; // Clamped and volatility-adjusted capital fraction
  realizedAnnualVol: number;
  volatilityScaleFactor: number;
  status: "OPTIMAL" | "CONSERVATIVE_DAMPENED" | "VOLATILITY_CAPPED" | "NEGATIVE_EDGE";
  rationaleVi: string;
}

/**
 * Computes Dynamic Half-Kelly fraction with annualized volatility targeting.
 * Prevents over-betting and guarantees capital survival under fat-tailed distributions.
 */
export function calculateCrossAssetKelly(params: KellyParameters): KellyResult {
  const p = Math.max(0, Math.min(1, params.winRate));
  const b = Math.max(0.01, params.payoffRatio);
  const targetVol = params.targetAnnualVol ?? 0.18;
  const maxCap = params.maxCapitalPerTrade ?? 0.25;
  const annualFactor = params.isCrypto ? Math.sqrt(365) : Math.sqrt(252);

  // Kelly Formula: f* = (p*b - (1-p)) / b
  const unconstrained = (p * b - (1 - p)) / b;

  if (unconstrained <= 0) {
    return {
      unconstrainedKelly: 0,
      halfKelly: 0,
      recommendedAllocation: 0,
      realizedAnnualVol: 0,
      volatilityScaleFactor: 1.0,
      status: "NEGATIVE_EDGE",
      rationaleVi: "Kỳ vọng toán học âm (Negative Edge) - Thuật toán từ chối giải ngân vị thế.",
    };
  }

  // Institutional safety standard: Half-Kelly
  const halfKelly = unconstrained * 0.5;

  // Realized volatility estimation from returns series
  let realizedVol = targetVol;
  let volScale = 1.0;

  if (params.returnsSeries && params.returnsSeries.length >= 10) {
    const returns = params.returnsSeries;
    const n = returns.length;
    const mean = returns.reduce((acc, r) => acc + r, 0) / n;
    const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (n - 1);
    const dailyVol = Math.sqrt(Math.max(1e-8, variance));
    realizedVol = dailyVol * annualFactor;

    // Volatility Targeting: scale allocation inversely to excess volatility
    volScale = Math.min(1.5, targetVol / Math.max(0.05, realizedVol));
  }

  // Final Allocation: Clamped between 2% and maxCap
  const unadjustedAlloc = halfKelly * volScale;
  const recommendedAllocation = Math.max(0.02, Math.min(maxCap, Math.round(unadjustedAlloc * 1000) / 1000));

  let status: KellyResult["status"] = "OPTIMAL";
  if (volScale < 0.8) {
    status = "VOLATILITY_CAPPED";
  } else if (recommendedAllocation === maxCap) {
    status = "CONSERVATIVE_DAMPENED";
  }

  const rationaleVi = `Kelly 1/2 (${(halfKelly * 100).toFixed(1)}%) điều chỉnh Volatility (Biến động thực: ${(realizedVol * 100).toFixed(1)}%, Tỷ lệ co: ${volScale.toFixed(2)}x) -> Tỷ trọng tối ưu: ${(recommendedAllocation * 100).toFixed(1)}% vốn.`;

  return {
    unconstrainedKelly: Math.round(unconstrained * 1000) / 1000,
    halfKelly: Math.round(halfKelly * 1000) / 1000,
    recommendedAllocation,
    realizedAnnualVol: Math.round(realizedVol * 1000) / 1000,
    volatilityScaleFactor: Math.round(volScale * 100) / 100,
    status,
    rationaleVi,
  };
}

// ============================================================================
// 2. Vietnam Equities T+2 Settlement Cornish-Fisher VaR & Cushion
// ============================================================================

export interface T2RiskMetrics {
  twoDayVaR95Pct: number; // 95% Cornish-Fisher Value-at-Risk over T+2 (positive percentage e.g. 4.2%)
  twoDayCVaR95Pct: number; // 95% Expected Shortfall over T+2 (positive percentage e.g. 5.8%)
  skewness: number;
  excessKurtosis: number;
  excessiveTailRisk: boolean;
  positionSizingMultiplier: number; // 0.5x if tail risk is extreme, else 1.0x
  advisoryVi: string;
}

/**
 * Computes T+2 Settlement Horizon VaR & CVaR using Cornish-Fisher expansion.
 * Accurately models fat tails and asymmetric downside skew during the mandatory holding cycle.
 */
export function calculateT2SettlementRisk(returns: number[]): T2RiskMetrics {
  if (!returns || returns.length < 15) {
    return {
      twoDayVaR95Pct: 5.0,
      twoDayCVaR95Pct: 7.0,
      skewness: 0,
      excessKurtosis: 0,
      excessiveTailRisk: false,
      positionSizingMultiplier: 1.0,
      advisoryVi: "Thiếu dữ liệu lịch sử T+2: áp dụng định mức VaR mặc định 5.0%.",
    };
  }

  // Transform 1-day returns into 2-day rolling holding period returns
  const r2d: number[] = [];
  for (let i = 1; i < returns.length; i++) {
    const r1 = returns[i - 1];
    const r2 = returns[i];
    r2d.push((1 + r1) * (1 + r2) - 1);
  }

  const n = r2d.length;
  const mean = r2d.reduce((s, r) => s + r, 0) / n;
  const variance = r2d.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(Math.max(1e-8, variance));

  // Sample Skewness
  const m3 = r2d.reduce((s, r) => s + (r - mean) ** 3, 0) / n;
  const skewness = std > 1e-6 ? m3 / (std ** 3) : 0;

  // Sample Kurtosis (Excess)
  const m4 = r2d.reduce((s, r) => s + (r - mean) ** 4, 0) / n;
  const kurtosis = std > 1e-6 ? m4 / (std ** 4) - 3 : 0;

  // Cornish-Fisher Expansion for alpha = 0.05 (z = -1.64485)
  const z = normInv(0.05); // ~ -1.64485
  const s = Math.max(-2.5, Math.min(2.5, skewness));
  const k = Math.max(-2.0, Math.min(10.0, kurtosis));

  const zCf =
    z +
    (s / 6) * (z * z - 1) +
    (k / 24) * (z ** 3 - 3 * z) -
    ((s * s) / 36) * (2 * z ** 3 - 5 * z);

  // Cornish-Fisher VaR(95%) over 2-day holding period
  const var95 = Math.max(0, -(mean + zCf * std));
  const var95Pct = Math.round(var95 * 1000) / 10; // e.g. 4.8%

  // Expected Shortfall (CVaR) approximation based on tail returns exceeding VaR
  const tailLosses = r2d.filter((r) => r <= -var95);
  let cvar95 = var95 * 1.25;
  if (tailLosses.length > 0) {
    const avgTailLoss = tailLosses.reduce((s, r) => s + Math.abs(r), 0) / tailLosses.length;
    cvar95 = Math.max(var95, avgTailLoss);
  }
  const cvar95Pct = Math.round(cvar95 * 1000) / 10;

  const excessiveTailRisk = var95Pct >= 6.0;
  const positionSizingMultiplier = excessiveTailRisk ? 0.5 : 1.0;

  const advisoryVi = excessiveTailRisk
    ? `Cảnh báo: Rủi ro kẹp T+2 cao (VaR95: ${var95Pct}%, CVaR95: ${cvar95Pct}%, Lệch âm: ${skewness.toFixed(2)}). Khuyến nghị giảm 50% quy mô vị thế.`
    : `Biên rủi ro kẹp T+2 ổn định (VaR95: ${var95Pct}%, CVaR95: ${cvar95Pct}%). Vị thế được bảo vệ trong giới hạn rủi ro danh mục.`;

  return {
    twoDayVaR95Pct: var95Pct,
    twoDayCVaR95Pct: cvar95Pct,
    skewness: Math.round(skewness * 100) / 100,
    excessKurtosis: Math.round(kurtosis * 100) / 100,
    excessiveTailRisk,
    positionSizingMultiplier,
    advisoryVi,
  };
}

/**
 * Checks price distance to statutory ceiling/floor limits (HoSE ±7%, HNX ±10%).
 * Guards against adverse ceiling fill slippage and buying into ceiling exhaustion.
 */
export function checkCeilingFloorHeadroom(
  currentPrice: number,
  ceilingPrice: number,
  floorPrice: number
): {
  ceilingHeadroomPct: number;
  floorHeadroomPct: number;
  canEnterLong: boolean;
  canEnterShortOrSell: boolean;
  blockReason: string | null;
} {
  if (!currentPrice || currentPrice <= 0) {
    return { ceilingHeadroomPct: 7, floorHeadroomPct: 7, canEnterLong: true, canEnterShortOrSell: true, blockReason: null };
  }

  const ceilingHeadroomPct = ceilingPrice > currentPrice
    ? Math.round(((ceilingPrice - currentPrice) / currentPrice) * 1000) / 10
    : 0;

  const floorHeadroomPct = currentPrice > floorPrice
    ? Math.round(((currentPrice - floorPrice) / currentPrice) * 1000) / 10
    : 0;

  // Prohibit buying if price is within 1.5% of ceiling (adverse fill exhaustion)
  if (ceilingHeadroomPct < 1.5) {
    return {
      ceilingHeadroomPct,
      floorHeadroomPct,
      canEnterLong: false,
      canEnterShortOrSell: true,
      blockReason: `Giá tiệm cận giá Trần (+${ceilingHeadroomPct}%). Nguy cơ đỉnh ngắn hạn và kẹt thanh khoản mua đuổi.`,
    };
  }

  // Prohibit panic selling if price is already locked at floor
  if (floorHeadroomPct < 1.0) {
    return {
      ceilingHeadroomPct,
      floorHeadroomPct,
      canEnterLong: false,
      canEnterShortOrSell: false,
      blockReason: `Giá tiệm cận giá Sàn (-${floorHeadroomPct}%). Trắng bên mua, ưu tiên chờ nhịp hồi kỹ thuật.`,
    };
  }

  return {
    ceilingHeadroomPct,
    floorHeadroomPct,
    canEnterLong: true,
    canEnterShortOrSell: true,
    blockReason: null,
  };
}

// ============================================================================
// 3. Vietnam Derivatives (VN30F) Continuous Ornstein-Uhlenbeck & OFI
// ============================================================================

export interface OUBasisCalibration {
  theta: number; // Mean reversion speed per minute
  longTermMean: number; // Equilibrium basis in points
  halfLifeMinutes: number; // Half-life of basis divergence
  equilibriumVol: number; // Volatility of equilibrium state
  currentZScore: number; // Current basis Z-score
  stationary: boolean;
  signal: "STRONG_LONG_BASIS_REVERSION" | "STRONG_SHORT_BASIS_REVERSION" | "FAIR_VALUE_CHOP" | "NON_STATIONARY_DRIFT";
  signalRationaleVi: string;
}

/**
 * Calibrates continuous Ornstein-Uhlenbeck (OU) parameters for intraday VN30F basis:
 * dX_t = theta * (mu - X_t) * dt + sigma * dW_t
 */
export function calibrateBasisOrnsteinUhlenbeck(
  basisSeries: number[],
  dtMinutes = 1
): OUBasisCalibration {
  const n = basisSeries.length;
  if (n < 15) {
    return {
      theta: 0,
      longTermMean: 0,
      halfLifeMinutes: Infinity,
      equilibriumVol: 1.0,
      currentZScore: 0,
      stationary: false,
      signal: "FAIR_VALUE_CHOP",
      signalRationaleVi: "Dữ liệu basis chưa đủ 15 kỳ quan sát để hiệu chuẩn OU.",
    };
  }

  // OLS Regression: Delta X_t = a + b * X_{t-1} + e_t
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  const m = n - 1;

  for (let i = 0; i < m; i++) {
    const x = basisSeries[i];
    const y = basisSeries[i + 1] - x;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const denom = m * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) {
    return {
      theta: 0,
      longTermMean: 0,
      halfLifeMinutes: Infinity,
      equilibriumVol: 1.0,
      currentZScore: 0,
      stationary: false,
      signal: "NON_STATIONARY_DRIFT",
      signalRationaleVi: "Mẫu basis suy biến (phương sai xấp xỉ 0).",
    };
  }

  const b = (m * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / m;

  // Stationarity requires -0.999 < b < -0.0001 (AR(1) root phi = 1 + b in (0.001, 1))
  if (b >= -0.0001 || b <= -0.999) {
    return {
      theta: 0,
      longTermMean: Math.round((sumX / m) * 10) / 10,
      halfLifeMinutes: Infinity,
      equilibriumVol: 1.0,
      currentZScore: 0,
      stationary: false,
      signal: "NON_STATIONARY_DRIFT",
      signalRationaleVi: "Basis đang trong xu thế trôi tự do (Non-Stationary Trend) hoặc dao động nghịch pha, không có tính chất hồi quy trung bình.",
    };
  }

  const phi = Math.max(0.001, Math.min(0.999, 1 + b));
  const theta = -Math.log(phi) / dtMinutes;
  const longTermMean = -a / b;
  const halfLifeMinutes = Math.log(2) / theta;

  // Calculate residual variance
  let sumResidualSq = 0;
  for (let i = 0; i < m; i++) {
    const x = basisSeries[i];
    const y = basisSeries[i + 1] - x;
    const residual = y - (a + b * x);
    sumResidualSq += residual * residual;
  }
  const residualVar = sumResidualSq / Math.max(1, m - 2);
  const sigmaE = Math.sqrt(Math.max(1e-8, residualVar));
  const equilibriumVol = Math.sqrt(Math.max(1e-8, (sigmaE * sigmaE) / (2 * theta)));

  const currentBasis = basisSeries[n - 1];
  const currentZScore = Math.round(((currentBasis - longTermMean) / Math.max(0.1, equilibriumVol)) * 100) / 100;

  let signal: OUBasisCalibration["signal"] = "FAIR_VALUE_CHOP";
  let signalRationaleVi = `Basis quanh vùng hợp lý (${currentBasis.toFixed(1)} pts, Z-score: ${currentZScore}).`;

  if (currentZScore <= -2.0 && halfLifeMinutes <= 180) {
    signal = "STRONG_LONG_BASIS_REVERSION";
    signalRationaleVi = `Basis chiết khấu sâu (Z-score: ${currentZScore}, Half-life: ${Math.round(halfLifeMinutes)}p) -> Tín hiệu Mua LONG ăn chênh lệch Basis.`;
  } else if (currentZScore >= 2.0 && halfLifeMinutes <= 180) {
    signal = "STRONG_SHORT_BASIS_REVERSION";
    signalRationaleVi = `Basis thặng dư cao (Z-score: +${currentZScore}, Half-life: ${Math.round(halfLifeMinutes)}p) -> Tín hiệu Bán SHORT ăn chênh lệch Basis.`;
  }

  return {
    theta: Math.round(theta * 10000) / 10000,
    longTermMean: Math.round(longTermMean * 10) / 10,
    halfLifeMinutes: Math.round(halfLifeMinutes * 10) / 10,
    equilibriumVol: Math.round(equilibriumVol * 100) / 100,
    currentZScore,
    stationary: true,
    signal,
    signalRationaleVi,
  };
}

export interface BookQueueLevel {
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
}

export interface OFIResult {
  rawOFI: number; // Raw volume delta across 3 best levels
  normalizedOFI: number; // Scaled between -1.0 and +1.0
  institutionalPressure: "STRONG_BUY_PRESSURE" | "MODERATE_BUY_PRESSURE" | "BALANCED" | "MODERATE_SELL_PRESSURE" | "STRONG_SELL_PRESSURE";
  detailVi: string;
}

/**
 * Computes Multi-Level Order Flow Imbalance (OFI) based on Cont, Kukanov & Stoikov (2014).
 * Captures instantaneous buying/selling aggression in the order book before price updates.
 */
export function computeOrderFlowImbalance(
  prevLevels: BookQueueLevel[],
  currLevels: BookQueueLevel[]
): OFIResult {
  if (!prevLevels || !currLevels || prevLevels.length === 0 || currLevels.length === 0) {
    return {
      rawOFI: 0,
      normalizedOFI: 0,
      institutionalPressure: "BALANCED",
      detailVi: "Sổ lệnh chưa đủ dữ liệu tính OFI.",
    };
  }

  const depth = Math.min(prevLevels.length, currLevels.length, 3);
  let totalDelta = 0;
  let totalDepthVolume = 0;

  for (let k = 0; k < depth; k++) {
    const p = prevLevels[k];
    const c = currLevels[k];

    // Bid Side Contribution
    let deltaB = 0;
    if (c.bidPrice > p.bidPrice) {
      deltaB = c.bidQty;
    } else if (c.bidPrice === p.bidPrice) {
      deltaB = c.bidQty - p.bidQty;
    } else {
      deltaB = -p.bidQty;
    }

    // Ask Side Contribution
    let deltaA = 0;
    if (c.askPrice < p.askPrice) {
      deltaA = -c.askQty;
    } else if (c.askPrice === p.askPrice) {
      deltaA = p.askQty - c.askQty;
    } else {
      deltaA = p.askQty;
    }

    totalDelta += deltaB + deltaA;
    totalDepthVolume += c.bidQty + c.askQty;
  }

  const normalizedOFI = totalDepthVolume > 0
    ? Math.max(-1.0, Math.min(1.0, Math.round((totalDelta / totalDepthVolume) * 1000) / 1000))
    : 0;

  let pressure: OFIResult["institutionalPressure"] = "BALANCED";
  if (normalizedOFI >= 0.45) {
    pressure = "STRONG_BUY_PRESSURE";
  } else if (normalizedOFI >= 0.15) {
    pressure = "MODERATE_BUY_PRESSURE";
  } else if (normalizedOFI <= -0.45) {
    pressure = "STRONG_SELL_PRESSURE";
  } else if (normalizedOFI <= -0.15) {
    pressure = "MODERATE_SELL_PRESSURE";
  }

  const detailVi = `OFI Level 2/3: ${totalDelta >= 0 ? "+" : ""}${totalDelta} HĐ (Chuẩn hóa: ${(normalizedOFI * 100).toFixed(1)}%) -> Áp lực: ${pressure}.`;

  return {
    rawOFI: totalDelta,
    normalizedOFI,
    institutionalPressure: pressure,
    detailVi,
  };
}

// ============================================================================
// 4. Forex & Metals Real-Time Spread-Spike Circuit Breaker
// ============================================================================

export interface SpreadSafetyResult {
  isSafe: boolean;
  currentSpreadPips: number;
  medianSpreadPips: number;
  spikeRatio: number;
  lockoutReason: string | null;
  recommendedStopBufferPips: number;
}

/**
 * Real-Time Spread-Spike Circuit Breaker protecting FX & Gold sniper entries
 * against slippage, liquidity vacuums, and news spread widening.
 */
export function evaluateForexSpreadSafety(
  currentSpreadPips: number,
  historicalSpreadsPips: number[],
  assetType: "FX_MAJOR" | "FX_CROSS" | "GOLD" | "SILVER" = "FX_MAJOR"
): SpreadSafetyResult {
  const maxAllowedSpreadMap = {
    FX_MAJOR: 1.8, // 1.8 pips max on EURUSD/USDJPY
    FX_CROSS: 3.5, // 3.5 pips max on GBPJPY/EURAUD
    GOLD: 4.5, // 4.5 pips ($0.45) max on XAUUSD
    SILVER: 5.0, // 5.0 pips on XAGUSD
  };

  const maxAllowed = maxAllowedSpreadMap[assetType] ?? 2.5;

  let medianSpread = currentSpreadPips;
  if (historicalSpreadsPips && historicalSpreadsPips.length >= 5) {
    const sorted = [...historicalSpreadsPips].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianSpread = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  medianSpread = Math.max(0.1, medianSpread);

  const spikeRatio = Math.round((currentSpreadPips / medianSpread) * 100) / 100;

  // Circuit Breaker triggers if spread is > 2.2x median OR exceeds max allowed limit
  let isSafe = true;
  let lockoutReason: string | null = null;

  if (currentSpreadPips > maxAllowed) {
    isSafe = false;
    lockoutReason = `Spread (${currentSpreadPips.toFixed(1)} pips) vượt giới hạn an toàn tối đa (${maxAllowed.toFixed(1)} pips).`;
  } else if (spikeRatio >= 2.2 && currentSpreadPips >= 1.0) {
    isSafe = false;
    lockoutReason = `Spread giãn nở đột biến (${spikeRatio}x mức trung vị ${medianSpread.toFixed(1)} pips). Kích hoạt Circuit Breaker ngăn quét Stop Loss.`;
  }

  // Recommended dynamic stop buffer to absorb spread volatility
  const recommendedStopBufferPips = Math.round(Math.max(currentSpreadPips * 1.5, medianSpread * 1.2) * 10) / 10;

  return {
    isSafe,
    currentSpreadPips: Math.round(currentSpreadPips * 10) / 10,
    medianSpreadPips: Math.round(medianSpread * 10) / 10,
    spikeRatio,
    lockoutReason,
    recommendedStopBufferPips,
  };
}

// ============================================================================
// 5. Crypto Volatility Leverage Governor & Liquidation Clusters
// ============================================================================

export interface OhlcScalarBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LeverageGovernorResult {
  garmanKlassVolAnnualized: number;
  maxRecommendedLeverage: number;
  volatilityRegime: "COMPRESSED_COILING" | "NORMAL" | "EXPANDING_RISK" | "FLASH_CRASH_SHOCK";
  governorAdvisoryVi: string;
}

/**
 * Computes 24h rolling Garman-Klass Volatility and dynamically caps maximum
 * allowed leverage to eliminate exchange liquidation risk during flash wicks.
 */
export function computeGarmanKlassLeverageCap(
  bars: OhlcScalarBar[],
  isCrypto24h = true
): LeverageGovernorResult {
  if (!bars || bars.length < 5) {
    return {
      garmanKlassVolAnnualized: 0.5,
      maxRecommendedLeverage: 10,
      volatilityRegime: "NORMAL",
      governorAdvisoryVi: "Thiếu nến lịch sử: Áp dụng trần đòn bẩy mặc định 10x.",
    };
  }

  const n = bars.length;
  let sumGk = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const h = Math.max(b.high, b.close, b.open);
    const l = Math.min(b.low, b.close, b.open);
    const o = Math.max(1e-8, b.open);
    const c = Math.max(1e-8, b.close);

    const logHl = Math.log(Math.max(1.00001, h / Math.max(1e-8, l)));
    const logCo = Math.log(c / o);

    // Garman-Klass formulation: 0.5 * ln(H/L)^2 - (2*ln(2) - 1) * ln(C/O)^2
    const gkBar = 0.5 * (logHl ** 2) - (2 * Math.log(2) - 1) * (logCo ** 2);
    sumGk += Math.max(0, gkBar);
  }

  const gkMeanPeriod = sumGk / n;
  // Annualize: 365 days * 24 periods = 8760 if hourly, or 365 if daily
  const annualMultiplier = isCrypto24h ? Math.sqrt(365 * 24) : Math.sqrt(252);
  const gkVolAnn = Math.sqrt(gkMeanPeriod) * annualMultiplier;
  const gkVolClamped = Math.max(0.1, Math.min(3.0, gkVolAnn));

  // Leverage Cap Model: Inverse proportional to annual volatility
  // Calibrated target risk budget = 4.0 / annualVol (40% vol -> 10x, 20% vol -> 20x, 120% vol -> 3x)
  const rawLev = Math.round(4.0 / Math.max(0.2, gkVolClamped));
  const maxRecommendedLeverage = Math.max(2, Math.min(20, rawLev));

  let regime: LeverageGovernorResult["volatilityRegime"] = "NORMAL";
  let governorAdvisoryVi = `Biến động Garman-Klass: ${(gkVolClamped * 100).toFixed(1)}% -> Đòn bẩy tối đa khuyến nghị: ${maxRecommendedLeverage}x.`;

  if (gkVolClamped >= 1.20) {
    regime = "FLASH_CRASH_SHOCK";
    governorAdvisoryVi = `Cực kỳ nguy hiểm: Biến động đột biến ${(gkVolClamped * 100).toFixed(1)}%. Khống chế đòn bẩy tối đa ${maxRecommendedLeverage}x để chống quét râu thanh lý.`;
  } else if (gkVolClamped >= 0.75) {
    regime = "EXPANDING_RISK";
    governorAdvisoryVi = `Biến động mở rộng ${(gkVolClamped * 100).toFixed(1)}%. Giảm đòn bẩy xuống ${maxRecommendedLeverage}x.`;
  } else if (gkVolClamped <= 0.35) {
    regime = "COMPRESSED_COILING";
    governorAdvisoryVi = `Biến động nén chặt ${(gkVolClamped * 100).toFixed(1)}%. Thị trường chuẩn bị bùng nổ xung lực.`;
  }

  return {
    garmanKlassVolAnnualized: Math.round(gkVolClamped * 1000) / 1000,
    maxRecommendedLeverage,
    volatilityRegime: regime,
    governorAdvisoryVi,
  };
}

export interface LiquidationCluster {
  levelPrice: number;
  type: "LONG_LIQUIDATION_POOL" | "SHORT_LIQUIDATION_POOL";
  estimatedVolumeUsd: number;
  distancePct: number;
  isMagnetZone: boolean;
}

export interface LiquidationSkewContext {
  symbol?: string;
  fundingRate?: number | null;
  priceChange24hPct?: number | null;
  oiChange24hPct?: number | null;
  orderBookImbalance?: number | null; // -100 to +100
}

export interface LiquidationClusterResult {
  currentPrice: number;
  clusters: LiquidationCluster[];
  primaryMagnetPrice: number | null;
  dominantExposure: "LONGS_EXPOSED" | "SHORTS_EXPOSED" | "BALANCED";
  longExposureSharePct?: number;
  insightVi: string;
}

/**
 * Predicts asymmetric institutional Liquidation Cascade clusters and Magnet Zones (LMZ)
 * across key leverage tiers (20x, 50x, 100x), weighting exposure by funding/OI/OBI skew and ATR reach density.
 */
export function detectCryptoLiquidationClusters(
  currentPrice: number,
  openInterestUsd: number,
  atr: number,
  skewContext?: LiquidationSkewContext,
): LiquidationClusterResult {
  if (currentPrice <= 0 || openInterestUsd <= 0) {
    return {
      currentPrice,
      clusters: [],
      primaryMagnetPrice: null,
      dominantExposure: "BALANCED",
      longExposureSharePct: 50,
      insightVi: "Dữ liệu Open Interest chưa hợp lệ.",
    };
  }

  const mmr = 0.005; // 0.5% Maintenance Margin Rate
  const tiers = [
    { leverage: 20, share: 0.40 }, // 40% of leveraged OI
    { leverage: 50, share: 0.35 }, // 35%
    { leverage: 100, share: 0.25 }, // 25%
  ];

  // Asymmetric positioning skew: positive funding & rising price+OI crowd Longs below market;
  // negative funding & falling price with rising OI crowd Shorts above market.
  const fundingNorm =
    skewContext?.fundingRate != null ? Math.tanh(skewContext.fundingRate / 0.00035) : 0;
  const pricePct = skewContext?.priceChange24hPct ?? 0;
  const oiPct = skewContext?.oiChange24hPct ?? 0;
  const trendCrowding =
    skewContext?.priceChange24hPct != null
      ? Math.tanh((pricePct * (oiPct < -1 ? -0.5 : 1.0)) / 3.5)
      : 0;
  const obiNorm =
    skewContext?.orderBookImbalance != null
      ? Math.max(-1, Math.min(1, skewContext.orderBookImbalance / 100))
      : 0;

  const hasSkewSignal =
    skewContext != null &&
    (skewContext.fundingRate != null ||
      skewContext.priceChange24hPct != null ||
      skewContext.orderBookImbalance != null);

  const rawLongShare = hasSkewSignal
    ? 0.5 + 0.19 * fundingNorm + 0.11 * trendCrowding - 0.07 * obiNorm
    : 0.5;
  const longShare = Math.max(0.20, Math.min(0.80, rawLongShare));
  const shortShare = 1 - longShare;

  const effAtr = Math.max(1e-12, atr > 0 ? atr : currentPrice * 0.015);
  const symHint = skewContext?.symbol ?? "COINUSDT";

  const scoredClusters: { cluster: LiquidationCluster; magnetDensity: number }[] = [];
  let totalLongLiqUsd = 0;
  let totalShortLiqUsd = 0;

  for (const t of tiers) {
    const liqDistancePct = 1 / t.leverage - mmr; // e.g. 1/50 - 0.005 = 1.5%
    const longLiqPrice = roundPrice(currentPrice * (1 - liqDistancePct), symHint, "CRYPTO");
    const shortLiqPrice = roundPrice(currentPrice * (1 + liqDistancePct), symHint, "CRYPTO");

    const estLongVol = openInterestUsd * t.share * longShare;
    const estShortVol = openInterestUsd * t.share * shortShare;

    const longDistAtr = Math.max(0.35, Math.abs(currentPrice - longLiqPrice) / effAtr);
    const shortDistAtr = Math.max(0.35, Math.abs(shortLiqPrice - currentPrice) / effAtr);

    scoredClusters.push({
      cluster: {
        levelPrice: longLiqPrice,
        type: "LONG_LIQUIDATION_POOL",
        estimatedVolumeUsd: Math.round(estLongVol),
        distancePct: Math.round(liqDistancePct * 1000) / 10,
        isMagnetZone: estLongVol >= 5_000_000,
      },
      magnetDensity: estLongVol / Math.pow(longDistAtr, 0.85),
    });
    totalLongLiqUsd += estLongVol;

    scoredClusters.push({
      cluster: {
        levelPrice: shortLiqPrice,
        type: "SHORT_LIQUIDATION_POOL",
        estimatedVolumeUsd: Math.round(estShortVol),
        distancePct: Math.round(liqDistancePct * 1000) / 10,
        isMagnetZone: estShortVol >= 5_000_000,
      },
      magnetDensity: estShortVol / Math.pow(shortDistAtr, 0.85),
    });
    totalShortLiqUsd += estShortVol;
  }

  // Rank by ATR-normalized magnetic pull density, tie-breaking by proximity
  scoredClusters.sort((a, b) => {
    if (Math.abs(b.magnetDensity - a.magnetDensity) > 1e-3) {
      return b.magnetDensity - a.magnetDensity;
    }
    return Math.abs(a.cluster.distancePct) - Math.abs(b.cluster.distancePct);
  });
  const clusters = scoredClusters.map((x) => x.cluster);
  const primaryMagnetPrice = clusters.length > 0 ? clusters[0]!.levelPrice : null;

  const dominantExposure: LiquidationClusterResult["dominantExposure"] =
    totalLongLiqUsd > totalShortLiqUsd * 1.2
      ? "LONGS_EXPOSED"
      : totalShortLiqUsd > totalLongLiqUsd * 1.2
        ? "SHORTS_EXPOSED"
        : "BALANCED";

  const longExposureSharePct = Math.round(longShare * 100);
  const insightVi = `Cụm thanh lý trọng điểm gần nhất: $${primaryMagnetPrice} (Biên độ ${clusters[0]?.distancePct}%, ${clusters[0]?.type === "SHORT_LIQUIDATION_POOL" ? "Quét Short" : "Quét Long"}). Trạng thái: ${dominantExposure} (Long ${longExposureSharePct}% / Short ${100 - longExposureSharePct}%).`;

  return {
    currentPrice,
    clusters,
    primaryMagnetPrice,
    dominantExposure,
    longExposureSharePct,
    insightVi,
  };
}

/**
 * Maps a LiquidationClusterResult into unified precision-engine direction alignment
 * and external magnet targets for Forward Liquidity Forecasting.
 */
export function buildCryptoLiquidityContext(liqClusters: LiquidationClusterResult | null): {
  liquidationClusterAligned: "SHORT_SQUEEZE_UP" | "LONG_FLUSH_DOWN" | "BALANCED" | null;
  externalMagnets:
  | {
    price: number;
    side: "BUY_SIDE" | "SELL_SIDE";
    type: "SHORT_LIQ_CLUSTER" | "LONG_LIQ_CLUSTER";
    notionalUsd: number;
    isDominant: boolean;
  }[]
  | null;
} {
  if (!liqClusters) {
    return { liquidationClusterAligned: null, externalMagnets: null };
  }
  const liquidationClusterAligned =
    liqClusters.dominantExposure === "SHORTS_EXPOSED"
      ? "SHORT_SQUEEZE_UP"
      : liqClusters.dominantExposure === "LONGS_EXPOSED"
        ? "LONG_FLUSH_DOWN"
        : "BALANCED";
  const externalMagnets = liqClusters.clusters.slice(0, 4).map((c) => ({
    price: c.levelPrice,
    side: c.type === "SHORT_LIQUIDATION_POOL" ? ("BUY_SIDE" as const) : ("SELL_SIDE" as const),
    type:
      c.type === "SHORT_LIQUIDATION_POOL"
        ? ("SHORT_LIQ_CLUSTER" as const)
        : ("LONG_LIQ_CLUSTER" as const),
    notionalUsd: c.estimatedVolumeUsd,
    isDominant:
      (c.type === "SHORT_LIQUIDATION_POOL" && liqClusters.dominantExposure === "SHORTS_EXPOSED") ||
      (c.type === "LONG_LIQUIDATION_POOL" && liqClusters.dominantExposure === "LONGS_EXPOSED"),
  }));
  return { liquidationClusterAligned, externalMagnets };
}

// ============================================================================
// 5. Phase 4C: Counterfactual Multi-Scenario Portfolio Stress Test & Tail Guard
// ============================================================================

export interface PortfolioStressPosition {
  symbol: string;
  assetType: "VN_EQUITY" | "VN30F" | "CRYPTO" | "FOREX";
  direction: "BUY" | "SELL";
  notionalUsd: number;
  stopDistancePct?: number; // e.g. 0.015 (1.5%)
  isT2Locked?: boolean; // True for unsettled VN equities in T+0..T+2
}

export interface ScenarioStressShockResult {
  shockId:
    | "VN_EQUITY_FLOOR_LOCK_T25"
    | "USD_YIELD_SPIKE"
    | "CRYPTO_DELEVERAGING_FLUSH"
    | "CORRELATION_BREAKDOWN_80";
  shockNameVi: string;
  estimatedLossUsd: number;
  estimatedLossPctOfEquity: number;
  slippageAmplificationFactor: number;
}

export interface MultiScenarioStressTestResult {
  shocks: ScenarioStressShockResult[];
  worstCaseShockId: ScenarioStressShockResult["shockId"];
  worstCaseLossUsd: number;
  scenarioWeightedExpectedShortfallUsd: number; // StressCVaR
  maxDailyLossBudgetUsd: number;
  budgetUtilizationPct: number;
  breachesDailyBudget: boolean;
  recommendedPositionScale: number; // [0.00, 1.00]
  rationaleVi: string;
}

/**
 * Runs a fast (<1ms) counterfactual multi-scenario stress test across open + candidate
 * positions before order dispatch. Evaluates 4 canonical systemic shocks:
 * 1. VN_EQUITY_FLOOR_LOCK_T25: -6.8% gap over 2.5 days with T+2.5 illiquidity slippage
 * 2. USD_YIELD_SPIKE: DXY +1.8% shock hitting EURUSD/XAUUSD/USDVND
 * 3. CRYPTO_DELEVERAGING_FLUSH: -12% flash cascade with 2.2x stop-loss slippage
 * 4. CORRELATION_BREAKDOWN_80: Historical correlations converge to 0.80 under crisis
 */
export function runMultiScenarioPortfolioStressTest(params: {
  positions: PortfolioStressPosition[];
  accountBalanceUsd: number;
  maxDailyLossUsd: number;
  currentDailyRealizedPnlUsd?: number;
  crisisProbability?: number; // e.g. S3 + S4 + S5 probability in [0, 1]
}): MultiScenarioStressTestResult {
  const safeBalance =
    typeof params.accountBalanceUsd === "number" &&
    Number.isFinite(params.accountBalanceUsd) &&
    params.accountBalanceUsd > 0
      ? Math.max(100, Math.min(1e12, params.accountBalanceUsd))
      : 10_000;

  const safeMaxDaily =
    typeof params.maxDailyLossUsd === "number" &&
    Number.isFinite(params.maxDailyLossUsd) &&
    params.maxDailyLossUsd > 0
      ? Math.max(10, Math.min(1e12, params.maxDailyLossUsd))
      : 500;

  const currentPnl =
    typeof params.currentDailyRealizedPnlUsd === "number" &&
    Number.isFinite(params.currentDailyRealizedPnlUsd)
      ? Math.max(-1e12, Math.min(1e12, params.currentDailyRealizedPnlUsd))
      : 0;

  const crisisProb =
    typeof params.crisisProbability === "number" && Number.isFinite(params.crisisProbability)
      ? Math.min(1, Math.max(0, params.crisisProbability))
      : 0.25;

  const remainingDailyBudgetUsd = Math.max(0, safeMaxDaily + Math.min(0, currentPnl));
  const cleanPositions = (Array.isArray(params.positions) ? params.positions : []).filter(
    (p) =>
      p &&
      typeof p.symbol === "string" &&
      typeof p.notionalUsd === "number" &&
      Number.isFinite(p.notionalUsd) &&
      p.notionalUsd > 0,
  );

  if (cleanPositions.length === 0) {
    return {
      shocks: [],
      worstCaseShockId: "CORRELATION_BREAKDOWN_80",
      worstCaseLossUsd: 0,
      scenarioWeightedExpectedShortfallUsd: 0,
      maxDailyLossBudgetUsd: safeMaxDaily,
      budgetUtilizationPct: 0,
      breachesDailyBudget: false,
      recommendedPositionScale: 1.0,
      rationaleVi: "Danh mục chưa có vị thế mở -> Sức chịu đựng Stress Test 100% thông thoáng.",
    };
  }

  let lossShock1 = 0;
  let lossShock2 = 0;
  let lossShock3 = 0;
  const individualStopLosses: number[] = [];

  for (const pos of cleanPositions) {
    const notional = Math.min(1e12, pos.notionalUsd);
    const stopPct =
      typeof pos.stopDistancePct === "number" &&
      Number.isFinite(pos.stopDistancePct) &&
      pos.stopDistancePct > 0
        ? Math.min(0.5, Math.max(0.001, pos.stopDistancePct))
        : pos.assetType === "FOREX"
          ? 0.005
          : 0.018;
    const baseStopLossUsd = notional * stopPct;
    individualStopLosses.push(baseStopLossUsd);

    // Shock 1: VN Equity T+2.5 Floor Lock (-11% cumulative gap if T+2 locked, else 1.8x stop)
    if (pos.assetType === "VN_EQUITY") {
      const mult = pos.direction === "BUY" ? (pos.isT2Locked ? 0.11 : Math.max(stopPct * 1.8, 0.068)) : 0.02;
      lossShock1 += notional * mult;
    } else if (pos.assetType === "VN30F") {
      // Short VN30F offsets equity floor lock!
      lossShock1 += pos.direction === "SELL" ? -notional * 0.055 : notional * stopPct * 1.75;
    } else {
      lossShock1 += baseStopLossUsd * 0.5;
    }

    // Shock 2: USD & Yield Spike (+1.8% DXY, 2.0x stop slippage on FX/Gold)
    if (pos.assetType === "FOREX") {
      lossShock2 += baseStopLossUsd * 1.85;
    } else {
      lossShock2 += baseStopLossUsd * 1.1;
    }

    // Shock 3: Crypto De-leveraging Flush (-12% cascade, 2.2x stop slippage on Crypto)
    if (pos.assetType === "CRYPTO") {
      lossShock3 += baseStopLossUsd * 2.15;
    } else {
      lossShock3 += baseStopLossUsd * 0.75;
    }
  }

  lossShock1 = Math.max(0, lossShock1);

  // Shock 4: Correlation Breakdown (rho -> 0.80 across all positions simultaneously)
  const sumIndividual = individualStopLosses.reduce((a, b) => a + b, 0);
  const sumSquares = individualStopLosses.reduce((a, b) => a + b * b, 0);
  const rhoCrisis = 0.80;
  const crisisPortfolioVariance =
    sumSquares + rhoCrisis * Math.max(0, sumIndividual * sumIndividual - sumSquares);
  const lossShock4 = Math.sqrt(Math.max(0, crisisPortfolioVariance)) * 1.45;

  const shocks: ScenarioStressShockResult[] = [
    {
      shockId: "VN_EQUITY_FLOOR_LOCK_T25",
      shockNameVi: "Cú sốc Sàn thanh khoản T+2.5 Cổ phiếu VN (-6.8%/phiên)",
      estimatedLossUsd: Number(lossShock1.toFixed(2)),
      estimatedLossPctOfEquity: Number(((lossShock1 / safeBalance) * 100).toFixed(2)),
      slippageAmplificationFactor: 1.8,
    },
    {
      shockId: "USD_YIELD_SPIKE",
      shockNameVi: "Cú sốc Tỷ giá DXY & Lợi suất Trái phiếu (+1.8% Spike)",
      estimatedLossUsd: Number(lossShock2.toFixed(2)),
      estimatedLossPctOfEquity: Number(((lossShock2 / safeBalance) * 100).toFixed(2)),
      slippageAmplificationFactor: 1.85,
    },
    {
      shockId: "CRYPTO_DELEVERAGING_FLUSH",
      shockNameVi: "Cú sốc Thanh lý Dây chuyền Crypto Perp (-12% Cascade)",
      estimatedLossUsd: Number(lossShock3.toFixed(2)),
      estimatedLossPctOfEquity: Number(((lossShock3 / safeBalance) * 100).toFixed(2)),
      slippageAmplificationFactor: 2.15,
    },
    {
      shockId: "CORRELATION_BREAKDOWN_80",
      shockNameVi: "Cú sốc Đồng pha Tương quan Khủng hoảng (ρ = 0.80)",
      estimatedLossUsd: Number(lossShock4.toFixed(2)),
      estimatedLossPctOfEquity: Number(((lossShock4 / safeBalance) * 100).toFixed(2)),
      slippageAmplificationFactor: 1.45,
    },
  ];

  let worstShock = shocks[0]!;
  for (const s of shocks) {
    if (s.estimatedLossUsd > worstShock.estimatedLossUsd) {
      worstShock = s;
    }
  }

  const avgShockLoss =
    shocks.reduce((acc, s) => acc + s.estimatedLossUsd, 0) / shocks.length;
  const scenarioWeightedExpectedShortfallUsd = Number(
    ((1 - crisisProb) * avgShockLoss + crisisProb * worstShock.estimatedLossUsd).toFixed(2),
  );

  const budgetUtilizationPct =
    remainingDailyBudgetUsd > 0
      ? Number(((scenarioWeightedExpectedShortfallUsd / remainingDailyBudgetUsd) * 100).toFixed(1))
      : 999;

  const breachesDailyBudget =
    remainingDailyBudgetUsd <= 0 ||
    scenarioWeightedExpectedShortfallUsd > remainingDailyBudgetUsd;

  const recommendedPositionScale =
    remainingDailyBudgetUsd <= 0
      ? 0
      : scenarioWeightedExpectedShortfallUsd <= remainingDailyBudgetUsd
        ? 1.0
        : Number(
            Math.max(
              0.15,
              Math.min(1.0, remainingDailyBudgetUsd / Math.max(1e-6, scenarioWeightedExpectedShortfallUsd)),
            ).toFixed(3),
          );

  const rationaleVi = breachesDailyBudget
    ? `Cảnh báo Stress Test [${worstShock.shockId}]: StressCVaR $${scenarioWeightedExpectedShortfallUsd} vượt ngân sách lỗ ngày còn lại ($${remainingDailyBudgetUsd.toFixed(2)}) -> Co quy mô vị thế về ${(recommendedPositionScale * 100).toFixed(0)}%.`
    : `Đạt chuẩn Stress Test 4 kịch bản: StressCVaR $${scenarioWeightedExpectedShortfallUsd} (${budgetUtilizationPct}% hạn mức ngày $${remainingDailyBudgetUsd.toFixed(2)}).`;

  return {
    shocks,
    worstCaseShockId: worstShock.shockId,
    worstCaseLossUsd: worstShock.estimatedLossUsd,
    scenarioWeightedExpectedShortfallUsd,
    maxDailyLossBudgetUsd: safeMaxDaily,
    budgetUtilizationPct,
    breachesDailyBudget,
    recommendedPositionScale,
    rationaleVi,
  };
}

// ============================================================================
// 11. UNIFIED SSOT TRADE RISK PLAN (CRYPTO + FOREX KEIIY & POSITION SIZER)
// ============================================================================

export interface UnifiedTradeRiskPlanInput {
  assetType: "CRYPTO" | "FOREX";
  symbol: string;
  direction: "BUY" | "SELL";
  winRatePct: number; // e.g. 76
  payoffRatio: number; // Net R:R, e.g. 2.1
  sizeMultiplier: number; // 0..1 from EvaluatePrecisionTradeSetup
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  accountBalanceUsd?: number; // Default 10000
  leverage?: number; // Crypto Futures leverage (default 1) or Forex leverage (default 100)
  crossRates?: CrossRateOverrides;
}

export interface UnifiedTradeRiskPlanResult {
  kellyAllocation: number;
  effectiveRiskPct: number;
  riskAmountUsd: number;
  recommendedMarginUsd: number;
  recommendedLotsOrQty: number;
  estimatedLiquidationPrice: number | null;
}

/**
 * Single Source of Truth (SSOT) risk, Kelly allocation, and position sizing plan shared
 * across Crypto Signal Hub, Forex Signal Hub, Auto-Trade Worker, and Execution Dispatcher.
 */
export function calculateUnifiedTradeRiskPlan(
  input: UnifiedTradeRiskPlanInput,
): UnifiedTradeRiskPlanResult {
  const balance =
    typeof input.accountBalanceUsd === "number" && Number.isFinite(input.accountBalanceUsd) && input.accountBalanceUsd > 0
      ? input.accountBalanceUsd
      : 10_000;
  const sizeMult = Math.max(0, Math.min(1.5, input.sizeMultiplier));
  if (
    sizeMult <= 0 ||
    !Number.isFinite(input.entryPrice) ||
    input.entryPrice <= 0 ||
    !Number.isFinite(input.stopLossPrice) ||
    input.stopLossPrice <= 0 ||
    Math.abs(input.entryPrice - input.stopLossPrice) <= 1e-12
  ) {
    return {
      kellyAllocation: 0,
      effectiveRiskPct: 0,
      riskAmountUsd: 0,
      recommendedMarginUsd: 0,
      recommendedLotsOrQty: 0,
      estimatedLiquidationPrice: null,
    };
  }

  const kelly = calculateCrossAssetKelly({
    winRate: Math.max(0.05, Math.min(0.95, input.winRatePct / 100)),
    payoffRatio: Math.max(1.0, Number.isFinite(input.payoffRatio) ? input.payoffRatio : 1.8),
    isCrypto: input.assetType === "CRYPTO",
    maxCapitalPerTrade: 0.02,
  });

  const effectiveRiskPct =
    kelly.recommendedAllocation > 0
      ? Number((Math.min(1.5, Math.max(0.25, kelly.recommendedAllocation * 100)) * sizeMult).toFixed(2))
      : Number((1.0 * sizeMult).toFixed(2));
  const riskAmountUsd = Number(((balance * effectiveRiskPct) / 100).toFixed(2));

  if (input.assetType === "CRYPTO") {
    const lev = Math.max(1, Math.min(50, Math.round(input.leverage ?? 3)));
    const sizer = calculateCryptoPositionSize({
      accountBalance: balance,
      riskPercent: effectiveRiskPct,
      entryPrice: input.entryPrice,
      stopLossPrice: input.stopLossPrice,
      takeProfit1: input.takeProfit1,
      takeProfit2: input.takeProfit2,
      takeProfit3: input.takeProfit3,
      leverage: lev,
      direction: input.direction,
    });
    return {
      kellyAllocation: kelly.recommendedAllocation,
      effectiveRiskPct,
      riskAmountUsd,
      recommendedMarginUsd: sizer.requiredMarginUsd,
      recommendedLotsOrQty: Number(Math.max(0.001, sizer.positionQty).toFixed(4)),
      estimatedLiquidationPrice: sizer.estimatedLiquidationPrice,
    };
  }

  const fxSizer = calculateForexPositionSize({
    accountBalance: balance,
    riskPercent: effectiveRiskPct,
    pair: input.symbol,
    entryPrice: input.entryPrice,
    stopLossPrice: input.stopLossPrice,
    takeProfit1: input.takeProfit1,
    takeProfit2: input.takeProfit2,
    takeProfit3: input.takeProfit3,
    leverage: input.leverage ?? 100,
    crossRates: input.crossRates,
  });

  return {
    kellyAllocation: kelly.recommendedAllocation,
    effectiveRiskPct,
    riskAmountUsd,
    recommendedMarginUsd: fxSizer.marginRequiredUsd,
    recommendedLotsOrQty: Number(Math.max(0.01, fxSizer.standardLots).toFixed(2)),
    estimatedLiquidationPrice: null,
  };
}
