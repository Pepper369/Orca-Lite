import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  convertEngineReportToCriticPayload,
  detectTimeframeCoverage,
  evaluateScenarioPayload,
  evaluateSftDataset,
  loadSftDataset,
  MULTI_SCENARIO_TRAINING_CASES,
  MultiScenarioTrainer,
  validateSftSample,
  verifyScenarioMathInvariants,
  type SftScenarioSample,
  type TimeframeHorizon,
  type TrapCategory,
} from "../training/multi-scenario-trainer";
import {
  ADVERSARIAL_BENCHMARK_SUITE,
  AdversarialQaTrainer,
  MULTI_SCENARIO_ADVERSARIAL_CASES,
} from "../training/adversarial-qa-trainer";
import {
  getFptPracticalScenario,
  getVnIndexMacroScenario,
} from "../engines/multi-scenario-engine";

function makeValidSftSample(overrides: Partial<SftScenarioSample> = {}): SftScenarioSample {
  return {
    id: "SFT-TEST-001",
    category: "multi_scenario_strategy",
    topic: "Chiến lược đa kịch bản & đa khung thời gian FPT",
    question:
      "Phân tích đa kịch bản Bull/Base/Bear và đa khung thời gian T+2.5, trung hạn, dài hạn cho FPT?",
    reasoningCoT: [
      "1. Tổng xác suất Bull 0.35 + Base 0.45 + Bear 0.20 = 1.00.",
      "2. E[R] = 0.35*20 + 0.45*5 + 0.20*(-15) = +6.25%.",
      "3. Bao phủ đủ ngắn hạn T+2.5, trung hạn BCTC quý, dài hạn 1-3 năm.",
    ],
    goldAnswer: `### Báo cáo Đa kịch bản FPT
- **Bull (35%)**: Mục tiêu 156.000 (+20%). Vô hiệu hóa khi đóng cửa thủng 122.000.
- **Base (45%)**: Mục tiêu 136.500 (+5%). Vô hiệu hóa thủng 120.000.
- **Bear (20%)**: Mục tiêu 110.500 (-15%). Kế hoạch kẹt sàn T+2.5: bán ATO phiên T+2 và phòng vệ Short VN30F.
$$E[R] = 0.35 \\times 20\\% + 0.45 \\times 5\\% + 0.20 \\times (-15\\%) = +6.25\\%$$
- **Ngắn hạn T+2.5**: Hỗ trợ 126.000, cắt lỗ 122.000.
- **Trung hạn (1-2 Quý BCTC)**: EPS tăng trưởng 22%.
- **Dài hạn (1-3 Năm)**: Lợi thế cạnh tranh Moat WIDE, định giá DCF 168.000.`,
    structuredScenarioPayload: {
      symbol: "FPT",
      currentPrice: 130_000,
      averageVolume20d: 3_500_000,
      marketContext: { exchange: "HOSE", sbvMonetaryStance: "NEUTRAL", usdVndPressure: "MODERATE" },
      scenarios: [
        {
          label: "BULL",
          name: "AI & Chuyển đổi số bứt phá",
          probability: 0.35,
          targetPrice: 156_000,
          expectedReturnPct: 20.0,
          timeHorizonWeeks: 12,
          invalidation: {
            priceLevel: 122_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA50 ngày",
          },
          actionProtocol: {
            allocationPct: 50,
            entryCondition: "Vượt 133.000 kèm vol lớn",
            stopLossPrice: 122_000,
            takeProfitLevels: [145_000, 156_000],
          },
        },
        {
          label: "BASE",
          name: "Tăng trưởng ổn định",
          probability: 0.45,
          targetPrice: 136_500,
          expectedReturnPct: 5.0,
          timeHorizonWeeks: 8,
          invalidation: {
            priceLevel: 120_000,
            condition: "BREAK_BELOW",
            timeframe: "DAILY_CLOSE",
            rationale: "Thủng MA100",
          },
          actionProtocol: {
            allocationPct: 30,
            entryCondition: "Mua gom vùng 128.000",
            stopLossPrice: 120_000,
            takeProfitLevels: [136_500],
          },
        },
        {
          label: "BEAR",
          name: "Thị trường chung điều chỉnh sâu",
          probability: 0.20,
          targetPrice: 110_500,
          expectedReturnPct: -15.0,
          timeHorizonWeeks: 4,
          invalidation: {
            priceLevel: 138_000,
            condition: "BREAK_ABOVE",
            timeframe: "DAILY_CLOSE",
            rationale: "Vượt đỉnh 138.000",
          },
          actionProtocol: {
            allocationPct: 0,
            entryCondition: "Không mua mới",
            stopLossPrice: 122_000,
            takeProfitLevels: [],
          },
          bearContingency: {
            t2FloorLockRisk: "MEDIUM",
            estimatedSlippagePct: 7.0,
            liquidityDrainExitPlan: "Bán ATO phiên T+2 nếu trắng bảng bên mua",
            hedgingStrategy: "Short VN30F1M phòng vệ",
          },
        },
      ],
    },
    references: ["multi-scenario-engine.ts", "multi-scenario-critic.ts"],
    ...overrides,
  };
}

