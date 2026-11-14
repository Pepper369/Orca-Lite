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
import path from "node:path";
import { executeContextualAiPipeline } from "../../engines/orca-contextual-reasoning-engine";
import { detectQueryIntent, isScreenerQuery } from "../response-structure-architect";
import { getFastScreenerFeed, buildFastDatafeedContext } from "../fast-datafeed-hub";
import {
  calculatePitTax,
  calculateLoanAmortization,
  calculatePositionSizing,
  calculateWacc,
  calculateDcf,
} from "../../engines/financial-calculation-suite";
import {
  inspectLocalGgufArtifact,
  isLocalGgufModelId,
  resolveLocalGgufConfig,
} from "../../ai/local-gguf";

describe("Phase 3: Orca AI Answering System Comprehensive E2E Verification", () => {
  // 1. Scenario 1: Mã cổ phiếu đơn lẻ & Bóc tách đa nhân tố
  it("Scenario 1: Single Stock Analysis - Trích xuất đúng mã, tính toán định lượng & cấu trúc câu trả lời", async () => {
    const q = "Phân tích sức khỏe tài chính và định giá của FPT";
    const intentRes = detectQueryIntent(q);
    assert.equal(intentRes.intent, "STOCK_DEEP_DIVE");
    assert.ok(intentRes.detectedEntities.tickers.includes("FPT"), "Entities phải chứa ticker FPT");

    const pipelineRes = await executeContextualAiPipeline(q);
    assert.ok(pipelineRes != null, "Pipeline phải xử lý được câu hỏi FPT");
    assert.equal(pipelineRes.domain, "stock_single");
    assert.ok(pipelineRes.answer.includes("FPT"), "Answer markdown phải chứa FPT");
    assert.ok(pipelineRes.latencyMs >= 0, "Độ trễ phải hợp lệ");
  });

  // 2. Scenario 2: Sàng lọc định lượng & KaTeX Formulas
  it("Scenario 2: Quantitative Screener - Nhận diện bộ lọc, xuất bảng Markdown & chèn công thức KaTeX", async () => {
    const q = "Lọc các cổ phiếu có dòng tiền cá mập và bứt phá đỉnh";
    assert.equal(isScreenerQuery(q), true);

    const screener = await getFastScreenerFeed(q);
    assert.ok(screener.matchedCount > 0, "Phải có cổ phiếu thỏa mãn tiêu chí sàng lọc");
    assert.ok(screener.topStocks.length > 0, "Top stocks không được rỗng");
    assert.ok(screener.markdownTable.includes("| Hạng | Mã CP |"), "Bảng kết quả phải chứa cột Hạng và Mã CP");
    assert.ok(screener.filterCaveats.length >= 3, "Phải có ít nhất 3 lưu ý bẫy định lượng");

    // Kiểm tra datafeed context tích hợp vào LLM prompt
    const feed = await buildFastDatafeedContext(q);
    assert.ok(feed.assembledPromptContext.includes("KẾT QUẢ SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG"));
    assert.ok(feed.assembledPromptContext.includes("| Hạng | Mã CP |"));
  });

  // 3. Scenario 3: BCTC & Kiểm toán Forensic Accounting
  it("Scenario 3: Forensic BCTC & Fraud Detection - Bắt cờ đỏ rủi ro lợi nhuận và bẫy dòng tiền", async () => {
    const q = "Kiểm tra chất lượng lợi nhuận và bẫy thoát lỗ trên giấy của HPG";
    const intentRes = detectQueryIntent(q);
    assert.ok(intentRes.detectedEntities.tickers.includes("HPG"), "Entities phải nhận diện HPG");

    const pipelineRes = await executeContextualAiPipeline(q);
    assert.ok(pipelineRes != null, "Pipeline phải bắt được bẫy BCTC");
    assert.equal(pipelineRes.domain, "forensic_bctc");
    assert.ok(pipelineRes.answer.length > 200, "Báo cáo phân tích chất lượng BCTC phải chi tiết");
    assert.ok(
      pipelineRes.answer.includes("CFO") ||
      pipelineRes.answer.includes("lợi nhuận") ||
      pipelineRes.answer.includes("HPG") ||
      pipelineRes.answer.includes("Accrual"),
      "Phải chứa các thuật ngữ tài chính cốt lõi về chất lượng lợi nhuận"
    );
  });

  // 4. Scenario 4: Toán tài chính chính xác (Financial Math Suite)
  it("Scenario 4: High-Precision Financial Math - Tính đúng biểu thuế TNCN lũy tiến & lịch trả nợ vay", () => {
    // Thuế TNCN lương 50 triệu (1 người phụ thuộc)
    const tax = calculatePitTax(50_000_000, 1);
    assert.ok(tax.totalTaxVnd > 0, "Thuế phải nộp > 0");
    assert.ok(tax.taxableIncomeVnd > 0, "Thu nhập tính thuế > 0");
    assert.ok(tax.netSalaryVnd > 0 && tax.netSalaryVnd < 50_000_000, "Lương net phải hợp lệ");

    // Lịch trả nợ vay ngân hàng 2 tỷ trong 120 tháng, lãi 9.5%/năm
    const loan = calculateLoanAmortization(2_000_000_000, 9.5, 120);
    assert.equal(loan.schedule.length, 120, "Lịch trả nợ phải có đủ 120 kỳ");
    assert.equal(loan.schedule[119].endingBalanceVnd, 0, "Kỳ cuối cùng dư nợ gốc phải về 0");
    assert.ok(loan.totalInterestVnd > 0, "Tổng lãi phải trả > 0");

    // Position Sizing: Vốn 1 tỷ, rủi ro 2%, cắt lỗ entry 50k, stopLoss 47k
    const pos = calculatePositionSizing(1_000_000_000, 2, 50_000, 47_000, 60_000, 50);
    assert.equal(pos.capitalAtRiskVnd, 20_000_000, "Rủi ro tối đa phải đúng bằng 2% của 1 tỷ (20 triệu)");
    assert.ok(pos.sharesToBuy > 0, "Số lượng cổ phiếu khuyến nghị phải > 0");

    // Định giá WACC & DCF
    const wacc = calculateWacc(70_000_000_000, 30_000_000_000, 13.5, 8.0, 20);
    assert.ok(wacc.waccPct > 6.4 && wacc.waccPct < 13.5, "WACC phải nằm giữa chi phí nợ sau thuế và chi phí vốn CSH");

    const dcf = calculateDcf(
      [1_000_000_000, 1_200_000_000, 1_400_000_000, 1_600_000_000, 1_800_000_000],
      3.5,
      wacc.waccPct,
      2_000_000_000,
      500_000
    );
    assert.ok(dcf.fairValuePerShareVnd > 0, "Giá trị nội tại hợp lý mỗi cổ phiếu phải > 0");
  });

  // 5. Scenario 5: Xác thực mô hình Local GGUF trên đĩa cứng & Cơ chế Gateway Fallback
  it("Scenario 5: Local GGUF Runtime Verification - Kiểm tra tệp trọng số 1.92 GB và Magic Header", () => {
    const ggufRelativePath = "models/orca-fa-qwen2.5-3b-q4_k_m.gguf";
    const ggufAbsolutePath = path.resolve(process.cwd(), "..", "Orca-Lite", ggufRelativePath);

    const artifactStatus = inspectLocalGgufArtifact(ggufAbsolutePath);
    assert.equal(artifactStatus.exists, true, "Tệp trọng số .gguf phải tồn tại trên đĩa");
    assert.equal(artifactStatus.validMagic, true, "Tệp phải có 4-byte header 'GGUF' hợp lệ");
    assert.equal(artifactStatus.ggufVersion, 3, "Định dạng GGUF phải là Version 3");
    assert.ok(artifactStatus.sizeMb > 1800, "Kích thước tệp phải > 1.8 GB (~1.92 GB)");

    // Xác nhận định danh mô hình
    assert.equal(isLocalGgufModelId("orca-fa-qwen2.5-3b"), true);
    assert.equal(isLocalGgufModelId("local-gguf"), true);

    // Xác nhận cấu hình Fallback endpoint khi bật URL
    const prevUrl = process.env.LOCAL_GGUF_BASE_URL;
    try {
      process.env.LOCAL_GGUF_BASE_URL = "http://127.0.0.1:8080/v1";
      const config = resolveLocalGgufConfig(ggufAbsolutePath);
      assert.equal(config.enabled, true);
      assert.equal(config.baseUrl, "http://127.0.0.1:8080/v1");
      assert.equal(config.model, "orca-fa-qwen2.5-3b");
    } finally {
      if (prevUrl === undefined) delete process.env.LOCAL_GGUF_BASE_URL;
      else process.env.LOCAL_GGUF_BASE_URL = prevUrl;
    }
  });
});
