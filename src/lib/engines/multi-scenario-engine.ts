/**
 * ORCA MULTI-SCENARIO & MULTI-TIMEFRAME QUANT STRATEGY ENGINE
 *
 * Chuẩn hóa phương pháp luận phân tích tài chính đa kịch bản (3-Scenario Framework)
 * kết hợp ma trận đa khung thời gian (Multi-Timeframe Integration) cho thị trường Việt Nam (VNINDEX / HOSE / HNX).
 *
 * Tính toán định lượng:
 * - Kỳ vọng lợi nhuận có trọng số: E[R] = sum(p_i * R_i)
 * - Phương sai & Độ lệch chuẩn (Scenario Volatility): sigma = sqrt(sum(p_i * (R_i - E[R])^2))
 * - Tỷ lệ Lợi nhuận / Rủi ro tổng hợp (Composite Risk-to-Reward Ratio): RRR
 * - Điểm vô hiệu hóa (Invalidation Point) & Hành động kích hoạt (Actionable Trigger)
 * - Tỷ trọng phân bổ tài sản tối ưu (Recommended Equity / Cash Ratio)
 */

export type ScenarioType = "BULL" | "BASE" | "BEAR";
export type TimeframeBias = "BULLISH" | "NEUTRAL" | "BEARISH";

export type ScenarioActionVerdict =
  | "STRONG_ACCUMULATE" // Mua tích lũy mạnh (E[R] cao, RRR > 2.5, Bear rủi ro thấp)
  | "SELECTIVE_BUY"     // Mua thăm dò / từng phần (E[R] dương vừa, RRR > 1.5)
  | "HOLD_OBSERVE"      // Nắm giữ & quan sát (Chờ tín hiệu xác nhận)
  | "TRIM_RISK"         // Hạ tỷ trọng / chốt lời từng phần (RRR < 1.0 hoặc chạm kháng cự)
  | "DEFENSIVE_CASH";   // Phòng thủ tối đa, ưu tiên tiền mặt (E[R] âm hoặc rủi ro Bear áp đảo)

export interface ScenarioDetail {
  type: ScenarioType;
  labelVi: string;
  probability: number; // 0.0 - 1.0 (Tổng 3 kịch bản = 1.0)
  targetPrice: number; // Mức giá hoặc điểm số mục tiêu
  returnPct: number;   // Tỷ suất sinh lời dự kiến (%)
  drivers: string[];   // Các động lực cốt lõi
  catalysts: string[]; // Xúc tác định lượng / tin tức
  invalidationPoint: number; // Mốc giá vi phạm vô hiệu hóa luận điểm
  invalidationCondition: string; // Điều kiện kích hoạt trạng thái vi phạm
  actionableTrigger: string;     // Kế hoạch hành động cụ thể khi kịch bản xảy ra
  maxDrawdownPct: number;        // Mức sụt giảm tối đa dự kiến (%)
}

export interface ShortTermTPlusHorizon {
  timeframe: string; // "T+2.5 / Ngắn hạn (1 - 10 phiên)"
  focus: string;     // Cung cầu vi mô, nến nhật, VWAP, T+2.5 settlement
  bias: TimeframeBias;
  supportLevel: number;
  resistanceLevel: number;
  stopLossLevel: number;
  actionVi: string;
}

export interface MediumTermQuarterlyHorizon {
  timeframe: string; // "Trung hạn (1 - 2 Quý / Mùa BCTC)"
  focus: string;     // EPS forward, NIM, tăng trưởng doanh thu, P/E trailing/forward
  bias: TimeframeBias;
  businessCyclePhase: string;
  quarterlyCatalysts: string[];
  quarterlyTargetPrice: number;
}

export interface LongTermCycleHorizon {
  timeframe: string; // "Dài hạn (1 - 3 Năm / Chu kỳ kinh tế)"
  focus: string;     // Moat (Lợi thế cạnh tranh), ROE/ROIC, DCF Fair Value, chu kỳ vĩ mô
  bias: TimeframeBias;
  fairValueDCF: number;
  moatRating: "WIDE" | "NARROW" | "NONE";
  structuralDrivers: string[];
}

export interface MultiTimeframeMatrix {
  shortTerm: ShortTermTPlusHorizon;
  mediumTerm: MediumTermQuarterlyHorizon;
  longTerm: LongTermCycleHorizon;
  confluenceSummaryVi: string;
}

export interface PortfolioAllocationAdvice {
  equityPct: number;    // % Cổ phiếu (0 - 100)
  cashPct: number;      // % Tiền mặt (0 - 100)
  marginAllowed: boolean;
  maxLeverageRatio: number; // e.g., 1.0 (không vay), 1.3, 1.5
  allocationNoteVi: string;
}

export interface MultiScenarioReport {
  symbol: string;
  currentPrice: number;
  asOfDate: string;
  scenarios: {
    bull: ScenarioDetail;
    base: ScenarioDetail;
    bear: ScenarioDetail;
  };
  metrics: {
    expectedReturnPct: number; // E[R] %
    scenarioVariance: number;  // Var(R)
    scenarioVolatilityPct: number; // sigma %
    upsidePotentialPct: number;
    downsideRiskPct: number;
    riskRewardRatio: number;   // RRR = Upside / Downside
    verdict: ScenarioActionVerdict;
    verdictVi: string;
  };
  timeframeMatrix: MultiTimeframeMatrix;
  allocation: PortfolioAllocationAdvice;
  executiveSummaryVi: string;
}

