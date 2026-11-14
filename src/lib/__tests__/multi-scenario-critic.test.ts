import test from "node:test";
import assert from "node:assert/strict";
import { 
  auditMultiScenarioModel, 
  StrictScenario, 
  ScenarioInputPayload 
} from "../engines/multi-scenario-critic";

test("CRO Stress Test - Bẫy 1: Tổng xác suất khác 100% (Arbitrary Probabilities Trap)", () => {
  const invalidPayload: ScenarioInputPayload = {
    symbol: "SSI",
    currentPrice: 30_000,
    averageVolume20d: 15_000_000,
    scenarios: [
      {
        label: "BULL",
        name: "Sóng nâng hạng thị trường",
        probability: 0.60,
        targetPrice: 36_000,
        expectedReturnPct: 20.0,
        timeHorizonWeeks: 8,
        invalidation: {
          priceLevel: 28_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Gãy nền giá hỗ trợ MA50"
        },
        actionProtocol: {
          allocationPct: 50,
          entryCondition: "Vượt 31.000 kèm vol > 20M",
          stopLossPrice: 28_000,
          takeProfitLevels: [34_000, 36_000]
        }
      },
      {
        label: "BASE",
        name: "Tích lũy đi ngang",
        probability: 0.40,
        targetPrice: 31_500,
        expectedReturnPct: 5.0,
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 27_500,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Thủng biên dưới kênh sideway"
        },
        actionProtocol: {
          allocationPct: 30,
          entryCondition: "Mua test tại biên dưới 29.500",
          stopLossPrice: 28_000,
          takeProfitLevels: [31_500]
        }
      },
      {
        label: "BEAR",
        name: "Thị trường điều chỉnh chung",
        probability: 0.30, // 0.60 + 0.40 + 0.30 = 1.30 (130%) -> VI PHẠM
        targetPrice: 24_000,
        expectedReturnPct: -20.0,
        timeHorizonWeeks: 4,
        invalidation: {
          priceLevel: 32_000,
          condition: "BREAK_ABOVE",
          timeframe: "DAILY_CLOSE",
          rationale: "Vượt đỉnh cũ kháng cự"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Không mở mua",
          stopLossPrice: 28_000,
          takeProfitLevels: []
        },
        bearContingency: {
          t2FloorLockRisk: "HIGH",
          estimatedSlippagePct: 10.5,
          liquidityDrainExitPlan: "Bán khớp ATO ngay khi phiên sáng T+2 mở cửa"
        }
      }
    ]
  };

  const report = auditMultiScenarioModel(invalidPayload);

  assert.equal(report.passed, false, "Kịch bản tổng xác suất 130% không được phép PASS");
  assert.equal(report.verdict, "REJECTED_UNSAFE");
  assert.ok(report.issues.some(i => i.code === "ERR_PROBABILITY_SUM"));
  assert.equal(report.metrics.totalProbability, 1.3);
});

test("CRO Stress Test - Bẫy 2 & 4: Bear Case hời hợt và bỏ qua rủi ro kẹt sàn T+2.5", () => {
  const superficialBearPayload: ScenarioInputPayload = {
    symbol: "DIG",
    currentPrice: 25_000,
    averageVolume20d: 8_000_000,
    marketContext: { exchange: "HOSE" },
    scenarios: [
      {
        label: "BULL",
        name: "Bứt phá vượt đỉnh",
        probability: 0.50,
        targetPrice: 30_000,
        expectedReturnPct: 20.0,
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 23_500,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Thủng MA20"
        },
        actionProtocol: {
          allocationPct: 50,
          entryCondition: "Break 26.000",
          stopLossPrice: 23_500,
          takeProfitLevels: [29_000, 30_000]
        }
      },
      {
        label: "BASE",
        name: "Dao động thăm dò",
        probability: 0.30,
        targetPrice: 25_500,
        expectedReturnPct: 2.0,
        timeHorizonWeeks: 4,
        invalidation: {
          priceLevel: 23_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Mất nền giá ngắn hạn"
        },
        actionProtocol: {
          allocationPct: 20,
          entryCondition: "Mua gom quanh 24.500",
          stopLossPrice: 23_000,
          takeProfitLevels: [26_000]
        }
      },
      {
        label: "BEAR",
        name: "Điều chỉnh nhẹ",
        probability: 0.20,
        targetPrice: 24_200,
        expectedReturnPct: -3.2, // Quá hời hợt so với biên độ sàn HOSE 7% và rủi ro T+2.5
        timeHorizonWeeks: 2,
        invalidation: {
          priceLevel: 27_000,
          condition: "BREAK_ABOVE",
          timeframe: "DAILY_CLOSE",
          rationale: "Vượt kháng cự ngắn hạn"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Không mua",
          stopLossPrice: 23_000,
          takeProfitLevels: []
        }
        // Thiếu hoàn toàn bearContingency (không có phương án kẹt sàn T+2.5)
      }
    ]
  };

  const report = auditMultiScenarioModel(superficialBearPayload);

  assert.equal(report.passed, false);
  assert.equal(report.verdict, "REJECTED_UNSAFE");
  assert.ok(report.issues.some(i => i.code === "ERR_BEAR_SUPERFICIAL_DRAWDOWN"), "Phải bắt lỗi Bear case hời hợt");
  assert.ok(report.issues.some(i => i.code === "ERR_T2_LIQUIDITY_UNMITIGATED"), "Phải bắt lỗi thiếu phương án kẹt sàn T+2.5");
});

