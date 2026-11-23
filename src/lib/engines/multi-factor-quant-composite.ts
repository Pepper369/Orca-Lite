/**
 * ORCA INSTITUTIONAL MULTI-FACTOR QUANT COMPOSITE ENGINE
 *
 * Implements an institutional-grade, cross-sectional multi-factor framework
 * integrating 3 primary dimensions tailored for the Vietnam stock market:
 *
 * 1. Technical & Microstructure (Z_Tech):
 *    - Momentum & Relative Strength (RS O'Neil 4-Quarter Weighting vs VN-Index)
 *    - Orderflow & Wyckoff Absorption (Active Buy Ratio >= 0.58, V/V20 >= 1.5)
 *    - Apex Launch Zone ([0.8% - 7.5%] from pivot) & Overhead Runway (>= 5.0%)
 *    - Ornstein-Uhlenbeck Mean Reversion & Half-life (t1/2 <= 20 days)
 *
 * 2. Fundamental & Earnings Forensics (Z_Fund):
 *    - Capital Efficiency & Moat: ROIC >= 15%, DuPont 3-way leverage guardrail
 *    - Forensic Accounting: Sloan Accrual Ratio <= 5%, CFO/Net Income >= 0.8
 *    - Fortress & Solvency: Piotroski F-Score (0-9), Altman Z'' (> 2.6), ICR >= 3.5x
 *
 * 3. Valuation & Margin of Safety (Z_Val):
 *    - Relative Multiples: Historical 5Y P/E & P/B percentiles, Gordon Growth P/B vs ROE
 *    - Intrinsic Value & FCF Yield: FCF Yield >= 6%, DCF 3-stage Margin of Safety (MOS >= 15-20%)
 *
 * Regime-Adaptive Dynamic Weighting:
 * - BULL_EXPANSION:        w_Tech = 0.45, w_Fund = 0.30, w_Val = 0.25
 * - SIDEWAY_CONSOLIDATION:  w_Tech = 0.30, w_Fund = 0.45, w_Val = 0.25
 * - BEAR_CAPITULATION:     w_Tech = 0.15, w_Fund = 0.45, w_Val = 0.40
 * - HIGH_VOLATILITY:       w_Tech = 0.20, w_Fund = 0.50, w_Val = 0.30
 *
 * Execution Guardrail: Triple-Barrier Method (Upper Target, Stop-Loss, T+20 Time Horizon, R:R >= 2.2x).
 */

import { normCdf } from "./advanced-quant-math";
import type { OhlcvBar } from "../types";
import {
  extractQlibFormulaicAlphas,
  evaluateFactorQualityQlib,
  buildQlibCompositeAlpha,
  computeForwardReturns,
} from "./formulaic-alpha-qlib";
import { monitorAlphaDecayAndRebalance } from "./alpha-decay-monitor";

export type MarketRegime =
  | "BULL_EXPANSION"
  | "SIDEWAY_CONSOLIDATION"
  | "BEAR_CAPITULATION"
  | "HIGH_VOLATILITY";

export type MultiFactorCategory =
  | "SUPER_ELITE" // 90 - 99: Top 10% thị trường
  | "LEADER"      // 80 - 89: Cổ phiếu dẫn dắt phân ngành
  | "WATCH"       // 60 - 79: Theo dõi tích cực (Chờ điểm nổ)
  | "NEUTRAL"     // 40 - 59: Trung tính
  | "AVOID";      // 1 - 39: Kém / Cờ đỏ rủi ro cao

export interface MultiFactorWeights {
  wTech: number;
  wFund: number;
  wVal: number;
}

export const REGIME_WEIGHTS_MAP: Record<MarketRegime, MultiFactorWeights> = {
  BULL_EXPANSION: { wTech: 0.45, wFund: 0.30, wVal: 0.25 },
  SIDEWAY_CONSOLIDATION: { wTech: 0.30, wFund: 0.45, wVal: 0.25 },
  BEAR_CAPITULATION: { wTech: 0.15, wFund: 0.45, wVal: 0.40 },
  HIGH_VOLATILITY: { wTech: 0.20, wFund: 0.50, wVal: 0.30 },
};

export interface MultiFactorInput {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number | null;

  // Technical & Microstructure
  rsRating?: number | null; // 1 - 99
  activeBuyRatio?: number | null; // 0.0 - 1.0 (e.g. 0.62)
  volumeAbsorptionRatio?: number | null; // V_t / SMA20(V)
  launchZoneDistancePct?: number | null; // % from pivot/bottom (e.g. 2.4%)
  overheadRoomPct?: number | null; // % to overhead resistance (e.g. 8.5%)
  ouHalfLifeDays?: number | null; // Mean reversion half-life in days
  volume20Avg?: number | null; // 20-day average volume in shares
  atr14?: number | null;
  qlibAlphaPercentileRank?: number | null; // Qlib formulaic alpha percentile rank (0 - 100)
  rawOhlcvBars?: OhlcvBar[] | null; // Optional raw bars for auto-evaluating Qlib formulaic alphas

