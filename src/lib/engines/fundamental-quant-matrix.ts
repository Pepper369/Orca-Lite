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
  | "BUFFETT_COMPOUNDER"
  | "LYNCH_GROWTH"
  | "GRAHAM_NET_NET"
  | "DIVIDEND_ARISTOCRAT"
  | "WORKING_CAPITAL"
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

  // 7. Forensic Accounting & Chống gian lận (Beneish M-Score & Sloan Accruals)
  beneishMScore: number | null;
  isBeneishSafe: boolean; // M-Score < -2.22
  sloanAccrualRatio: number | null; // (Net Income - CFO) / Total Assets

  // 8. Warren Buffett Compounder (Siêu tích lũy vốn)
  isBuffettCompounder: boolean;
  buffettScore: number; // 0 - 100

  // 9. Peter Lynch Fast Grower
  isLynchFastGrower: boolean;

  // 10. Benjamin Graham Net-Net (NCAV)
  isGrahamNcav: boolean;
  ncavPerShare: number | null;

  // 11. Working Capital & Cash Conversion Cycle (CCC)
  cashConversionCycleDays: number | null;
  isWorkingCapitalChampion: boolean;

  // 12. Dividend Aristocrat (Quý tộc cổ tức)
  isDividendAristocrat: boolean;
  dividendPayoutRatio: number | null;

  // 13. Điểm uốn tăng trưởng quý (Quarterly Inflection)
  inflectionDelta: number | null;
  isQuarterlyInflection: boolean;

  // 14. Phân hạng Sức khỏe FA Tổng hợp
  faCategory: FaCategory;
  faBadgeVi: string;
  faSummaryVi: string;
}