test("MULTI_SCENARIO_TRAINING_CASES covers all 3 timeframes and all 6 adversarial trap categories", () => {
  const horizons: TimeframeHorizon[] = [
    "short_term_t25",
    "medium_term_quarterly",
    "long_term_cycle",
  ];
  const traps: TrapCategory[] = [
    "t25_floor_lock_liquidity",
    "quarterly_bctc_inflection",
    "long_term_macro_sbv",
    "probability_sum_trap",
    "optimistic_skew_asymmetry_trap",
    "missing_invalidation_trap",
  ];

  for (const h of horizons) {
    assert.ok(
      MULTI_SCENARIO_TRAINING_CASES.some((c) => c.timeframe === h),
      `Thiếu training case cho timeframe ${h}`
    );
  }
  for (const t of traps) {
    assert.ok(
      MULTI_SCENARIO_TRAINING_CASES.some((c) => c.trapCategory === t),
      `Thiếu training case cho trapCategory ${t}`
    );
  }
});

test("MultiScenarioTrainer.evaluateAdversarialSuite passes 100% of CRO red-team traps and gold payloads", () => {
  const results = MultiScenarioTrainer.evaluateAdversarialSuite();
  assert.equal(results.length, MULTI_SCENARIO_TRAINING_CASES.length);

  for (const res of results) {
    assert.equal(
      res.passed,
      true,
      `Adversarial case ${res.caseId} failed: ${res.diagnostics.join(" | ")}`
    );
    assert.equal(res.actualAuditVerdict, res.expectedAuditVerdict);
    assert.equal(res.missingExpectedIssues.length, 0);
  }
});

test("convertEngineReportToCriticPayload bridges FPT and VN-Index reports cleanly to CRO Critic", () => {
  const fptPayload = convertEngineReportToCriticPayload(getFptPracticalScenario());
  const fptEval = evaluateScenarioPayload(fptPayload, {
    expectedVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
  });
  assert.equal(fptEval.passedExpectation, true);
  assert.equal(fptEval.mathChecks.probabilitySumValid, true);
  assert.equal(fptEval.mathChecks.expectedReturnMatchesAudit, true);
  assert.equal(fptEval.mathChecks.scenarioReturnConsistencyValid, true);
  assert.equal(fptEval.mathChecks.deterministicInvalidationValid, true);
  assert.equal(fptEval.mathChecks.bearContingencyPresent, true);
  assert.equal(fptEval.auditReport.verdict, "APPROVED_FOR_EXECUTION");

  const vniPayload = convertEngineReportToCriticPayload(getVnIndexMacroScenario(), {
    averageVolume20d: 750_000_000,
    sbvMonetaryStance: "NEUTRAL",
    usdVndPressure: "MODERATE",
  });
  const vniEval = evaluateScenarioPayload(vniPayload, {
    expectedVerdict: "APPROVED_FOR_EXECUTION",
    expectedIssueCodes: [],
  });
  assert.equal(vniEval.passedExpectation, true);
  assert.equal(vniEval.mathChecks.probabilitySumValid, true);
  assert.equal(vniEval.auditReport.verdict, "APPROVED_FOR_EXECUTION");
});