  // Fundamental & Forensic
  roe?: number | null; // % e.g. 24.5
  roic?: number | null; // % e.g. 18.2
  isLeverageDrivenRoe?: boolean | null; // DuPont check: true if leverage ratio > 3.5 without margin improvement
  cfoToNetProfit?: number | null; // Ratio: CFO / Net Income (>= 0.8 is quality)
  sloanAccrualRatio?: number | null; // % (<= 5% safe, > 10% red flag)
  cashConversionCycleDays?: number | null; // CCC in days
  fScore?: number | null; // Piotroski F-Score (0 - 9)
  altmanZScore?: number | null; // Altman Z''
  interestCoverage?: number | null; // EBIT / Interest expense
  netDebtToEbitda?: number | null; // Net debt / EBITDA
  hasOtherReceivablesAlert?: boolean | null; // Khoản phải thu khác / Tổng TS > 30%

  // Valuation & Margin of Safety
  pe?: number | null;
  peMedian5Y?: number | null;
  pb?: number | null;
  pbTheoreticalGordon?: number | null;
  evEbitda?: number | null;
  fcfYieldPct?: number | null; // FCF / Market Cap %
  marginOfSafetyPct?: number | null; // Intrinsic MOS %
}

export interface FactorPillarDetail {
  rawScore: number; // 0 - 100
  zScore: number; // Normalized Z-score (-3.0 to +3.0)
  weight: number; // Effective weight in regime
  weightedContribution: number;
  signalsVi: string[];
}

export interface TripleBarrierPlan {
  entryPrice: number;
  upperBarrierPrice: number; // Profit taking
  lowerBarrierPrice: number; // Stop loss
  profitTargetPct: number;
  stopLossPct: number;
  riskRewardRatio: number; // R:R >= 2.2x
  timeHorizonDays: number; // e.g. 20 trading days
  isViable: boolean;
}

export interface MultiFactorCompositeResult {
  symbol: string;
  name: string;
  sector: string;
  compositeScore: number; // 1 - 99 percentile
  rawComposite: number;
  category: MultiFactorCategory;
  categoryVi: string;
  regime: MarketRegime;
  weights: MultiFactorWeights;
  breakdown: {
    technical: FactorPillarDetail;
    fundamental: FactorPillarDetail;
    valuation: FactorPillarDetail;
  };
  orthogonalizedZ?: {
    technical: number;
    fundamental: number;
    valuation: number;
  };
  redFlags: string[];
  hardEliminated: boolean;
  eliminationReasonVi?: string;
  tripleBarrier?: TripleBarrierPlan;
  formulaBreakdownVi: string;
  summaryVi: string;
}

/**
 * Determines prevailing market regime from VN-Index structure.
 */
export function determineMarketRegime(
  vnIndexPrice: number = 1250,
  vnIndexMa50: number = 1240,
  vnIndexMa200: number = 1210,
  marketVolatilityRatio: number = 1.0,
): MarketRegime {
  if (marketVolatilityRatio > 1.8) {
    return "HIGH_VOLATILITY";
  }

  if (vnIndexPrice > vnIndexMa50 && vnIndexMa50 > vnIndexMa200) {
    return "BULL_EXPANSION";
  }

  if (vnIndexPrice < vnIndexMa50 && vnIndexMa50 < vnIndexMa200) {
    return "BEAR_CAPITULATION";
  }

  return "SIDEWAY_CONSOLIDATION";
}

/**
 * Scores Pillar 1: Technical & Microstructure (Z_Tech)
 */
