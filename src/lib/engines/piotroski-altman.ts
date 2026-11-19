import type { FundamentalSnapshot } from "../financial/snapshots";
import { resolveIndustryEvalTrack, safeDiv, type IndustryEvalTrack } from "../financial/fa-core";

/**
 * Piotroski F-Score (0 - 9) & Altman Z''-Score (Emerging Market Variant) Engine
 *
 * Upgraded FA 2.0 Rules:
 * 1. Multi-period deltas (ΔROA, ΔLTD/Assets, ΔCurrentRatio, ΔShares, ΔGrossMargin, ΔAssetTurnover)
 *    computed directly from `snap.annualHistory` [t, t-1] when available.
 * 2. No free points from `?? 0`: missing inputs leave the criterion `false` and lower `criteriaEvaluated`.
 * 3. Financial-sector exemption: Banks, Securities, and Insurance firms receive `EXEMPT_FINANCIAL`
 *    on Altman Z'' rather than distorted balance-sheet distress scores.
 */

export interface PiotroskiResult {
  fScore: number; // 0 - 9
  criteriaEvaluated: number; // 0 - 9 criteria with real data
  isMultiPeriod: boolean;
  rating: "EXCELLENT" | "GOOD" | "AVERAGE" | "WEAK";
  criteria: {
    // 1. Profitability
    positiveRoa: boolean;
    positiveCfo: boolean;
    increasingRoa: boolean;
    cashQuality: boolean;
    // 2. Leverage & Liquidity
    lowerLeverage: boolean;
    higherLiquidity: boolean;
    noDilution: boolean;
    // 3. Operating Efficiency
    higherGrossMargin: boolean;
    higherTurnover: boolean;
  };
  summaryVi: string;
}

export interface AltmanZResult {
  zScore: number | null;
  zone: "SAFE" | "GREY" | "DISTRESS" | "EXEMPT_FINANCIAL" | "INSUFFICIENT_DATA";
  zoneVi: "An Toàn" | "Vùng Xám" | "Nguy Cơ Cao" | "Miễn trừ (Tài chính)" | "Thiếu dữ liệu BCTC";
  descriptionVi: string;
  x1_workingCapitalAssets: number | null;
  x2_retainedEarningsAssets: number | null;
  x3_ebitAssets: number | null;
  x4_equityLiabilities: number | null;
}

export interface FundamentalHealthMetrics {
  piotroski: PiotroskiResult;
  altman: AltmanZResult;
  industryTrack: IndustryEvalTrack;
}

/**
 * Calculates Piotroski F-Score (0 - 9) deterministically from FundamentalSnapshot.
 */
