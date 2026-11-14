/**
 * ============================================================================
 * ORCA-FA: MULTI-SCENARIO CRITIC & STRESS-TEST ENGINE
 * ============================================================================
 * Giám đốc Quản trị Rủi ro & Phản biện Độc lập (CRO / Stress Tester Module).
 * Phản biện, đập tan thiên kiến tô hồng và kiểm toán các kịch bản của Orca AI.
 *
 * Tiêu chuẩn áp dụng:
 * 1. Tiên đề Tổng Xác suất: \sum p_i = 1.0 (Unitary Probability Constraint)
 * 2. Tính toán Lợi suất Kỳ vọng số học: E[R] = \sum (p_i * R_i)
 * 3. Kiểm định Bất đối xứng Lợi nhuận / Rủi ro (Asymmetry Risk-Reward Ratio)
 * 4. Điểm Vô hiệu hóa Xác định (Deterministic Invalidation Point)
 * 5. Thử nghiệm Căng thẳng Thanh khoản Kẹt sàn T+2.5 (T+2.5 Liquidity Lock Stress Test)
 * 6. Kế hoạch Thoát hàng Khẩn cấp & Phòng vệ Black Swan cho TTCK Việt Nam
 */

export type ScenarioLabel = "BULL" | "BASE" | "BEAR";

export interface StrictScenario {
  label: ScenarioLabel;
  name: string;
  probability: number; // 0.0 -> 1.0 (Bắt buộc dạng thập phân chuẩn)
  targetPrice: number; // Giá mục tiêu kỳ vọng (VND)
  expectedReturnPct: number; // % Lợi suất kỳ vọng so với giá hiện tại
  timeHorizonWeeks: number; // Khung thời gian hiệu lực (tuần)
  
  // Deterministic Invalidation Point (Mốc triệt tiêu xác định)
  invalidation: {
    priceLevel: number; // Mức giá số học cụ thể (VND)
    condition: "BREAK_BELOW" | "BREAK_ABOVE"; // Điều kiện triệt tiêu
    timeframe: "DAILY_CLOSE" | "INTRADAY" | "WEEKLY_CLOSE";
    rationale: string; // Lý do cấu trúc (ví dụ: gãy MA50 + Vol > 1.5x)
  };

  // Ma trận hành động thực chiến
  actionProtocol: {
    allocationPct: number; // % Tỷ trọng khuyến nghị tối đa cho kịch bản này
    entryCondition: string; // Điều kiện giải ngân
    stopLossPrice: number; // Mức cắt lỗ cứng
    takeProfitLevels: number[]; // Các mốc chốt lời từng phần
  };

  // Kế hoạch phòng vệ cho Bear Case (bắt buộc với BEAR)
  bearContingency?: {
    t2FloorLockRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    estimatedSlippagePct: number; // Độ trượt giá dự kiến nếu kẹt sàn T+2.5 (vd: -7% đến -21%)
    liquidityDrainExitPlan: string; // Kế hoạch thoát hàng khi mất thanh khoản sàn
    hedgingStrategy?: string; // Phòng vệ phái sinh VN30F hoặc danh mục tương quan nghịch
  };
}

export interface ScenarioAuditIssue {
  code: 
    | "ERR_PROBABILITY_SUM"
    | "ERR_NEGATIVE_PROBABILITY"
    | "ERR_MISSING_INVALIDATION_PRICE"
    | "ERR_INVALIDATION_LOGIC_MISMATCH"
    | "ERR_BEAR_MISSING_CONTINGENCY"
    | "ERR_BEAR_SUPERFICIAL_DRAWDOWN"
    | "ERR_T2_LIQUIDITY_UNMITIGATED"
    | "ERR_NEGATIVE_EXPECTED_RETURN"
    | "ERR_UNFAVORABLE_ASYMMETRY"
    | "WARN_EXTREME_SKEW";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "WARNING";
  scenarioLabel?: ScenarioLabel;
  message: string;
  recommendation: string;
}