export function scoreTechnicalPillar(input: MultiFactorInput): {
  score: number;
  signals: string[];
} {
  let score = 50;
  const signals: string[] = [];

  // 1. Relative Strength O'Neil RS
  const rs = input.rsRating ?? 50;
  score = rs;
  if (rs >= 80) signals.push(`RS ${rs}/99 (Top siêu cổ)`);
  else if (rs < 40) signals.push(`RS yếu ${rs}/99`);

  // 2. Active Buy Orderflow Imbalance
  if (input.activeBuyRatio != null) {
    if (input.activeBuyRatio >= 0.60) {
      score += 10;
      signals.push(`Lực cầu chủ động chiếm ${(input.activeBuyRatio * 100).toFixed(0)}%`);
    } else if (input.activeBuyRatio <= 0.40) {
      score -= 10;
      signals.push(`Lực cung ép bán ${(100 - input.activeBuyRatio * 100).toFixed(0)}%`);
    }
  }

  // 3. Wyckoff Volume Absorption
  if (input.volumeAbsorptionRatio != null) {
    if (input.volumeAbsorptionRatio >= 1.5) {
      score += 8;
      signals.push(`Khối lượng hấp thụ cao (${input.volumeAbsorptionRatio.toFixed(1)}x MA20)`);
    }
  }

  // 4. Apex Sweet Launch Zone [0.8% - 7.5%]
  if (input.launchZoneDistancePct != null) {
    const dist = input.launchZoneDistancePct;
    if (dist >= 0.8 && dist <= 7.5) {
      score += 8;
      signals.push(`Điểm mua Apex chuẩn (+${dist.toFixed(1)}% từ đáy)`);
    } else if (dist > 10.0) {
      score -= 12;
      signals.push(`Giá quá rướn (+${dist.toFixed(1)}% rủi ro điều chỉnh)`);
    }
  }

  // 5. Overhead Supply Runway
  if (input.overheadRoomPct != null) {
    if (input.overheadRoomPct >= 6.5) {
      score += 6;
      signals.push(`Dư địa cản rộng (+${input.overheadRoomPct.toFixed(1)}%)`);
    } else if (input.overheadRoomPct < 3.0) {
      score -= 10;
      signals.push(`Sát cản mạnh (Dư địa chỉ ${input.overheadRoomPct.toFixed(1)}%)`);
    }
  }

  // 6. Ornstein-Uhlenbeck Mean Reversion Half-Life
  if (input.ouHalfLifeDays != null && input.ouHalfLifeDays <= 20) {
    score += 5;
    signals.push(`Hồi quy nhanh (Half-life ${input.ouHalfLifeDays.toFixed(0)} ngày)`);
  }

  // 7. Microsoft Qlib Formulaic Alpha Composite Percentile Rank (with Alpha Decay Adaptive Weights)
  let qlibRank = input.qlibAlphaPercentileRank;
  if (qlibRank == null && input.rawOhlcvBars && input.rawOhlcvBars.length >= 25) {
    try {
      const alphas = extractQlibFormulaicAlphas(input.rawOhlcvBars);
      const fwd = computeForwardReturns(input.rawOhlcvBars, 1);
      const reports: Record<string, ReturnType<typeof evaluateFactorQualityQlib>> = {};
      const decayReport =
        input.rawOhlcvBars.length >= 40
          ? monitorAlphaDecayAndRebalance({ symbol: input.symbol, bars: input.rawOhlcvBars })
          : null;
      const decayWeightByFactor = new Map<string, number>();
      if (decayReport) {
        for (const p of decayReport.factorProfiles) {
          decayWeightByFactor.set(p.factorName, p.rebalancedWeight);
        }
      }
      for (const [k, series] of Object.entries(alphas)) {
        const rep = evaluateFactorQualityQlib(k, series, fwd);
        if (decayWeightByFactor.has(k)) {
          const w = decayWeightByFactor.get(k)!;
          // Prune decayed/exhausted factors (w === 0) and scale surviving factors by adaptive weight
          rep.icir = w <= 0 ? 0 : Number((rep.icir * (0.5 + w * 2.0)).toFixed(3));
        }
        reports[k] = rep;
      }
      const comp = buildQlibCompositeAlpha({ factors: alphas, reports, useOnlyAdmitted: false });
      qlibRank = comp.latestPercentileRank;
    } catch {
      // Non-blocking fallback
    }
  }

  if (qlibRank != null) {
    if (qlibRank >= 80) {
      score += 7;
      signals.push(`Qlib Alpha Top ${(100 - qlibRank).toFixed(0)}% thị trường (ICIR cao)`);
    } else if (qlibRank < 30) {
      score -= 7;
      signals.push(`Qlib Alpha yếu (Phân vị ${qlibRank.toFixed(0)}%)`);
    }
  }

  return {
    score: Math.max(5, Math.min(99, Math.round(score))),
    signals,
  };
}

/**
 * Scores Pillar 2: Fundamental & Earnings Forensics (Z_Fund)
 */