export interface ScenarioInputPayload {
  symbol: string;
  currentPrice: number;
  asOfDate?: string;
  bull: {
    probability: number;
    targetPrice: number;
    drivers: string[];
    catalysts: string[];
    invalidationPoint: number;
    invalidationCondition: string;
    actionableTrigger: string;
    maxDrawdownPct?: number;
  };
  base: {
    probability: number;
    targetPrice: number;
    drivers: string[];
    catalysts: string[];
    invalidationPoint: number;
    invalidationCondition: string;
    actionableTrigger: string;
    maxDrawdownPct?: number;
  };
  bear: {
    probability: number;
    targetPrice: number;
    drivers: string[];
    catalysts: string[];
    invalidationPoint: number;
    invalidationCondition: string;
    actionableTrigger: string;
    maxDrawdownPct?: number;
  };
  timeframeMatrix: MultiTimeframeMatrix;
  customAllocation?: Partial<PortfolioAllocationAdvice>;
}

/**
 * Tính toán các chỉ số định lượng xác suất từ 3 kịch bản
 */
export function calculateScenarioMetrics(
  currentPrice: number,
  bullTarget: number,
  bullProb: number,
  baseTarget: number,
  baseProb: number,
  bearTarget: number,
  bearProb: number
): {
  normalizedProbs: { bull: number; base: number; bear: number };
  returns: { bullPct: number; basePct: number; bearPct: number };
  expectedReturnPct: number;
  variance: number;
  volatilityPct: number;
  riskRewardRatio: number;
  verdict: ScenarioActionVerdict;
  verdictVi: string;
} {
  // 1. Chuẩn hóa xác suất nếu tổng khác 1.0
  const rawSum = bullProb + baseProb + bearProb;
  const pBull = rawSum > 0 ? bullProb / rawSum : 0.25;
  const pBase = rawSum > 0 ? baseProb / rawSum : 0.5;
  const pBear = rawSum > 0 ? bearProb / rawSum : 0.25;

  // 2. Tính tỷ suất sinh lời từng kịch bản
  const rBull = ((bullTarget - currentPrice) / currentPrice) * 100;
  const rBase = ((baseTarget - currentPrice) / currentPrice) * 100;
  const rBear = ((bearTarget - currentPrice) / currentPrice) * 100;

  // 3. Kỳ vọng lợi nhuận có trọng số E[R]
  const expectedReturnPct = pBull * rBull + pBase * rBase + pBear * rBear;

  // 4. Phương sai & Độ lệch chuẩn kịch bản
  const variance =
    pBull * Math.pow(rBull - expectedReturnPct, 2) +
    pBase * Math.pow(rBase - expectedReturnPct, 2) +
    pBear * Math.pow(rBear - expectedReturnPct, 2);
  const volatilityPct = Math.sqrt(Math.max(0, variance));

  // 5. Tỷ lệ Lợi nhuận / Rủi ro tổng hợp (Composite Scenario RRR)
  // Upside = p_bull * r_bull + p_base * max(0, r_base)
  // Downside = p_bear * |r_bear| + p_base * |min(0, r_base)|
  const upside = pBull * Math.max(0, rBull) + pBase * Math.max(0, rBase);
  const downside = pBear * Math.abs(Math.min(0, rBear)) + pBase * Math.abs(Math.min(0, rBase));
  const riskRewardRatio = downside > 0.0001 ? upside / downside : upside > 0 ? 99 : 0;

  // 6. Quyết định hành động (Verdict)
  let verdict: ScenarioActionVerdict = "HOLD_OBSERVE";
  let verdictVi = "Nắm giữ & Theo dõi tín hiệu";

  if (expectedReturnPct >= 15 && riskRewardRatio >= 2.5 && rBear >= -15) {
    verdict = "STRONG_ACCUMULATE";
    verdictVi = "Tích lũy chủ động tỷ trọng lớn (Risk/Reward vượt trội)";
  } else if (expectedReturnPct >= 7 && riskRewardRatio >= 1.5) {
    verdict = "SELECTIVE_BUY";
    verdictVi = "Giải ngân từng phần / Mua thăm dò tại hỗ trợ";
  } else if (expectedReturnPct < 0 || riskRewardRatio < 0.8 || rBear <= -25) {
    verdict = "DEFENSIVE_CASH";
    verdictVi = "Phòng thủ tuyệt đối, ưu tiên giữ tỷ trọng tiền mặt";
  } else if (riskRewardRatio < 1.2 || expectedReturnPct < 4) {
    verdict = "TRIM_RISK";
    verdictVi = "Hạ tỷ trọng, khóa lợi nhuận ngắn hạn, quản trị rủi ro";
  }

  return {
    normalizedProbs: {
      bull: Number(pBull.toFixed(4)),
      base: Number(pBase.toFixed(4)),
      bear: Number(pBear.toFixed(4)),
    },
    returns: {
      bullPct: Number(rBull.toFixed(2)),
      basePct: Number(rBase.toFixed(2)),
      bearPct: Number(rBear.toFixed(2)),
    },
    expectedReturnPct: Number(expectedReturnPct.toFixed(2)),
    variance: Number(variance.toFixed(2)),
    volatilityPct: Number(volatilityPct.toFixed(2)),
    riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
    verdict,
    verdictVi,
  };
}