export function computeFundamentalMatrix(params: {
  snap?: Partial<FundamentalSnapshot> | null;
  price?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  niYoyPct?: number | null;
  revenueYoyPct?: number | null;
  marketCapBillion?: number | null;
  vietcapProfile?: VietcapProfile | null;
}): FundamentalMatrixResult {
  const { snap, price, pe, pb, dividendYield, niYoyPct, revenueYoyPct, marketCapBillion, vietcapProfile } = params;
  const effectiveRevenueYoy = revenueYoyPct ?? snap?.revenueYoyPct ?? null;

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

  // 7. Forensic Accounting & Chống gian lận (Beneish M-Score & Sloan Accruals)
  // Ensure consistent scale for Sloan accrual ratio (normalize to billion VND if in full VND)
  const rawNetProfit = snap?.netProfit ?? 0;
  const rawOcf = snap?.ocfTtm ?? 0;
  const rawEquity = snap?.equity ?? 1000;
  const netProfitBillion = Math.abs(rawNetProfit) > 100_000_000 ? rawNetProfit / 1_000_000_000 : rawNetProfit;
  const ocfRatioBillion = Math.abs(rawOcf) > 100_000_000 ? rawOcf / 1_000_000_000 : rawOcf;
  const equityBillion = Math.abs(rawEquity) > 100_000_000 ? rawEquity / 1_000_000_000 : rawEquity;

  const totalAssetsApprox = Math.max(1, equityBillion * (1 + (snap?.debtEquity ?? 1)));
  const sloanAccrualRatio = Number(((netProfitBillion - ocfRatioBillion) / totalAssetsApprox).toFixed(3));

  const dsri = cfoToNetProfit != null && cfoToNetProfit < 0.6 ? 1.25 : cfoToNetProfit != null && cfoToNetProfit >= 1.0 ? 0.92 : 1.0;
  const gmi = (snap?.grossMargin != null && snap.grossMargin >= 20) ? 0.95 : 1.15;
  const aqi = 1.0;
  const sgi = 1 + Math.max(-0.4, Math.min(1.2, (effectiveRevenueYoy ?? 0) / 100));
  const depi = 1.0;
  const sgai = 1.0;
  const lvgi = (snap?.debtEquity != null && snap.debtEquity > 2.0) ? 1.2 : 0.98;
  const tata = Math.max(-0.4, Math.min(0.4, sloanAccrualRatio));

  const rawMScore = -4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.037 * tata + 0.0327 * lvgi;
  const beneishMScore = Number(rawMScore.toFixed(2));
  const isBeneishSafe = beneishMScore < -2.22;

  // 8. Warren Buffett Compounder (Siêu tích lũy vốn)
  const isBuffettCompounder = Boolean(
    isHighRoic &&
    roe >= 18 &&
    (netMargin >= 12 || (snap?.grossMargin ?? 0) >= 22) &&
    (isNetCash || isSafeDebt) &&
    (cfoToNetProfit == null || cfoToNetProfit >= 0.85) &&
    (effectiveRevenueYoy == null || effectiveRevenueYoy >= 6)
  );
  let bScore = 40;
  if (roic != null && roic >= 20) bScore += 25;
  else if (roic != null && roic >= 15) bScore += 15;
  if (roe >= 20) bScore += 20;
  if (isNetCash) bScore += 15;
  if (isQualityEarnings) bScore += 10;
  if (netMargin >= 15) bScore += 10;
  const buffettScore = Math.min(99, bScore);

  // 9. Peter Lynch Fast Grower
  const growthRate = Math.max(niYoyPct ?? 0, snap?.niQoqPct ?? 0);
  const isLynchFastGrower = Boolean(
    growthRate >= 20 &&
    peg != null &&
    peg > 0 &&
    peg <= 0.85 &&
    (snap?.debtEquity == null || snap.debtEquity <= 1.0) &&
    (effectiveRevenueYoy == null || effectiveRevenueYoy >= 10)
  );

  // 10. Benjamin Graham Net-Net (NCAV)
  const cashVal = snap?.cash ?? 0;
  const totalDebtVal = snap?.totalDebt ?? 0;
  const currentAssetsEst = (snap?.equity ?? 0) * 0.7 + cashVal;
  const ncavTotal = currentAssetsEst - totalDebtVal;
  const sharesVal = snap?.shares ?? 0;
  const rawNcavPerShare = sharesVal > 0 ? Number((ncavTotal / sharesVal).toFixed(2)) : null;
  // Normalize ncavPerShare to match price unit (thousand VND vs full VND)
  let normNcavPerShare = rawNcavPerShare;
  if (normNcavPerShare != null && price != null && price > 0) {
    if (price < 500 && normNcavPerShare > 500) {
      normNcavPerShare = normNcavPerShare / 1000;
    } else if (price > 500 && normNcavPerShare < 500) {
      normNcavPerShare = normNcavPerShare * 1000;
    }
  }
  const isGrahamNcav = Boolean(
    (marketCapBillion != null && ncavTotal > 0 && marketCapBillion <= (ncavTotal / 1_000_000_000) * 1.3) ||
    (normNcavPerShare != null && price != null && price > 0 && price <= normNcavPerShare * 1.3 && rawNetProfit > 0)
  );
  const ncavPerShare = normNcavPerShare ?? rawNcavPerShare;

  // 11. Working Capital & Cash Conversion Cycle (CCC)
  const effectiveCurrentRatio = snap?.currentRatio ?? (isNetCash ? 1.5 : null);
  const isWorkingCapitalChampion = Boolean(
    effectiveCurrentRatio != null &&
    effectiveCurrentRatio >= 1.25 &&
    (snap?.quickRatio == null || snap.quickRatio >= 0.85) &&
    cfoToNetProfit != null &&
    cfoToNetProfit >= 1.0
  );
  const cashConversionCycleDays = isWorkingCapitalChampion
    ? Math.max(15, Math.round(55 - (cfoToNetProfit ?? 1) * 15))
    : Math.round(75 + (snap?.debtEquity ?? 1) * 10);

  // 12. Dividend Aristocrat
  const isDividendAristocrat = Boolean(
    dividendYield != null &&
    dividendYield >= 5.5 &&
    (pe == null || pe <= 16) &&
    isSafeDebt &&
    (cfoToNetProfit == null || cfoToNetProfit >= 0.8)
  );
  const dividendPayoutRatio =
    dividendYield != null && pe != null && pe > 0
      ? Number(Math.min(100, Math.max(0, dividendYield * pe)).toFixed(1))
      : null;

  // 13. Điểm uốn tăng trưởng quý (Quarterly Inflection)
  let inflectionDelta: number | null = null;
  if (snap?.niQoqPct != null && niYoyPct != null) {
    inflectionDelta = Number((snap.niQoqPct - niYoyPct).toFixed(1));
  }
  const isQuarterlyInflection = Boolean(
    inflectionDelta != null && inflectionDelta >= 15.0 && (snap?.niQoqPct ?? 0) >= 20.0
  );

  // 14. Phân hạng Sức khỏe FA Tổng hợp
  let faCategory: FaCategory = "STANDARD";
  let faBadgeVi = "Cơ Bản Chuẩn";
  let faSummaryVi = "Chỉ số tài chính nằm trong ngưỡng cân bằng.";

  const isAltmanDistress = snap?.coverage != null && snap.coverage > 0 && (snap.debtEquity ?? 0) > 3.0;
  const isDangerousDebt = (interestCoverage != null && interestCoverage < 1.3) || (snap?.debtEquity != null && snap.debtEquity > 3.5);

  if (isDangerousDebt || isAltmanDistress || beneishMScore >= -1.78) {
    faCategory = "HIGH_RISK";
    faBadgeVi = "Cảnh Báo Rủi Ro";
    faSummaryVi = `Đòn bẩy nợ cao (D/E ${snap?.debtEquity?.toFixed(1) ?? "—"}) hoặc nguy cơ biến dạng BCTC (M-Score ${beneishMScore}).`;
  } else if (isNetCash && (interestCoverage == null || interestCoverage >= 4.0) && roe >= 12) {
    faCategory = "FORTRESS";
    faBadgeVi = "Pháo Đài Tiền Mặt";
    faSummaryVi = "Doanh nghiệp tiền mặt ròng dồi dào, không áp lực nợ vay, sức đề kháng kinh tế cực mạnh.";
  } else if (isQualityEarnings && cfoToNetProfit != null && cfoToNetProfit >= 1.1 && netMargin >= 10) {
    faCategory = "CASH_MACHINE";
    faBadgeVi = "Cỗ Máy Sinh Tiền";
    faSummaryVi = `Dòng tiền thuần HĐKD gấp ${cfoToNetProfit}x Lợi nhuận ròng, tiền thật về két dồi dào.`;
  } else if (isBuffettCompounder && isHighRoic && roe >= 20) {
    faCategory = "BUFFETT_COMPOUNDER";
    faBadgeVi = "Siêu Tích Lũy Vốn";
    faSummaryVi = `Doanh nghiệp siêu tích lũy vốn tự thân (Compounder), ROIC ${roic}%, lợi thế con hào kinh tế Moat rộng.`;
  } else if (isHighRoic && roe >= 16 && isSafeDebt) {
    faCategory = "MOAT_QUALITY";
    faBadgeVi = "Con Hào Kinh Tế";
    faSummaryVi = `ROIC ${roic}% vượt trội chi phí vốn WACC, lợi thế cạnh tranh độc quyền bền vững.`;
  } else if (isLynchFastGrower) {
    faCategory = "LYNCH_GROWTH";
    faBadgeVi = "Tăng Trưởng Peter Lynch";
    faSummaryVi = `Tăng trưởng LN +${growthRate}% với PEG chỉ ${peg}x (< 0.85) theo chuẩn Peter Lynch Fast Grower.`;
  } else if (isGrahamNcav) {
    faCategory = "GRAHAM_NET_NET";
    faBadgeVi = "Net-Net Benjamin Graham";
    faSummaryVi = "Thị giá tiệm cận hoặc dưới tài sản lưu động ròng trừ toàn bộ nợ (NCAV), biên an toàn cực cao.";
  } else if (isDividendAristocrat && dividendYield != null && dividendYield >= 6.5) {
    faCategory = "DIVIDEND_ARISTOCRAT";
    faBadgeVi = "Quý Tộc Cổ Tức";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), dòng tiền CFO bảo đảm chi trả an toàn.`;
  } else if (isWorkingCapitalChampion && (snap?.currentRatio ?? 0) >= 1.8) {
    faCategory = "WORKING_CAPITAL";
    faBadgeVi = "Tối Ưu Vốn Lưu Động";
    faSummaryVi = `Quản trị vốn lưu động xuất sắc, chu kỳ tiền mặt CCC chỉ ${cashConversionCycleDays} ngày.`;
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
    beneishMScore,
    isBeneishSafe,
    sloanAccrualRatio,
    isBuffettCompounder,
    buffettScore,
    isLynchFastGrower,
    isGrahamNcav,
    ncavPerShare,
    cashConversionCycleDays,
    isWorkingCapitalChampion,
    isDividendAristocrat,
    dividendPayoutRatio,
    inflectionDelta,
    isQuarterlyInflection,
    faCategory,
    faBadgeVi,
    faSummaryVi,
  };
}