export function scoreFundamentalPillar(input: MultiFactorInput): {
  score: number;
  signals: string[];
} {
  let score = 50;
  const signals: string[] = [];

  // 1. Piotroski F-Score (0 - 9) — Base anchor scaled to [35..75] to prevent double-counting saturation with ROIC/CFO/Altman
  if (input.fScore != null) {
    score = 35 + Math.round((input.fScore / 9) * 40);
    if (input.fScore >= 7) signals.push(`Piotroski ${input.fScore}/9 điểm (Siêu khỏe)`);
    else if (input.fScore <= 3) signals.push(`Piotroski yếu ${input.fScore}/9 điểm`);
  }

  // 2. Capital Efficiency (ROIC & ROE)
  const roic = input.roic ?? (input.roe ? input.roe * 0.75 : 10);
  if (roic >= 18) {
    score += 10;
    signals.push(`ROIC ấn tượng ${roic.toFixed(1)}%`);
  } else if (roic >= 12) {
    score += 5;
  } else if (roic < 6) {
    score -= 10;
  }

  // DuPont leverage penalty
  if (input.isLeverageDrivenRoe) {
    score -= 12;
    signals.push("ROE tăng nhờ bẩy nợ cao (DuPont cờ vàng)");
  }

  // 3. Forensic Accounting: Sloan Accrual Ratio (normalize decimal e.g. 0.045 -> 4.5%)
  if (input.sloanAccrualRatio != null && Number.isFinite(input.sloanAccrualRatio)) {
    const sloanPct =
      Math.abs(input.sloanAccrualRatio) <= 1.0
        ? input.sloanAccrualRatio * 100
        : input.sloanAccrualRatio;
    if (sloanPct <= 5.0) {
      score += 6;
      signals.push(`Dồn tích sạch (Sloan ${sloanPct.toFixed(1)}%)`);
    } else if (sloanPct > 10.0) {
      score -= 15;
      signals.push(`Dồn tích cao (Sloan ${sloanPct.toFixed(1)}% - Rủi ro lợi nhuận ảo)`);
    }
  }

  // 4. CFO to Net Income Quality
  if (input.cfoToNetProfit != null) {
    if (input.cfoToNetProfit >= 1.0) {
      score += 8;
      signals.push(`Dòng tiền thực chất (CFO/LNST = ${input.cfoToNetProfit.toFixed(2)}x)`);
    } else if (input.cfoToNetProfit < 0.5) {
      score -= 12;
      signals.push(`Lợi nhuận trên giấy (CFO/LNST = ${input.cfoToNetProfit.toFixed(2)}x)`);
    }
  }

  // 5. Solvency: Altman Z'' & Interest Coverage Ratio
  if (input.altmanZScore != null) {
    if (input.altmanZScore >= 2.6) {
      score += 6;
      signals.push(`Altman Z'' = ${input.altmanZScore.toFixed(2)} (Vùng an toàn)`);
    } else if (input.altmanZScore < 1.1) {
      score -= 18;
      signals.push(`Altman Z'' = ${input.altmanZScore.toFixed(2)} (Vùng nguy hiểm vỡ nợ)`);
    }
  }

  if (input.interestCoverage != null) {
    if (input.interestCoverage >= 4.0) {
      score += 5;
      signals.push(`Bao phủ lãi vay ${input.interestCoverage.toFixed(1)}x`);
    } else if (input.interestCoverage < 1.5) {
      score -= 14;
      signals.push(`Áp lực nợ vay lớn (ICR = ${input.interestCoverage.toFixed(1)}x)`);
    }
  }

  return {
    score: Math.max(5, Math.min(99, Math.round(score))),
    signals,
  };
}

/**
 * Scores Pillar 3: Valuation & Margin of Safety (Z_Val)
 */
export function scoreValuationPillar(input: MultiFactorInput): {
  score: number;
  signals: string[];
} {
  let score = 50;
  const signals: string[] = [];

  // 1. P/E vs Historical 5Y Median
  const pe = input.pe;
  if (pe != null && pe > 0) {
    if (input.peMedian5Y != null && input.peMedian5Y > 0) {
      const discount = (input.peMedian5Y - pe) / input.peMedian5Y;
      if (discount >= 0.20) {
        score += 12;
        signals.push(`P/E chiết khấu ${(discount * 100).toFixed(0)}% so với trung vị 5 năm`);
      } else if (discount <= -0.30) {
        score -= 10;
        signals.push(`P/E đắt hơn 5 năm (+${(-discount * 100).toFixed(0)}%)`);
      }
    } else {
      if (pe <= 10) score += 10;
      else if (pe > 25) score -= 10;
    }
  }

  // 2. Gordon Model P/B vs ROE (Especially for Financials)
  if (input.pb != null && input.pbTheoreticalGordon != null) {
    const pbDiscount = (input.pbTheoreticalGordon - input.pb) / input.pbTheoreticalGordon;
    if (pbDiscount >= 0.15) {
      score += 10;
      signals.push(`P/B thị trường thấp hơn P/B định giá Gordon (${input.pb.toFixed(1)}x vs ${input.pbTheoreticalGordon.toFixed(1)}x)`);
    }
  }

  // 3. FCF Yield
  if (input.fcfYieldPct != null) {
    if (input.fcfYieldPct >= 7.0) {
      score += 10;
      signals.push(`FCF Yield dồi dào ${input.fcfYieldPct.toFixed(1)}%`);
    } else if (input.fcfYieldPct < 0) {
      score -= 6;
      signals.push(`FCF âm (${input.fcfYieldPct.toFixed(1)}%)`);
    }
  }

  // 4. Intrinsic Margin of Safety (MOS)
  if (input.marginOfSafetyPct != null) {
    if (input.marginOfSafetyPct >= 20.0) {
      score += 15;
      signals.push(`Biên an toàn định giá MOS +${input.marginOfSafetyPct.toFixed(1)}%`);
    } else if (input.marginOfSafetyPct >= 10.0) {
      score += 8;
    } else if (input.marginOfSafetyPct < 0) {
      score -= 10;
      signals.push(`Thị giá vượt giá trị nội tại (${input.marginOfSafetyPct.toFixed(1)}%)`);
    }
  }

  return {
    score: Math.max(5, Math.min(99, Math.round(score))),
    signals,
  };
}

