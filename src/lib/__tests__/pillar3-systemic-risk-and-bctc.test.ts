import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSystemicLegalRisk,
  getContagionExposureForTicker,
  VN_SYSTEMIC_EXPOSURE_MAP,
} from "../services/systemic-risk-radar";
import {
  analyzeBctcQuality,
  quickAnalyzeHeadlineEarnings,
} from "../services/bctc-quality-analyst";

test("Trụ cột 3: Radar Rủi ro Pháp lý - Phát hiện biến cố pháp lý và bóc tách lan tỏa hệ thống", () => {
  const title = "Bộ Công an khởi tố và bắt tạm giam lãnh đạo một tập đoàn bất động sản lớn";
  const content = "Doanh nghiệp này có nhiều dự án hợp tác tài trợ tín dụng cùng các ngân hàng.";
  
  const signal = evaluateSystemicLegalRisk(title, content, "NVL");
  assert.ok(signal);
  assert.equal(signal.severity, "CRITICAL");
  assert.equal(signal.category, "LEGAL_ARREST");
  assert.equal(signal.primaryTicker, "NVL");
  assert.equal(signal.systemicContagionRisk, "SEVERE");
  assert.ok(signal.affectedTickers.includes("VPB"));
  assert.ok(signal.affectedTickers.includes("MBB"));
  assert.ok(signal.aiActionPlanVi.includes("Tuyệt đối tránh bắt đáy"));
});

test("Trụ cột 3: Radar Rủi ro Pháp lý - Truy vết các ngân hàng tài trợ chéo của VIC/VHM", () => {
  const links = getContagionExposureForTicker("VIC");
  assert.ok(links.length >= 2);
  const targets = links.map((l) => l.targetTicker);
  assert.ok(targets.includes("TCB"));
  assert.ok(targets.includes("VPB"));
});

test("Trụ cột 3: BCTC Quality Analyst - Nhận diện tăng trưởng chất lượng cao (GRADE_A)", () => {
  const result = analyzeBctcQuality("FPT", "Q4", {
    revenue: 15_000,
    grossProfit: 6_000,
    operatingExpenses: 2_000, // Core = 4.000
    financialIncome: 300,
    otherIncome: 50,
    netProfit: 3_800,
    operatingCashFlow: 4_200,
  });

  assert.equal(result.qualityGrade, "GRADE_A");
  assert.equal(result.isCoreDriven, true);
  assert.equal(result.isPaperProfitEscape, false);
  assert.ok(result.coreProfitRatioPct && result.coreProfitRatioPct >= 80);
});

test("Trụ cột 3: BCTC Quality Analyst - Phát hiện bẫy THOÁT LỖ TRÊN GIẤY (GRADE_D)", () => {
  // Hoạt động chính bị lỗ: Gross 500 tỷ nhưng Chi phí 800 tỷ => Core = -300 tỷ
  // Nhưng bán công ty con thu 1.000 tỷ => Net profit = +600 tỷ!
  const result = analyzeBctcQuality("HAG", "Q4", {
    revenue: 2_000,
    grossProfit: 500,
    operatingExpenses: 800, // Core = -300 tỷ (Âm)
    financialIncome: 1_000, // Thoái vốn
    otherIncome: 0,
    netProfit: 600, // Thoát lỗ
    operatingCashFlow: -400,
  });

  assert.equal(result.qualityGrade, "GRADE_D");
  assert.equal(result.isPaperProfitEscape, true);
  assert.equal(result.isCoreDriven, false);
  assert.ok(result.qualityTitleVi.includes("Thoát lỗ trên giấy"));
  assert.ok(result.summaryAnalysisVi.includes("cốt lõi thực tế bị ÂM"));
});

test("Trụ cột 3: BCTC Quality Analyst - Phân tích nhanh từ tiêu đề bài báo tài chính", () => {
  const headline = "HPG ước lãi ròng kỷ lục 4.500 tỷ đồng trong quý 4";
  const analysis = quickAnalyzeHeadlineEarnings(headline);
  assert.ok(analysis);
  assert.equal(analysis.ticker, "HPG");
  assert.equal(analysis.netProfitVndBillions, 4500);
});
