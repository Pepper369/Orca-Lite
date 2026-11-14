import test from "node:test";
import assert from "node:assert/strict";
import {
  detectQueryIntent,
  buildStructuredSystemPrompt,
  type IntentDetectionResult,
} from "../services/response-structure-architect";

test("Response Structure Architect - Intent Detection Suite", async (t) => {
  await t.test("detects MULTI_SCENARIO when query asks for Bull/Base/Bear or probabilities", () => {
    const res = detectQueryIntent("Phân tích kịch bản Bull Base Bear cho cổ phiếu HPG");
    assert.equal(res.intent, "MULTI_SCENARIO");
    assert.ok(res.confidence >= 0.9);
    assert.ok(res.detectedEntities.tickers.includes("HPG"));
  });

  await t.test("detects STOCK_COMPARE when comparing two Vietnamese stocks", () => {
    const res = detectQueryIntent("So sánh HPG và NKG nên mua mã nào?");
    assert.equal(res.intent, "STOCK_COMPARE");
    assert.ok(res.detectedEntities.tickers.includes("HPG"));
    assert.ok(res.detectedEntities.tickers.includes("NKG"));
  });

  await t.test("detects STOCK_DEEP_DIVE for single stock analysis", () => {
    const res = detectQueryIntent("Phân tích chi tiết cổ phiếu FPT");
    assert.equal(res.intent, "STOCK_DEEP_DIVE");
    assert.ok(res.detectedEntities.tickers.includes("FPT"));
  });

  await t.test("detects COMMODITY_MACRO for commodity queries", () => {
    const res = detectQueryIntent("Giá dầu Brent và quặng sắt tăng mạnh tác động ra sao?");
    assert.equal(res.intent, "COMMODITY_MACRO");
  });

  await t.test("detects FORENSIC_OR_RISK for financial traps and red flags", () => {
    const res = detectQueryIntent("Cảnh báo rủi ro kẹt sàn T+2.5 và bẫy CFO âm liên tục");
    assert.equal(res.intent, "FORENSIC_OR_RISK");
    assert.equal(res.detectedEntities.hasRiskKeyword, true);
  });

  await t.test("detects PERSONAL_FINANCE for salary, tax and debt", () => {
    const res = detectQueryIntent("Lương gross 50 triệu có 1 người phụ thuộc tính thuế TNCN thế nào?");
    assert.equal(res.intent, "PERSONAL_FINANCE");
  });

  await t.test("detects MARKET_OVERVIEW for index questions", () => {
    const res = detectQueryIntent("Thị trường chứng khoán VN-Index và VN30 hôm nay thế nào?");
    assert.equal(res.intent, "MARKET_OVERVIEW");
    assert.equal(res.detectedEntities.hasMacroKeyword, true);
  });

  await t.test("detects STOCK_TECHNICAL for chart, RSI, MACD and resistance queries", () => {
    const res = detectQueryIntent("Phân tích kỹ thuật chart SSI, chỉ báo RSI và MA20");
    assert.equal(res.intent, "STOCK_TECHNICAL");
    assert.ok(res.detectedEntities.tickers.includes("SSI"));
  });

  await t.test("detects EARNINGS_REVIEW for quarterly earnings and BCTC reports", () => {
    const res = detectQueryIntent("Đánh giá kết quả kinh doanh quý 3 và BCTC của HPG");
    assert.equal(res.intent, "EARNINGS_REVIEW");
    assert.ok(res.detectedEntities.tickers.includes("HPG"));
  });

  await t.test("detects SCREENER_FILTER for financial screener metrics", () => {
    const res = detectQueryIntent("Lọc top cổ phiếu theo tiêu chí ROE trên 20% và PE dưới 10");
    assert.equal(res.intent, "SCREENER_FILTER");
  });
});