/**
 * Builds Triple-Barrier Quantitative Execution Plan.
 */
export function buildTripleBarrierPlan(
  price: number,
  atr14?: number | null,
  overheadRoomPct?: number | null,
): TripleBarrierPlan {
  const currentPrice = price > 0 ? price : 50000;
  const effectiveAtr = atr14 && atr14 > 0 ? atr14 : currentPrice * 0.025; // Default 2.5% ATR

  // Upper barrier: +2.5 ATR (or capped by overhead resistance)
  let targetDelta = effectiveAtr * 2.5;
  if (overheadRoomPct != null && overheadRoomPct > 4.0) {
    const resistanceDelta = (currentPrice * overheadRoomPct) / 100 * 0.92; // 8% buffer below resistance
    targetDelta = Math.max(targetDelta, resistanceDelta);
  }

  // Lower barrier: -1.0 ATR
  const stopDelta = effectiveAtr * 1.0;

  const upperBarrierPrice = Math.round(currentPrice + targetDelta);
  const lowerBarrierPrice = Math.round(currentPrice - stopDelta);

  const profitTargetPct = Number(((upperBarrierPrice - currentPrice) / currentPrice * 100).toFixed(1));
  const stopLossPct = Number(((currentPrice - lowerBarrierPrice) / currentPrice * 100).toFixed(1));
  const riskRewardRatio = stopLossPct > 0 ? Number((profitTargetPct / stopLossPct).toFixed(2)) : 2.5;

  return {
    entryPrice: currentPrice,
    upperBarrierPrice,
    lowerBarrierPrice,
    profitTargetPct,
    stopLossPct,
    riskRewardRatio,
    timeHorizonDays: 20, // T+20 trading sessions
    isViable: riskRewardRatio >= 2.2,
  };
}

/**
 * Computes single-stock Multi-Factor Composite Score.
 */
