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

  // 1. Piotroski F-Score (0 - 9)
  if (input.fScore != null) {
    score = Math.round((input.fScore / 9) * 100);
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

  // 3. Forensic Accounting: Sloan Accrual Ratio
  if (input.sloanAccrualRatio != null) {
    if (input.sloanAccrualRatio <= 5.0) {
      score += 6;
      signals.push(`Dồn tích sạch (Sloan ${input.sloanAccrualRatio.toFixed(1)}%)`);
    } else if (input.sloanAccrualRatio > 10.0) {
      score -= 15;
      signals.push(`Dồn tích cao (Sloan ${input.sloanAccrualRatio.toFixed(1)}% - Rủi ro lợi nhuận ảo)`);
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

  if (input.sloanAccrualRatio != null && input.sloanAccrualRatio > 15.0) {
    redFlags.push("Cảnh báo Sloan: Tỷ lệ dồn tích > 15% (Lợi nhuận ảo nghiêm trọng)");
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
    resultMap.set(item.symbol, item);
  });

  return resultMap;
}
