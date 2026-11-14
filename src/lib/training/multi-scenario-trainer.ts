/**
 * ORCA-FA: MULTI-SCENARIO & MULTI-TIMEFRAME TRAINING & RED-TEAMING HARNESS
 *
 * Hệ thống huấn luyện, thẩm định định lượng và kiểm thử đối kháng (Red-Teaming)
 * cho phân tích Đa kịch bản (Bull / Base / Bear) & Đa khung thời gian (T+2.5 / Trung hạn / Dài hạn).
 *
 * Nhiệm vụ cốt lõi:
 * 1. Định nghĩa bộ kịch bản huấn luyện đối kháng & stress-test đa khung thời gian:
 *    - Kẹt sàn & rút thanh khoản T+2.5 (T+2.5 floor-lock & liquidity drain)
 *    - Điểm uốn lợi nhuận BCTC theo quý (Quarterly BCTC earnings inflection)
 *    - Chu kỳ vĩ mô 1-3 năm & thắt chặt tín phiếu NHNN (Long-term 1-3Y macro/SBV tightening cycle)
 *    - Bẫy tổng xác suất != 1.0 (Probability sum traps)
 *    - Bẫy lệch kỳ vọng / bất đối xứng Bull-Bear mỏng (Optimistic skew / asymmetry traps)
 *    - Bẫy thiếu mốc vô hiệu hóa xác định (Missing invalidation point traps)
 * 2. Kiểm định Payload kịch bản qua auditMultiScenarioModel() (CRO Critic) & đối soát toán học độc lập.
 * 3. Đánh giá câu trả lời trực tiếp từ executeContextualAiPipeline() trên các truy vấn đa kịch bản.
 * 4. Xác thực & chấm điểm dữ liệu huấn luyện SFT JSON theo chuẩn CRO + MTF 3 khung thời gian.
 * 5. Tính toán Training Readiness Score (0-100), phân rã độ chính xác theo từng khung thời gian
 *    và đề xuất lộ trình huấn luyện bổ sung (Curriculum Recommendations).
 */

import fs from "node:fs";
import path from "node:path";
import {
  auditMultiScenarioModel,
  type ScenarioAuditIssue,
  type ScenarioAuditReport,
  type ScenarioInputPayload as CriticScenarioInputPayload,
  type ScenarioLabel,
  type StrictScenario,
} from "../engines/multi-scenario-critic";
import {
  type MultiScenarioReport,
} from "../engines/multi-scenario-engine";
import {
  executeContextualAiPipeline,
  type SnapshotFacts,
} from "../engines/orca-contextual-reasoning-engine";

export type TimeframeHorizon =
  | "short_term_t25"
  | "medium_term_quarterly"
  | "long_term_cycle";

export type TrapCategory =
  | "t25_floor_lock_liquidity"
  | "quarterly_bctc_inflection"
  | "long_term_macro_sbv"
  | "probability_sum_trap"
  | "optimistic_skew_asymmetry_trap"
  | "missing_invalidation_trap";

export interface MultiScenarioTrainingCase {
  id: string;
  title: string;
  timeframe: TimeframeHorizon;
  trapCategory: TrapCategory;
  symbol: string;
  question: string;
  facts?: SnapshotFacts;
  adversarialTrap: string;
  expectedAuditVerdict: "APPROVED_FOR_EXECUTION" | "REJECTED_UNSAFE" | "NEEDS_REVISION";
  expectedIssueCodes: ScenarioAuditIssue["code"][];
  candidatePayload: CriticScenarioInputPayload;
  expectedTimeframes: TimeframeHorizon[];
  expectedCriteria: string[];
}

export interface SftScenarioSample {
  id: string;
  category: string;
  topic: string;
  question: string;
  systemPrompt?: string;
  reasoningCoT?: string[];
  goldAnswer: string;
  structuredScenarioPayload?: CriticScenarioInputPayload;
  expectedMetrics?: {
    totalProbability?: number;
    expectedReturnPct?: number;
    scenarioVolatilityPct?: number;
    compositeRrr?: number;
    bullBearAsymmetryRatio?: number;
    t2LiquidityHaircutReturnPct?: number;
    croVerdict?: ScenarioAuditReport["verdict"];
    croAuditScore?: number;
    croPassed?: boolean;
  };
  references?: string[];
}

export interface MathInvariantCheckResult {
  probabilitySumValid: boolean;
  totalProbability: number;
  allProbabilitiesInRange: boolean;
  expectedReturnComputed: number;
  expectedReturnMatchesAudit: boolean;
  scenarioReturnConsistencyValid: boolean;
  scenarioReturnDiscrepancies: string[];
  hasAllThreeScenarios: boolean;
  deterministicInvalidationValid: boolean;
  bearContingencyPresent: boolean;
}

export interface PayloadEvaluationResult {
  symbol: string;
  auditReport: ScenarioAuditReport;
  mathChecks: MathInvariantCheckResult;
  score: number;
  passedExpectation: boolean;
  diagnostics: string[];
}

export interface SftValidationResult {
  id: string;
  category: string;
  topic: string;
  valid: boolean;
  score: number;
  timeframeCoverage: Record<TimeframeHorizon, boolean>;
  hasAllThreeTimeframes: boolean;
  hasKatexOrMath: boolean;
  hasInvalidationLevels: boolean;
  hasBearContingency: boolean;
  payloadEval?: PayloadEvaluationResult;
  failures: string[];
  warnings: string[];
}

export interface AdversarialCaseEvalResult {
  caseId: string;
  title: string;
  timeframe: TimeframeHorizon;
  trapCategory: TrapCategory;
  expectedAuditVerdict: ScenarioAuditReport["verdict"];
  actualAuditVerdict: ScenarioAuditReport["verdict"];
  expectedIssueCodes: ScenarioAuditIssue["code"][];
  detectedIssueCodes: ScenarioAuditIssue["code"][];
  missingExpectedIssues: ScenarioAuditIssue["code"][];
  score: number;
  passed: boolean;
  payloadEval: PayloadEvaluationResult;
  diagnostics: string[];
}

export interface LivePipelineEvalResult {
  caseId: string;
  symbol: string;
  timeframe: TimeframeHorizon;
  trapCategory: TrapCategory;
  question: string;
  detectedDomain: string;
  answerLength: number;
  score: number;
  passed: boolean;
  timeframeCoverage: Record<TimeframeHorizon, boolean>;
  hasThreeScenarios: boolean;
  hasQuantMath: boolean;
  hasInvalidationPoint: boolean;
  hasBearContingency: boolean;
  passedCriteria: string[];
  missedCriteria: string[];
  structuredAuditPassed?: boolean;
  diagnostics: string[];
}

export interface TimeframeAccuracyMetrics {
  timeframe: TimeframeHorizon;
  total: number;
  passed: number;
  accuracyPct: number;
  averageScore: number;
}

export interface FailureDiagnostic {
  source: "adversarial_payload" | "sft_dataset" | "live_pipeline";
  id: string;
  timeframe?: TimeframeHorizon;
  trapCategory?: TrapCategory;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  reason: string;
}

export interface CurriculumRecommendation {
  targetArea: string;
  priority: "P0" | "P1" | "P2";
  currentAccuracyPct: number;
  actionVi: string;
  suggestedDrillIds: string[];
}

export interface TrainingReadinessReport {
  timestamp: number;
  durationMs: number;
  readinessScore: number;
  readinessTier: "PRODUCTION_READY" | "CALIBRATION_NEEDED" | "RETRAINING_REQUIRED";
  summary: {
    totalAdversarialCases: number;
    passedAdversarialCases: number;
    adversarialAccuracyPct: number;
    totalSftSamples: number;
    passedSftSamples: number;
    sftValidityPct: number;
    totalLiveCases: number;
    passedLiveCases: number;
    livePipelineAccuracyPct: number;
  };
  timeframeBreakdown: Record<TimeframeHorizon, TimeframeAccuracyMetrics>;
  trapCategoryBreakdown: Record<
    TrapCategory,
    { total: number; passed: number; accuracyPct: number }
  >;
  adversarialResults: AdversarialCaseEvalResult[];
  sftResults: SftValidationResult[];
  liveResults: LivePipelineEvalResult[];
  failureDiagnostics: FailureDiagnostic[];
  curriculumRecommendations: CurriculumRecommendation[];
}

export interface TrainerRunOptions {
  sftDatasetPath?: string;
  sftSamples?: SftScenarioSample[];
  includeLivePipeline?: boolean;
  cases?: MultiScenarioTrainingCase[];
}

const PROBABILITY_EPSILON = 0.001;
const EXPECTED_RETURN_EPSILON = 0.05;
const SCENARIO_RETURN_TOLERANCE_PCT = 0.75;

const DEFAULT_SFT_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), "src/lib/data/training/orca-multi-scenario-sft.json"),
  path.resolve(process.cwd(), "src/lib/data/training/orca-qa-gold-sft.json"),
];

/**
 * Bộ kịch bản huấn luyện đối kháng & stress-test đa khung thời gian (9 tình huống chuẩn hóa)
 */