test("validateSftSample enforces sum(p_i)=1.0, exact E[R], MTF 3-horizon coverage, invalidation, and Bear contingency", () => {
  const validSample = makeValidSftSample();
  const validRes = validateSftSample(validSample);
  assert.equal(validRes.valid, true, `Expected valid sample, failures: ${validRes.failures.join("; ")}`);
  assert.equal(validRes.score, 100);
  assert.equal(validRes.hasAllThreeTimeframes, true);

  // Defensive negative-expectancy stress test (E[R] <= 0) should pass when goldAnswer explicitly warns DEFENSIVE_CASH
  const defensivePayload = structuredClone(validSample.structuredScenarioPayload!);
  defensivePayload.scenarios[0].probability = 0.2; // +4.0
  defensivePayload.scenarios[1].probability = 0.3; // +1.5
  defensivePayload.scenarios[2].probability = 0.5;
  defensivePayload.scenarios[2].targetPrice = 104_000;
  defensivePayload.scenarios[2].expectedReturnPct = -20.0; // -10.0 => E[R] = -4.5%
  const defensiveSample = makeValidSftSample({
    id: "SFT-DEF-001",
    goldAnswer:
      validSample.goldAnswer +
      "\n**Cảnh báo phòng thủ DEFENSIVE_CASH:** Do E[R] âm, tuyệt đối không mua mới và ưu tiên giữ tiền mặt.",
    structuredScenarioPayload: defensivePayload,
  });
  const defRes = validateSftSample(defensiveSample);
  assert.equal(defRes.valid, true, `Defensive sample failed: ${defRes.failures.join("; ")}`);

  // Broken probability sum (0.5 + 0.4 + 0.3 = 1.2)
  const badProbPayload = structuredClone(validSample.structuredScenarioPayload!);
  badProbPayload.scenarios[0].probability = 0.5;
  const badProbRes = validateSftSample(
    makeValidSftSample({ id: "SFT-BAD-PROB", structuredScenarioPayload: badProbPayload })
  );
  assert.equal(badProbRes.valid, false);
  assert.ok(badProbRes.failures.some((f) => f.includes("tổng xác suất")));

  // Missing long-term timeframe coverage
  const missingMtfRes = validateSftSample(
    makeValidSftSample({
      id: "SFT-BAD-MTF",
      topic: "Lướt sóng T+2.5",
      question: "Đánh giá ngắn hạn T+2.5",
      reasoningCoT: ["Kiểm tra T+2.5"],
      goldAnswer:
        "Bull 35%, Base 45%, Bear 20%. E[R]=+6.25%. Vô hiệu hóa thủng 122.000. Ngắn hạn T+2.5 kẹt sàn bán ATO.",
    })
  );
  assert.equal(missingMtfRes.valid, false);
  assert.equal(missingMtfRes.hasAllThreeTimeframes, false);
  assert.ok(missingMtfRes.failures.some((f) => f.includes("khung thời gian")));
});

test("MultiScenarioTrainer.runFullTrainingEvaluation computes readinessScore, timeframeBreakdown, diagnostics, and curriculum", async () => {
  const validSft = makeValidSftSample({ id: "SFT-OK-1" });
  const badProbPayload = structuredClone(validSft.structuredScenarioPayload!);
  badProbPayload.scenarios[0].probability = 0.6; // sum = 1.25
  const invalidSft = makeValidSftSample({
    id: "SFT-FAIL-1",
    structuredScenarioPayload: badProbPayload,
  });

  const report = await MultiScenarioTrainer.runFullTrainingEvaluation({
    sftSamples: [validSft, invalidSft],
    includeLivePipeline: false,
  });

  assert.equal(report.summary.totalAdversarialCases, MULTI_SCENARIO_TRAINING_CASES.length);
  assert.equal(report.summary.passedAdversarialCases, MULTI_SCENARIO_TRAINING_CASES.length);
  assert.equal(report.summary.adversarialAccuracyPct, 100);
  assert.equal(report.summary.totalSftSamples, 2);
  assert.equal(report.summary.passedSftSamples, 1);
  assert.equal(report.summary.sftValidityPct, 50);
  assert.ok(report.readinessScore >= 0 && report.readinessScore <= 100);

  // Per-timeframe breakdown must cover all 3 horizons
  assert.ok(report.timeframeBreakdown.short_term_t25.total > 0);
  assert.ok(report.timeframeBreakdown.medium_term_quarterly.total > 0);
  assert.ok(report.timeframeBreakdown.long_term_cycle.total > 0);
  assert.equal(report.timeframeBreakdown.short_term_t25.accuracyPct, 100);

  // Curriculum must flag SFT failure
  assert.ok(report.failureDiagnostics.some((d) => d.source === "sft_dataset" && d.id === "SFT-FAIL-1"));
  assert.ok(
    report.curriculumRecommendations.some((r) => r.suggestedDrillIds.includes("SFT-FAIL-1"))
  );
});

