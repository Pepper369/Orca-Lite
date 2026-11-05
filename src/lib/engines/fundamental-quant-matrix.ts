/**
 * Fundamental Quant Matrix Engine (Orca-Lite FA)
 * Deterministic quantitative fundamental analysis:
 * 1. Earnings Quality & Accruals Analysis (CFO / Net Profit conversion & FCF Yield)
 * 2. Capital Efficiency & Economic Moat (ROIC & DuPont 3-Way)
 * 3. Financial Fortress & Solvency (Interest Coverage Ratio ICR & Net Cash)
 * 4. Growth at Reasonable Price (PEG Ratio)
 * 5. Consensus Upside & CTCK Target Price Margin of Safety
 * 6. Joel Greenblatt's Magic Formula Percentile Score
 * 7. FA Master Classification & Health Rating
 */

import type { FundamentalSnapshot } from "../financial/snapshots";
import type { VietcapProfile } from "../providers/vietcap";

export type FaCategory =
  | "FORTRESS"
  | "CASH_MACHINE"
  | "MOAT_QUALITY"
  | "UNDERVALUED_GROWTH"
  | "CONSENSUS_UPSIDE"
  | "VALUE_DIVIDEND"
  | "HIGH_RISK"
  | "STANDARD";

export interface FundamentalMatrixResult {
  // 1. Dòng tiền & Chất lượng Lợi nhuận
  cfoToNetProfit: number | null; // CFO / Net Profit (>= 1.0 = Tiền mặt thực chất)
  isQualityEarnings: boolean;
  ocfBillion: number | null; // in Billion VND
  fcfBillion: number | null; // in Billion VND
  fcfYieldPct: number | null; // FCF / Market Cap (%)

  // 2. Hiệu quả Vốn & Moat
  roic: number | null; // Return on Invested Capital (%)
  isHighRoic: boolean; // ROIC >= 15%
  dupontDrive: "MARGIN" | "TURNOVER" | "LEVERAGE" | "BALANCED";

  // 3. Đòn bẩy & Sức bền Tài chính
  interestCoverage: number | null; // EBIT / Interest (>= 4.0x = Siêu an toàn)
  isSafeDebt: boolean;
  isNetCash: boolean; // Tiền mặt > Tổng nợ vay
  netDebtToEbitda: number | null;

  // 4. Định giá & Tăng trưởng
  peg: number | null; // P/E / NI YoY% (< 1.0 = Hời Peter Lynch)
  isUndervaluedGrowth: boolean;

  // 5. Định giá Đồng thuận CTCK
  consensusTargetPrice: number | null;
  consensusUpsidePct: number | null; // % upside tới giá mục tiêu
  isConsensusDiscount: boolean; // Upside >= 20%

  // 6. Magic Formula Greenblatt Score (1 - 99)
  magicFormulaScore: number;

  // 7. Phân hạng Sức khỏe FA Tổng hợp
  faCategory: FaCategory;
  faBadgeVi: string;
  faSummaryVi: string;
}