/**
 * Tính toán tỷ trọng danh mục tối ưu dựa trên Verdict và RRR
 */
export function deriveOptimalAllocation(
  verdict: ScenarioActionVerdict,
  riskRewardRatio: number,
  expectedReturnPct: number,
  downsideRiskPct: number
): PortfolioAllocationAdvice {
  switch (verdict) {
    case "STRONG_ACCUMULATE":
      return {
        equityPct: 80,
        cashPct: 20,
        marginAllowed: riskRewardRatio >= 3.0 && downsideRiskPct < 10,
        maxLeverageRatio: 1.25,
        allocationNoteVi:
          "Tỷ trọng cổ phiếu mục tiêu 70-80%. Có thể sử dụng margin thận trọng ở các nhịp pullback kiểm định hỗ trợ ngắn hạn.",
      };
    case "SELECTIVE_BUY":
      return {
        equityPct: 60,
        cashPct: 40,
        marginAllowed: false,
        maxLeverageRatio: 1.0,
        allocationNoteVi:
          "Duy trì tỷ trọng cổ phiếu 50-60%, dự trữ 40% tiền mặt. Mua từng phần (chia 2-3 đợt), tuyệt đối không dùng margin.",
      };
    case "HOLD_OBSERVE":
      return {
        equityPct: 45,
        cashPct: 55,
        marginAllowed: false,
        maxLeverageRatio: 1.0,
        allocationNoteVi:
          "Thế trận cân bằng 45% cổ / 55% tiền. Kiên nhẫn chờ đợi xác nhận breakout hoặc kiểm định hỗ trợ thành công.",
      };
    case "TRIM_RISK":
      return {
        equityPct: 30,
        cashPct: 70,
        marginAllowed: false,
        maxLeverageRatio: 1.0,
        allocationNoteVi:
          "Chủ động hạ tỷ trọng cổ phiếu về 30%, chốt lời danh mục ngắn hạn hoặc cắt các vị thế chạm điểm vô hiệu hóa.",
      };
    case "DEFENSIVE_CASH":
    default:
      return {
        equityPct: 15,
        cashPct: 85,
        marginAllowed: false,
        maxLeverageRatio: 1.0,
        allocationNoteVi:
          "Phòng thủ tối đa: Tiền mặt chiếm 80-90%. Chỉ giữ các vị thế dài hạn có biên an toàn cực lớn (Margin of Safety).",
      };
  }
}

/**
 * Sinh báo cáo Đa Khung Kịch Bản hoàn chỉnh
 */