test("CRO Stress Test - Bẫy 3: Thiếu mốc giá vô hiệu hóa số học cụ thể (Deterministic Invalidation)", () => {
  const vagueInvalidationPayload: ScenarioInputPayload = {
    symbol: "HPG",
    currentPrice: 28_000,
    averageVolume20d: 25_000_000,
    scenarios: [
      {
        label: "BULL",
        name: "Lò cao Dung Quất 2 chạy thử",
        probability: 0.50,
        targetPrice: 34_000,
        expectedReturnPct: 21.4,
        timeHorizonWeeks: 12,
        invalidation: {
          priceLevel: NaN as any, // Thiếu mức giá số học cụ thể
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Tâm lý thị trường xấu đi và bán tháo"
        },
        actionProtocol: {
          allocationPct: 60,
          entryCondition: "Vượt 29.000",
          stopLossPrice: 26_500,
          takeProfitLevels: [32_000, 34_000]
        }
      },
      {
        label: "BASE",
        name: "Đi ngang tích lũy quanh MA50",
        probability: 0.25,
        targetPrice: 28_500,
        expectedReturnPct: 1.8,
        timeHorizonWeeks: 8,
        invalidation: {
          priceLevel: 26_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Thủng MA50"
        },
        actionProtocol: {
          allocationPct: 20,
          entryCondition: "Mua test 27.500",
          stopLossPrice: 26_000,
          takeProfitLevels: [29_000]
        }
      },
      {
        label: "BEAR",
        name: "Giá thép thế giới sụt giảm",
        probability: 0.25,
        targetPrice: 23_000,
        expectedReturnPct: -17.8,
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 30_500,
          condition: "BREAK_ABOVE",
          timeframe: "DAILY_CLOSE",
          rationale: "Vượt đỉnh 30.500"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Không mua",
          stopLossPrice: 26_000,
          takeProfitLevels: []
        },
        bearContingency: {
          t2FloorLockRisk: "MEDIUM",
          estimatedSlippagePct: 8.0,
          liquidityDrainExitPlan: "Thoát hàng tại phiên ATC nếu thủng 26.000"
        }
      }
    ]
  };

  const report = auditMultiScenarioModel(vagueInvalidationPayload);

  assert.equal(report.passed, false);
  assert.ok(report.issues.some(i => i.code === "ERR_MISSING_INVALIDATION_PRICE"));
});

test("CRO Stress Test - Bẫy 5: Lợi suất kỳ vọng số học E[R] âm bị tô hồng", () => {
  const negativeExpectancyPayload: ScenarioInputPayload = {
    symbol: "NVL",
    currentPrice: 12_000,
    averageVolume20d: 10_000_000,
    scenarios: [
      {
        label: "BULL",
        name: "Tái cơ cấu nợ trái phiếu thành công",
        probability: 0.20,
        targetPrice: 15_000,
        expectedReturnPct: 25.0, // Đóng góp: 0.20 * 25% = +5%
        timeHorizonWeeks: 8,
        invalidation: {
          priceLevel: 10_500,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Gãy đáy cũ"
        },
        actionProtocol: {
          allocationPct: 30,
          entryCondition: "Break 13.000",
          stopLossPrice: 10_500,
          takeProfitLevels: [15_000]
        }
      },
      {
        label: "BASE",
        name: "Đi ngang chờ gia hạn trái phiếu",
        probability: 0.30,
        targetPrice: 12_000,
        expectedReturnPct: 0.0, // Đóng góp: 0%
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 10_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Thủng hỗ trợ tâm lý"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Quan sát",
          stopLossPrice: 10_000,
          takeProfitLevels: []
        }
      },
      {
        label: "BEAR",
        name: "Chậm thanh toán gốc lãi, bị phong tỏa dự án",
        probability: 0.50,
        targetPrice: 8_000,
        expectedReturnPct: -33.3, // Đóng góp: 0.50 * -33.3% = -16.65%
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 13_500,
          condition: "BREAK_ABOVE",
          timeframe: "DAILY_CLOSE",
          rationale: "Vượt kháng cự đảo chiều"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Cấm mua",
          stopLossPrice: 10_500,
          takeProfitLevels: []
        },
        bearContingency: {
          t2FloorLockRisk: "EXTREME",
          estimatedSlippagePct: 21.0, // Nguy cơ 3 cây sàn liên tiếp
          liquidityDrainExitPlan: "Đặt lệnh MP phiên ATO, chủ động Short phòng vệ VN30F"
        }
      }
    ]
  };

  const report = auditMultiScenarioModel(negativeExpectancyPayload);

  // E[R] = 5% + 0% - 16.65% = -11.65% < 0
  assert.equal(report.passed, false);
  assert.equal(report.verdict, "REJECTED_UNSAFE");
  assert.ok(report.metrics.expectedReturnPct < 0);
  assert.ok(report.issues.some(i => i.code === "ERR_NEGATIVE_EXPECTED_RETURN"));
});