export interface ScenarioAuditMetrics {
  totalProbability: number;
  expectedReturnPct: number; // E[R]
  bullBearAsymmetryRatio: number; // (p_bull * R_bull) / (p_bear * |R_bear|)
  downsideSemivariance: number;
  t2LiquidityHaircutReturnPct: number; // E[R] sau khi tính độ trượt giá kẹt sàn T+2.5
  isExecutable: boolean; // Đạt chuẩn thực chiến để chuyển giao cho Nhà đầu tư hay không
  auditScore: number; // 0 - 100
}

export interface ScenarioAuditReport {
  symbol: string;
  currentPrice: number;
  timestamp: number;
  passed: boolean;
  verdict: "APPROVED_FOR_EXECUTION" | "REJECTED_UNSAFE" | "NEEDS_REVISION";
  metrics: ScenarioAuditMetrics;
  issues: ScenarioAuditIssue[];
  auditedScenarios: StrictScenario[];
}

export interface ScenarioInputPayload {
  symbol: string;
  currentPrice: number;
  averageVolume20d: number; // Khối lượng khớp trung bình 20 phiên
  scenarios: StrictScenario[];
  marketContext?: {
    exchange: "HOSE" | "HNX" | "UPCOM";
    sbvMonetaryStance?: "EASING" | "NEUTRAL" | "TIGHTENING_BILLS"; // Chính sách tín phiếu SBV
    usdVndPressure?: "LOW" | "MODERATE" | "HIGH";
  };
}

/**
 * Thuật toán kiểm định, phản biện và Stress-Test toàn diện cho mô hình đa kịch bản
 */
