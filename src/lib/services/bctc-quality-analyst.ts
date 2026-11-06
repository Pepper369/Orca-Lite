import { extractEarningsFromHeadline, detectReportingPeriod } from "./earnings-intel";

/**
 * ============================================================================
 * TRỤ CỘT 3: AI BCTC QUALITY ANALYST (PHÂN TÍCH CHẤT LƯỢNG LỢI NHUẬN BCTC)
 * ============================================================================
 * Đánh giá tính bền vững của kết quả kinh doanh mùa BCTC:
 * 1. Bóc tách tỷ trọng Lợi nhuận cốt lõi (Core EBIT) vs Doanh thu tài chính/Thu nhập bất thường.
 * 2. Phát hiện hiện tượng "Thoát lỗ trên giấy": Hoạt động kinh doanh chính thua lỗ
 *    nhưng tổng kết quả lại dương nhờ bán tài sản hoặc chuyển nhượng công ty con.
 * 3. Đánh giá chất lượng dòng tiền và xếp hạng A / B / C / D.
 */

export type EarningsQualityGrade = "GRADE_A" | "GRADE_B" | "GRADE_C" | "GRADE_D";

export interface BctcQualityAssessment {
  ticker: string;
  period: string;
  revenueVndBillions: number | null;
  netProfitVndBillions: number | null;
  coreProfitRatioPct: number | null; // % Lợi nhuận cốt lõi / LNST
  financialIncomeRatioPct: number | null; // % Doanh thu tài chính / LNST
  otherIncomeRatioPct: number | null; // % Thu nhập khác / LNST
  isCoreDriven: boolean; // Tăng trưởng từ HĐKD cốt lõi
  isPaperProfitEscape: boolean; // Thoát lỗ nhờ bán tài sản / thu nhập ảo một lần
  qualityGrade: EarningsQualityGrade;
  qualityTitleVi: string;
  summaryAnalysisVi: string;
  investorWarningVi: string;
}

export interface RawFinancialInputs {
  revenue?: number; // Doanh thu thuần
  grossProfit?: number; // Lợi nhuận gộp
  operatingExpenses?: number; // Chi phí bán hàng + QLDN
  financialIncome?: number; // Doanh thu tài chính
  otherIncome?: number; // Lợi nhuận khác
  netProfit?: number; // LNST
  operatingCashFlow?: number; // CFO
}

/**
 * Phân tích chuyên sâu chất lượng lợi nhuận từ các chỉ tiêu tài chính
 */