export function computeMultiFactorComposite(
  input: MultiFactorInput,
  regime: MarketRegime = "BULL_EXPANSION",
): MultiFactorCompositeResult {
  const weights = REGIME_WEIGHTS_MAP[regime];
  const redFlags: string[] = [];

  // Check Hard Elimination Filters
  let hardEliminated = false;
  let eliminationReasonVi: string | undefined;

  if (input.volume20Avg != null && input.volume20Avg < 80000) {
    hardEliminated = true;
    eliminationReasonVi = `Thanh khoản quá thấp (Khớp TB20 chỉ ${input.volume20Avg.toLocaleString("vi-VN")} cp/ngày - rủi ro kẹt sàn T+2.5)`;
    redFlags.push(eliminationReasonVi);
  }

  if (input.hasOtherReceivablesAlert) {
    redFlags.push("Cảnh báo: Phải thu khác > 30% Tổng TS (Rủi ro ủy thác đầu tư mờ ám)");
  }

  if (input.sloanAccrualRatio != null && Number.isFinite(input.sloanAccrualRatio)) {
    const sloanPct =
      Math.abs(input.sloanAccrualRatio) <= 1.0
        ? input.sloanAccrualRatio * 100
        : input.sloanAccrualRatio;
    if (sloanPct > 15.0) {
      redFlags.push("Cảnh báo Sloan: Tỷ lệ dồn tích > 15% (Lợi nhuận ảo nghiêm trọng)");
    }
  }

  if (input.altmanZScore != null && input.altmanZScore < 1.1) {
    redFlags.push("Cảnh báo Altman Z'': Rơi vào vùng nguy cơ phá sản / vỡ nợ");
  }

  // Calculate Pillar Scores
  const tech = scoreTechnicalPillar(input);
  const fund = scoreFundamentalPillar(input);
  const val = scoreValuationPillar(input);

  // Z-Score approximations centered at 50, scale = 16.67
  const zTech = Number(((tech.score - 50) / 16.67).toFixed(2));
  const zFund = Number(((fund.score - 50) / 16.67).toFixed(2));
  const zVal = Number(((val.score - 50) / 16.67).toFixed(2));

  // Weighted raw composite
  let rawComposite =
    weights.wTech * tech.score +
    weights.wFund * fund.score +
    weights.wVal * val.score;

  // Apply red flag penalties
  if (redFlags.length > 0) {
    rawComposite -= redFlags.length * 8;
  }
  rawComposite = Math.max(5, Math.min(99, rawComposite));

  // If hard-eliminated, cap score at 35 (AVOID)
  if (hardEliminated) {
    rawComposite = Math.min(35, rawComposite);
  }

  // Map to Percentile Rank using Standard Normal CDF
  const zComposite = (rawComposite - 50) / 18;
  const percentile = Math.round(normCdf(zComposite) * 100);
  const compositeScore = Math.max(1, Math.min(99, percentile));

  // Classify Category
  let category: MultiFactorCategory = "NEUTRAL";
  let categoryVi = "Trung Tính";
  if (compositeScore >= 90) {
    category = "SUPER_ELITE";
    categoryVi = "Siêu Cổ Phiếu Elite";
  } else if (compositeScore >= 80) {
    category = "LEADER";
    categoryVi = "Cổ Phiếu Dẫn Dắt";
  } else if (compositeScore >= 60) {
    category = "WATCH";
    categoryVi = "Theo Dõi Tích Cực";
  } else if (compositeScore < 40) {
    category = "AVOID";
    categoryVi = "Kém (Cần Tránh)";
  }

  // Triple-Barrier Plan
  const tripleBarrier = input.price && input.price > 0
    ? buildTripleBarrierPlan(input.price, input.atr14, input.overheadRoomPct)
    : undefined;

  const formulaBreakdownVi =
    `Composite = ${weights.wTech}·Tech(${tech.score}) + ${weights.wFund}·Fund(${fund.score}) + ${weights.wVal}·Val(${val.score})` +
    (redFlags.length ? ` - ${redFlags.length * 8}đ (Cờ đỏ)` : "");

  const summaryVi =
    `Orca Quant Composite ${compositeScore}/99 (${categoryVi}) [Regime: ${regime}]: ` +
    `Tech: ${tech.score}đ, Fund: ${fund.score}đ, Val: ${val.score}đ.` +
    (tripleBarrier ? ` Kế hoạch T+20: Mục tiêu ${tripleBarrier.profitTargetPct}%, Stop ${tripleBarrier.stopLossPct}% (R:R ${tripleBarrier.riskRewardRatio}x).` : "");

  return {
    symbol: input.symbol,
    name: input.name || input.symbol,
    sector: input.sector || "Thị trường chung",
    compositeScore,
    rawComposite: Number(rawComposite.toFixed(2)),
    category,
    categoryVi,
    regime,
    weights,
    breakdown: {
      technical: {
        rawScore: tech.score,
        zScore: zTech,
        weight: weights.wTech,
        weightedContribution: Number((weights.wTech * tech.score).toFixed(2)),
        signalsVi: tech.signals,
      },
      fundamental: {
        rawScore: fund.score,
        zScore: zFund,
        weight: weights.wFund,
        weightedContribution: Number((weights.wFund * fund.score).toFixed(2)),
        signalsVi: fund.signals,
      },
      valuation: {
        rawScore: val.score,
        zScore: zVal,
        weight: weights.wVal,
        weightedContribution: Number((weights.wVal * val.score).toFixed(2)),
        signalsVi: val.signals,
      },
    },
    redFlags,
    hardEliminated,
    eliminationReasonVi,
    tripleBarrier,
    formulaBreakdownVi,
    summaryVi,
  };
}

/**
 * Calculates Universe Multi-Factor Percentiles across cross-sectional stocks.
 */
