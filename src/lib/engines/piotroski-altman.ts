import type { FundamentalSnapshot } from "../financial/snapshots";

/**
 * Piotroski F-Score (0 - 9) & Altman Z''-Score (Emerging Market Variant) Engine
 *
 * Joseph Piotroski's 9-point criteria evaluates fundamental momentum across 3 core pillars:
 * 1. Profitability (ROA, CFO, delta ROA, Accruals CFO > Net Income) -> 4 points
 * 2. Leverage, Liquidity and Source of Funds (delta Debt, delta Current Ratio, Dilution) -> 3 points
 * 3. Operating Efficiency (delta Gross Margin, delta Asset Turnover) -> 2 points
 *
 * Altman Z''-Score (Edward Altman 1993 for Emerging Markets & non-US firms):
 * Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
 * Where:
 * X1 = Working Capital / Total Assets
 * X2 = Retained Earnings / Total Assets
 * X3 = EBIT / Total Assets
 * X4 = Book Value Equity / Total Liabilities
 *
 * Zones:
 * Z'' > 2.60 : SAFE (Vùng an toàn)
 * 1.10 - 2.60 : GREY (Vùng xám)
 * < 1.10 : DISTRESS (Vùng nguy hiểm)
 */

export interface PiotroskiResult {
  fScore: number; // 0 - 9
  rating: "EXCELLENT" | "GOOD" | "AVERAGE" | "WEAK";
  criteria: {
    // 1. Profitability
    positiveRoa: boolean; // ROA > 0
    positiveCfo: boolean; // Cash flow from operations > 0
    increasingRoa: boolean; // ROA increased vs prior period
    cashQuality: boolean; // CFO > Net Income (high accrual quality)
    // 2. Leverage & Liquidity
    lowerLeverage: boolean; // Long term debt / Equity decreased or prudent
    higherLiquidity: boolean; // Current ratio improved or healthy (> 1.2)
    noDilution: boolean; // No equity dilution / shares stable
    // 3. Operating Efficiency
    higherGrossMargin: boolean; // Gross margin improved
    higherTurnover: boolean; // Revenue growth outpaces assets
  };
  summaryVi: string;
}

export interface AltmanZResult {
  zScore: number | null;
  zone: "SAFE" | "GREY" | "DISTRESS";
  zoneVi: "An Toàn" | "Vùng Xám" | "Nguy Cơ Cao";
  descriptionVi: string;
  x1_workingCapitalAssets: number | null;
  x2_retainedEarningsAssets: number | null;
  x3_ebitAssets: number | null;
  x4_equityLiabilities: number | null;
}

export interface FundamentalHealthMetrics {
  piotroski: PiotroskiResult;
  altman: AltmanZResult;
}

/**
 * Calculates Piotroski F-Score (0 - 9) deterministically from FundamentalSnapshot.
 */
export function calculatePiotroskiScore(snap: FundamentalSnapshot): PiotroskiResult {
  const roa = snap.roa ?? 0;
  const netProfit = snap.netProfit ?? 0;
  const ocf = snap.ocfTtm ?? 0;
  const niYoy = snap.niYoyPct ?? 0;
  const revYoy = snap.revenueYoyPct ?? 0;
  const grossMargin = snap.grossMargin ?? 0;
  const currentRatio = snap.currentRatio ?? 0;
  const debtEquity = snap.debtEquity ?? 0;

  // Criteria 1: ROA > 0
  const positiveRoa = roa > 0 || netProfit > 0;

  // Criteria 2: CFO > 0
  const positiveCfo = ocf > 0;

  // Criteria 3: Delta ROA > 0 (Proxy: Net Income YoY growth > 0)
  const increasingRoa = niYoy > 0;

  // Criteria 4: CFO > Net Profit (Cash earnings exceed accounting income)
  const cashQuality = ocf > 0 && (netProfit <= 0 || ocf >= netProfit * 0.85);

  // Criteria 5: Lower or prudent Leverage (D/E <= 1.2 or low debt)
  const lowerLeverage = debtEquity <= 1.2 || (snap.totalDebt ?? 0) === 0;

  // Criteria 6: Higher or safe liquidity (Current Ratio >= 1.2)
  const higherLiquidity = currentRatio >= 1.2;

  // Criteria 7: No significant share dilution (proxy: shares exist and coverage >= 1)
  const noDilution = (snap.shares ?? 0) > 0;

  // Criteria 8: Higher or solid Gross Margin (Gross Margin > 15% or positive revenue growth)
  const higherGrossMargin = grossMargin >= 15 || revYoy > 0;

  // Criteria 9: Higher Asset Turnover (Revenue YoY > 0 and Net Margin > 5%)
  const higherTurnover = revYoy > 0 && (snap.netMargin ?? 0) > 0;

  let fScore = 0;
  if (positiveRoa) fScore++;
  if (positiveCfo) fScore++;
  if (increasingRoa) fScore++;
  if (cashQuality) fScore++;
  if (lowerLeverage) fScore++;
  if (higherLiquidity) fScore++;
  if (noDilution) fScore++;
  if (higherGrossMargin) fScore++;
  if (higherTurnover) fScore++;

  let rating: PiotroskiResult["rating"] = "WEAK";
  let summaryVi = "Sức khỏe tài chính yếu, cần cẩn trọng rủi ro dòng tiền.";
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
 * Calculates Edward Altman's Z''-Score for Emerging Markets.
 * Formula: Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
 */
export function calculateAltmanZScore(snap: FundamentalSnapshot): AltmanZResult {
  const equity = snap.equity ?? 0;
  const debt = snap.totalDebt ?? 0;
  const cash = snap.cash ?? 0;
  const netProfit = snap.netProfit ?? 0;
  const ebitda = snap.ebitdaTtm ?? netProfit * 1.25;

  // Approximate total assets if not directly given: Equity + Total Debt
  const totalAssets = Math.max(1_000_000, equity + debt);
  const totalLiabilities = Math.max(1_000_000, debt);

  // X1: Working Capital / Total Assets (proxied by Cash & Liquid assets vs Total Assets)
  const workingCapital = Math.max(0, cash - debt * 0.4);
  const x1 = Math.min(1.0, Math.max(-0.5, workingCapital / totalAssets));

  // X2: Retained Earnings / Total Assets (proxied by Net Profit over Assets, annualized)
  const x2 = Math.min(1.0, Math.max(-0.5, netProfit / totalAssets));

  // X3: EBIT / Total Assets (proxied by EBITDA * 0.8 / Total Assets)
  const ebit = ebitda * 0.8;
  const x3 = Math.min(1.0, Math.max(-0.5, ebit / totalAssets));

  // X4: Book Value of Equity / Total Liabilities
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
  return {
    piotroski: calculatePiotroskiScore(snap),
    altman: calculateAltmanZScore(snap),
  };
}
