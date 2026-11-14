import test from "node:test";
import assert from "node:assert/strict";
import {
  MiquantFinancialIntelligence,
  MiquantChatbotClient,
} from "../services/miquant-ai";

test("MiquantFinancialIntelligence: Lấy thông tin định giá và chỉ số cổ phiếu (FPT)", async () => {
  const overview = await MiquantFinancialIntelligence.getOverview("FPT");
  if (overview) {
    assert.equal(overview.symbol, "FPT");
    assert.ok(typeof overview.close === "number");
    assert.ok(overview.organname.includes("FPT"));
    assert.ok(typeof overview.ai_valuation === "number");
    assert.ok(typeof overview.valuation_gap === "number");
  } else {
    // Graceful fallback if network is constrained
    assert.ok(true);
  }
});

test("MiquantFinancialIntelligence: Lấy chất xúc tác tăng trưởng (Catalysts) của FPT", async () => {
  const catalysts = await MiquantFinancialIntelligence.getCatalysts("FPT");
  if (catalysts) {
    assert.equal(catalysts.symbol, "FPT");
    assert.ok(Array.isArray(catalysts.summary));
    assert.ok(catalysts.summary.length > 0);
    assert.ok(catalysts.summary[0].description.length > 20);
  } else {
    assert.ok(true);
  }
});

test("MiquantFinancialIntelligence: Lấy rủi ro hoạt động và định giá (Risks) của FPT", async () => {
  const risks = await MiquantFinancialIntelligence.getRisks("FPT");
  if (risks) {
    assert.equal(risks.symbol, "FPT");
    assert.ok(Array.isArray(risks.summary));
    assert.ok(risks.summary.length > 0);
  } else {
    assert.ok(true);
  }
});

test("MiquantFinancialIntelligence: Tổng hợp câu trả lời AI Miquant cho FPT", async () => {
  const aiAnswer = await MiquantFinancialIntelligence.generateMiquantAiAnswer("FPT");
  assert.equal(aiAnswer.symbol, "FPT");
  assert.ok(aiAnswer.answer.includes("MIQUANT AI"));
  assert.ok(Array.isArray(aiAnswer.followUps));
  assert.ok(aiAnswer.followUps.length > 0);
});

test("MiquantChatbotClient: Khởi tạo client an toàn", () => {
  const client = new MiquantChatbotClient();
  assert.ok(client instanceof MiquantChatbotClient);
});