export function calculateUniverseMultiFactor(
  inputs: MultiFactorInput[],
  regime: MarketRegime = "BULL_EXPANSION",
): Map<string, MultiFactorCompositeResult> {
  const resultMap = new Map<string, MultiFactorCompositeResult>();
  if (inputs.length === 0) return resultMap;

  // Single-pass computation
  const scored = inputs.map((item) => computeMultiFactorComposite(item, regime));

  // Sort ascending by raw composite for percentile calibration
  scored.sort((a, b) => a.rawComposite - b.rawComposite);

  const total = scored.length;
  scored.forEach((item, idx) => {
    let calibratedPercentile = item.compositeScore;
    if (total > 1) {
      calibratedPercentile = Math.round(1 + (98 * idx) / (total - 1));
    }

    if (item.hardEliminated) {
      calibratedPercentile = Math.min(35, calibratedPercentile);
    }

    item.compositeScore = calibratedPercentile;
    if (calibratedPercentile >= 90) {
      item.category = "SUPER_ELITE";
      item.categoryVi = "Siêu Cổ Phiếu Elite";
    } else if (calibratedPercentile >= 80) {
      item.category = "LEADER";
      item.categoryVi = "Cổ Phiếu Dẫn Dắt";
    } else if (calibratedPercentile >= 60) {
      item.category = "WATCH";
      item.categoryVi = "Theo Dõi Tích Cực";
    } else if (calibratedPercentile < 40) {
      item.category = "AVOID";
      item.categoryVi = "Kém (Cần Tránh)";
    } else {
      item.category = "NEUTRAL";
      item.categoryVi = "Trung Tính";
    }
    item.summaryVi =
      `Orca Quant Composite ${item.compositeScore}/99 (${item.categoryVi}) [Regime: ${item.regime}]: ` +
      `Tech: ${item.breakdown.technical.rawScore}đ, Fund: ${item.breakdown.fundamental.rawScore}đ, Val: ${item.breakdown.valuation.rawScore}đ.` +
      (item.tripleBarrier
        ? ` Kế hoạch T+20: Mục tiêu ${item.tripleBarrier.profitTargetPct}%, Stop ${item.tripleBarrier.stopLossPct}% (R:R ${item.tripleBarrier.riskRewardRatio}x).`
        : "");
    resultMap.set(item.symbol, item);
  });

  // Attach Gram-Schmidt orthogonalized cross-sectional Z-scores (Fund -> Val -> Tech)
  // so collinear valuation/quality/momentum effects can be inspected without double-counting
  if (scored.length >= 3) {
    const fundVec = scored.map((s) => s.breakdown.fundamental.zScore);
    const valVec = scored.map((s) => s.breakdown.valuation.zScore);
    const techVec = scored.map((s) => s.breakdown.technical.zScore);
    const [orthFund, orthVal, orthTech] = orthogonalizeFactorVectorsGramSchmidt([
      fundVec,
      valVec,
      techVec,
    ]);
    scored.forEach((item, idx) => {
      item.orthogonalizedZ = {
        fundamental: Number((orthFund?.[idx] ?? item.breakdown.fundamental.zScore).toFixed(3)),
        valuation: Number((orthVal?.[idx] ?? item.breakdown.valuation.zScore).toFixed(3)),
        technical: Number((orthTech?.[idx] ?? item.breakdown.technical.zScore).toFixed(3)),
      };
    });
  }

  return resultMap;
}

/**
 * Gram-Schmidt Factor Orthogonalization across cross-sectional factor vectors.
 * Removes collinearity between pillars (e.g. Fundamental Quality, Valuation, and Momentum)
 * and standardizes each orthogonalized residual vector to zero mean and unit variance.
 */
export function orthogonalizeFactorVectorsGramSchmidt(vectors: number[][]): number[][] {
  if (vectors.length === 0) return [];
  const n = vectors[0]!.length;
  if (n < 2) return vectors.map((v) => [...v]);

  const centerAndNormalize = (vec: number[]): number[] => {
    const mean = vec.reduce((a, b) => a + b, 0) / n;
    const centered = vec.map((x) => x - mean);
    const variance = centered.reduce((s, x) => s + x * x, 0) / Math.max(1, n - 1);
    const std = Math.sqrt(Math.max(1e-9, variance));
    return centered.map((x) => x / std);
  };

  const ortho: number[][] = [];
  for (let k = 0; k < vectors.length; k++) {
    let uk = centerAndNormalize(vectors[k]!);
    for (let j = 0; j < ortho.length; j++) {
      const uj = ortho[j]!;
      let dotVU = 0;
      let dotUU = 0;
      for (let i = 0; i < n; i++) {
        dotVU += uk[i]! * uj[i]!;
        dotUU += uj[i]! * uj[i]!;
      }
      if (dotUU > 1e-9) {
        const proj = dotVU / dotUU;
        uk = uk.map((val, i) => val - proj * uj[i]!);
      }
    }
    ortho.push(centerAndNormalize(uk).map((v) => Number(v.toFixed(4))));
  }

  return ortho;
}

function rankVector(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  let k = 0;
  while (k < indexed.length) {
    let end = k;
    while (end + 1 < indexed.length && Math.abs(indexed[end + 1]!.v - indexed[k]!.v) <= 1e-12) {
      end++;
    }
    const avgRank = (k + end) / 2 + 1;
    for (let j = k; j <= end; j++) {
      ranks[indexed[j]!.i] = avgRank;
    }
    k = end + 1;
  }
  return ranks;
}

