import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyContext,
  executeContextualAiPipeline,
  extractTickers,
  detectSectorKeyword,
} from "../engines/orca-contextual-reasoning-engine";

test("classifyContext accurately classifies user question into domains and angles", () => {
  // 1. Stock Pair Comparison
  const comp1 = classifyContext("So sánh HPG và NKG xem mã nào mạnh hơn?");
  assert.equal(comp1.domain, "stock_compare");
  assert.deepEqual(comp1.symbols, ["HPG", "NKG"]);

  const comp2 = classifyContext("Nên mua SSI hay VND thời điểm này?");
  assert.equal(comp2.domain, "stock_compare");
  assert.deepEqual(comp2.symbols, ["SSI", "VND"]);

  // 2. Single Stock - Entry Timing
  const single1 = classifyContext("Có nên mua HPG giá này không, đã vào Vùng Vàng chưa?");
  assert.equal(single1.domain, "stock_single");
  assert.equal(single1.stockAngle, "entry_timing");
  assert.deepEqual(single1.symbols, ["HPG"]);

  // 3. Single Stock - Fundamental & BCTC
  const single2 = classifyContext("Báo cáo tài chính và dòng tiền OCF của FPT quý này thế nào?");
  assert.equal(single2.domain, "stock_single");
  assert.equal(single2.stockAngle, "fundamental_bctc");
  assert.deepEqual(single2.symbols, ["FPT"]);

  // 4. Single Stock - Valuation
  const single3 = classifyContext("Định giá P/E của MBB hiện tại đắt hay rẻ, mục tiêu giá bao nhiêu?");
  assert.equal(single3.domain, "stock_single");
  assert.equal(single3.stockAngle, "valuation");
  assert.deepEqual(single3.symbols, ["MBB"]);

  // 5. Single Stock - Dividend
  const single4 = classifyContext("Cổ tức tiền mặt VNM có cao hơn gửi tiết kiệm ngân hàng không?");
  assert.equal(single4.domain, "stock_single");
  assert.equal(single4.stockAngle, "dividend");
  assert.deepEqual(single4.symbols, ["VNM"]);

  // 6. Sector & Money Flow
  const sec1 = classifyContext("Dòng tiền hôm nay có vào ngành thép không?");
  assert.equal(sec1.domain, "sector_money_flow");
  assert.equal(sec1.sector, "Thép");

  const sec2 = classifyContext("Nhóm ngành ngân hàng hôm nay biến động ra sao?");
  assert.equal(sec2.domain, "sector_money_flow");
  assert.equal(sec2.sector, "Ngân hàng");

  // 7. Market Overview
  const mkt = classifyContext("Thị trường hôm nay VN-Index biến động thế nào?");
  assert.equal(mkt.domain, "market_overview");

  // 8. Personal Finance - Housing loan
  const pf1 = classifyContext("Lương 25 triệu có nên vay mua nhà 2 tỷ không?");
  assert.equal(pf1.domain, "personal_finance");
  assert.equal(pf1.personalTopic, "housing_loan");

  // 9. Personal Finance - FIRE retirement
  const pf2 = classifyContext("Cần bao nhiêu tiền để đạt tự do tài chính FIRE nghỉ hưu sớm?");
  assert.equal(pf2.domain, "personal_finance");
  assert.equal(pf2.personalTopic, "fire_retirement");
});

test("executeContextualAiPipeline generates tailored answers for personal finance scenarios", async () => {
  const facts = {
    netIncome: 30_000_000,
    totalExpenses: 16_000_000,
    fixedExpenses: 11_000_000,
    monthlySavings: 14_000_000,
    savingsRate: 46.7,
    emergencyFundMonths: 3.5,
    totalDebt: 0,
    location: "TP.HCM",
  };

  // Housing loan context
  const houseRes = await executeContextualAiPipeline("Tôi muốn vay mua nhà 2.5 tỷ, dòng tiền có gánh nổi không?", facts);
  assert.ok(houseRes != null);
  assert.equal(houseRes.domain, "personal_finance");
  assert.equal(houseRes.personalTopic, "housing_loan");
  assert.ok(houseRes.answer.includes("Vay mua nhà"));
  assert.ok(houseRes.answer.includes("35% thu nhập"));
  assert.ok(/down payment/i.test(houseRes.answer));

  // FIRE context
  const fireRes = await executeContextualAiPipeline("Kế hoạch tự do tài chính FIRE của tôi thế nào?", facts);
  assert.ok(fireRes != null);
  assert.equal(fireRes.domain, "personal_finance");
  assert.equal(fireRes.personalTopic, "fire_retirement");
  assert.ok(fireRes.answer.includes("Tự do tài chính"));
  assert.ok(fireRes.answer.includes("Quy tắc 4%"));

  // Family dependents context
  const famFacts = { ...facts, dependents: 2 };
  const famRes = await executeContextualAiPipeline("Chi phí nuôi 2 con nhỏ và kế hoạch tài chính cho gia đình?", famFacts);
  assert.ok(famRes != null);
  assert.equal(famRes.domain, "personal_finance");
  assert.equal(famRes.personalTopic, "family_dependents");
  assert.ok(famRes.answer.includes("người phụ thuộc"));
  assert.ok(famRes.answer.includes("Quỹ Học vấn"));
});