test("Response Structure Architect - Structured System Prompt Generation", async (t) => {
  await t.test("generates MULTI_SCENARIO template with required math & probability sections", () => {
    const intentResult: IntentDetectionResult = {
      intent: "MULTI_SCENARIO",
      confidence: 0.95,
      detectedEntities: { tickers: ["HPG"], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "HPG: 29.500 VND (+2.1%)");
    assert.ok(prompt.includes("MẪU ĐA KỊCH BẢN & ĐA KHUNG THỜI GIAN"));
    assert.ok(prompt.includes("BẢNG MA TRẬN 3 KỊCH BẢN (BULL / BASE / BEAR)"));
    assert.ok(prompt.includes("p_{bull} + p_{base} + p_{bear} = 1.0"));
    assert.ok(prompt.includes("HPG: 29.500 VND (+2.1%)"));
  });

  await t.test("generates STOCK_COMPARE template with head-to-head matrix", () => {
    const intentResult: IntentDetectionResult = {
      intent: "STOCK_COMPARE",
      confidence: 0.94,
      detectedEntities: { tickers: ["HPG", "NKG"], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "");
    assert.ok(prompt.includes("MẪU SO SÁNH ĐỐI ĐẦU CỔ PHIẾU - HEAD TO HEAD"));
    assert.ok(prompt.includes("BẢNG MA TRẬN ĐỐI ĐẦU ĐỊNH LƯỢNG (HEAD-TO-HEAD MATRIX)"));
    assert.ok(prompt.includes("VỊ THẾ CẠNH TRANH & CON HÀO KINH TẾ"));
  });

  await t.test("generates STOCK_DEEP_DIVE template with forensic BCTC & MOS", () => {
    const intentResult: IntentDetectionResult = {
      intent: "STOCK_DEEP_DIVE",
      confidence: 0.92,
      detectedEntities: { tickers: ["FPT"], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "FPT: 135.000 VND | P/E: 24.5");
    assert.ok(prompt.includes("MẪU PHÂN TÍCH CỔ PHIẾU CHUYÊN SÂU"));
    assert.ok(prompt.includes("SỨC KHỎE TÀI CHÍNH & CHẤT LƯỢNG LỢI NHUẬN (BCTC)"));
    assert.ok(prompt.includes("ĐỊNH GIÁ & BIÊN ĐỘ AN TOÀN (MARGIN OF SAFETY)"));
  });

  await t.test("generates COMMODITY_MACRO template with transmission mechanism & sector beneficiaries", () => {
    const intentResult: IntentDetectionResult = {
      intent: "COMMODITY_MACRO",
      confidence: 0.88,
      detectedEntities: { tickers: [], commodities: ["Brent Crude Oil"], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "Brent Oil: $82.5/barrel (+1.8%)");
    assert.ok(prompt.includes("MẪU TÁC ĐỘNG HÀNG HÓA & NGUYÊN VẬT LIỆU"));
    assert.ok(prompt.includes("CƠ CHẾ TRUYỀN DẪN VÀO NỀN KINH TẾ VIỆT NAM"));
    assert.ok(prompt.includes("Nhóm hưởng lợi"));
    assert.ok(prompt.includes("Nhóm chịu áp lực chi phí"));
  });

  await t.test("generates FORENSIC_OR_RISK template with red flag detection & discipline", () => {
    const intentResult: IntentDetectionResult = {
      intent: "FORENSIC_OR_RISK",
      confidence: 0.9,
      detectedEntities: { tickers: [], commodities: [], hasMacroKeyword: false, hasRiskKeyword: true },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "");
    assert.ok(prompt.includes("MẪU KIỂM TOÁN THẨM ĐỊNH & PHÒNG VỆ RỦI RO"));
    assert.ok(prompt.includes("NHẬN DIỆN BẢN CHẤT CỜ ĐỎ"));
    assert.ok(prompt.includes("BÓC TÁCH BẰNG CHỨNG SỐ LIỆU ĐỊNH LƯỢNG"));
  });

  await t.test("generates PERSONAL_FINANCE template with cashflow diagnosis & tax brackets", () => {
    const intentResult: IntentDetectionResult = {
      intent: "PERSONAL_FINANCE",
      confidence: 0.9,
      detectedEntities: { tickers: [], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "");
    assert.ok(prompt.includes("MẪU TÀI CHÍNH CÁ NHÂN & DÒNG TIỀN"));
    assert.ok(prompt.includes("CHẨN ĐOÁN DÒNG TIỀN & BẢNG TÍNH ĐỊNH LƯỢNG"));
    assert.ok(prompt.includes("Thuế TNCN"));
  });

  await t.test("generates MARKET_OVERVIEW template with market regime & allocation", () => {
    const intentResult: IntentDetectionResult = {
      intent: "MARKET_OVERVIEW",
      confidence: 0.85,
      detectedEntities: { tickers: [], commodities: [], hasMacroKeyword: true, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "VN-Index: 1255.4 (+5.2 điểm)");
    assert.ok(prompt.includes("MẪU TỔNG QUAN THỊ TRƯỜNG & CHẾ ĐỘ REGIME"));
    assert.ok(prompt.includes("CHẾ ĐỘ THỊ TRƯỜNG (MARKET REGIME)"));
    assert.ok(prompt.includes("CHIẾN LƯỢC QUẢN TRỊ DANH MỤC & PHÒNG VỆ T+2.5"));
  });

  await t.test("generates STOCK_TECHNICAL template with Wyckoff, Overhead room and Triple-Barrier", () => {
    const intentResult: IntentDetectionResult = {
      intent: "STOCK_TECHNICAL",
      confidence: 0.93,
      detectedEntities: { tickers: ["SSI"], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "SSI: 32.500 | RSI: 62.4");
    assert.ok(prompt.includes("MẪU PHÂN TÍCH KỸ THUẬT & DÒNG TIỀN NÂNG CAO"));
    assert.ok(prompt.includes("ĐO LƯỜNG DƯ ĐỊA CẢN TRÊN ĐẦU & NÉ BẪY KẸP HÀNG T+2.5"));
    assert.ok(prompt.includes("Overhead Room"));
    assert.ok(prompt.includes("R:R \\ge 2.2\\text{x}"));
  });

  await t.test("generates EARNINGS_REVIEW template with Core EBIT & Forensic CFO", () => {
    const intentResult: IntentDetectionResult = {
      intent: "EARNINGS_REVIEW",
      confidence: 0.93,
      detectedEntities: { tickers: ["HPG"], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "HPG DT: 34.000 tỷ | LNST: 3.200 tỷ");
    assert.ok(prompt.includes("MẪU BÓC TÁCH KẾT QUẢ KINH DOANH & BCTC QUÝ / NIÊN ĐỘ"));
    assert.ok(prompt.includes("CORE EBIT VS THU NHẬP BẤT THƯỜNG"));
    assert.ok(prompt.includes("FORENSIC CFO & ACCRUALS"));
  });

  await t.test("generates SCREENER_FILTER template with multi-factor screening and filter caveats", () => {
    const intentResult: IntentDetectionResult = {
      intent: "SCREENER_FILTER",
      confidence: 0.92,
      detectedEntities: { tickers: [], commodities: [], hasMacroKeyword: false, hasRiskKeyword: false },
    };
    const prompt = buildStructuredSystemPrompt(intentResult, "");
    assert.ok(prompt.includes("MẪU LỌC & SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG"));
    assert.ok(prompt.includes("BẢNG XẾP HẠNG TOP CỔ PHIẾU ĐẠT TIÊU CHÍ"));
    assert.ok(prompt.includes("Bẫy P/E thấp ở đỉnh chu kỳ"));
  });
});