/**
 * Computes Spearman Rank Information Coefficient (RankIC) in [-1, 1]
 * between cross-sectional factor scores at time t and realized forward returns at t + H.
 */
export function computeSpearmanRankIc(factorScores: number[], forwardReturns: number[]): number {
  const n = Math.min(factorScores.length, forwardReturns.length);
  if (n < 3) return 0;
  const rX = rankVector(factorScores.slice(0, n));
  const rY = rankVector(forwardReturns.slice(0, n));
  const meanX = (n + 1) / 2;
  const meanY = (n + 1) / 2;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rX[i]! - meanX;
    const dy = rY[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  if (denom <= 1e-9) return 0;
  return Number(Math.max(-1, Math.min(1, cov / denom)).toFixed(4));
}

export interface RollingRankIcSnapshot {
  techScores: number[];
  fundScores: number[];
  valScores: number[];
  forwardReturns: number[];
}

export interface DynamicRankIcWeightResult {
  weights: MultiFactorWeights;
  rankIcMean: { tech: number; fund: number; val: number };
  icInformationRatio: { tech: number; fund: number; val: number };
  sampleWindows: number;
}

/**
 * Estimates Dynamic Factor Weights proportional to Rolling RankIC Information Ratio (IC-IR),
 * shrunk toward the prevailing MarketRegime prior when sample windows are small.
 */
export function estimateRollingRankIcWeights(
  snapshots: RollingRankIcSnapshot[],
  fallbackRegime: MarketRegime = "BULL_EXPANSION",
): DynamicRankIcWeightResult {
  const prior = REGIME_WEIGHTS_MAP[fallbackRegime];
  if (snapshots.length === 0) {
    return {
      weights: { ...prior },
      rankIcMean: { tech: 0, fund: 0, val: 0 },
      icInformationRatio: { tech: 0, fund: 0, val: 0 },
      sampleWindows: 0,
    };
  }

  const icTech: number[] = [];
  const icFund: number[] = [];
  const icVal: number[] = [];

  for (const snap of snapshots) {
    icTech.push(computeSpearmanRankIc(snap.techScores, snap.forwardReturns));
    icFund.push(computeSpearmanRankIc(snap.fundScores, snap.forwardReturns));
    icVal.push(computeSpearmanRankIc(snap.valScores, snap.forwardReturns));
  }

  const calcMeanAndIr = (arr: number[]): { mean: number; ir: number } => {
    const m = arr.length;
    if (m === 0) return { mean: 0, ir: 0 };
    // Exponential recency decay weights
    let wSum = 0;
    let mean = 0;
    for (let i = 0; i < m; i++) {
      const w = Math.exp(-(m - 1 - i) / 6);
      mean += w * arr[i]!;
      wSum += w;
    }
    mean /= Math.max(1e-9, wSum);
    if (m < 2) return { mean: Number(mean.toFixed(4)), ir: Number(Math.max(0, mean * 2).toFixed(4)) };
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (m - 1);
    const std = Math.sqrt(Math.max(0.01, variance));
    return {
      mean: Number(mean.toFixed(4)),
      ir: Number((mean / std).toFixed(4)),
    };
  };

  const tStat = calcMeanAndIr(icTech);
  const fStat = calcMeanAndIr(icFund);
  const vStat = calcMeanAndIr(icVal);

  const rawT = Math.max(0.08, tStat.ir > 0 ? tStat.ir : Math.max(0.08, prior.wTech * (1 + tStat.mean)));
  const rawF = Math.max(0.08, fStat.ir > 0 ? fStat.ir : Math.max(0.08, prior.wFund * (1 + fStat.mean)));
  const rawV = Math.max(0.08, vStat.ir > 0 ? vStat.ir : Math.max(0.08, prior.wVal * (1 + vStat.mean)));
  const sumRaw = rawT + rawF + rawV;

  const empWTech = rawT / sumRaw;
  const empWFund = rawF / sumRaw;
  const empWVal = rawV / sumRaw;

  // Shrinkage toward regime prior based on number of observation windows
  const confidence = Math.min(0.80, snapshots.length / (snapshots.length + 3));
  const wTech = Number((confidence * empWTech + (1 - confidence) * prior.wTech).toFixed(3));
  const wFund = Number((confidence * empWFund + (1 - confidence) * prior.wFund).toFixed(3));
  const wVal = Number(Math.max(0.05, 1 - wTech - wFund).toFixed(3));

  return {
    weights: { wTech, wFund, wVal },
    rankIcMean: { tech: tStat.mean, fund: fStat.mean, val: vStat.mean },
    icInformationRatio: { tech: tStat.ir, fund: fStat.ir, val: vStat.ir },
    sampleWindows: snapshots.length,
  };
}
