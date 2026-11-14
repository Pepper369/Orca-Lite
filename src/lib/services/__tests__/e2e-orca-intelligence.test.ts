import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string, ...rest: unknown[]) {
  if (id === "server-only") return {};
  return originalRequire.call(this, id, ...rest);
};

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectQueryIntent,
  buildStructuredSystemPrompt,
  parseScreeningCriteria,
  isScreenerQuery,
} from "../response-structure-architect";
import { buildFastDatafeedContext, getFastScreenerFeed } from "../fast-datafeed-hub";

describe("Orca-FA Institutional Intelligence Suite (All 7 Themes)", () => {
  it("Theme 1: SCREENER_FILTER - Tự động bóc tách và phân loại tiêu chí lọc đa nhân tố", async () => {
    const q = "Tìm cho tôi những cổ phiếu có tiêu chí ROE > 20%, P/E < 12 và nợ thấp";
    assert.equal(isScreenerQuery(q), true);

    const criteria = parseScreeningCriteria(q);
    assert.equal(criteria.roeMin, 20);
    assert.equal(criteria.peMax, 12);
    assert.equal(criteria.debtEquityMax, 0.8);

    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "SCREENER_FILTER");

    const feed = await getFastScreenerFeed(q);
    assert.ok(feed != null);
    assert.ok(feed.topStocks.length > 0);
  });

  it("Theme 2: MULTI_SCENARIO - Nhận diện kịch bản Bull/Base/Bear và ràng buộc tổng xác suất", async () => {
    const q = "Phân tích đa kịch bản cho cổ phiếu HPG theo các khung thời gian và xác suất";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "MULTI_SCENARIO");

    const prompt = buildStructuredSystemPrompt(intent, "HPG: 28.000đ");
    assert.ok(prompt.includes("p_{bull} + p_{base} + p_{bear} = 1.0"));
  });

  it("Theme 3: STOCK_TECHNICAL - Nhận diện phân tích kỹ thuật, Wyckoff, Overhead room", async () => {
    const q = "Phân tích kỹ thuật chart đồ thị SSI xem chỉ báo RSI, MACD và điểm cản trên đầu";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "STOCK_TECHNICAL");

    const prompt = buildStructuredSystemPrompt(intent, "SSI: 32.500đ");
    assert.ok(prompt.includes("Overhead Room"));
    assert.ok(prompt.includes("R:R"));
  });

  it("Theme 4: COMMODITY_MACRO - Truyền dẫn giá dầu thô và liên hệ cổ phiếu dầu khí", async () => {
    const q = "Giá dầu thô thế giới biến động thì ảnh hưởng như thế nào tới cổ phiếu PVD và PVS?";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "COMMODITY_MACRO");

    const prompt = buildStructuredSystemPrompt(intent, "Dầu Brent: 78.5 USD");
    assert.ok(prompt.includes("TRUYỀN DẪN"));
  });

  it("Theme 5: FORENSIC_OR_RISK - Bắt bẫy rủi ro BCTC, cờ đỏ, dòng tiền CFO âm", async () => {
    const q = "Cổ phiếu này có rủi ro gì về dòng tiền CFO âm hay bẫy nợ xấu và kẹt sàn T+2.5 không?";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "FORENSIC_OR_RISK");

    const prompt = buildStructuredSystemPrompt(intent, "Rủi ro cảnh báo");
    assert.ok(prompt.includes("FORENSIC AUDIT"));
  });

  it("Theme 6: PERSONAL_FINANCE - Quản lý tài chính cá nhân, thuế TNCN lũy tiến, trả nợ", async () => {
    const q = "Lương gross 50 triệu thì đóng thuế TNCN bao nhiêu và nên trả góp mua nhà thế nào?";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "PERSONAL_FINANCE");

    const prompt = buildStructuredSystemPrompt(intent, "Tài chính cá nhân");
    assert.ok(prompt.includes("THUẾ TNCN"));
  });

  it("Theme 7: STOCK_DEEP_DIVE - Bóc tách cơ bản chuyên sâu & ma trận đa nhân tố cho 1 mã đơn lẻ", async () => {
    const q = "Đánh giá chi tiết cơ bản của VNM";
    const intent = detectQueryIntent(q);
    assert.equal(intent.intent, "STOCK_DEEP_DIVE");

    const prompt = buildStructuredSystemPrompt(intent, "VNM: 68.500đ");
    assert.ok(prompt.includes("ORCA MULTI-FACTOR"));
  });
});