export function calculatePiotroskiScore(snap: FundamentalSnapshot): PiotroskiResult {
  const track = snap.industryTrack ?? resolveIndustryEvalTrack(snap.symbol);
  const isFinancial = track === "FINANCIAL_BANK_SEC_INS";
  const hist = snap.annualHistory ?? [];
  const curr = hist[0];
  const prev = hist[1];
  const isMultiPeriod = Boolean(curr && prev);

  let criteriaEvaluated = 0;

  // 1. ROA > 0
  let positiveRoa = false;
  if (snap.roa != null && Number.isFinite(snap.roa)) {
    criteriaEvaluated++;
    positiveRoa = snap.roa > 0;
  } else if (snap.netProfit != null && Number.isFinite(snap.netProfit)) {
    criteriaEvaluated++;
    positiveRoa = snap.netProfit > 0;
  }

  // 2. CFO > 0 (Banks/Financials: operating cash flow can swing with deposits/margin loans, still tracked if available)
  let positiveCfo = false;
  if (snap.ocfTtm != null && Number.isFinite(snap.ocfTtm)) {
    criteriaEvaluated++;
    positiveCfo = snap.ocfTtm > 0;
  }

  // 3. ΔROA > 0
  let increasingRoa = false;
  const roaCurr = curr ? safeDiv(curr.netProfit, curr.totalAssets) : null;
  const roaPrev = prev ? safeDiv(prev.netProfit, prev.totalAssets) : null;
  if (roaCurr != null && roaPrev != null) {
    criteriaEvaluated++;
    increasingRoa = roaCurr > roaPrev;
  } else if (snap.niYoyPct != null && Number.isFinite(snap.niYoyPct)) {
    criteriaEvaluated++;
    increasingRoa = snap.niYoyPct > 0;
  }

  // 4. Cash Quality: CFO > Net Profit (accruals quality)
  let cashQuality = false;
  if (snap.ocfTtm != null && Number.isFinite(snap.ocfTtm) && snap.netProfit != null && Number.isFinite(snap.netProfit)) {
    criteriaEvaluated++;
    cashQuality = snap.ocfTtm > 0 && (snap.netProfit <= 0 || snap.ocfTtm >= snap.netProfit);
  }

  // 5. Lower or prudent leverage (NEVER award free point when debt data is missing)
  let lowerLeverage = false;
  const ltdCurr = curr ? safeDiv(curr.longTermDebt ?? curr.totalDebt, curr.totalAssets) : null;
  const ltdPrev = prev ? safeDiv(prev.longTermDebt ?? prev.totalDebt, prev.totalAssets) : null;
  if (ltdCurr != null && ltdPrev != null) {
    criteriaEvaluated++;
    lowerLeverage = ltdCurr <= ltdPrev;
  } else if (snap.totalDebt != null && Number.isFinite(snap.totalDebt) && snap.totalDebt === 0) {
    criteriaEvaluated++;
    lowerLeverage = true;
  } else if (snap.debtEquity != null && Number.isFinite(snap.debtEquity)) {
    criteriaEvaluated++;
    lowerLeverage = isFinancial ? snap.debtEquity >= 0 : snap.debtEquity >= 0 && snap.debtEquity <= 1.2;
  }

  // 6. Higher Liquidity (Financials: Equity/Assets >= 7% capital adequacy proxy)
  let higherLiquidity = false;
  if (isFinancial) {
    const eqAssetsCurr =
      curr != null
        ? safeDiv(curr.equity, curr.totalAssets)
        : safeDiv(snap.equity, snap.totalAssets);
    const eqAssetsPrev = prev != null ? safeDiv(prev.equity, prev.totalAssets) : null;
    if (eqAssetsCurr != null) {
      criteriaEvaluated++;
      higherLiquidity = eqAssetsPrev != null ? eqAssetsCurr >= eqAssetsPrev - 0.005 : eqAssetsCurr >= 0.07;
    }
  } else {
    const crCurr = curr ? safeDiv(curr.currentAssets, curr.currentLiabilities) : null;
    const crPrev = prev ? safeDiv(prev.currentAssets, prev.currentLiabilities) : null;
    if (crCurr != null && crPrev != null) {
      criteriaEvaluated++;
      higherLiquidity = crCurr >= crPrev;
    } else if (snap.currentRatio != null && Number.isFinite(snap.currentRatio)) {
      criteriaEvaluated++;
      higherLiquidity = snap.currentRatio >= 1.2;
    }
  }

  // 7. No significant equity dilution
  let noDilution = false;
  if (curr?.shares != null && prev?.shares != null && curr.shares > 0 && prev.shares > 0) {
    criteriaEvaluated++;
    noDilution = curr.shares <= prev.shares * 1.01;
  } else if (snap.shares != null && snap.shares > 0 && snap.coverage >= 0.4) {
    criteriaEvaluated++;
    noDilution = true;
  }

  // 8. Higher Gross Margin (Financials: Operating/Net Margin expansion)
  let higherGrossMargin = false;
  if (isFinancial) {
    const nmCurr = curr ? safeDiv(curr.netProfit, curr.revenue) : null;
    const nmPrev = prev ? safeDiv(prev.netProfit, prev.revenue) : null;
    if (nmCurr != null && nmPrev != null) {
      criteriaEvaluated++;
      higherGrossMargin = nmCurr >= nmPrev;
    } else if (snap.netMargin != null && Number.isFinite(snap.netMargin)) {
      criteriaEvaluated++;
      higherGrossMargin = snap.netMargin >= 20;
    }
  } else {
    const gmCurr = curr ? safeDiv(curr.grossProfit, curr.revenue) : null;
    const gmPrev = prev ? safeDiv(prev.grossProfit, prev.revenue) : null;
    if (gmCurr != null && gmPrev != null) {
      criteriaEvaluated++;
      higherGrossMargin = gmCurr >= gmPrev;
    } else if (snap.grossMargin != null && Number.isFinite(snap.grossMargin)) {
      criteriaEvaluated++;
      higherGrossMargin = snap.grossMargin >= 15 && (snap.revenueYoyPct == null || snap.revenueYoyPct > 0);
    }
  }

  // 9. Higher Asset Turnover (Δ(Revenue / Assets) > 0)
  let higherTurnover = false;
  const atCurr = curr ? safeDiv(curr.revenue, curr.totalAssets) : null;
  const atPrev = prev ? safeDiv(prev.revenue, prev.totalAssets) : null;
  if (atCurr != null && atPrev != null) {
    criteriaEvaluated++;
    higherTurnover = atCurr > atPrev;
  } else if (snap.revenueYoyPct != null && snap.netMargin != null) {
    criteriaEvaluated++;
    higherTurnover = snap.revenueYoyPct > 0 && snap.netMargin > 0;
  }

  const checks = [
    positiveRoa,
    positiveCfo,
    increasingRoa,
    cashQuality,
    lowerLeverage,
    higherLiquidity,
    noDilution,
    higherGrossMargin,
    higherTurnover,
  ];
  const fScore = checks.reduce((acc, pass) => acc + (pass ? 1 : 0), 0);

  let rating: PiotroskiResult["rating"] = "WEAK";
  let summaryVi = "Sức khỏe tài chính yếu hoặc thiếu dữ liệu xác thực, cần cẩn trọng rủi ro dòng tiền.";
  if (fScore >= 8) {
    rating = "EXCELLENT";
    summaryVi = "Cực kỳ xuất sắc (Kim Cương): Dòng tiền dồi dào, biên lợi nhuận mở rộng, đòn bẩy an toàn.";
  } else if (fScore >= 6) {
    rating = "GOOD";
    summaryVi = "Tốt & Lành mạnh: Đạt chuẩn đầu tư tăng trưởng bền vững.";
  } else if (fScore >= 4) {
    rating = "AVERAGE";
    summaryVi = "Trung bình: Một số chỉ số biên lợi nhuận hoặc dòng tiền chưa tối ưu.";
  }

  return {
    fScore,
    criteriaEvaluated,
    isMultiPeriod,
    rating,
    criteria: {
      positiveRoa,
      positiveCfo,
      increasingRoa,
      cashQuality,
      lowerLeverage,
      higherLiquidity,
      noDilution,
      higherGrossMargin,
      higherTurnover,
    },
    summaryVi,
  };
}