export function generateMultiScenarioReport(input: ScenarioInputPayload): MultiScenarioReport {
  const metricsResult = calculateScenarioMetrics(
    input.currentPrice,
    input.bull.targetPrice,
    input.bull.probability,
    input.base.targetPrice,
    input.base.probability,
    input.bear.targetPrice,
    input.bear.probability
  );

  const defaultDrawdowns = {
    bull: input.bull.maxDrawdownPct ?? 5,
    base: input.base.maxDrawdownPct ?? 10,
    bear: input.bear.maxDrawdownPct ?? 22,
  };

  const scenarios: MultiScenarioReport["scenarios"] = {
    bull: {
      type: "BULL",
      labelVi: "Kịch bản Lạc quan (Bull Case)",
      probability: metricsResult.normalizedProbs.bull,
      targetPrice: input.bull.targetPrice,
      returnPct: metricsResult.returns.bullPct,
      drivers: input.bull.drivers,
      catalysts: input.bull.catalysts,
      invalidationPoint: input.bull.invalidationPoint,
      invalidationCondition: input.bull.invalidationCondition,
      actionableTrigger: input.bull.actionableTrigger,
      maxDrawdownPct: defaultDrawdowns.bull,
    },
    base: {
      type: "BASE",
      labelVi: "Kịch bản Cơ sở (Base Case)",
      probability: metricsResult.normalizedProbs.base,
      targetPrice: input.base.targetPrice,
      returnPct: metricsResult.returns.basePct,
      drivers: input.base.drivers,
      catalysts: input.base.catalysts,
      invalidationPoint: input.base.invalidationPoint,
      invalidationCondition: input.base.invalidationCondition,
      actionableTrigger: input.base.actionableTrigger,
      maxDrawdownPct: defaultDrawdowns.base,
    },
    bear: {
      type: "BEAR",
      labelVi: "Kịch bản Phòng thủ / Tiêu cực (Bear Case)",
      probability: metricsResult.normalizedProbs.bear,
      targetPrice: input.bear.targetPrice,
      returnPct: metricsResult.returns.bearPct,
      drivers: input.bear.drivers,
      catalysts: input.bear.catalysts,
      invalidationPoint: input.bear.invalidationPoint,
      invalidationCondition: input.bear.invalidationCondition,
      actionableTrigger: input.bear.actionableTrigger,
      maxDrawdownPct: defaultDrawdowns.bear,
    },
  };

  const downsideRisk =
    metricsResult.normalizedProbs.bear * Math.abs(Math.min(0, metricsResult.returns.bearPct)) +
    metricsResult.normalizedProbs.base * Math.abs(Math.min(0, metricsResult.returns.basePct));

  const allocation = {
    ...deriveOptimalAllocation(
      metricsResult.verdict,
      metricsResult.riskRewardRatio,
      metricsResult.expectedReturnPct,
      downsideRisk
    ),
    ...input.customAllocation,
  };

  const executiveSummaryVi = `Báo cáo Đa kịch bản cho ${input.symbol}: Xác suất cao nhất tập trung ở ${scenarios.base.labelVi} (${(scenarios.base.probability * 100).toFixed(0)}%). Kỳ vọng lợi nhuận có trọng số E[R] đạt ${metricsResult.expectedReturnPct > 0 ? "+" : ""}${metricsResult.expectedReturnPct}%, độ biến động kịch bản sigma = ${metricsResult.volatilityPct}%, Tỷ lệ Lợi nhuận/Rủi ro RRR = ${metricsResult.riskRewardRatio}. Khuyến nghị hành động: ${metricsResult.verdictVi}. Phân bổ danh mục tối ưu: ${allocation.equityPct}% Cổ phiếu / ${allocation.cashPct}% Tiền mặt.`;

  return {
    symbol: input.symbol,
    currentPrice: input.currentPrice,
    asOfDate: input.asOfDate ?? new Date().toISOString().slice(0, 10),
    scenarios,
    metrics: {
      expectedReturnPct: metricsResult.expectedReturnPct,
      scenarioVariance: metricsResult.variance,
      scenarioVolatilityPct: metricsResult.volatilityPct,
      upsidePotentialPct: Number(
        (
          metricsResult.normalizedProbs.bull * Math.max(0, metricsResult.returns.bullPct) +
          metricsResult.normalizedProbs.base * Math.max(0, metricsResult.returns.basePct)
        ).toFixed(2)
      ),
      downsideRiskPct: Number(downsideRisk.toFixed(2)),
      riskRewardRatio: metricsResult.riskRewardRatio,
      verdict: metricsResult.verdict,
      verdictVi: metricsResult.verdictVi,
    },
    timeframeMatrix: input.timeframeMatrix,
    allocation,
    executiveSummaryVi,
  };
}

/**
 * Định dạng công thức KaTeX cho báo cáo đa kịch bản
 */
export function formatScenarioKaTeX(report: MultiScenarioReport): string {
  const { bull, base, bear } = report.scenarios;
  const pBull = bull.probability;
  const pBase = base.probability;
  const pBear = bear.probability;
  const rBull = bull.returnPct;
  const rBase = base.returnPct;
  const rBear = bear.returnPct;
  const er = report.metrics.expectedReturnPct;
  const sigma = report.metrics.scenarioVolatilityPct;
  const rrr = report.metrics.riskRewardRatio;

  return `### 🧮 Mô Hình Toán Học Xác Suất Định Lượng

**1. Kỳ vọng lợi nhuận có trọng số (Expected Return):**
$$E[R] = \\sum_{i \\in \\{Bull, Base, Bear\\}} p_i \\times R_i$$
$$E[R] = (${pBull} \\times ${rBull}\\%) + (${pBase} \\times ${rBase}\\%) + (${pBear} \\times ${rBear}\\%) = \\mathbf{${er > 0 ? "+" : ""}${er}\\%}$$

**2. Độ biến động kịch bản (Scenario Volatility & Variance):**
$$\\sigma = \\sqrt{\\sum_{i} p_i \\times (R_i - E[R])^2} = \\mathbf{${sigma}\\%}$$

**3. Tỷ lệ Lợi nhuận / Rủi ro tổng hợp (Composite Risk-to-Reward Ratio):**
$$RRR = \\frac{\\text{Upside Expectation}}{\\text{Downside Risk}} = \\frac{p_{bull} R_{bull}^+ + p_{base} R_{base}^+}{p_{bear} |R_{bear}^-| + p_{base} |R_{base}^-|} = \\mathbf{${rrr}}$$
`;
}

/**
 * Xuất toàn bộ báo cáo phân tích kịch bản theo định dạng Markdown chuyên nghiệp
 */