test("CRO Stress Test - Tiêu chuẩn Vàng Đạt chuẩn Thẩm định (APPROVED FOR EXECUTION)", () => {
  const goldStandardPayload: ScenarioInputPayload = {
    symbol: "FPT",
    currentPrice: 130_000,
    averageVolume20d: 3_500_000,
    marketContext: {
      exchange: "HOSE",
      sbvMonetaryStance: "NEUTRAL",
      usdVndPressure: "MODERATE"
    },
    scenarios: [
      {
        label: "BULL",
        name: "Mảng AI & Bán dẫn tiếp tục bứt phá lợi nhuận",
        probability: 0.45,
        targetPrice: 156_000,
        expectedReturnPct: 20.0,
        timeHorizonWeeks: 10,
        invalidation: {
          priceLevel: 122_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Đóng nến ngày dưới MA50 kèm thanh khoản vượt 1.5x MA20"
        },
        actionProtocol: {
          allocationPct: 50,
          entryCondition: "Vượt 133.000 với volume > 4.5M cổ phiếu",
          stopLossPrice: 122_000,
          takeProfitLevels: [145_000, 156_000]
        }
      },
      {
        label: "BASE",
        name: "Tích lũy kiểm tra lại đỉnh lịch sử 130k",
        probability: 0.35,
        targetPrice: 136_500,
        expectedReturnPct: 5.0,
        timeHorizonWeeks: 6,
        invalidation: {
          priceLevel: 120_000,
          condition: "BREAK_BELOW",
          timeframe: "DAILY_CLOSE",
          rationale: "Mất kênh giá hồi quy song song tuần"
        },
        actionProtocol: {
          allocationPct: 30,
          entryCondition: "Mua gom khi giá test MA20 quanh 126.000 - 128.000",
          stopLossPrice: 121_000,
          takeProfitLevels: [136_500]
        }
      },
      {
        label: "BEAR",
        name: "Thị trường chung điều chỉnh sâu do SBV hút tín phiếu tỷ giá",
        probability: 0.20,
        targetPrice: 110_000,
        expectedReturnPct: -15.38,
        timeHorizonWeeks: 4,
        invalidation: {
          priceLevel: 138_000,
          condition: "BREAK_ABOVE",
          timeframe: "DAILY_CLOSE",
          rationale: "Breakout đỉnh mới phủ nhận nhịp điều chỉnh"
        },
        actionProtocol: {
          allocationPct: 0,
          entryCondition: "Đình chỉ mở vị thế mới",
          stopLossPrice: 122_000,
          takeProfitLevels: []
        },
        bearContingency: {
          t2FloorLockRisk: "MEDIUM",
          estimatedSlippagePct: 7.0, // Ước tính trượt giá 1 cây sàn
          liquidityDrainExitPlan: "Hạ 50% tỷ trọng margin ngay khi thủng 124.000; đặt lệnh ATO ngày T+2 nếu mất thanh khoản",
          hedgingStrategy: "Mở vị thế Short tương đương trên VN30F để khóa rủi ro danh mục"
        }
      }
    ]
  };

  const report = auditMultiScenarioModel(goldStandardPayload);

  // Kiểm toán tổng xác suất: 0.45 + 0.35 + 0.20 = 1.00
  assert.equal(report.metrics.totalProbability, 1.0);
  assert.equal(report.passed, true);
  assert.equal(report.verdict, "APPROVED_FOR_EXECUTION");
  assert.ok(report.metrics.auditScore >= 85);
  
  // Kiểm tra tính toán số học đúng đắn:
  // E[R] = (0.45 * 20%) + (0.35 * 5%) + (0.20 * -15.38%) = 9.0 + 1.75 - 3.076 = 7.674% (~7.67%)
  assert.ok(report.metrics.expectedReturnPct > 7.0 && report.metrics.expectedReturnPct < 8.5);
  // Asymmetry ratio: (0.45 * 20) / (0.20 * 15.38) = 9 / 3.076 = 2.93x > 1.3x
  assert.ok(report.metrics.bullBearAsymmetryRatio >= 2.0);
  // Haircut E[R] với rủi ro kẹt sàn T+2.5 vẫn dương
  assert.ok(report.metrics.t2LiquidityHaircutReturnPct > 5.0);
  assert.equal(report.issues.length, 0);
});