/**
 * Calculates Edward Altman's Z''-Score for Emerging Markets (non-financial firms only).
 * Formula: Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
 */
export function calculateAltmanZScore(snap: FundamentalSnapshot): AltmanZResult {
  const track = snap.industryTrack ?? resolveIndustryEvalTrack(snap.symbol);
  if (track === "FINANCIAL_BANK_SEC_INS") {
    return {
      zScore: null,
      zone: "EXEMPT_FINANCIAL",
      zoneVi: "Miễn trừ (Tài chính)",
      descriptionVi: "Ngân hàng/Chứng khoán/Bảo hiểm không áp dụng mô hình Altman Z'' (đòn bẩy tiền gửi đặc thù).",
      x1_workingCapitalAssets: null,
      x2_retainedEarningsAssets: null,
      x3_ebitAssets: null,
      x4_equityLiabilities: null,
    };
  }

  const equity = snap.equity;
  const totalLiabilities = snap.totalLiabilities ?? snap.totalDebt;
  const totalAssets =
    snap.totalAssets ??
    (equity != null && totalLiabilities != null ? equity + totalLiabilities : null);

  if (
    equity == null ||
    totalAssets == null ||
    totalLiabilities == null ||
    totalAssets <= 0 ||
    totalLiabilities <= 0
  ) {
    return {
      zScore: null,
      zone: "INSUFFICIENT_DATA",
      zoneVi: "Thiếu dữ liệu BCTC",
      descriptionVi: "Thiếu Tổng tài sản, Tổng nợ phải trả hoặc VCSH để tính Altman Z''-Score chính xác.",
      x1_workingCapitalAssets: null,
      x2_retainedEarningsAssets: null,
      x3_ebitAssets: null,
      x4_equityLiabilities: null,
    };
  }

  // X1: Working Capital / Total Assets (prefer true CA - CL; bounded liquid proxy only when cash & debt exist)
  let workingCapital: number | null = null;
  if (snap.currentAssets != null && snap.currentLiabilities != null) {
    workingCapital = snap.currentAssets - snap.currentLiabilities;
  } else if (snap.cash != null && snap.totalDebt != null) {
    workingCapital = snap.cash - snap.totalDebt * 0.4;
  }

  // X2: Retained Earnings / Total Assets (fallback to netProfit only when RE absent)
  const retained = snap.retainedEarnings ?? snap.netProfit;

  // X3: EBIT / Total Assets
  const ebit =
    snap.ebit ??
    (snap.ebitdaTtm != null ? snap.ebitdaTtm * 0.8 : null);

  if (workingCapital == null || retained == null || ebit == null) {
    return {
      zScore: null,
      zone: "INSUFFICIENT_DATA",
      zoneVi: "Thiếu dữ liệu BCTC",
      descriptionVi: "Thiếu cấu phần Vốn lưu động, LN giữ lại hoặc EBIT để tính Altman Z''-Score.",
      x1_workingCapitalAssets: null,
      x2_retainedEarningsAssets: null,
      x3_ebitAssets: null,
      x4_equityLiabilities: null,
    };
  }

  const x1 = Math.min(1.0, Math.max(-0.5, workingCapital / totalAssets));
  const x2 = Math.min(1.0, Math.max(-0.5, retained / totalAssets));
  const x3 = Math.min(1.0, Math.max(-0.5, ebit / totalAssets));
  const x4 = Math.min(10.0, Math.max(0, equity / totalLiabilities));

  const zScoreRaw = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  const zScore = Math.round(zScoreRaw * 100) / 100;

  let zone: AltmanZResult["zone"] = "GREY";
  let zoneVi: AltmanZResult["zoneVi"] = "Vùng Xám";
  let descriptionVi = "Rủi ro trung bình, cần theo dõi thêm biến động nợ vay.";

  if (zScore >= 2.6) {
    zone = "SAFE";
    zoneVi = "An Toàn";
    descriptionVi = "Vùng an toàn cao: Rủi ro kiệt quệ tài chính cực thấp, cấu trúc vốn vững chắc.";
  } else if (zScore < 1.1) {
    zone = "DISTRESS";
    zoneVi = "Nguy Cơ Cao";
    descriptionVi = "Vùng nguy cấp: Tỷ lệ nợ cao hoặc hiệu quả sinh lời trên tài sản suy giảm.";
  }

  return {
    zScore,
    zone,
    zoneVi,
    descriptionVi,
    x1_workingCapitalAssets: Math.round(x1 * 100) / 100,
    x2_retainedEarningsAssets: Math.round(x2 * 100) / 100,
    x3_ebitAssets: Math.round(x3 * 100) / 100,
    x4_equityLiabilities: Math.round(x4 * 100) / 100,
  };
}

/**
 * Combined Fundamental Health Analyzer (Piotroski + Altman).
 */
export function computePiotroskiAltman(snap: FundamentalSnapshot): FundamentalHealthMetrics {
  const industryTrack = snap.industryTrack ?? resolveIndustryEvalTrack(snap.symbol);
  return {
    piotroski: calculatePiotroskiScore(snap),
    altman: calculateAltmanZScore(snap),
    industryTrack,
  };
}