export function formatMultiScenarioMarkdown(report: MultiScenarioReport): string {
  const { symbol, currentPrice, scenarios, metrics, timeframeMatrix, allocation } = report;
  const priceFormatted = currentPrice.toLocaleString("vi-VN");

  return `# 🎯 BÁO CÁO PHÂN TÍCH ĐA KHUNG KỊCH BẢN (MULTI-SCENARIO QUANT STRATEGY)
**Mã tài sản / Chỉ số:** \`${symbol}\` | **Thị giá cơ sở:** \`${priceFormatted}\` | **Ngày phân tích:** \`${report.asOfDate}\`

> [!NOTE]
> **Khuyến nghị điều hành (Executive Verdict):** **${metrics.verdictVi}**  
> **Kỳ vọng lợi nhuận có trọng số $E[R]$:** \`${metrics.expectedReturnPct > 0 ? "+" : ""}${metrics.expectedReturnPct}%\` | **Hệ số RRR:** \`${metrics.riskRewardRatio}x\` | **Tỷ trọng tối ưu:** \`${allocation.equityPct}% Cổ phiếu / ${allocation.cashPct}% Tiền mặt\`

---

## 📊 1. MA TRẬN 3 KỊCH BẢN CHUẨN TẮC (BULL / BASE / BEAR)

| Chỉ số / Đặc điểm | 🚀 Bull Case (Lạc quan) | ⚖️ Base Case (Cơ sở) | 🛡️ Bear Case (Phòng thủ) |
| :--- | :---: | :---: | :---: |
| **Xác suất xảy ra ($p_i$)** | **${(scenarios.bull.probability * 100).toFixed(0)}%** | **${(scenarios.base.probability * 100).toFixed(0)}%** | **${(scenarios.bear.probability * 100).toFixed(0)}%** |
| **Mục tiêu giá / Điểm số** | \`${scenarios.bull.targetPrice.toLocaleString("vi-VN")}\` | \`${scenarios.base.targetPrice.toLocaleString("vi-VN")}\` | \`${scenarios.bear.targetPrice.toLocaleString("vi-VN")}\` |
| **Tỷ suất sinh lời ($R_i$)** | **+${scenarios.bull.returnPct}%** | **+${scenarios.base.returnPct}%** | **${scenarios.bear.returnPct}%** |
| **Max Drawdown dự kiến** | -${scenarios.bull.maxDrawdownPct}% | -${scenarios.base.maxDrawdownPct}% | -${scenarios.bear.maxDrawdownPct}% |
| **Điểm vô hiệu hóa (Invalidation)** | \`${scenarios.bull.invalidationPoint.toLocaleString("vi-VN")}\` | \`${scenarios.base.invalidationPoint.toLocaleString("vi-VN")}\` | \`${scenarios.bear.invalidationPoint.toLocaleString("vi-VN")}\` |

### Chi tiết Luận Điểm Từng Kịch Bản:

#### 🟢 Kịch bản 1: Bull Case (${(scenarios.bull.probability * 100).toFixed(0)}% xác suất)
- **Động lực tăng trưởng:** ${scenarios.bull.drivers.join("; ")}
- **Xúc tác định lượng (Catalysts):** ${scenarios.bull.catalysts.join("; ")}
- **Điều kiện vô hiệu hóa (Invalidation Condition):** ${scenarios.bull.invalidationCondition}
- **Hành động kích hoạt (Action Trigger):** ${scenarios.bull.actionableTrigger}

#### 🟡 Kịch bản 2: Base Case (${(scenarios.base.probability * 100).toFixed(0)}% xác suất - Kịch bản trọng tâm)
- **Động lực cơ sở:** ${scenarios.base.drivers.join("; ")}
- **Xúc tác định lượng:** ${scenarios.base.catalysts.join("; ")}
- **Điều kiện vô hiệu hóa:** ${scenarios.base.invalidationCondition}
- **Hành động kích hoạt:** ${scenarios.base.actionableTrigger}

#### 🔴 Kịch bản 3: Bear Case (${(scenarios.bear.probability * 100).toFixed(0)}% xác suất)
- **Rủi ro vi phạm / Thiên nga đen:** ${scenarios.bear.drivers.join("; ")}
- **Áp lực xúc tác tiêu cực:** ${scenarios.bear.catalysts.join("; ")}
- **Điều kiện vô hiệu hóa:** ${scenarios.bear.invalidationCondition}
- **Hành động kích hoạt:** ${scenarios.bear.actionableTrigger}

---

## 🧮 2. CÔNG THỨC TOÁN ĐỊNH LƯỢNG & BIÊN AN TOÀN

${formatScenarioKaTeX(report)}

---

## ⏱️ 3. MA TRẬN ĐA KHUNG THỜI GIAN (MULTI-TIMEFRAME INTEGRATION)

| Khung thời gian | Trọng tâm phân tích | Xu hướng (Bias) | Mốc kỹ thuật / Định giá | Kế hoạch thực thi |
| :--- | :--- | :---: | :--- | :--- |
| **Ngắn hạn (T+2.5)** | ${timeframeMatrix.shortTerm.focus} | \`${timeframeMatrix.shortTerm.bias}\` | Hỗ trợ: \`${timeframeMatrix.shortTerm.supportLevel.toLocaleString("vi-VN")}\`<br>Kháng cự: \`${timeframeMatrix.shortTerm.resistanceLevel.toLocaleString("vi-VN")}\`<br>Cắt lỗ: \`${timeframeMatrix.shortTerm.stopLossLevel.toLocaleString("vi-VN")}\` | ${timeframeMatrix.shortTerm.actionVi} |
| **Trung hạn (1-2 Quý)** | ${timeframeMatrix.mediumTerm.focus}<br>Chu kỳ: *${timeframeMatrix.mediumTerm.businessCyclePhase}* | \`${timeframeMatrix.mediumTerm.bias}\` | Target quý: \`${timeframeMatrix.mediumTerm.quarterlyTargetPrice.toLocaleString("vi-VN")}\` | Xúc tác: ${timeframeMatrix.mediumTerm.quarterlyCatalysts.join(", ")} |
| **Dài hạn (1-3 Năm)** | ${timeframeMatrix.longTerm.focus}<br>Lợi thế hào kinh tế (Moat): \`${timeframeMatrix.longTerm.moatRating}\` | \`${timeframeMatrix.longTerm.bias}\` | DCF Fair Value: \`${timeframeMatrix.longTerm.fairValueDCF.toLocaleString("vi-VN")}\` | Động lực dài hạn: ${timeframeMatrix.longTerm.structuralDrivers.join(", ")} |

> [!TIP]
> **Đồng thuận đa khung thời gian (Confluence Summary):**  
> ${timeframeMatrix.confluenceSummaryVi}

---

## 💼 4. QUẢN TRỊ DANH MỤC & PHÂN BỔ VỐN

- **Tỷ trọng Cổ phiếu:** \`${allocation.equityPct}%\` | **Tiền mặt / Tiết kiệm thanh khoản:** \`${allocation.cashPct}%\`
- **Chính sách Đòn bẩy (Margin):** ${allocation.marginAllowed ? `Cho phép (Tối đa ${allocation.maxLeverageRatio}x)` : "Tuyệt đối KHÔNG sử dụng Margin"}
- **Chỉ dẫn thực thi:** ${allocation.allocationNoteVi}

---
*Tự động trích xuất bởi Orca AI Multi-Scenario Engine © 2026 Orca-FA*`;
}