export function auditMultiScenarioModel(payload: ScenarioInputPayload): ScenarioAuditReport {
  const issues: ScenarioAuditIssue[] = [];
  const { symbol, currentPrice, averageVolume20d, scenarios, marketContext } = payload;
  const exchange = marketContext?.exchange ?? "HOSE";
  const floorCeilBandPct = exchange === "HOSE" ? 0.07 : exchange === "HNX" ? 0.10 : 0.15;

  // 1. KIỂM ĐỊNH NGUYÊN TẮC XÁC SUẤT (Probability Axiom)
  let sumProb = 0;
  for (const sc of scenarios) {
    if (sc.probability < 0 || sc.probability > 1) {
      issues.push({
        code: "ERR_NEGATIVE_PROBABILITY",
        severity: "CRITICAL",
        scenarioLabel: sc.label,
        message: `Xác suất kịch bản ${sc.label} (${sc.probability}) nằm ngoài miền hợp lệ [0, 1].`,
        recommendation: "Hiệu chỉnh xác suất về thang đo chuẩn [0.0 - 1.0]."
      });
    }
    sumProb += sc.probability;
  }

  // Cho phép sai số dấu phẩy động cực nhỏ (epsilon = 0.001)
  const isProbSumUnitary = Math.abs(sumProb - 1.0) <= 0.001;
  if (!isProbSumUnitary) {
    issues.push({
      code: "ERR_PROBABILITY_SUM",
      severity: "CRITICAL",
      message: `Tổng xác suất các kịch bản không bằng 100% (Hiện tại: ${(sumProb * 100).toFixed(2)}%). Vi phạm bẫy gán xác suất tùy tiện!`,
      recommendation: "Chuẩn hóa lại trọng số xác suất sao cho \\sum p_i = 1.0."
    });
  }

  // 2. TÍNH TOÁN EXPECTED RETURN E[R] VÀ ASYMMETRY RATIO
  let expectedReturnPct = 0;
  let bullWeightedReturn = 0;
  let bearWeightedRisk = 0;
  let bearScenarioFound = false;

  for (const sc of scenarios) {
    expectedReturnPct += sc.probability * sc.expectedReturnPct;

    if (sc.label === "BULL") {
      bullWeightedReturn += sc.probability * Math.max(0, sc.expectedReturnPct);
    }
    if (sc.label === "BEAR") {
      bearScenarioFound = true;
      bearWeightedRisk += sc.probability * Math.abs(Math.min(0, sc.expectedReturnPct));
    }
  }

  // Tỷ số bất đối xứng Lợi nhuận/Rủi ro: (p_Bull * R_Bull) / (p_Bear * |R_Bear|)
  const bullBearAsymmetryRatio = bearWeightedRisk > 0 
    ? Number((bullWeightedReturn / bearWeightedRisk).toFixed(2)) 
    : bullWeightedReturn > 0 ? 99.0 : 0;

  if (expectedReturnPct <= 0) {
    issues.push({
      code: "ERR_NEGATIVE_EXPECTED_RETURN",
      severity: "CRITICAL",
      message: `Lợi suất kỳ vọng số học E[R] = ${expectedReturnPct.toFixed(2)}% <= 0. Mô hình không có lợi thế toán học (Negative Mathematical Expectancy).`,
      recommendation: "Không được khuyến nghị giải ngân khi E[R] <= 0 trừ khi chiến lược là Short phái sinh."
    });
  }

  if (bullBearAsymmetryRatio < 1.3 && bullBearAsymmetryRatio > 0) {
    issues.push({
      code: "ERR_UNFAVORABLE_ASYMMETRY",
      severity: "HIGH",
      message: `Tỷ số bất đối xứng Bull/Bear (${bullBearAsymmetryRatio}) dưới ngưỡng an toàn tối thiểu (1.30x). Biên an toàn quá mỏng.`,
      recommendation: "Nâng cao điều kiện kích hoạt hoặc chỉ giải ngân khi tỷ lệ Risk/Reward tiềm năng cải thiện."
    });
  }

  // 3. KIỂM ĐỊNH MỐC VÔ HIỆU HÓA (DETERMINISTIC INVALIDATION CHECK)
  for (const sc of scenarios) {
    if (!sc.invalidation || !Number.isFinite(sc.invalidation.priceLevel) || sc.invalidation.priceLevel <= 0) {
      issues.push({
        code: "ERR_MISSING_INVALIDATION_PRICE",
        severity: "CRITICAL",
        scenarioLabel: sc.label,
        message: `Kịch bản ${sc.label} thiếu mức giá vô hiệu hóa số học cụ thể (Invalidation Price). Đây là bẫy ngụy biện định tính mơ hồ!`,
        recommendation: "Bắt buộc xác định mức giá cụ thể (ví dụ thủng đáy cũ hoặc MA50) khiến luận điểm bị hủy bỏ ngay lập tức."
      });
      continue;
    }

    // Logic consistency: Bull bị hủy khi giá rơi thủng mức hỗ trợ (BREAK_BELOW), Bear bị hủy khi vượt kháng cự (BREAK_ABOVE)
    if (sc.label === "BULL" && sc.invalidation.condition !== "BREAK_BELOW") {
      issues.push({
        code: "ERR_INVALIDATION_LOGIC_MISMATCH",
        severity: "HIGH",
        scenarioLabel: sc.label,
        message: `Kịch bản BULL phải có điều kiện vô hiệu hóa là BREAK_BELOW (thủng giá sàn/hỗ trợ), nhưng hiện tại là ${sc.invalidation.condition}.`,
        recommendation: "Sửa điều kiện vô hiệu hóa Bull thành BREAK_BELOW."
      });
    }

    if (sc.label === "BEAR" && sc.invalidation.condition !== "BREAK_ABOVE") {
      issues.push({
        code: "ERR_INVALIDATION_LOGIC_MISMATCH",
        severity: "HIGH",
        scenarioLabel: sc.label,
        message: `Kịch bản BEAR phải có điều kiện vô hiệu hóa là BREAK_ABOVE (vượt kháng cự), nhưng hiện tại là ${sc.invalidation.condition}.`,
        recommendation: "Sửa điều kiện vô hiệu hóa Bear thành BREAK_ABOVE."
      });
    }
  }

  // 4. KIỂM ĐỊNH RỦI RO KẸT THANH KHOẢN T+2.5 VÀ BLACK SWAN TRONG BEAR CASE
  const bearScenarios = scenarios.filter((s) => s.label === "BEAR");
  let t2LiquidityHaircutReturnPct = expectedReturnPct;

  if (bearScenarios.length === 0) {
    issues.push({
      code: "ERR_BEAR_MISSING_CONTINGENCY",
      severity: "CRITICAL",
      message: "Thiếu hoàn toàn kịch bản BEAR CASE! Vi phạm nghiêm trọng nguyên tắc quản trị rủi ro độc lập.",
      recommendation: "Bắt buộc bổ sung kịch bản Bear Case với kịch bản thị trường điều chỉnh sâu."
    });
  } else {
    for (const bear of bearScenarios) {
      // Kiểm tra độ nông/sâu của Bear Case (Bẫy tô hồng)
      // Trên TTCK VN, một nhịp gãy xu hướng thường mất tối thiểu 2 cây sàn (-14% HOSE, -20% HNX)
      const minRealisticDrawdown = floorCeilBandPct * 1.5 * 100; // vd: 10.5% với HOSE
      if (Math.abs(bear.expectedReturnPct) < minRealisticDrawdown * 0.7) {
        issues.push({
          code: "ERR_BEAR_SUPERFICIAL_DRAWDOWN",
          severity: "HIGH",
          scenarioLabel: "BEAR",
          message: `Kịch bản Bear Case dự phóng mức giảm quá nhẹ nhàng (${bear.expectedReturnPct}%). Đây là bẫy tô hồng (Superficial Bear Case). Nhịp gãy thực chiến thường mất tối thiểu ${(minRealisticDrawdown * 0.7).toFixed(1)}%.`,
          recommendation: `Căng thẳng hóa kịch bản Bear với mức sụt giảm tối thiểu -${minRealisticDrawdown.toFixed(1)}% do hiệu ứng call margin chéo.`
        });
      }

      // Kiểm tra kế hoạch thoát kẹt sàn T+2.5
      if (!bear.bearContingency || !bear.bearContingency.liquidityDrainExitPlan) {
        issues.push({
          code: "ERR_T2_LIQUIDITY_UNMITIGATED",
          severity: "CRITICAL",
          scenarioLabel: "BEAR",
          message: "Kịch bản Bear Case không có kế hoạch xử lý rủi ro mất thanh khoản kẹt sàn T+2.5 (Liquidity Drain Exit Plan).",
          recommendation: "Quy định rõ hành động khi cổ phiếu trắng bảng bên mua phiên T+1/T+2: lệnh ưu tiên ATO phiên tiếp theo, hedging Short VN30F phái sinh để bảo vệ NAV."
        });
      } else {
        // Áp dụng trượt giá do kẹt sàn T+2.5 vào mô hình Stress Test
        const slippage = bear.bearContingency.estimatedSlippagePct || (floorCeilBandPct * 100);
        // Tái tính toán E[R] trong tình huống xấu nhất khi Bear xảy ra kèm trượt giá T+2.5
        const stressedBearReturn = bear.expectedReturnPct - slippage;
        t2LiquidityHaircutReturnPct = expectedReturnPct - (bear.probability * slippage);
      }
    }
  }

  // 5. TỔNG HỢP ĐIỂM SỐ VÀ KẾT LUẬN THẨM ĐỊNH (VERDICT)
  const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
  const highCount = issues.filter(i => i.severity === "HIGH").length;
  const mediumCount = issues.filter(i => i.severity === "MEDIUM").length;

  let auditScore = 100 - (criticalCount * 35) - (highCount * 15) - (mediumCount * 5);
  auditScore = Math.max(0, Math.min(100, auditScore));

  const passed = criticalCount === 0 && highCount <= 1 && isProbSumUnitary && expectedReturnPct > 0;
  const verdict = criticalCount > 0 
    ? "REJECTED_UNSAFE" 
    : passed 
      ? "APPROVED_FOR_EXECUTION" 
      : "NEEDS_REVISION";

  return {
    symbol,
    currentPrice,
    timestamp: Date.now(),
    passed,
    verdict,
    metrics: {
      totalProbability: Number(sumProb.toFixed(4)),
      expectedReturnPct: Number(expectedReturnPct.toFixed(2)),
      bullBearAsymmetryRatio,
      downsideSemivariance: Number(bearWeightedRisk.toFixed(2)),
      t2LiquidityHaircutReturnPct: Number(t2LiquidityHaircutReturnPct.toFixed(2)),
      isExecutable: passed,
      auditScore,
    },
    issues,
    auditedScenarios: scenarios,
  };
}