export const MULTI_SCENARIO_TRAINING_CASES: MultiScenarioTrainingCase[] = [
  {
    id: "MS_T25_TRAP_01",
    title: "Bẫy kẹt sàn & rút thanh khoản T+2.5 trên cổ phiếu beta cao (DIG)",
    timeframe: "short_term_t25",
    trapCategory: "t25_floor_lock_liquidity",
    symbol: "DIG",
    question:
      "Phân tích đa kịch bản Bull Base Bear và đa khung thời gian (ngắn hạn T+2.5, trung hạn, dài hạn) cho cổ phiếu bất động sản đầu cơ DIG khi vừa có phiên xả sàn mất thanh khoản.",
    adversarialTrap:
      "Bear Case tô hồng (-4.5%) và thiếu kế hoạch thoát kẹt sàn T+2.5 (ATO / hedging VN30F).",
    expectedAuditVerdict: "REJECTED_UNSAFE",
    expectedIssueCodes: ["ERR_BEAR_SUPERFICIAL_DRAWDOWN", "ERR_T2_LIQUIDITY_UNMITIGATED"],
    candidatePayload: {
      symbol: "DIG",
      currentPrice: 22_000,
      averageVolume20d: 9_500_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "NEUTRAL", usdVndPressure: "MODERATE" },
      scenarios: [
        {
          label: "BULL",
          name: "Hồi phục kỹ thuật test đỉnh cũ",
          probability: 0.45,
          targetPrice: 26_400,
          expectedReturnPct: 20.0,
          timeHorizonWeeks: 4,
          invalidation: {
            priceLevel: 20_500,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng đáy cây nến breakout",
          },
          actionProtocol: {
            allocationPct: 40,
            entryCondition: "Vượt 23.000 kèm vol > 12M",
            stopLossPrice: 20_500,
            takeProfitLevels: [25_000, 26_400],
          },
        },
        {
          label: "BASE",
          name: "Đi ngang hấp thụ cung T+2.5",
          probability: 0.35,
          targetPrice: 22_660,
          expectedReturnPct: 3.0,
          timeHorizonWeeks: 3,
          invalidation: {
            priceLevel: 20_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Mất nền giá hỗ trợ MA20",
          },
          actionProtocol: {
            allocationPct: 20,
            entryCondition: "Mua thăm dò vùng 21.200",
            stopLossPrice: 20_000,
            takeProfitLevels: [23_500],
          },
        },
        {
          label: "BEAR",
          name: "Điều chỉnh nhẹ không đáng kể",
          probability: 0.20,
          targetPrice: 21_010,
          expectedReturnPct: -4.5, // Bẫy tô hồng trên biên sàn HOSE 7%
          timeHorizonWeeks: 2,
          invalidation: {
            priceLevel: 23_800,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt lại kháng cự gần nhất",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không mở mua",
            stopLossPrice: 20_500,
            takeProfitLevels: [],
          },
          // Thiếu hoàn toàn bearContingency
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "3 kịch bản Bull/Base/Bear kèm xác suất tổng 100%",
      "Kế hoạch xử lý kẹt thanh khoản T+2.5 và lệnh ATO",
      "Mốc cắt lỗ / điểm vô hiệu hóa số học cụ thể",
      "Bao phủ đủ 3 khung thời gian ngắn hạn T+2.5, trung hạn, dài hạn",
    ],
  },
  {
    id: "MS_T25_GOLD_02",
    title: "Stress-test thanh khoản T+2.5 đạt chuẩn cho nhóm Chứng khoán beta cao (SSI)",
    timeframe: "short_term_t25",
    trapCategory: "t25_floor_lock_liquidity",
    symbol: "SSI",
    question:
      "Lập ma trận đa kịch bản và đa khung thời gian (T+2.5, trung hạn BCTC, dài hạn) cho cổ phiếu SSI với phương án phòng vệ kẹt sàn T+2.5.",
    adversarialTrap:
      "Kiểm định kịch bản chuẩn phải giữ được E[R] dương và t2LiquidityHaircutReturnPct khả thi khi tính trượt giá sàn.",
    expectedAuditVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
    candidatePayload: {
      symbol: "SSI",
      currentPrice: 34_000,
      averageVolume20d: 18_000_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "EASING", usdVndPressure: "LOW" },
      scenarios: [
        {
          label: "BULL",
          name: "Sóng KRX & nâng hạng FTSE đẩy thanh khoản vượt 30 nghìn tỷ",
          probability: 0.40,
          targetPrice: 42_500,
          expectedReturnPct: 25.0,
          timeHorizonWeeks: 8,
          invalidation: {
            priceLevel: 31_800,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Gãy hỗ trợ MA50 kèm thanh khoản bán > 1.5x trung bình 20 phiên",
          },
          actionProtocol: {
            allocationPct: 50,
            entryCondition: "Breakout 35.000 với volume > 22M",
            stopLossPrice: 31_800,
            takeProfitLevels: [39_000, 42_500],
          },
        },
        {
          label: "BASE",
          name: "Tích lũy trong hộp 33.000 - 36.500 chờ KQKD quý",
          probability: 0.40,
          targetPrice: 36_040,
          expectedReturnPct: 6.0,
          timeHorizonWeeks: 6,
          invalidation: {
            priceLevel: 31_200,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng biên dưới kênh tích lũy",
          },
          actionProtocol: {
            allocationPct: 30,
            entryCondition: "Giải ngân từng phần vùng 33.000 - 33.800",
            stopLossPrice: 31_500,
            takeProfitLevels: [36_500],
          },
        },
        {
          label: "BEAR",
          name: "Rút margin chéo toàn thị trường do cú sốc tỷ giá",
          probability: 0.20,
          targetPrice: 27_880,
          expectedReturnPct: -18.0,
          timeHorizonWeeks: 3,
          invalidation: {
            priceLevel: 36_500,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh ngắn hạn phủ nhận kịch bản phân phối",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Đóng toàn bộ vị thế margin, giữ tiền mặt",
            stopLossPrice: 31_800,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "HIGH",
            estimatedSlippagePct: 9.5,
            liquidityDrainExitPlan:
              "Hạ 100% margin ngay khi thủng 32.000; nếu trắng bảng bên mua phiên T+1, kê lệnh bán ATO phiên T+2 khi hàng về tài khoản.",
            hedgingStrategy: "Mở vị thế Short VN30F1M tỷ lệ 0.6x beta để phòng vệ NAV.",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "3 kịch bản Bull/Base/Bear kèm E[R] và tỷ lệ RRR",
      "Phương án xử lý thanh khoản T+2.5 khi biến động mạnh",
      "Mốc vô hiệu hóa & cắt lỗ định lượng rõ ràng",
      "Bao phủ ngắn hạn T+2.5, trung hạn 1-2 quý, dài hạn 1-3 năm",
    ],
  },
  {
    id: "MS_QTR_INFLECT_01",
    title: "Điểm uốn lợi nhuận BCTC Quý cho cổ phiếu chu kỳ Thép (HPG)",
    timeframe: "medium_term_quarterly",
    trapCategory: "quarterly_bctc_inflection",
    symbol: "HPG",
    question:
      "Đánh giá đa kịch bản và đa khung thời gian (ngắn hạn T+2.5, trung hạn BCTC quý, dài hạn 1-3 năm) cho cổ phiếu HPG trước mùa báo cáo tài chính và tiến độ Dung Quất 2.",
    adversarialTrap:
      "Phải định lượng chính xác điểm uốn biên lợi nhuận gộp BCTC quý, tránh bẫy P/E chu kỳ và có sẵn Bear contingency.",
    expectedAuditVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
    candidatePayload: {
      symbol: "HPG",
      currentPrice: 27_000,
      averageVolume20d: 24_000_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "NEUTRAL", usdVndPressure: "MODERATE" },
      scenarios: [
        {
          label: "BULL",
          name: "Dung Quất 2 chạy thương mại + Giá HRC hồi phục đẩy LNST quý tăng > 40% YoY",
          probability: 0.35,
          targetPrice: 33_480,
          expectedReturnPct: 24.0,
          timeHorizonWeeks: 14,
          invalidation: {
            priceLevel: 25_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Đóng cửa thủng nền giá tích lũy MA100 tại 25.000 VND",
          },
          actionProtocol: {
            allocationPct: 50,
            entryCondition: "Mua khi giá vượt 27.800 sau BCTC quý xác nhận biên gộp > 14%",
            stopLossPrice: 25_000,
            takeProfitLevels: [31_000, 33_500],
          },
        },
        {
          label: "BASE",
          name: "Sản lượng nội địa ổn định, LNST quý tăng 12-15% YoY",
          probability: 0.45,
          targetPrice: 29_160,
          expectedReturnPct: 8.0,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 24_600,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng đáy tích lũy 24.600 VND",
          },
          actionProtocol: {
            allocationPct: 35,
            entryCondition: "Tích lũy từng phần vùng 25.800 - 26.800",
            stopLossPrice: 24_800,
            takeProfitLevels: [29_200],
          },
        },
        {
          label: "BEAR",
          name: "Thép Trung Quốc bán phá giá + biên gộp BCTC quý co hẹp dưới 9%",
          probability: 0.20,
          targetPrice: 22_140,
          expectedReturnPct: -18.0,
          timeHorizonWeeks: 10,
          invalidation: {
            priceLevel: 29_500,
            condition: "BREAK_ABOVE",
            timeframe: "WEEKLY_CLOSE",
            rationale: "Đóng nến tuần vượt 29.500 kèm khối lượng ngoại mua ròng",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Đứng ngoài quan sát, chờ P/B chiết khấu về dưới 1.2x",
            stopLossPrice: 25_000,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "MEDIUM",
            estimatedSlippagePct: 7.0,
            liquidityDrainExitPlan:
              "Bán dứt khoát 50% khi thủng 25.200 trong phiên; phần còn lại đặt ATO nếu phiên kế tiếp suy yếu.",
            hedgingStrategy: "Giảm beta danh mục sang nhóm phòng thủ hoặc Short VN30F.",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "Phân tích 3 kịch bản Bull/Base/Bear với E[R] chính xác",
      "Đề cập động lực BCTC quý / biên lợi nhuận / chu kỳ ngành thép",
      "Mốc cắt lỗ và điểm vô hiệu hóa cụ thể",
      "Ma trận đa khung thời gian T+2.5, trung hạn quý, dài hạn 1-3 năm",
    ],
  },
  {
    id: "MS_QTR_TRAP_02",
    title: "Bẫy kỳ vọng âm E[R] <= 0 trước rủi ro suy giảm BCTC quý (NKG)",
    timeframe: "medium_term_quarterly",
    trapCategory: "quarterly_bctc_inflection",
    symbol: "NKG",
    question:
      "Phân tích đa kịch bản rủi ro cho cổ phiếu chu kỳ biên mỏng khi BCTC quý có dấu hiệu suy giảm biên gộp và hàng tồn kho giá cao.",
    adversarialTrap:
      "Bẫy tô hồng E[R] âm: Xác suất Bear cao (45%) với mức giảm -26% kéo E[R] xuống âm dù Bull tăng +22%.",
    expectedAuditVerdict: "REJECTED_UNSAFE",
    expectedIssueCodes: ["ERR_NEGATIVE_EXPECTED_RETURN", "ERR_UNFAVORABLE_ASYMMETRY"],
    candidatePayload: {
      symbol: "NKG",
      currentPrice: 20_000,
      averageVolume20d: 7_000_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "TIGHTENING_BILLS", usdVndPressure: "HIGH" },
      scenarios: [
        {
          label: "BULL",
          name: "Giá HRC bật tăng bất ngờ giúp hoàn nhập dự phòng tồn kho",
          probability: 0.25,
          targetPrice: 24_400,
          expectedReturnPct: 22.0,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 18_500,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng đáy ngắn hạn 18.500",
          },
          actionProtocol: {
            allocationPct: 20,
            entryCondition: "Chỉ mở mua khi có xác nhận BCTC hoàn nhập dự phòng",
            stopLossPrice: 18_500,
            takeProfitLevels: [23_500],
          },
        },
        {
          label: "BASE",
          name: "Đi ngang biên độ hẹp, lợi nhuận quý đi ngang quanh hòa vốn",
          probability: 0.30,
          targetPrice: 20_000,
          expectedReturnPct: 0.0,
          timeHorizonWeeks: 10,
          invalidation: {
            priceLevel: 18_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Mất vùng hỗ trợ tâm lý 18.000",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Quan sát, không giải ngân",
            stopLossPrice: 18_000,
            takeProfitLevels: [],
          },
        },
        {
          label: "BEAR",
          name: "Trích lập dự phòng giảm giá hàng tồn kho gây lỗ ròng BCTC quý",
          probability: 0.45,
          targetPrice: 14_800,
          expectedReturnPct: -26.0,
          timeHorizonWeeks: 8,
          invalidation: {
            priceLevel: 21_800,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh phục hồi 21.800",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Cấm mua mới",
            stopLossPrice: 18_500,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "HIGH",
            estimatedSlippagePct: 12.0,
            liquidityDrainExitPlan: "Thoát dứt khoát bằng lệnh ATO khi thủng 18.500",
            hedgingStrategy: "Giữ tiền mặt 85%+ và phòng vệ VN30F nếu có danh mục cổ phiếu khác",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "Chỉ ra kỳ vọng lợi nhuận hoặc rủi ro Bear áp đảo",
      "Khuyến nghị phòng thủ / giữ tiền mặt / không mua đuổi",
      "Có mốc cắt lỗ hoặc vô hiệu hóa rõ ràng",
    ],
  },
  {
    id: "MS_MACRO_SBV_01",
    title: "Chu kỳ vĩ mô 1-3 năm & Stress Test SBV hút tín phiếu + áp lực tỷ giá USD/VND (VNINDEX)",
    timeframe: "long_term_cycle",
    trapCategory: "long_term_macro_sbv",
    symbol: "VNINDEX",
    question:
      "Phân tích đa kịch bản VN-Index đa khung thời gian (T+2.5, trung hạn 1-2 quý, dài hạn 1-3 năm) trong bối cảnh SBV hút ròng tín phiếu kiểm soát tỷ giá USD/VND.",
    adversarialTrap:
      "Bắt buộc cân bằng rủi ro thắt chặt thanh khoản ngắn-trung hạn với định giá chu kỳ dài hạn 1-3 năm của VN-Index.",
    expectedAuditVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
    candidatePayload: {
      symbol: "VNINDEX",
      currentPrice: 1_260,
      averageVolume20d: 750_000_000,
      marketContext: {
        exchange: "HOSE",
        sbvMonetaryStance: "TIGHTENING_BILLS",
        usdVndPressure: "HIGH",
      },
      scenarios: [
        {
          label: "BULL",
          name: "Áp lực tỷ giá hạ nhiệt nhanh, nâng hạng FTSE & chu kỳ FDI 1-3Y bùng nổ",
          probability: 0.30,
          targetPrice: 1_450,
          expectedReturnPct: 15.08,
          timeHorizonWeeks: 52,
          invalidation: {
            priceLevel: 1_210,
            condition: "BREAK_BELOW",
            timeframe: "WEEKLY_CLOSE",
            rationale: "Đóng nến tuần thủng MA200 tuần tại 1.210 điểm",
          },
          actionProtocol: {
            allocationPct: 75,
            entryCondition: "Gia tăng tỷ trọng khi VN-Index vượt 1.300 với thanh khoản > 25 nghìn tỷ/phiên",
            stopLossPrice: 1_210,
            takeProfitLevels: [1_380, 1_450],
          },
        },
        {
          label: "BASE",
          name: "SBV hút tín phiếu điều tiết ngắn hạn, EPS toàn thị trường tăng 14% trong chu kỳ mới",
          probability: 0.50,
          targetPrice: 1_335,
          expectedReturnPct: 5.95,
          timeHorizonWeeks: 36,
          invalidation: {
            priceLevel: 1_190,
            condition: "BREAK_BELOW",
            timeframe: "WEEKLY_CLOSE",
            rationale: "Thủng đáy trung hạn 1.190 điểm",
          },
          actionProtocol: {
            allocationPct: 55,
            entryCondition: "Duy trì 55% cổ phiếu đầu ngành / 45% tiền mặt, tích lũy tại vùng 1.220 - 1.245",
            stopLossPrice: 1_200,
            takeProfitLevels: [1_335],
          },
        },
        {
          label: "BEAR",
          name: "SBV buộc phải tăng lãi suất điều hành nếu tỷ giá vượt ngưỡng kiểm soát",
          probability: 0.20,
          targetPrice: 1_080,
          expectedReturnPct: -14.29,
          timeHorizonWeeks: 24,
          invalidation: {
            priceLevel: 1_315,
            condition: "BREAK_ABOVE",
            timeframe: "WEEKLY_CLOSE",
            rationale: "Chỉ số vượt 1.315 kèm khối ngoại dừng bán ròng",
          },
          actionProtocol: {
            allocationPct: 15,
            entryCondition: "Thu hẹp danh mục cổ phiếu xuống tối đa 15%, giữ 85% tiền mặt/tiền gửi",
            stopLossPrice: 1_210,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "MEDIUM",
            estimatedSlippagePct: 6.5,
            liquidityDrainExitPlan:
              "Hạ toàn bộ margin khi VN-Index mất mốc 1.220; bán ưu tiên các mã beta cao ở nhịp hồi kỹ thuật hoặc ATO.",
            hedgingStrategy: "Mở hợp đồng Short VN30F phòng vệ danh mục cơ sở tỷ lệ 0.5x - 0.8x.",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "3 kịch bản Bull/Base/Bear với xác suất tổng 100%",
      "Đánh giá tác động tín phiếu SBV / tỷ giá USD/VND và chu kỳ dài hạn 1-3 năm",
      "Phân bổ tỷ trọng cổ phiếu / tiền mặt rõ ràng",
      "Bao phủ đủ 3 khung thời gian ngắn hạn T+2.5, trung hạn, dài hạn",
    ],
  },
  {
    id: "MS_MACRO_FPT_02",
    title: "Chu kỳ tăng trưởng dài hạn 1-3Y & đồng thuận MTF cho cổ phiếu đầu ngành (FPT)",
    timeframe: "long_term_cycle",
    trapCategory: "long_term_macro_sbv",
    symbol: "FPT",
    question:
      "Xây dựng chiến lược đa kịch bản Bull Base Bear và đa khung thời gian (T+2.5, trung hạn, dài hạn 1-3 năm) cho cổ phiếu FPT.",
    adversarialTrap:
      "Kiểm tra đồng thuận đa khung thời gian và tính nhất quán số học giữa E[R], RRR và invalidation point.",
    expectedAuditVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
    candidatePayload: {
      symbol: "FPT",
      currentPrice: 135_000,
      averageVolume20d: 3_800_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "NEUTRAL", usdVndPressure: "MODERATE" },
      scenarios: [
        {
          label: "BULL",
          name: "AI Factory & hợp đồng chuyển đổi số toàn cầu bứt phá > 35% YoY",
          probability: 0.25,
          targetPrice: 175_000,
          expectedReturnPct: 29.63,
          timeHorizonWeeks: 52,
          invalidation: {
            priceLevel: 128_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Đóng nến ngày thủng MA50 tại 128.000 kèm vol > 1.5x trung bình",
          },
          actionProtocol: {
            allocationPct: 60,
            entryCondition: "Gia tăng khi vượt đỉnh lịch sử kèm Pocket Pivot",
            stopLossPrice: 128_000,
            takeProfitLevels: [155_000, 175_000],
          },
        },
        {
          label: "BASE",
          name: "CNTT nước ngoài tăng trưởng ổn định 22-25% YoY, ROE 27%",
          probability: 0.55,
          targetPrice: 152_000,
          expectedReturnPct: 12.59,
          timeHorizonWeeks: 26,
          invalidation: {
            priceLevel: 124_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA100 tại 124.000 VND",
          },
          actionProtocol: {
            allocationPct: 45,
            entryCondition: "Tích lũy từng phần vùng nền 130.000 - 133.500",
            stopLossPrice: 124_000,
            takeProfitLevels: [152_000],
          },
        },
        {
          label: "BEAR",
          name: "Suy thoái IT toàn cầu & JPY mất giá bào mòn biên lợi nhuận",
          probability: 0.20,
          targetPrice: 118_000,
          expectedReturnPct: -12.59,
          timeHorizonWeeks: 16,
          invalidation: {
            priceLevel: 142_000,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh 142.000 kèm dòng tiền ngoại mua ròng",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không dùng margin, chờ chiết khấu sâu về vùng định giá DCF an toàn",
            stopLossPrice: 124_000,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "LOW",
            estimatedSlippagePct: 5.0,
            liquidityDrainExitPlan:
              "Cắt giảm tỷ trọng chủ động nếu thủng 124.000; đặt lệnh ưu tiên phiên sáng T+2 nếu biến động diện rộng.",
            hedgingStrategy: "Phòng vệ danh mục bằng hợp đồng Short VN30F khi thị trường thủng hỗ trợ tuần.",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "3 kịch bản Bull/Base/Bear kèm E[R] và tỷ lệ RRR",
      "Động lực dài hạn AI / CNTT nước ngoài / lợi thế cạnh tranh Moat",
      "Ma trận đa khung thời gian T+2.5, trung hạn, dài hạn",
      "Mốc vô hiệu hóa & phòng vệ Bear rõ ràng",
    ],
  },
  {
    id: "MS_PROB_TRAP_01",
    title: "Bẫy tổng xác suất Bull/Base/Bear != 100% (125% Probability Sum Trap)",
    timeframe: "medium_term_quarterly",
    trapCategory: "probability_sum_trap",
    symbol: "VCB",
    question:
      "Kiểm tra mô hình đa kịch bản VCB nếu gán xác suất Bull 50%, Base 45%, Bear 30% (tổng 125%) có hợp lệ không?",
    adversarialTrap:
      "Gán xác suất tùy tiện tổng 1.25 (125%) vi phạm tiên đề xác suất sum(p_i) = 1.0.",
    expectedAuditVerdict: "REJECTED_UNSAFE",
    expectedIssueCodes: ["ERR_PROBABILITY_SUM"],
    candidatePayload: {
      symbol: "VCB",
      currentPrice: 92_000,
      averageVolume20d: 1_800_000,
      marketContext: { exchange: "HOSE" },
      scenarios: [
        {
          label: "BULL",
          name: "Tăng trưởng tín dụng vượt 16% và hoàn nhập trích lập",
          probability: 0.50,
          targetPrice: 108_000,
          expectedReturnPct: 17.39,
          timeHorizonWeeks: 16,
          invalidation: {
            priceLevel: 87_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA50",
          },
          actionProtocol: {
            allocationPct: 50,
            entryCondition: "Mua vùng 90.000 - 92.000",
            stopLossPrice: 87_000,
            takeProfitLevels: [102_000, 108_000],
          },
        },
        {
          label: "BASE",
          name: "NIM ổn định, lợi nhuận tăng 12%",
          probability: 0.45,
          targetPrice: 98_000,
          expectedReturnPct: 6.52,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 86_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Mất nền tích lũy",
          },
          actionProtocol: {
            allocationPct: 30,
            entryCondition: "Tích lũy quanh 90.000",
            stopLossPrice: 86_000,
            takeProfitLevels: [98_000],
          },
        },
        {
          label: "BEAR",
          name: "Nợ xấu bất động sản tăng kéo giảm lợi nhuận",
          probability: 0.30, // 0.50 + 0.45 + 0.30 = 1.25 -> VI PHẠM
          targetPrice: 78_000,
          expectedReturnPct: -15.22,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 99_000,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh 99.000",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không mua",
            stopLossPrice: 87_000,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "LOW",
            estimatedSlippagePct: 5.0,
            liquidityDrainExitPlan: "Bán hạ tỷ trọng chủ động khi thủng 87.000",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "Tổng xác suất 3 kịch bản phải chuẩn hóa về đúng 100% (1.0)",
      "Không chấp nhận tổng xác suất 125% khi tính E[R]",
      "Có đủ 3 kịch bản và ma trận đa khung thời gian",
    ],
  },
  {
    id: "MS_SKEW_TRAP_01",
    title: "Bẫy lệch kỳ vọng & bất đối xứng Bull/Bear mỏng (Optimistic Skew Trap)",
    timeframe: "short_term_t25",
    trapCategory: "optimistic_skew_asymmetry_trap",
    symbol: "MWG",
    question:
      "Đánh giá đa kịch bản Bull/Base/Bear và đa khung thời gian cho cổ phiếu MWG khi biên tăng Bull quá mỏng so với rủi ro Bear (tỷ lệ bất đối xứng Bull/Bear dưới 1.3x) nhưng vẫn muốn giải ngân.",
    adversarialTrap:
      "Bất đối xứng Bull/Bear dưới 1.30x (0.83x) kết hợp Bear drawdown tô hồng khiến mô hình mất biên an toàn.",
    expectedAuditVerdict: "NEEDS_REVISION",
    expectedIssueCodes: ["ERR_UNFAVORABLE_ASYMMETRY", "ERR_BEAR_SUPERFICIAL_DRAWDOWN"],
    candidatePayload: {
      symbol: "MWG",
      currentPrice: 65_000,
      averageVolume20d: 6_500_000,
      marketContext: { exchange: "HOSE" },
      scenarios: [
        {
          label: "BULL",
          name: "Bách Hóa Xanh đạt điểm hòa vốn đúng kế hoạch",
          probability: 0.30,
          targetPrice: 71_500,
          expectedReturnPct: 10.0, // 0.30 * 10 = 3.0
          timeHorizonWeeks: 8,
          invalidation: {
            priceLevel: 61_500,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA20 tại 61.500",
          },
          actionProtocol: {
            allocationPct: 40,
            entryCondition: "Mua vượt 66.000",
            stopLossPrice: 61_500,
            takeProfitLevels: [71_500],
          },
        },
        {
          label: "BASE",
          name: "Đi ngang tích lũy",
          probability: 0.35,
          targetPrice: 66_300,
          expectedReturnPct: 2.0,
          timeHorizonWeeks: 6,
          invalidation: {
            priceLevel: 60_500,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng nền 60.500",
          },
          actionProtocol: {
            allocationPct: 20,
            entryCondition: "Quan sát quanh 64.000",
            stopLossPrice: 60_500,
            takeProfitLevels: [67_000],
          },
        },
        {
          label: "BEAR",
          name: "Biên lợi nhuận điện máy phục hồi chậm",
          probability: 0.35,
          targetPrice: 59_150,
          expectedReturnPct: -9.0, // 0.35 * 9 = 3.15 -> Asymmetry = 3.0 / 3.15 = 0.95 < 1.30 AND |bear| < 10.5*0.7 (wait: 9 > 7.35! Let's use -7.0% so it hits both ERR_UNFAVORABLE_ASYMMETRY and ERR_BEAR_SUPERFICIAL_DRAWDOWN)
          timeHorizonWeeks: 4,
          invalidation: {
            priceLevel: 69_000,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh ngắn hạn 69.000",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không mua",
            stopLossPrice: 61_500,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "MEDIUM",
            estimatedSlippagePct: 7.0,
            liquidityDrainExitPlan: "Hạ tỷ trọng khi thủng 61.500 bằng lệnh ATO",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "Nhận diện tỷ lệ Risk/Reward hoặc biên an toàn mỏng",
      "Không khuyến nghị giải ngân mạnh khi bất đối xứng bất lợi",
      "Đề xuất mốc giá chờ chiết khấu hoặc vô hiệu hóa rõ ràng",
    ],
  },
  {
    id: "MS_INV_TRAP_01",
    title: "Bẫy thiếu điểm vô hiệu hóa số học & đảo ngược logic điều kiện (Missing Invalidation Trap)",
    timeframe: "short_term_t25",
    trapCategory: "missing_invalidation_trap",
    symbol: "TCB",
    question:
      "Xây dựng kịch bản đa khung thời gian cho cổ phiếu TCB kèm điểm vô hiệu hóa xác định (Invalidation Point) để tránh giữ lệnh mù quáng.",
    adversarialTrap:
      "BULL thiếu priceLevel (0) và BEAR gắn sai điều kiện BREAK_BELOW thay vì BREAK_ABOVE.",
    expectedAuditVerdict: "REJECTED_UNSAFE",
    expectedIssueCodes: ["ERR_MISSING_INVALIDATION_PRICE", "ERR_INVALIDATION_LOGIC_MISMATCH"],
    candidatePayload: {
      symbol: "TCB",
      currentPrice: 24_000,
      averageVolume20d: 14_000_000,
      marketContext: { exchange: "HOSE" },
      scenarios: [
        {
          label: "BULL",
          name: "CASA dẫn đầu toàn ngành đẩy ROE lên 18%",
          probability: 0.40,
          targetPrice: 28_800,
          expectedReturnPct: 20.0,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 0, // THIẾU MỐC VÔ HIỆU HÓA SỐ HỌC
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Khi nào thị trường xấu thì bán",
          },
          actionProtocol: {
            allocationPct: 50,
            entryCondition: "Vượt 24.800",
            stopLossPrice: 22_500,
            takeProfitLevels: [27_000, 28_800],
          },
        },
        {
          label: "BASE",
          name: "Tích lũy quanh vùng 23.500 - 25.000",
          probability: 0.40,
          targetPrice: 25_200,
          expectedReturnPct: 5.0,
          timeHorizonWeeks: 8,
          invalidation: {
            priceLevel: 22_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA50 tại 22.000",
          },
          actionProtocol: {
            allocationPct: 30,
            entryCondition: "Mua vùng 23.500",
            stopLossPrice: 22_000,
            takeProfitLevels: [25_200],
          },
        },
        {
          label: "BEAR",
          name: "Nợ xấu trái phiếu doanh nghiệp gây áp lực trích lập",
          probability: 0.20,
          targetPrice: 20_400,
          expectedReturnPct: -15.0,
          timeHorizonWeeks: 6,
          invalidation: {
            priceLevel: 26_000,
            condition: "BREAK_BELOW", // SAI LOGIC: BEAR phải là BREAK_ABOVE
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt 26.000",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không mua",
            stopLossPrice: 22_500,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "MEDIUM",
            estimatedSlippagePct: 7.0,
            liquidityDrainExitPlan: "Bán ATO khi thủng 22.000",
          },
        },
      ],
    },
    expectedTimeframes: ["short_term_t25", "medium_term_quarterly", "long_term_cycle"],
    expectedCriteria: [
      "Mỗi kịch bản bắt buộc có mốc giá vô hiệu hóa (Invalidation Point) số học cụ thể",
      "Logic điều kiện nhất quán: Bull cắt lỗ khi thủng hỗ trợ, Bear vô hiệu hóa khi vượt kháng cự",
      "Bao phủ đủ 3 khung thời gian ngắn hạn T+2.5, trung hạn, dài hạn",
    ],
  },
];

// Điều chỉnh Bear returnPct của MS_SKEW_TRAP_01 để đảm bảo kích hoạt đồng thời ERR_UNFAVORABLE_ASYMMETRY và ERR_BEAR_SUPERFICIAL_DRAWDOWN
// (0.30 * 10 = 3.0; 0.35 * 7.0 = 2.45 -> Asymmetry = 1.22 < 1.30 và |bear| = 7.0 < 10.5 * 0.7 = 7.35)
const skewCase = MULTI_SCENARIO_TRAINING_CASES.find((c) => c.id === "MS_SKEW_TRAP_01");
if (skewCase) {
  const bearScenario = skewCase.candidatePayload.scenarios.find((s) => s.label === "BEAR");
  if (bearScenario) {
    bearScenario.targetPrice = 60_450;
    bearScenario.expectedReturnPct = -7.0;
  }
}

/**
 * Chuyển đổi MultiScenarioReport (engine) sang CriticScenarioInputPayload (critic)
 * để có thể kiểm định chéo bất kỳ báo cáo nào từ multi-scenario-engine.ts.
 */
export function convertEngineReportToCriticPayload(
  report: MultiScenarioReport,
  options?: {
    averageVolume20d?: number;
    exchange?: "HOSE" | "HNX" | "UPCOM";
    sbvMonetaryStance?: "EASING" | "NEUTRAL" | "TIGHTENING_BILLS";
    usdVndPressure?: "LOW" | "MODERATE" | "HIGH";
    t2FloorLockRisk?: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    estimatedSlippagePct?: number;
    hedgingStrategy?: string;
  }
): CriticScenarioInputPayload {
  const { bull, base, bear } = report.scenarios;

  const toStrict = (
    sc: typeof bull,
    label: ScenarioLabel,
    weeks: number
  ): StrictScenario => {
    const isBear = label === "BEAR";
    return {
      label,
      name: sc.labelVi,
      probability: sc.probability,
      targetPrice: sc.targetPrice,
      expectedReturnPct: sc.returnPct,
      timeHorizonWeeks: weeks,
      invalidation: {
        priceLevel: sc.invalidationPoint,
        condition: isBear ? "BREAK_ABOVE" : "BREAK_BELOW",
        timeframe: "DAILY_CLOSE",
        rationale: sc.invalidationCondition,
      },
      actionProtocol: {
        allocationPct: isBear ? 0 : label === "BULL" ? report.allocation.equityPct : Math.round(report.allocation.equityPct * 0.6),
        entryCondition: sc.actionableTrigger,
        stopLossPrice: report.timeframeMatrix.shortTerm.stopLossLevel,
        takeProfitLevels: isBear ? [] : [sc.targetPrice],
      },
      ...(isBear
        ? {
            bearContingency: {
              t2FloorLockRisk: options?.t2FloorLockRisk ?? "MEDIUM",
              estimatedSlippagePct: options?.estimatedSlippagePct ?? 7.0,
              liquidityDrainExitPlan: sc.actionableTrigger,
              hedgingStrategy:
                options?.hedgingStrategy ??
                "Mở vị thế phòng vệ VN30F1M tương ứng hoặc nâng tỷ trọng tiền mặt tối đa.",
            },
          }
        : {}),
    };
  };

  return {
    symbol: report.symbol,
    currentPrice: report.currentPrice,
    averageVolume20d: options?.averageVolume20d ?? 3_500_000,
    marketContext: {
      exchange: options?.exchange ?? "HOSE",
      sbvMonetaryStance: options?.sbvMonetaryStance ?? "NEUTRAL",
      usdVndPressure: options?.usdVndPressure ?? "MODERATE",
    },
    scenarios: [
      toStrict(bull, "BULL", 12),
      toStrict(base, "BASE", 8),
      toStrict(bear, "BEAR", 4),
    ],
  };
}

/**
 * Kiểm tra bất biến toán học & cấu trúc của ScenarioInputPayload
 */
export function verifyScenarioMathInvariants(
  payload: CriticScenarioInputPayload,
  auditReport?: ScenarioAuditReport
): MathInvariantCheckResult {
  const report = auditReport ?? auditMultiScenarioModel(payload);
  const scenarios = payload.scenarios ?? [];

  let totalProbability = 0;
  let allProbabilitiesInRange = true;
  let expectedReturnComputed = 0;
  const scenarioReturnDiscrepancies: string[] = [];

  for (const sc of scenarios) {
    if (!Number.isFinite(sc.probability) || sc.probability < 0 || sc.probability > 1) {
      allProbabilitiesInRange = false;
    }
    totalProbability += Number.isFinite(sc.probability) ? sc.probability : 0;
    expectedReturnComputed +=
      (Number.isFinite(sc.probability) ? sc.probability : 0) *
      (Number.isFinite(sc.expectedReturnPct) ? sc.expectedReturnPct : 0);

    if (
      Number.isFinite(payload.currentPrice) &&
      payload.currentPrice > 0 &&
      Number.isFinite(sc.targetPrice) &&
      Number.isFinite(sc.expectedReturnPct)
    ) {
      const impliedReturnPct = ((sc.targetPrice - payload.currentPrice) / payload.currentPrice) * 100;
      const diff = Math.abs(impliedReturnPct - sc.expectedReturnPct);
      if (diff > SCENARIO_RETURN_TOLERANCE_PCT) {
        scenarioReturnDiscrepancies.push(
          `${sc.label}: expectedReturnPct=${sc.expectedReturnPct.toFixed(2)}% nhưng (target-current)/current=${impliedReturnPct.toFixed(2)}%`
        );
      }
    }
  }

  const probabilitySumValid = Math.abs(totalProbability - 1.0) <= PROBABILITY_EPSILON;
  const expectedReturnRounded = Number(expectedReturnComputed.toFixed(2));
  const expectedReturnMatchesAudit =
    Math.abs(expectedReturnRounded - report.metrics.expectedReturnPct) <= EXPECTED_RETURN_EPSILON;

  const labels = new Set(scenarios.map((s) => s.label));
  const hasAllThreeScenarios = labels.has("BULL") && labels.has("BASE") && labels.has("BEAR");

  const deterministicInvalidationValid =
    scenarios.length > 0 &&
    scenarios.every((sc) => {
      if (!sc.invalidation || !Number.isFinite(sc.invalidation.priceLevel) || sc.invalidation.priceLevel <= 0) {
        return false;
      }
      if (sc.label === "BULL" && sc.invalidation.condition !== "BREAK_BELOW") return false;
      if (sc.label === "BEAR" && sc.invalidation.condition !== "BREAK_ABOVE") return false;
      return true;
    });

  const bearScenarios = scenarios.filter((s) => s.label === "BEAR");
  const bearContingencyPresent =
    bearScenarios.length > 0 &&
    bearScenarios.every(
      (b) =>
        Boolean(b.bearContingency) &&
        Boolean(b.bearContingency?.liquidityDrainExitPlan?.trim()) &&
        Number.isFinite(b.bearContingency?.estimatedSlippagePct)
    );

  return {
    probabilitySumValid,
    totalProbability: Number(totalProbability.toFixed(4)),
    allProbabilitiesInRange,
    expectedReturnComputed: expectedReturnRounded,
    expectedReturnMatchesAudit,
    scenarioReturnConsistencyValid: scenarioReturnDiscrepancies.length === 0,
    scenarioReturnDiscrepancies,
    hasAllThreeScenarios,
    deterministicInvalidationValid,
    bearContingencyPresent,
  };
}

/**
 * Kiểm tra độ phủ 3 khung thời gian (Ngắn hạn T+2.5 / Trung hạn Quý / Dài hạn 1-3Y) trong văn bản
 */
export function detectTimeframeCoverage(text: string): Record<TimeframeHorizon, boolean> {
  const normalized = text.toLowerCase();
  const shortTermT25 =
    /t\+2\.?5|ngắn hạn|short[- ]?term|1\s*[-–]\s*10\s*phiên|kẹt sàn|ato|vwap|t\+2/i.test(
      normalized
    );
  const mediumTermQuarterly =
    /trung hạn|medium[- ]?term|1\s*[-–]\s*2\s*quý|bctc|báo cáo tài chính|eps|biên lợi nhuận|quarterly/i.test(
      normalized
    );
  const longTermCycle =
    /dài hạn|long[- ]?term|1\s*[-–]\s*3\s*năm|chu kỳ|dcf|moat|lợi thế cạnh tranh|vĩ mô|macro|sbv|nhnn/i.test(
      normalized
    );

  return {
    short_term_t25: shortTermT25,
    medium_term_quarterly: mediumTermQuarterly,
    long_term_cycle: longTermCycle,
  };
}

/**
 * Đánh giá bất kỳ ScenarioInputPayload nào qua CRO Critic + Toán học độc lập
 */
export function evaluateScenarioPayload(
  payload: CriticScenarioInputPayload,
  expectations?: {
    expectedVerdict?: ScenarioAuditReport["verdict"];
    expectedIssueCodes?: ScenarioAuditIssue["code"][];
  }
): PayloadEvaluationResult {
  const auditReport = auditMultiScenarioModel(payload);
  const mathChecks = verifyScenarioMathInvariants(payload, auditReport);
  const diagnostics: string[] = [];

  if (!mathChecks.probabilitySumValid) {
    diagnostics.push(
      `Tổng xác suất = ${mathChecks.totalProbability} (sai lệch khỏi 1.0).`
    );
  }
  if (!mathChecks.scenarioReturnConsistencyValid) {
    diagnostics.push(...mathChecks.scenarioReturnDiscrepancies);
  }
  if (!mathChecks.deterministicInvalidationValid) {
    diagnostics.push("Thiếu hoặc sai logic mức giá vô hiệu hóa (Invalidation Point).");
  }
  if (!mathChecks.bearContingencyPresent) {
    diagnostics.push("Thiếu kế hoạch phòng vệ thanh khoản Bear / T+2.5.");
  }

  let passedExpectation = auditReport.passed;
  let score = auditReport.metrics.auditScore;

  if (expectations) {
    const detectedCodes = new Set(auditReport.issues.map((i) => i.code));
    const missingExpectedIssues = (expectations.expectedIssueCodes ?? []).filter(
      (code) => !detectedCodes.has(code)
    );
    const verdictMatch = expectations.expectedVerdict
      ? auditReport.verdict === expectations.expectedVerdict
      : true;

    passedExpectation = verdictMatch && missingExpectedIssues.length === 0;

    if (!verdictMatch) {
      diagnostics.push(
        `Kỳ vọng verdict=${expectations.expectedVerdict}, thực tế=${auditReport.verdict}.`
      );
    }
    if (missingExpectedIssues.length > 0) {
      diagnostics.push(
        `CRO Critic bỏ sót mã lỗi kỳ vọng: ${missingExpectedIssues.join(", ")}.`
      );
    }

    // Điểm đánh giá bài test đối kháng phản ánh độ khớp kỳ vọng bắt bẫy hoặc chất lượng gold payload
    if (expectations.expectedVerdict === "APPROVED_FOR_EXECUTION") {
      score = passedExpectation && mathChecks.scenarioReturnConsistencyValid
        ? auditReport.metrics.auditScore
        : Math.min(auditReport.metrics.auditScore, 55);
    } else {
      const totalChecks = 1 + (expectations.expectedIssueCodes?.length ?? 0);
      const passedChecks =
        (verdictMatch ? 1 : 0) +
        ((expectations.expectedIssueCodes?.length ?? 0) - missingExpectedIssues.length);
      score = Math.round((passedChecks / Math.max(1, totalChecks)) * 100);
    }
  } else {
    if (!mathChecks.scenarioReturnConsistencyValid) {
      score = Math.max(0, score - 15);
    }
  }

  return {
    symbol: payload.symbol,
    auditReport,
    mathChecks,
    score,
    passedExpectation,
    diagnostics,
  };
}

/**
 * Nạp tập dữ liệu SFT từ file JSON (mặc định ưu tiên orca-multi-scenario-sft.json nếu tồn tại)
 */
export function loadSftDataset(explicitPath?: string): {
  filePath: string | null;
  samples: SftScenarioSample[];
} {
  const candidates = explicitPath ? [explicitPath] : DEFAULT_SFT_CANDIDATE_PATHS;

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { filePath: candidate, samples: parsed as SftScenarioSample[] };
      }
      if (parsed && Array.isArray(parsed.samples)) {
        return { filePath: candidate, samples: parsed.samples as SftScenarioSample[] };
      }
    }
  }

  return { filePath: null, samples: [] };
}

/**
 * Xác thực & chấm điểm một mẫu huấn luyện SFT đa kịch bản
 */
export function validateSftSample(sample: SftScenarioSample): SftValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const combinedText = [
    sample.topic,
    sample.question,
    ...(sample.reasoningCoT ?? []),
    sample.goldAnswer,
  ].join("\n");

  const timeframeCoverage = detectTimeframeCoverage(combinedText);
  const hasAllThreeTimeframes =
    timeframeCoverage.short_term_t25 &&
    timeframeCoverage.medium_term_quarterly &&
    timeframeCoverage.long_term_cycle;

  if (!hasAllThreeTimeframes) {
    const missing: string[] = [];
    if (!timeframeCoverage.short_term_t25) missing.push("Ngắn hạn T+2.5");
    if (!timeframeCoverage.medium_term_quarterly) missing.push("Trung hạn 1-2 Quý/BCTC");
    if (!timeframeCoverage.long_term_cycle) missing.push("Dài hạn 1-3 Năm/Chu kỳ");
    failures.push(`Thiếu độ phủ khung thời gian: ${missing.join(", ")}.`);
  }

  const hasKatexOrMath = /\$\$[\s\S]+?\$\$|E\[R\]|\\sum|RRR/i.test(sample.goldAnswer);
  if (!hasKatexOrMath) {
    failures.push("Thiếu công thức toán học KaTeX / E[R] / RRR trong goldAnswer.");
  }

  const hasInvalidationLevels =
    /vô hiệu hóa|invalidation|cắt lỗ|stop[- ]?loss|thủng|break/i.test(sample.goldAnswer);
  if (!hasInvalidationLevels) {
    failures.push("Thiếu mốc vô hiệu hóa / cắt lỗ xác định trong goldAnswer.");
  }

  const hasBearContingency =
    /bear|tiêu cực|phòng thủ|kẹt sàn|t\+2\.?5|ato|trượt giá|slippage/i.test(sample.goldAnswer);
  if (!hasBearContingency) {
    failures.push("Thiếu kịch bản Bear hoặc kế hoạch ứng phó rủi ro T+2.5.");
  }

  let payloadEval: PayloadEvaluationResult | undefined;
  let score = 0;

  if (!sample.structuredScenarioPayload) {
    failures.push("Thiếu trường structuredScenarioPayload theo schema multi-scenario-critic.ts.");
  } else {
    payloadEval = evaluateScenarioPayload(sample.structuredScenarioPayload);
    const { mathChecks, auditReport } = payloadEval;

    if (!mathChecks.hasAllThreeScenarios) {
      failures.push("structuredScenarioPayload không đủ 3 kịch bản BULL / BASE / BEAR.");
    }
    if (!mathChecks.probabilitySumValid || !mathChecks.allProbabilitiesInRange) {
      failures.push(
        `Vi phạm tổng xác suất sum(p_i)=1.0 (hiện tại: ${mathChecks.totalProbability}).`
      );
    }
    if (!mathChecks.expectedReturnMatchesAudit) {
      failures.push(
        `Sai lệch E[R]: tính tay=${mathChecks.expectedReturnComputed}%, critic=${auditReport.metrics.expectedReturnPct}%.`
      );
    }
    if (!mathChecks.scenarioReturnConsistencyValid) {
      failures.push(...mathChecks.scenarioReturnDiscrepancies);
    }
    if (!mathChecks.deterministicInvalidationValid) {
      failures.push("structuredScenarioPayload thiếu invalidation.priceLevel hoặc sai condition.");
    }
    if (!mathChecks.bearContingencyPresent) {
      failures.push("structuredScenarioPayload thiếu bearContingency.liquidityDrainExitPlan.");
    }

    // Kiểm tra các lỗi CRO Critic cấu trúc (trừ trường hợp mẫu stress-test cố ý có E[R] <= 0 để khuyến nghị DEFENSIVE_CASH)
    const structuralCriticalIssues = auditReport.issues.filter(
      (i) => i.severity === "CRITICAL" && i.code !== "ERR_NEGATIVE_EXPECTED_RETURN"
    );
    if (structuralCriticalIssues.length > 0) {
      failures.push(
        `Lỗi CRO cấu trúc: ${structuralCriticalIssues.map((i) => i.code).join(", ")}.`
      );
    }

    const hasSuperficialBear = auditReport.issues.some(
      (i) => i.code === "ERR_BEAR_SUPERFICIAL_DRAWDOWN"
    );
    if (hasSuperficialBear) {
      failures.push("Bear Case quá hời hợt (ERR_BEAR_SUPERFICIAL_DRAWDOWN).");
    }

    // Đối soát expectedMetrics nếu dataset có khai báo sẵn
    if (sample.expectedMetrics) {
      const em = sample.expectedMetrics;
      if (
        typeof em.expectedReturnPct === "number" &&
        Math.abs(em.expectedReturnPct - auditReport.metrics.expectedReturnPct) > EXPECTED_RETURN_EPSILON
      ) {
        failures.push(
          `expectedMetrics.expectedReturnPct (${em.expectedReturnPct}%) lệch với CRO Critic (${auditReport.metrics.expectedReturnPct}%).`
        );
      }
      if (em.croVerdict && em.croVerdict !== auditReport.verdict) {
        failures.push(
          `expectedMetrics.croVerdict (${em.croVerdict}) lệch với CRO Critic (${auditReport.verdict}).`
        );
      }
      if (
        typeof em.t2LiquidityHaircutReturnPct === "number" &&
        Math.abs(em.t2LiquidityHaircutReturnPct - auditReport.metrics.t2LiquidityHaircutReturnPct) >
          EXPECTED_RETURN_EPSILON
      ) {
        failures.push(
          `expectedMetrics.t2LiquidityHaircutReturnPct (${em.t2LiquidityHaircutReturnPct}%) lệch với CRO Critic (${auditReport.metrics.t2LiquidityHaircutReturnPct}%).`
        );
      }
    }

    // Nếu E[R] <= 0, mẫu SFT hợp lệ khi và chỉ khi goldAnswer khuyến nghị phòng thủ / không mua
    if (auditReport.metrics.expectedReturnPct <= 0) {
      const warnsDefensive =
        /phòng thủ|tiền mặt|defensive|không mua|cấm mua|tránh|cảnh báo|từ chối|đứng ngoài/i.test(
          sample.goldAnswer
        );
      if (!warnsDefensive) {
        failures.push(
          `E[R]=${auditReport.metrics.expectedReturnPct}% <= 0 nhưng goldAnswer không khuyến nghị phòng thủ/đứng ngoài.`
        );
      } else {
        warnings.push(
          `Mẫu stress-test có E[R]=${auditReport.metrics.expectedReturnPct}% <= 0 và đã cảnh báo phòng thủ hợp lệ.`
        );
      }
    } else if (!auditReport.passed) {
      warnings.push(
        `CRO audit verdict=${auditReport.verdict} (${auditReport.issues.map((i) => i.code).join(", ")}).`
      );
    }
  }

  // Tính điểm SFT sample (0 - 100)
  const checkPoints = [
    hasAllThreeTimeframes ? 20 : 0,
    hasKatexOrMath ? 10 : 0,
    hasInvalidationLevels ? 10 : 0,
    hasBearContingency ? 10 : 0,
    payloadEval?.mathChecks.hasAllThreeScenarios ? 10 : 0,
    payloadEval?.mathChecks.probabilitySumValid && payloadEval?.mathChecks.allProbabilitiesInRange ? 15 : 0,
    payloadEval?.mathChecks.expectedReturnMatchesAudit && payloadEval?.mathChecks.scenarioReturnConsistencyValid
      ? 10
      : 0,
    payloadEval?.mathChecks.deterministicInvalidationValid ? 10 : 0,
    payloadEval?.mathChecks.bearContingencyPresent ? 5 : 0,
  ];
  score = checkPoints.reduce((acc, v) => acc + v, 0);

  return {
    id: sample.id,
    category: sample.category,
    topic: sample.topic,
    valid: failures.length === 0,
    score,
    timeframeCoverage,
    hasAllThreeTimeframes,
    hasKatexOrMath,
    hasInvalidationLevels,
    hasBearContingency,
    payloadEval,
    failures,
    warnings,
  };
}

/**
 * Đánh giá tập dữ liệu SFT đa kịch bản
 */
export function evaluateSftDataset(
  samplesOrPath?: string | SftScenarioSample[],
  options?: { multiScenarioOnly?: boolean }
): {
  filePath: string | null;
  totalLoaded: number;
  evaluatedSamples: SftValidationResult[];
  validityPct: number;
  averageScore: number;
} {
  let filePath: string | null = null;
  let rawSamples: SftScenarioSample[] = [];

  if (Array.isArray(samplesOrPath)) {
    rawSamples = samplesOrPath;
  } else {
    const loaded = loadSftDataset(samplesOrPath);
    filePath = loaded.filePath;
    rawSamples = loaded.samples;
  }

  const multiScenarioOnly = options?.multiScenarioOnly ?? true;
  const targetSamples = multiScenarioOnly
    ? rawSamples.filter(
        (s) =>
          Boolean(s.structuredScenarioPayload) ||
          /multi[-_]?scenario|đa kịch bản|đa khung/i.test(`${s.category} ${s.topic} ${s.id}`)
      )
    : rawSamples;

  const evaluatedSamples = targetSamples.map(validateSftSample);
  const passedCount = evaluatedSamples.filter((r) => r.valid).length;
  const validityPct =
    evaluatedSamples.length > 0
      ? Math.round((passedCount / evaluatedSamples.length) * 100)
      : 0;
  const averageScore =
    evaluatedSamples.length > 0
      ? Math.round(
          evaluatedSamples.reduce((acc, r) => acc + r.score, 0) / evaluatedSamples.length
        )
      : 0;

  return {
    filePath,
    totalLoaded: rawSamples.length,
    evaluatedSamples,
    validityPct,
    averageScore,
  };
}

function matchCriterionKeywords(criterion: string, answer: string): boolean {
  const lower = answer.toLowerCase();
  const patterns: Array<[RegExp, RegExp]> = [
    [/3 kịch bản|bull\/base\/bear/i, /bull[\s\S]*base[\s\S]*bear|lạc quan[\s\S]*cơ sở[\s\S]*(tiêu cực|phòng thủ)/i],
    [/xác suất.*100%|tổng 100%|e\[r\]/i, /e\[r\]|kỳ vọng|xác suất|100%/i],
    [/t\+2\.5|thanh khoản|ato/i, /t\+2\.?5|ato|thanh khoản|kẹt sàn|trượt giá/i],
    [/cắt lỗ|vô hiệu hóa|invalidation/i, /vô hiệu hóa|invalidation|cắt lỗ|stop[- ]?loss|thủng/i],
    [/3 khung thời gian|đa khung thời gian|t\+2\.5.*trung hạn.*dài hạn/i, /ngắn hạn[\s\S]*trung hạn[\s\S]*dài hạn|t\+2\.?5/i],
    [/bctc|biên lợi nhuận|chu kỳ ngành thép/i, /bctc|báo cáo tài chính|biên|chu kỳ|hrc|dung quất/i],
    [/tín phiếu|sbv|tỷ giá|1-3 năm/i, /tín phiếu|sbv|nhnn|tỷ giá|usd\/vnd|1\s*[-–]\s*3\s*năm/i],
    [/tỷ trọng cổ phiếu.*tiền mặt/i, /cổ phiếu[\s\S]*tiền mặt|tỷ trọng/i],
    [/ai|cntt|moat/i, /ai|cntt|moat|lợi thế cạnh tranh|roe/i],
    [/bất đối xứng|biên an toàn|rủi ro bear áp đảo|phòng thủ/i, /rủi ro|phòng thủ|tiền mặt|thận trọng|rrr|bất đối xứng|từ chối|rejected/i],
    [/logic điều kiện/i, /break_below|break_above|thủng|vượt/i],
  ];

  for (const [critRegex, ansRegex] of patterns) {
    if (critRegex.test(criterion) && ansRegex.test(lower)) {
      return true;
    }
  }

  // Fallback token overlap
  const tokens = criterion
    .toLowerCase()
    .split(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ+]+/i)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => lower.includes(t)).length;
  return hits / tokens.length >= 0.4;
}

/**
 * Đánh giá khả năng phản hồi thực tế của executeContextualAiPipeline trên các truy vấn đa kịch bản
 */
export async function evaluateLiveMultiScenarioPipeline(
  cases: MultiScenarioTrainingCase[] = MULTI_SCENARIO_TRAINING_CASES
): Promise<LivePipelineEvalResult[]> {
  const results: LivePipelineEvalResult[] = [];

  for (const tc of cases) {
    const response = await executeContextualAiPipeline(tc.question, tc.facts);
    const answer = response?.answer ?? "";
    const detectedDomain = response?.domain ?? "none";

    const timeframeCoverage = detectTimeframeCoverage(answer);
    const hasThreeScenarios =
      /bull/i.test(answer) && /base/i.test(answer) && /bear/i.test(answer);
    const hasQuantMath = /e\[r\]|rrr|\$\$|xác suất/i.test(answer);
    const hasInvalidationPoint =
      /vô hiệu hóa|invalidation|cắt lỗ|stop[- ]?loss/i.test(answer);
    const hasBearContingency =
      /t\+2\.?5|ato|phòng thủ|trượt giá|kẹt sàn|bear/i.test(answer);

    const passedCriteria: string[] = [];
    const missedCriteria: string[] = [];

    for (const crit of tc.expectedCriteria) {
      if (matchCriterionKeywords(crit, answer)) {
        passedCriteria.push(crit);
      } else {
        missedCriteria.push(crit);
      }
    }

    const diagnostics: string[] = [];
    if (!response) {
      diagnostics.push("executeContextualAiPipeline trả về null.");
    }
    if (!hasThreeScenarios) {
      diagnostics.push("Câu trả lời live thiếu cấu trúc 3 kịch bản Bull/Base/Bear.");
    }
    if (!timeframeCoverage.short_term_t25 || !timeframeCoverage.medium_term_quarterly || !timeframeCoverage.long_term_cycle) {
      diagnostics.push("Câu trả lời live chưa phủ đủ 3 khung thời gian (Ngắn hạn T+2.5 / Trung hạn / Dài hạn).");
    }

    let structuredAuditPassed: boolean | undefined;
    if (response?.structured && typeof response.structured === "object") {
      const s = response.structured as Record<string, unknown>;
      const maybeAudit = (s.auditReport ?? s.croAudit) as ScenarioAuditReport | undefined;
      if (maybeAudit && typeof maybeAudit.passed === "boolean") {
        structuredAuditPassed = maybeAudit.passed;
      } else if (typeof s.croPassed === "boolean") {
        structuredAuditPassed = s.croPassed;
      }
    }

    const criteriaRatio =
      tc.expectedCriteria.length > 0
        ? passedCriteria.length / tc.expectedCriteria.length
        : 1;
    const structureScore =
      (hasThreeScenarios ? 20 : 0) +
      (hasQuantMath ? 15 : 0) +
      (hasInvalidationPoint ? 15 : 0) +
      (hasBearContingency ? 10 : 0) +
      (timeframeCoverage.short_term_t25 &&
      timeframeCoverage.medium_term_quarterly &&
      timeframeCoverage.long_term_cycle
        ? 15
        : 0);
    const score = Math.min(100, Math.round(structureScore + criteriaRatio * 25));
    const passed = Boolean(response) && score >= 75 && hasThreeScenarios;

    results.push({
      caseId: tc.id,
      symbol: tc.symbol,
      timeframe: tc.timeframe,
      trapCategory: tc.trapCategory,
      question: tc.question,
      detectedDomain,
      answerLength: answer.length,
      score,
      passed,
      timeframeCoverage,
      hasThreeScenarios,
      hasQuantMath,
      hasInvalidationPoint,
      hasBearContingency,
      passedCriteria,
      missedCriteria,
      structuredAuditPassed,
      diagnostics,
    });
  }

  return results;
}

export class MultiScenarioTrainer {
  /**
   * Đánh giá toàn bộ bộ test đối kháng trên tầng CRO Critic & Toán học kịch bản
   */
  static evaluateAdversarialSuite(
    cases: MultiScenarioTrainingCase[] = MULTI_SCENARIO_TRAINING_CASES
  ): AdversarialCaseEvalResult[] {
    return cases.map((tc) => {
      const payloadEval = evaluateScenarioPayload(tc.candidatePayload, {
        expectedVerdict: tc.expectedAuditVerdict,
        expectedIssueCodes: tc.expectedIssueCodes,
      });

      const detectedCodes = payloadEval.auditReport.issues.map((i) => i.code);
      const detectedSet = new Set(detectedCodes);
      const missingExpectedIssues = tc.expectedIssueCodes.filter(
        (code) => !detectedSet.has(code)
      );

      return {
        caseId: tc.id,
        title: tc.title,
        timeframe: tc.timeframe,
        trapCategory: tc.trapCategory,
        expectedAuditVerdict: tc.expectedAuditVerdict,
        actualAuditVerdict: payloadEval.auditReport.verdict,
        expectedIssueCodes: tc.expectedIssueCodes,
        detectedIssueCodes: detectedCodes,
        missingExpectedIssues,
        score: payloadEval.score,
        passed: payloadEval.passedExpectation,
        payloadEval,
        diagnostics: payloadEval.diagnostics,
      };
    });
  }

  /**
   * Chạy toàn bộ quy trình huấn luyện, kiểm định SFT, red-teaming CRO và live pipeline evaluation
   */
  static async runFullTrainingEvaluation(
    options: TrainerRunOptions = {}
  ): Promise<TrainingReadinessReport> {
    const startTime = Date.now();
    const cases = options.cases ?? MULTI_SCENARIO_TRAINING_CASES;
    const includeLive = options.includeLivePipeline ?? true;

    // 1. Adversarial Payload & CRO Stress-Test Suite
    const adversarialResults = this.evaluateAdversarialSuite(cases);

    // 2. SFT Dataset Validation (if available)
    const sftEval = evaluateSftDataset(options.sftSamples ?? options.sftDatasetPath, {
      multiScenarioOnly: true,
    });
    const sftResults = sftEval.evaluatedSamples;

    // 3. Live Pipeline Evaluation
    const liveResults = includeLive
      ? await evaluateLiveMultiScenarioPipeline(cases)
      : [];

    // 4. Summary metrics
    const totalAdversarialCases = adversarialResults.length;
    const passedAdversarialCases = adversarialResults.filter((r) => r.passed).length;
    const adversarialAccuracyPct =
      totalAdversarialCases > 0
        ? Math.round((passedAdversarialCases / totalAdversarialCases) * 100)
        : 0;

    const totalSftSamples = sftResults.length;
    const passedSftSamples = sftResults.filter((r) => r.valid).length;
    const sftValidityPct =
      totalSftSamples > 0 ? Math.round((passedSftSamples / totalSftSamples) * 100) : 0;

    const totalLiveCases = liveResults.length;
    const passedLiveCases = liveResults.filter((r) => r.passed).length;
    const livePipelineAccuracyPct =
      totalLiveCases > 0 ? Math.round((passedLiveCases / totalLiveCases) * 100) : 0;

    // 5. Per-timeframe breakdown (combining adversarial + live where applicable)
    const horizons: TimeframeHorizon[] = [
      "short_term_t25",
      "medium_term_quarterly",
      "long_term_cycle",
    ];
    const timeframeBreakdown = {} as Record<TimeframeHorizon, TimeframeAccuracyMetrics>;

    for (const h of horizons) {
      const advInH = adversarialResults.filter((r) => r.timeframe === h);
      const liveInH = liveResults.filter((r) => r.timeframe === h);
      const combined = [
        ...advInH.map((r) => ({ passed: r.passed, score: r.score })),
        ...liveInH.map((r) => ({ passed: r.passed, score: r.score })),
      ];
      const total = combined.length;
      const passed = combined.filter((x) => x.passed).length;
      timeframeBreakdown[h] = {
        timeframe: h,
        total,
        passed,
        accuracyPct: total > 0 ? Math.round((passed / total) * 100) : 0,
        averageScore:
          total > 0
            ? Math.round(combined.reduce((acc, x) => acc + x.score, 0) / total)
            : 0,
      };
    }

    // 6. Per-trap category breakdown
    const trapCategories: TrapCategory[] = [
      "t25_floor_lock_liquidity",
      "quarterly_bctc_inflection",
      "long_term_macro_sbv",
      "probability_sum_trap",
      "optimistic_skew_asymmetry_trap",
      "missing_invalidation_trap",
    ];
    const trapCategoryBreakdown = {} as Record<
      TrapCategory,
      { total: number; passed: number; accuracyPct: number }
    >;

    for (const cat of trapCategories) {
      const advCat = adversarialResults.filter((r) => r.trapCategory === cat);
      const total = advCat.length;
      const passed = advCat.filter((r) => r.passed).length;
      trapCategoryBreakdown[cat] = {
        total,
        passed,
        accuracyPct: total > 0 ? Math.round((passed / total) * 100) : 0,
      };
    }

    // 7. Failure Diagnostics & Curriculum Recommendations
    const failureDiagnostics: FailureDiagnostic[] = [];

    for (const r of adversarialResults) {
      if (!r.passed) {
        failureDiagnostics.push({
          source: "adversarial_payload",
          id: r.caseId,
          timeframe: r.timeframe,
          trapCategory: r.trapCategory,
          severity: "CRITICAL",
          reason: r.diagnostics.join(" ") || `Verdict mismatch: expected ${r.expectedAuditVerdict}, got ${r.actualAuditVerdict}`,
        });
      }
    }

    for (const s of sftResults) {
      if (!s.valid) {
        failureDiagnostics.push({
          source: "sft_dataset",
          id: s.id,
          severity: "HIGH",
          reason: s.failures.join(" "),
        });
      }
    }

    for (const l of liveResults) {
      if (!l.passed) {
        failureDiagnostics.push({
          source: "live_pipeline",
          id: l.caseId,
          timeframe: l.timeframe,
          trapCategory: l.trapCategory,
          severity: l.score < 50 ? "CRITICAL" : "HIGH",
          reason:
            l.diagnostics.join(" ") ||
            `Live pipeline thiếu tiêu chí: ${l.missedCriteria.join("; ")}`,
        });
      }
    }

    const curriculumRecommendations: CurriculumRecommendation[] = [];

    for (const h of horizons) {
      const metrics = timeframeBreakdown[h];
      if (metrics.total > 0 && metrics.accuracyPct < 85) {
        const weakIds = [
          ...adversarialResults.filter((r) => r.timeframe === h && !r.passed).map((r) => r.caseId),
          ...liveResults.filter((r) => r.timeframe === h && !r.passed).map((r) => r.caseId),
        ];
        curriculumRecommendations.push({
          targetArea: `Khung thời gian ${h}`,
          priority: metrics.accuracyPct < 60 ? "P0" : "P1",
          currentAccuracyPct: metrics.accuracyPct,
          actionVi:
            h === "short_term_t25"
              ? "Tăng cường dữ liệu huấn luyện xử lý kẹt sàn T+2.5, lệnh ATO và độ trượt giá thanh khoản."
              : h === "medium_term_quarterly"
              ? "Bổ sung kịch bản điểm uốn BCTC quý, biên lợi nhuận gộp và bẫy E[R] âm theo chu kỳ."
              : "Bổ sung kịch bản chu kỳ vĩ mô 1-3 năm, chính sách tín phiếu SBV và định giá DCF dài hạn.",
          suggestedDrillIds: Array.from(new Set(weakIds)),
        });
      }
    }

    if (totalSftSamples === 0) {
      curriculumRecommendations.push({
        targetArea: "SFT Multi-Scenario Dataset",
        priority: "P1",
        currentAccuracyPct: 0,
        actionVi:
          "Chưa nạp được mẫu SFT đa kịch bản có structuredScenarioPayload. Cần nạp file orca-multi-scenario-sft.json để kiểm định độ phủ SFT.",
        suggestedDrillIds: [],
      });
    } else if (sftValidityPct < 100) {
      curriculumRecommendations.push({
        targetArea: "SFT Mathematical & CRO Compliance",
        priority: sftValidityPct < 75 ? "P0" : "P1",
        currentAccuracyPct: sftValidityPct,
        actionVi:
          "Chuẩn hóa lại tổng xác suất sum(p_i)=1.0, độ khớp E[R] và ma trận đủ 3 khung thời gian trong các mẫu SFT chưa đạt.",
        suggestedDrillIds: sftResults.filter((s) => !s.valid).map((s) => s.id),
      });
    }

    // 8. Compute Aggregate Training Readiness Score (0 - 100)
    const advAvgScore =
      totalAdversarialCases > 0
        ? adversarialResults.reduce((acc, r) => acc + r.score, 0) / totalAdversarialCases
        : 0;
    const liveAvgScore =
      totalLiveCases > 0
        ? liveResults.reduce((acc, r) => acc + r.score, 0) / totalLiveCases
        : 0;
    const sftAvgScore = totalSftSamples > 0 ? sftEval.averageScore : 0;

    let readinessScore = 0;
    if (totalSftSamples > 0 && includeLive && totalLiveCases > 0) {
      readinessScore = Math.round(
        advAvgScore * 0.4 + liveAvgScore * 0.35 + sftAvgScore * 0.25
      );
    } else if (includeLive && totalLiveCases > 0) {
      readinessScore = Math.round(advAvgScore * 0.55 + liveAvgScore * 0.45);
    } else if (totalSftSamples > 0) {
      readinessScore = Math.round(advAvgScore * 0.6 + sftAvgScore * 0.4);
    } else {
      readinessScore = Math.round(advAvgScore);
    }

    const readinessTier: TrainingReadinessReport["readinessTier"] =
      readinessScore >= 85 && passedAdversarialCases === totalAdversarialCases
        ? "PRODUCTION_READY"
        : readinessScore >= 65
        ? "CALIBRATION_NEEDED"
        : "RETRAINING_REQUIRED";

    return {
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      readinessScore,
      readinessTier,
      summary: {
        totalAdversarialCases,
        passedAdversarialCases,
        adversarialAccuracyPct,
        totalSftSamples,
        passedSftSamples,
        sftValidityPct,
        totalLiveCases,
        passedLiveCases,
        livePipelineAccuracyPct,
      },
      timeframeBreakdown,
      trapCategoryBreakdown,
      adversarialResults,
      sftResults,
      liveResults,
      failureDiagnostics,
      curriculumRecommendations,
    };
  }
}