// ============================================================================
// DỮ LIỆU MẪU THỰC CHIẾN ĐIỂN HÌNH TẠI THỊ TRƯỜNG CHỨNG KHOÁN VIỆT NAM
// ============================================================================

/**
 * Kịch bản thực chiến 1: Cổ phiếu tăng trưởng tiêu biểu FPT (Tập đoàn FPT)
 */
export function getFptPracticalScenario(): MultiScenarioReport {
  return generateMultiScenarioReport({
    symbol: "FPT",
    currentPrice: 135000,
    asOfDate: "2026-11-11",
    bull: {
      probability: 0.25,
      targetPrice: 175000,
      drivers: [
        "Mảng AI & Bán dẫn tăng tốc đột biến qua quan hệ đối tác chiến lược Nvidia và mở rộng AI Factory",
        "Doanh thu ký mới chuyển đổi số toàn cầu (Mỹ, Nhật, APAC) tăng trưởng trên 35% YoY",
        "Khối giáo dục duy trì biên EBIT trên 30% với số lượng sinh viên nhập học vượt kế hoạch",
      ],
      catalysts: [
        "Ký kết hợp đồng Mega-deal giá trị > 100 triệu USD trong Q4",
        "Khánh thành AI Data Center thế hệ mới với công suất full 100%",
        "Khối ngoại mua ròng trở lại sau khi hết room ngoại hoặc phát hành chứng chỉ NVDR",
      ],
      invalidationPoint: 128000,
      invalidationCondition:
        "Giá đóng cửa thủng MA50 ngày tại 128,000 VND kèm thanh khoản bán chủ động vượt 1.5x trung bình 20 phiên.",
      actionableTrigger:
        "Gia tăng tỷ trọng tối đa khi vượt dứt khoát đỉnh lịch sử kèm Pocket Pivot volume, nâng trailing stop lên 132,000.",
      maxDrawdownPct: 5.2,
    },
    base: {
      probability: 0.55,
      targetPrice: 152000,
      drivers: [
        "Mảng CNTT nước ngoài duy trì tốc độ tăng trưởng ổn định 22-25% YoY",
        "Khối viễn thông đóng góp dòng tiền đều đặn từ Data Center và dịch vụ băng rộng FTTH",
        "Tỷ lệ ROE duy trì xuất sắc quanh ngưỡng 26-28%, P/E forward 2026 hợp lý ở mức 22-23x",
      ],
      catalysts: [
        "Kết quả kinh doanh quý tăng trưởng lợi nhuận sau thuế 22% đúng với dự báo của giới phân tích",
        "Tạm ứng cổ tức tiền mặt đợt 2 tỷ lệ 10% và thưởng cổ tức cổ phiếu",
      ],
      invalidationPoint: 124000,
      invalidationCondition:
        "Tăng trưởng doanh thu ký mới dưới 15% trong 2 quý liên tiếp hoặc thủng hỗ trợ cứng MA100 tại 124,000 VND.",
      actionableTrigger:
        "Giải ngân tích lũy từng phần khi cổ phiếu test lại vùng nền tích lũy 130,000 - 133,000 VND.",
      maxDrawdownPct: 8.5,
    },
    bear: {
      probability: 0.2,
      targetPrice: 118000,
      drivers: [
        "Kinh tế Mỹ và Nhật Bản suy thoái khiến các tập đoàn toàn cầu cắt giảm ngân sách IT công nghệ",
        "Đồng Yên Nhật (JPY) mất giá mạnh làm giảm biên lợi nhuận quy đổi của FPT Japan",
        "Chi phí đầu tư CAPEX cho hạ tầng AI và trung tâm dữ liệu bào mòn dòng tiền tự do ngắn hạn",
      ],
      catalysts: [
        "Đơn hàng ký mới tại thị trường Bắc Mỹ giảm liên tiếp 2 quý",
        "Khối ngoại bán ròng đột biến do rút vốn khỏi thị trường cận biên/mới nổi",
      ],
      invalidationPoint: 118000,
      invalidationCondition:
        "Thủng đường xu hướng trung hạn MA200 tại 120,000 VND, xác nhận mô hình phân phối 2 đỉnh.",
      actionableTrigger:
        "Thực hiện cắt lỗ dứt khoát nếu thủng 124,000 VND; tuyệt đối không trung bình giá xuống.",
      maxDrawdownPct: 18.0,
    },
    timeframeMatrix: {
      shortTerm: {
        timeframe: "T+2.5 / Ngắn hạn (1 - 10 phiên)",
        focus: "Vùng tích lũy độ nén quanh MA20, hấp thụ lượng hàng chốt lời T+2.5 từ nhịp vượt đỉnh",
        bias: "BULLISH",
        supportLevel: 132000,
        resistanceLevel: 140000,
        stopLossLevel: 127500,
        actionVi: "Canh gom ở nhịp võng về 132,000 - 133,500; chốt 1/3 vị thế lướt sóng nếu chạm 140,000.",
      },
      mediumTerm: {
        timeframe: "Trung hạn (1 - 2 Quý / Mùa BCTC)",
        focus: "Động lực từ mùa báo cáo tài chính Q4 và kế hoạch kinh doanh năm mới; mở rộng công suất AI",
        bias: "BULLISH",
        businessCyclePhase: "Tăng trưởng mở rộng (Expansion Phase)",
        quarterlyCatalysts: [
          "BCTC kiểm toán cả năm tăng trưởng LNST > 23%",
          "Ghi nhận doanh thu từ các hợp đồng AI Factory đầu tiên",
        ],
        quarterlyTargetPrice: 155000,
      },
      longTerm: {
        timeframe: "Dài hạn (1 - 3 Năm / Chu kỳ kinh tế)",
        focus: "Lợi thế Moat công nghệ thông tin số 1 Việt Nam, chi phí nhân sự kỹ sư cạnh tranh toàn cầu, ROE 27%",
        bias: "BULLISH",
        fairValueDCF: 168000,
        moatRating: "WIDE",
        structuralDrivers: [
          "Làn sóng toàn cầu hóa công nghệ phần mềm và dịch vụ bán dẫn chip AI",
          "Chuyển dịch cơ cấu doanh thu sang các mảng có giá trị biên gộp cao (AI, Automotive, Cloud)",
        ],
      },
      confluenceSummaryVi:
        "Cả 3 khung thời gian (Ngắn hạn - Trung hạn - Dài hạn) đều duy trì xu hướng Bullish đồng pha. Khuyến nghị tập trung chiến lược Mua tích lũy tại các nhịp rung lắc ngắn hạn.",
    },
  });
}