export function analyzeBctcQuality(
  ticker: string,
  period: string,
  inputs: RawFinancialInputs,
): BctcQualityAssessment {
  const sym = ticker.toUpperCase().trim();
  const netProfit = inputs.netProfit ?? 0;
  const rev = inputs.revenue ?? null;
  const gross = inputs.grossProfit ?? (rev ? rev * 0.2 : 0);
  const sga = inputs.operatingExpenses ?? 0;
  const finInc = inputs.financialIncome ?? 0;
  const otherInc = inputs.otherIncome ?? 0;
  const cfo = inputs.operatingCashFlow;

  // Lợi nhuận từ HĐKD cốt lõi = Lợi nhuận gộp - Chi phí bán hàng & QLDN
  const coreOperatingProfit = gross - sga;

  let coreRatio = 0;
  let finRatio = 0;
  let otherRatio = 0;

  if (netProfit > 0) {
    coreRatio = Math.round((coreOperatingProfit / netProfit) * 100);
    finRatio = Math.round((finInc / netProfit) * 100);
    otherRatio = Math.round((otherInc / netProfit) * 100);
  }

  // Phát hiện thoát lỗ trên giấy: HĐKD cốt lõi âm nhưng LNST dương
  const isPaperProfitEscape = coreOperatingProfit <= 0 && netProfit > 0;
  const isCoreDriven = coreRatio >= 70 && !isPaperProfitEscape;

  let qualityGrade: EarningsQualityGrade = "GRADE_B";
  let qualityTitleVi = "Chất lượng lợi nhuận khá";
  let summaryAnalysisVi = "";
  let investorWarningVi = "";

  if (isPaperProfitEscape) {
    qualityGrade = "GRADE_D";
    qualityTitleVi = "Báo động đỏ: Thoát lỗ trên giấy";
    summaryAnalysisVi = `Mặc dù LNST ghi nhận dương (${netProfit.toLocaleString("vi-VN")} tỷ VND), mảng kinh doanh cốt lõi thực tế bị ÂM (${coreOperatingProfit.toLocaleString("vi-VN")} tỷ VND). Lợi nhuận chủ yếu đến từ doanh thu tài chính (${finInc.toLocaleString("vi-VN")} tỷ) hoặc thanh lý tài sản một lần.`;
    investorWarningVi = "RỦI RO CAO: Đây là lợi nhuận đột biến không có tính lặp lại. Giá cổ phiếu có nguy cơ điều chỉnh mạnh sau khi hiệu ứng tin tức qua đi.";
  } else if (coreRatio >= 80) {
    qualityGrade = "GRADE_A";
    qualityTitleVi = "Chất lượng cao: Tăng trưởng từ HĐKD cốt lõi";
    summaryAnalysisVi = `Lợi nhuận cốt lõi chiếm tới ${coreRatio}% tổng LNST. Doanh nghiệp có vị thế cạnh tranh vững chắc, tăng trưởng đến từ hoạt động bán hàng thực chất chứ không phụ thuộc vào các thủ thuật tài chính.`;
    investorWarningVi = "ĐÁNG ĐẦU TƯ: Kết quả kinh doanh bền vững, dòng tiền có độ tin cậy cao.";
  } else if (coreRatio >= 55) {
    qualityGrade = "GRADE_B";
    qualityTitleVi = "Chất lượng khá: Cốt lõi duy trì tốt";
    summaryAnalysisVi = `Lợi nhuận cốt lõi đóng góp ${coreRatio}% LNST. Doanh nghiệp duy trì được hoạt động kinh doanh ổn định, có thêm đóng góp hợp lý từ doanh thu tài chính.`;
    investorWarningVi = "Theo dõi tiến độ đơn hàng và biên lợi nhuận gộp trong các quý kế tiếp.";
  } else {
    qualityGrade = "GRADE_C";
    qualityTitleVi = "Chất lượng thấp: Phụ thuộc thu nhập một lần";
    summaryAnalysisVi = `Lợi nhuận cốt lõi chỉ đóng góp ${coreRatio}% LNST. Phần lớn lợi nhuận đến từ thoái vốn công ty con hoặc chuyển nhượng tài sản.`;
    investorWarningVi = "CẨN TRỌNG: Cần kiểm tra xem doanh nghiệp còn tài sản để bán trong các quý tiếp theo hay không.";
  }

  // Bổ sung kiểm tra dòng tiền CFO nếu có
  if (cfo !== undefined && cfo < 0 && netProfit > 0) {
    summaryAnalysisVi += ` Lưu ý: Dòng tiền thuần từ HĐKD (CFO) bị ÂM (${cfo.toLocaleString("vi-VN")} tỷ), cho thấy lợi nhuận chưa thực thu được tiền mặt mà đọng lại ở khoản phải thu hoặc tồn kho.`;
  }

  return {
    ticker: sym,
    period: period || "Gần nhất",
    revenueVndBillions: rev,
    netProfitVndBillions: netProfit,
    coreProfitRatioPct: coreRatio,
    financialIncomeRatioPct: finRatio,
    otherIncomeRatioPct: otherRatio,
    isCoreDriven,
    isPaperProfitEscape,
    qualityGrade,
    qualityTitleVi,
    summaryAnalysisVi,
    investorWarningVi,
  };
}

/**
 * Phân tích nhanh chất lượng BCTC từ dòng tin tức / tiêu đề bài báo tài chính
 */
export function quickAnalyzeHeadlineEarnings(
  title: string,
  content: string = "",
): BctcQualityAssessment | null {
  const extracted = extractEarningsFromHeadline(title);
  if (!extracted.ticker && !extracted.profitVndBillions) return null;

  const sym = extracted.ticker || "UNKNOWN";
  const period = extracted.period || detectReportingPeriod(title) || "Q/Gần nhất";
  const profit = extracted.profitVndBillions || 0;
  const rev = extracted.revenueVndBillions || 0;

  // Kiểm tra các từ khóa bất thường trong tiêu đề / nội dung
  const isFinancialHeavy = /(?:doanh\s+thu\s+tài\s+chính|thoái\s+vốn|chuyển\s+nhượng\s+(?:cổ\s+phần|dự\s+án)|bán\s+tài\s+sản)/i.test(
    `${title} ${content}`,
  );
  const isRecovery = /(?:thoát\s+lỗ|bất\s+ngờ\s+báo\s+lãi|hoàn\s+nhập)/i.test(title);

  const raw: RawFinancialInputs = {
    revenue: rev,
    netProfit: profit,
    grossProfit: isFinancialHeavy ? profit * 0.3 : profit * 0.9,
    operatingExpenses: profit * 0.1,
    financialIncome: isFinancialHeavy ? profit * 0.6 : profit * 0.1,
    otherIncome: isRecovery ? profit * 0.3 : 0,
  };

  return analyzeBctcQuality(sym, period, raw);
}
