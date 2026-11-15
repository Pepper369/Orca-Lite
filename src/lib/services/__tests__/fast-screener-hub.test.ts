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
  parseScreeningCriteria,
  isScreenerQuery,
  detectQueryIntent,
} from "../response-structure-architect";
import { getFastScreenerFeed, buildFastDatafeedContext } from "../fast-datafeed-hub";

describe("Quantitative Stock Screener & Datafeed Hub", () => {
  it("Bóc tách tiêu chí lọc cổ phiếu từ ngôn ngữ tự nhiên chuẩn xác", () => {
    const q1 = "Hãy tìm cho tôi những cổ phiếu có tiêu chí ROE > 20%, P/E < 12 và ngành Ngân hàng";
    const res1 = parseScreeningCriteria(q1);
    assert.equal(res1.roeMin, 20);
    assert.equal(res1.peMax, 12);
    assert.deepEqual(res1.sectors, ["Ngân hàng"]);
    assert.equal(isScreenerQuery(q1), true);

    const q2 = "Lọc các mã có cổ tức tiền mặt trên 7% và nợ thấp";
    const res2 = parseScreeningCriteria(q2);
    assert.equal(res2.divYieldMin, 7);
    assert.equal(res2.debtEquityMax, 0.8);
    assert.equal(isScreenerQuery(q2), true);

    const q3 = "Tìm các cổ phiếu chân sóng apex vùng vàng có F-Score >= 7";
    const res3 = parseScreeningCriteria(q3);
    assert.equal(res3.sweetZoneOnly, true);
    assert.equal(res3.fScoreMin, 7);
    assert.equal(isScreenerQuery(q3), true);

    const qCanslim = "Tìm các siêu cổ phiếu theo mô hình CANSLIM tăng trưởng cao";
    const resCanslim = parseScreeningCriteria(qCanslim);
    assert.equal(resCanslim.preset, "canslim");
    assert.equal(isScreenerQuery(qCanslim), true);

    const qVcp = "Lọc cổ phiếu mô hình VCP thu hẹp độ biến động nén chặt";
    const resVcp = parseScreeningCriteria(qVcp);
    assert.equal(resVcp.preset, "vcp");

    const qSmartMoney = "Tìm cổ phiếu có Smart Money cá mập gom mạnh";
    const resSmartMoney = parseScreeningCriteria(qSmartMoney);
    assert.equal(resSmartMoney.preset, "smart_money_inflow");
    assert.equal(resSmartMoney.smartMoneyOnly, true);

    const qRs = "Lọc cổ phiếu dẫn dắt RS Rating > 85";
    const resRs = parseScreeningCriteria(qRs);
    assert.equal(resRs.rsMin, 85);
    assert.equal(resRs.preset, "rs_leaders");

    const qLowBeta = "Lọc cổ phiếu Low-Beta Anomaly phòng thủ thị trường";
    const resLowBeta = parseScreeningCriteria(qLowBeta);
    assert.equal(resLowBeta.preset, "quant_low_beta");
  });

  it("Nhận diện Intent SCREENER_FILTER chuẩn mực cho câu hỏi sàng lọc", () => {
    const q = "Lọc cho tôi top 5 cổ phiếu ngân hàng định giá rẻ P/B dưới 1.2x và ROE trên 18%";
    const intentRes = detectQueryIntent(q);
    assert.equal(intentRes.intent, "SCREENER_FILTER");
    assert.ok(intentRes.confidence >= 0.9);
  });

  it("Tạo bảng dữ liệu Markdown và điểm sáng động lực trong FastScreenerFeed", async () => {
    const q = "Hãy tìm cho tôi những cổ phiếu có tiêu chí ROE > 15%, P/E < 15, cổ tức cao";
    const screenerRes = await getFastScreenerFeed(q);

    assert.ok(screenerRes != null);
    assert.ok(screenerRes.topStocks.length > 0);
    assert.ok(screenerRes.markdownTable.includes("| Hạng | Mã CP |"));
    assert.ok(screenerRes.filterCaveats.length >= 3);
  });

  it("Xử lý truy vấn Quant Trading với preset CANSLIM & Smart Money chính xác", async () => {
    const q = "Tìm cổ phiếu CANSLIM dẫn dắt thị trường";
    const screenerRes = await getFastScreenerFeed(q);

    assert.ok(screenerRes != null);
    assert.ok(screenerRes.topStocks.length > 0);
    assert.equal(screenerRes.criteria.preset, "canslim");
    assert.ok(screenerRes.criteriaSummary.some((s) => s.includes("CANSLIM")));
    assert.ok(screenerRes.filterCaveats.some((c) => c.includes("CANSLIM")));
    assert.ok(screenerRes.markdownTable.includes("| Hạng | Mã CP |"));
    assert.ok(screenerRes.topStocks.some((s) => s.tripleBarrierSummary != null || (s.multiFactorScore ?? 0) > 0));
  });

  it("Tích hợp bảng sàng lọc định lượng vào buildFastDatafeedContext mượt mà", async () => {
    const q = "Tìm cho tôi các cổ phiếu ngành thép có định giá P/E rẻ và điểm F-Score tốt";
    const feed = await buildFastDatafeedContext(q);

    assert.ok(feed.screenerResult != null);
    assert.ok(feed.assembledPromptContext.includes("KẾT QUẢ SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG"));
    assert.ok(feed.assembledPromptContext.includes("| Hạng | Mã CP |"));
  });
});