/**
 * Kịch bản thực chiến 2: Vĩ mô thị trường chung VN-Index (Mốc tham chiếu 1,280 điểm)
 */
export function getVnIndexMacroScenario(): MultiScenarioReport {
  return generateMultiScenarioReport({
    symbol: "VNINDEX",
    currentPrice: 1280,
    asOfDate: "2026-11-11",
    bull: {
      probability: 0.3,
      targetPrice: 1430,
      drivers: [
        "Hệ thống KRX chính thức golive mượt mà cho phép giao dịch trong ngày và mở đường triển khai CCP",
        "FTSE Russell chính thức nâng hạng Việt Nam lên nhóm thị trường mới nổi thứ cấp (Secondary Emerging)",
        "Tăng trưởng tín dụng toàn hệ thống ngân hàng đạt 15-16%, thanh khoản thị trường bùng nổ vượt 30,000 tỷ/phiên",
      ],
      catalysts: [
        "Dòng vốn ngoại ETF (VanEck, FTSE, Fubon) đảo chiều mua ròng ròng rã trên 15,000 tỷ VND",
        "NHNN duy trì lãi suất điều hành nới lỏng hỗ trợ các doanh nghiệp sản xuất và bất động sản phục hồi",
      ],
      invalidationPoint: 1245,
      invalidationCondition:
        "VN-Index đánh mất ngưỡng 1,245 điểm (MA50 tuần) kèm dòng tiền rút mạnh dưới 12,000 tỷ/phiên.",
      actionableTrigger:
        "Mở rộng tỷ trọng cổ phiếu lên 85-90%, tập trung nhóm dẫn dắt: Chứng khoán, Ngân hàng tư nhân và Công nghệ.",
      maxDrawdownPct: 4.0,
    },
    base: {
      probability: 0.5,
      targetPrice: 1340,
      drivers: [
        "Kinh tế vĩ mô phục hồi đều với GDP tăng trưởng 6.5 - 6.8%, lạm phát kiềm chế dưới 4.0%",
        "Kết quả kinh doanh toàn thị trường tăng trưởng EPS trung bình 14-16% YoY",
        "Định giá P/E VN-Index ở mức 13.5x - 14.2x, nằm trong vùng định giá hợp lý 10 năm qua",
      ],
      catalysts: [
        "Áp lực tỷ giá USD/VND hạ nhiệt khi FED duy trì chu kỳ giảm lãi suất cơ bản",
        "Các đợt thoái vốn nhà nước và IPO quy mô lớn được tái khởi động thành công",
      ],
      invalidationPoint: 1220,
      invalidationCondition:
        "Thủng đáy tích lũy 1,220 điểm, thanh khoản teo tóp kéo dài và P/E forward bị điều chỉnh hạ.",
      actionableTrigger:
        "Duy trì tỷ trọng cân bằng 60% cổ phiếu cơ bản tốt / 40% tiền mặt; chiến lược Mua tại hỗ trợ (1,260) - Bán tại cản (1,320-1,340).",
      maxDrawdownPct: 7.5,
    },
    bear: {
      probability: 0.2,
      targetPrice: 1180,
      drivers: [
        "Căng thẳng địa chính trị và chiến tranh thương mại bùng phát đẩy giá dầu và cước vận tải lên cao",
        "Tỷ giá VND chịu áp lực mất giá mạnh buộc NHNN phải phát hành tín phiếu hoặc tăng nhẹ lãi suất điều hành",
        "Thị trường bất động sản gặp trục trặc dòng tiền đáo hạn trái phiếu doanh nghiệp kéo theo nợ xấu ngân hàng tăng",
      ],
      catalysts: [
        "Khối ngoại tiếp tục bán ròng quyết liệt hơn 30,000 tỷ VND để hồi hương vốn về tài sản phi rủi ro USD",
        "Tăng trưởng lợi nhuận doanh nghiệp niêm yết rơi vào tình trạng trì trệ (< 5%)",
      ],
      invalidationPoint: 1180,
      invalidationCondition:
        "Thủng mốc tâm lý 1,200 điểm, kích hoạt làn sóng call margin chéo toàn diện trên các công ty chứng khoán.",
      actionableTrigger:
        "Kích hoạt cơ chế phòng vệ khẩn cấp: Hạ tỷ trọng cổ phiếu xuống dưới 20%, nâng tiền mặt lên 80-90% để bảo toàn vốn.",
      maxDrawdownPct: 15.0,
    },
    timeframeMatrix: {
      shortTerm: {
        timeframe: "T+2.5 / Ngắn hạn (1 - 10 phiên)",
        focus: "Dao động tích lũy trong biên độ 1,265 - 1,295 điểm; chú ý nhịp chốt lời của các phiên bùng nổ T+2.5",
        bias: "NEUTRAL",
        supportLevel: 1260,
        resistanceLevel: 1300,
        stopLossLevel: 1245,
        actionVi: "Giao dịch thận trọng, không mua đuổi khi chỉ số tiệm cận cản 1,300; ưu tiên chốt lời từng phần.",
      },
      mediumTerm: {
        timeframe: "Trung hạn (1 - 2 Quý / Mùa BCTC)",
        focus: "Sự phân hóa sâu sắc giữa các ngành; dòng tiền tìm đến các nhóm có EPS quý tăng tốc đột biến",
        bias: "BULLISH",
        businessCyclePhase: "Phục hồi sang Tăng trưởng (Early-Mid Cycle)",
        quarterlyCatalysts: [
          "Mùa công bố BCTC năm với bức tranh tăng trưởng phân hóa",
          "Thông tin tiến độ kiểm thử hệ thống giao dịch mới",
        ],
        quarterlyTargetPrice: 1350,
      },
      longTerm: {
        timeframe: "Dài hạn (1 - 3 Năm / Chu kỳ kinh tế)",
        focus: "Việt Nam hưởng lợi từ xu thế FDI dịch chuyển chuỗi cung ứng, quy mô dân số vàng, tầng lớp trung lưu gia tăng",
        bias: "BULLISH",
        fairValueDCF: 1480,
        moatRating: "WIDE",
        structuralDrivers: [
          "Tăng trưởng kinh tế vĩ mô ổn định 6.5 - 7.0%/năm",
          "Lộ trình nâng hạng thị trường Emerging Markets thu hút hàng tỷ USD vốn thụ động và chủ động",
        ],
      },
      confluenceSummaryVi:
        "Ngắn hạn thị trường phân hóa giằng co trong hộp tích lũy (Neutral), tuy nhiên Trung và Dài hạn xu hướng Tăng trưởng (Bullish) vẫn đóng vai trò chủ đạo. Chiến lược phòng ngừa rủi ro biến động ngắn hạn bằng cách quản trị tỷ trọng tiền mặt hợp lý.",
    },
  });
}