test("AdversarialQaTrainer registers multi-scenario cases and preserves existing callers", async () => {
  assert.ok(MULTI_SCENARIO_ADVERSARIAL_CASES.length === MULTI_SCENARIO_TRAINING_CASES.length);
  for (const msCase of MULTI_SCENARIO_ADVERSARIAL_CASES) {
    assert.ok(
      ADVERSARIAL_BENCHMARK_SUITE.some((c) => c.id === msCase.id),
      `Missing registered case ${msCase.id} in ADVERSARIAL_BENCHMARK_SUITE`
    );
  }

  const benchmark = await AdversarialQaTrainer.runBenchmark();
  assert.equal(benchmark.summary.totalTests, ADVERSARIAL_BENCHMARK_SUITE.length);
  assert.equal(benchmark.results.length, ADVERSARIAL_BENCHMARK_SUITE.length);

  // Existing 5 core adversarial cases must still score 100%
  const legacyIds = ["ADV_BCTC_01", "ADV_VAL_01", "ADV_T2_01", "ADV_VERIFY_01", "ADV_PF_01"];
  for (const id of legacyIds) {
    const res = benchmark.results.find((r) => r.testId === id);
    assert.ok(res, `Missing legacy case ${id}`);
    assert.ok(res.score >= 75, `Legacy case ${id} regressed to score ${res.score}`);
  }

  // Optional multiScenarioMetrics exposure
  const msOnly = await AdversarialQaTrainer.runMultiScenarioBenchmark({
    sftSamples: [makeValidSftSample()],
    includeLivePipeline: false,
  });
  assert.equal(msOnly.summary.adversarialAccuracyPct, 100);
  assert.equal(msOnly.summary.sftValidityPct, 100);
});

test("Validates on-disk SFT datasets (orca-multi-scenario-sft.json & orca-qa-gold-sft.json)", () => {
  const dedicatedPath = path.resolve(
    process.cwd(),
    "src/lib/data/training/orca-multi-scenario-sft.json"
  );
  assert.equal(fs.existsSync(dedicatedPath), true, "orca-multi-scenario-sft.json must exist");

  const evalRes = evaluateSftDataset(dedicatedPath, { multiScenarioOnly: false });
  assert.equal(evalRes.evaluatedSamples.length, 10, "orca-multi-scenario-sft.json should have 10 samples");
  assert.equal(evalRes.validityPct, 100);
  for (const sampleRes of evalRes.evaluatedSamples) {
    assert.equal(
      sampleRes.valid,
      true,
      `On-disk SFT sample ${sampleRes.id} failed: ${sampleRes.failures.join("; ")}`
    );
  }

  const goldPath = path.resolve(
    process.cwd(),
    "src/lib/data/training/orca-qa-gold-sft.json"
  );
  const goldEval = evaluateSftDataset(goldPath, { multiScenarioOnly: true });
  assert.equal(goldEval.evaluatedSamples.length, 3, "orca-qa-gold-sft.json should have 3 multi-scenario samples");
  assert.equal(goldEval.validityPct, 100);
  for (const sampleRes of goldEval.evaluatedSamples) {
    assert.equal(
      sampleRes.valid,
      true,
      `Gold SFT sample ${sampleRes.id} failed: ${sampleRes.failures.join("; ")}`
    );
  }
});

test("Full live MultiScenarioTrainer + AdversarialQaTrainer integration passes with PRODUCTION_READY score", async () => {
  const fullReport = await MultiScenarioTrainer.runFullTrainingEvaluation({
    includeLivePipeline: true,
  });

  assert.equal(fullReport.summary.totalAdversarialCases, 9);
  assert.equal(fullReport.summary.passedAdversarialCases, 9);
  assert.equal(fullReport.summary.adversarialAccuracyPct, 100);

  assert.equal(fullReport.summary.totalSftSamples, 10);
  assert.equal(fullReport.summary.passedSftSamples, 10);
  assert.equal(fullReport.summary.sftValidityPct, 100);

  assert.equal(fullReport.summary.totalLiveCases, 9);
  assert.equal(
    fullReport.summary.passedLiveCases,
    9,
    `Live pipeline failures: ${fullReport.failureDiagnostics
      .filter((d) => d.source === "live_pipeline")
      .map((d) => `${d.id}: ${d.reason}`)
      .join(" | ")}`
  );
  assert.equal(fullReport.summary.livePipelineAccuracyPct, 100);
  assert.ok(fullReport.readinessScore >= 85, `Expected readinessScore >= 85, got ${fullReport.readinessScore}`);
  assert.equal(fullReport.readinessTier, "PRODUCTION_READY");

  // Verify AdversarialQaTrainer.runBenchmark with includeMultiScenarioMetrics
  const bench = await AdversarialQaTrainer.runBenchmark({ includeMultiScenarioMetrics: true });
  assert.ok(bench.multiScenarioMetrics, "multiScenarioMetrics must be populated when requested");
  assert.equal(bench.multiScenarioMetrics.readinessTier, "PRODUCTION_READY");
  assert.equal(bench.summary.passedCount, bench.summary.totalTests, "All AdversarialQaTrainer cases must pass >= 75");
});