export function computeFundamentalMatrix(params: {
  snap?: FundamentalSnapshot | null;
  price?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  niYoyPct?: number | null;
  marketCapBillion?: number | null;
  vietcapProfile?: VietcapProfile | null;
}): FundamentalMatrixResult {
  const { snap, price, pe, pb, dividendYield, niYoyPct, marketCapBillion, vietcapProfile } = params;

  // 1. Dòng tiền & Chất lượng Lợi nhuận
  let cfoToNetProfit: number | null = null;
  if (snap?.ocfTtm != null && snap.netProfit != null && snap.netProfit > 0) {
    cfoToNetProfit = Number((snap.ocfTtm / snap.netProfit).toFixed(2));
  }

  const ocfBillion = snap?.ocfTtm
    ? Math.abs(snap.ocfTtm) > 100_000_000
      ? Math.round(snap.ocfTtm / 1_000_000_000)
      : Math.round(snap.ocfTtm)
    : null;
  const fcfBillion = snap?.fcfTtm
    ? Math.abs(snap.fcfTtm) > 100_000_000
      ? Math.round(snap.fcfTtm / 1_000_000_000)
      : Math.round(snap.fcfTtm)
    : null;

  let fcfYieldPct: number | null = null;
  if (fcfBillion != null && marketCapBillion != null && marketCapBillion > 0) {
    fcfYieldPct = Number(((fcfBillion / marketCapBillion) * 100).toFixed(1));
  }

  const isQualityEarnings = Boolean(
    cfoToNetProfit != null && cfoToNetProfit >= 0.8 && (fcfBillion == null || fcfBillion > 0)
  );

  // 2. Hiệu quả Vốn & Moat (ROIC)
  let roic: number | null = null;
  if (snap?.roic != null && Number.isFinite(snap.roic)) {
    // If provider gives decimal (0.18 = 18%), normalize to percentage
    roic = Math.abs(snap.roic) <= 1.0 ? Number((snap.roic * 100).toFixed(1)) : Number(snap.roic.toFixed(1));
  } else if (snap?.roe != null && snap.debtEquity != null) {
    // Proxy approximation if explicit roic is missing
    const de = snap.debtEquity;
    roic = Number((snap.roe / (1 + de * 0.7)).toFixed(1));
  }

  const isHighRoic = roic != null && roic >= 15.0;

  const netMargin =
    snap?.netMargin != null
      ? snap.netMargin
      : snap?.netProfit && snap?.revenue && snap.revenue > 0
      ? (snap.netProfit / snap.revenue) * 100
      : 0;
  const roe = snap?.roe != null ? snap.roe : roic != null ? roic : 15;

  let dupontDrive: FundamentalMatrixResult["dupontDrive"] = "BALANCED";
  const de = snap?.debtEquity ?? 1.0;
  if (netMargin >= 18 && de <= 1.2) {
    dupontDrive = "MARGIN";
  } else if (de > 2.2) {
    dupontDrive = "LEVERAGE";
  } else if (roe >= 18 && netMargin < 10) {
    dupontDrive = "TURNOVER";
  }

  // 3. Đòn bẩy & Sức bền Tài chính
  const interestCoverage = snap?.interestCoverage != null ? Number(snap.interestCoverage.toFixed(1)) : null;
  const isNetCash = Boolean(snap?.cash != null && snap.totalDebt != null && snap.cash > snap.totalDebt);
  const netDebtToEbitda = snap?.netDebtToEbitda != null ? Number(snap.netDebtToEbitda.toFixed(2)) : null;

  const isSafeDebt =
    isNetCash ||
    interestCoverage == null ||
    interestCoverage >= 3.5 ||
    (netDebtToEbitda != null && netDebtToEbitda <= 2.0);

  // 4. Định giá & Tăng trưởng (PEG)
  let peg: number | null = null;
  if (pe != null && pe > 0 && niYoyPct != null && niYoyPct > 5.0) {
    peg = Number((pe / niYoyPct).toFixed(2));
  }
  const isUndervaluedGrowth = peg != null && peg > 0 && peg <= 1.0;

  // 5. Định giá Đồng thuận CTCK
  const targetRaw = vietcapProfile?.targetPrice ?? null;
  // Handle price unit difference (VND vs thousand VND)
  let consensusTargetPrice: number | null = null;
  let consensusUpsidePct: number | null = null;

  if (targetRaw && targetRaw > 0 && price && price > 0) {
    // Standardize to match price unit
    let normTarget = targetRaw;
    if (price < 1000 && targetRaw > 1000) normTarget = targetRaw / 1000;
    else if (price > 1000 && targetRaw < 1000) normTarget = targetRaw * 1000;

    consensusTargetPrice = Number(normTarget.toFixed(2));
    consensusUpsidePct = Number((((consensusTargetPrice - price) / price) * 100).toFixed(1));
  }
  const isConsensusDiscount = consensusUpsidePct != null && consensusUpsidePct >= 20.0;

  // 6. Magic Formula Greenblatt Score (1 - 99)
  let mfScore = 50;
  if (roic != null) {
    if (roic >= 25) mfScore += 25;
    else if (roic >= 18) mfScore += 18;
    else if (roic >= 12) mfScore += 10;
    else if (roic < 5) mfScore -= 15;
  }
  if (pe != null && pe > 0) {
    // Earnings Yield proxy
    const ey = (1 / pe) * 100;
    if (ey >= 15) mfScore += 25; // P/E <= 6.6
    else if (ey >= 10) mfScore += 18; // P/E <= 10
    else if (ey >= 6.5) mfScore += 10; // P/E <= 15
    else if (ey < 4) mfScore -= 15; // P/E > 25
  }
  if (isQualityEarnings) mfScore += 8;
  if (isNetCash) mfScore += 6;
  const magicFormulaScore = Math.max(1, Math.min(99, Math.round(mfScore)));

  // 7. Phân hạng Sức khỏe FA Tổng hợp
  let faCategory: FaCategory = "STANDARD";
  let faBadgeVi = "Cơ Bản Chuẩn";
  let faSummaryVi = "Chỉ số tài chính nằm trong ngưỡng cân bằng.";

  const isAltmanDistress = snap?.coverage != null && snap.coverage > 0 && (snap.debtEquity ?? 0) > 3.0;
  const isDangerousDebt = (interestCoverage != null && interestCoverage < 1.3) || (snap?.debtEquity != null && snap.debtEquity > 3.5);

  if (isDangerousDebt || isAltmanDistress) {
    faCategory = "HIGH_RISK";
    faBadgeVi = "Cảnh Báo Rủi Ro";
    faSummaryVi = `Đòn bẩy nợ cao (D/E ${snap?.debtEquity?.toFixed(1) ?? "—"}), phủ lãi vay thấp.`;
  } else if (isNetCash && (interestCoverage == null || interestCoverage >= 4.0) && roe >= 12) {
    faCategory = "FORTRESS";
    faBadgeVi = "Pháo Đài Tiền Mặt";
    faSummaryVi = "Doanh nghiệp tiền mặt ròng dồi dào, không áp lực nợ vay, sức đề kháng kinh tế cực mạnh.";
  } else if (isQualityEarnings && cfoToNetProfit != null && cfoToNetProfit >= 1.1 && netMargin >= 10) {
    faCategory = "CASH_MACHINE";
    faBadgeVi = "Cỗ Máy Sinh Tiền";
    faSummaryVi = `Dòng tiền thuần HĐKD gấp ${cfoToNetProfit}x Lợi nhuận ròng, tiền thật về két dồi dào.`;
  } else if (isHighRoic && roe >= 16 && isSafeDebt) {
    faCategory = "MOAT_QUALITY";
    faBadgeVi = "Con Hào Kinh Tế";
    faSummaryVi = `ROIC ${roic}% vượt trội chi phí vốn WACC, lợi thế cạnh tranh độc quyền bền vững.`;
  } else if (isUndervaluedGrowth && (niYoyPct ?? 0) >= 20) {
    faCategory = "UNDERVALUED_GROWTH";
    faBadgeVi = "Tăng Trưởng Hời";
    faSummaryVi = `Tăng trưởng LN +${niYoyPct}% với PEG chỉ ${peg}x (< 1.0) theo chuẩn Peter Lynch.`;
  } else if (isConsensusDiscount) {
    faCategory = "CONSENSUS_UPSIDE";
    faBadgeVi = "Biên An Toàn CTCK";
    faSummaryVi = `Giá mục tiêu CTCK ${consensusTargetPrice?.toLocaleString("vi-VN")}, kỳ vọng tăng +${consensusUpsidePct}%.`;
  } else if (dividendYield != null && dividendYield >= 6.0 && (pe == null || pe <= 12) && isSafeDebt) {
    faCategory = "VALUE_DIVIDEND";
    faBadgeVi = "Cổ Tức & Giá Trị";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), định giá an toàn phòng thủ.`;
  }

  return {
    cfoToNetProfit,
    isQualityEarnings,
    ocfBillion,
    fcfBillion,
    fcfYieldPct,
    roic,
    isHighRoic,
    dupontDrive,
    interestCoverage,
    isSafeDebt,
    isNetCash,
    netDebtToEbitda,
    peg,
    isUndervaluedGrowth,
    consensusTargetPrice,
    consensusUpsidePct,
    isConsensusDiscount,
    magicFormulaScore,
    faCategory,
    faBadgeVi,
    faSummaryVi,
  };
}
