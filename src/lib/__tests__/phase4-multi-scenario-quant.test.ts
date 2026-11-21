import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextRequest } from "next/server";
import { POST as institutionalLabPost } from "@/app/api/v1/quant/institutional-lab/route";
import {
  computeAdaptiveStrategyWeights,
  computeScenarioDynamicExitPolicy,
  evaluateMarketScenarioVector,
} from "@/lib/engines/advanced-quant-math";
import { computeVn30fScenarioTailHedge } from "@/lib/engines/derivatives-arbitrage-engine";
import { runPurgedMetaLabelWalkForward } from "@/lib/engines/fx-crypto-backtest-harness";
import { evaluatePrecisionTradeSetup } from "@/lib/engines/fx-crypto-precision-engine";
import { runMultiScenarioPortfolioStressTest } from "@/lib/engines/unified-cross-asset-quant";
import type { OhlcvBar } from "@/lib/types";

describe("Phase 4: Multi-Scenario Adaptive Quant Engine, Counterfactual Stress & Adversarial Security", () => {
  it("P4-01: evaluateMarketScenarioVector conserves simplex sum(p)=1, computes Shannon entropy & shifts exit ladders between S1 and S2", () => {
    const trendScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.78, meanRevertLowVol: 0.14, crisisHighVol: 0.08 },
      efficiencyRatio: 0.68,
      adx14: 34,
      harExpansionRatio: 1.15,
      tailDegreesOfFreedom: 8.5,
      vpinOrToxicity: 0.22,
      spreadSpikeRatio: 1.0,
      macroScore: 72,
    });

    const sumTrend = Object.values(trendScenario.probabilities).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumTrend - 1.0) < 1e-3, `Expected simplex sum 1.0, got ${sumTrend}`);
    assert.equal(trendScenario.dominantScenario, "S1_TREND_EXPANSION");
    assert.equal(trendScenario.isHardLockout, false);
    assert.ok(trendScenario.shannonEntropy >= 0 && trendScenario.shannonEntropy <= 1);

    const rangeScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.12, meanRevertLowVol: 0.76, crisisHighVol: 0.12 },
      efficiencyRatio: 0.18,
      adx14: 14,
      harExpansionRatio: 0.78,
      tailDegreesOfFreedom: 9.0,
      vpinOrToxicity: 0.25,
    });
    assert.equal(rangeScenario.dominantScenario, "S2_MEAN_REVERT_RANGE");

    const exitTrend = computeScenarioDynamicExitPolicy(trendScenario, 2.2);
    const exitRange = computeScenarioDynamicExitPolicy(rangeScenario, 2.2);

    assert.equal(
      exitTrend.tp1ClosePct + exitTrend.tp2ClosePct + exitTrend.tp3ClosePct,
      100,
    );
    assert.equal(
      exitRange.tp1ClosePct + exitRange.tp2ClosePct + exitRange.tp3ClosePct,
      100,
    );
    // S1 Trend leaves a larger TP3 runner and wider trailing stop than S2 Mean-Revert Range
    assert.ok(
      exitTrend.tp3ClosePct > exitRange.tp3ClosePct,
      `Expected S1 TP3% (${exitTrend.tp3ClosePct}) > S2 TP3% (${exitRange.tp3ClosePct})`,
    );
    assert.ok(
      exitRange.tp1ClosePct > exitTrend.tp1ClosePct,
      `Expected S2 TP1% (${exitRange.tp1ClosePct}) > S1 TP1% (${exitTrend.tp1ClosePct})`,
    );
    assert.ok(exitTrend.tp3RMultiple > exitRange.tp3RMultiple);

    // Crisis Lockout S5 triggers hard lockout & 0 Kelly allocation
    const crisisScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.05, meanRevertLowVol: 0.05, crisisHighVol: 0.90 },
      tailDegreesOfFreedom: 2.5,
      vpinOrToxicity: 0.88,
      spreadSpikeRatio: 4.5,
      drawdownDeleverageScale: 0.20,
    });
    assert.equal(crisisScenario.dominantScenario, "S5_TAIL_CRISIS_LOCKOUT");
    assert.equal(crisisScenario.isHardLockout, true);
    assert.equal(crisisScenario.recommendedKellyScale, 0);
    assert.equal(crisisScenario.requireLimitEntryOnly, true);
  });

  it("P4-02: computeAdaptiveStrategyWeights dynamically rotates capital from Trend-Breakout to ICT-Liquidity-Sweep & Funding-Carry", () => {
    const trendScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.82, meanRevertLowVol: 0.10, crisisHighVol: 0.08 },
      efficiencyRatio: 0.72,
      adx14: 38,
    });
    const trendEnsemble = computeAdaptiveStrategyWeights({ scenarioVector: trendScenario });
    const sumW1 = Object.values(trendEnsemble.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumW1 - 1.0) < 1e-3);
    assert.equal(trendEnsemble.topStrategy, "TREND_BREAKOUT");

    const rangeScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.08, meanRevertLowVol: 0.82, crisisHighVol: 0.10 },
      efficiencyRatio: 0.15,
      adx14: 13,
      harExpansionRatio: 0.75,
    });
    const rangeEnsemble = computeAdaptiveStrategyWeights({ scenarioVector: rangeScenario });
    assert.equal(rangeEnsemble.topStrategy, "ICT_LIQUIDITY_SWEEP");
    assert.ok(
      rangeEnsemble.weights.ICT_LIQUIDITY_SWEEP > trendEnsemble.weights.ICT_LIQUIDITY_SWEEP,
    );

    const macroShockScenario = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.10, meanRevertLowVol: 0.20, crisisHighVol: 0.40 },
      isNewsOrCascadeLockout: true,
      spreadSpikeRatio: 3.0,
      macroScore: 28,
    });
    const shockEnsemble = computeAdaptiveStrategyWeights({ scenarioVector: macroShockScenario });
    assert.equal(shockEnsemble.topStrategy, "FUNDING_CARRY");
  });

  it("P4-03: runMultiScenarioPortfolioStressTest & computeVn30fScenarioTailHedge enforce counterfactual StressCVaR and VN30F T+2.5 tail hedge", () => {
    // 1) Concentrated unhedged portfolio exceeding daily loss budget under counterfactual shocks
    const stressUnhedged = runMultiScenarioPortfolioStressTest({
      positions: [
        { symbol: "FPT", assetType: "VN_EQUITY", direction: "BUY", notionalUsd: 12_000, isT2Locked: true },
        { symbol: "SSI", assetType: "VN_EQUITY", direction: "BUY", notionalUsd: 10_000, isT2Locked: true },
        { symbol: "BTCUSDT", assetType: "CRYPTO", direction: "BUY", notionalUsd: 8_000, stopDistancePct: 0.025 },
      ],
      accountBalanceUsd: 15_000,
      maxDailyLossUsd: 450,
      currentDailyRealizedPnlUsd: -100,
      crisisProbability: 0.55,
    });

    assert.equal(stressUnhedged.shocks.length, 4);
    assert.equal(stressUnhedged.breachesDailyBudget, true);
    assert.ok(
      stressUnhedged.recommendedPositionScale < 1.0 &&
        stressUnhedged.recommendedPositionScale >= 0.15,
      `Expected scaled down multiplier, got ${stressUnhedged.recommendedPositionScale}`,
    );

    // 2) Adding a VN30F Short Hedge reduces VN_EQUITY_FLOOR_LOCK_T25 shock loss
    const stressHedged = runMultiScenarioPortfolioStressTest({
      positions: [
        { symbol: "FPT", assetType: "VN_EQUITY", direction: "BUY", notionalUsd: 12_000, isT2Locked: true },
        { symbol: "SSI", assetType: "VN_EQUITY", direction: "BUY", notionalUsd: 10_000, isT2Locked: true },
        { symbol: "VN30F1M", assetType: "VN30F", direction: "SELL", notionalUsd: 18_000 },
      ],
      accountBalanceUsd: 15_000,
      maxDailyLossUsd: 450,
      crisisProbability: 0.55,
    });
    const shock1Unhedged = stressUnhedged.shocks.find((s) => s.shockId === "VN_EQUITY_FLOOR_LOCK_T25")!;
    const shock1Hedged = stressHedged.shocks.find((s) => s.shockId === "VN_EQUITY_FLOOR_LOCK_T25")!;
    assert.ok(
      shock1Hedged.estimatedLossUsd < shock1Unhedged.estimatedLossUsd,
      `VN30F Short hedge must reduce T+2.5 floor lock loss (${shock1Hedged.estimatedLossUsd} < ${shock1Unhedged.estimatedLossUsd})`,
    );

    // 3) Exact VN30F contract count calculation for 2.6 billion VND portfolio (~20 contracts at 1300 pts)
    const hedgePlan = computeVn30fScenarioTailHedge({
      equityPortfolioVnd: 2_600_000_000,
      t2LockedFraction: 0.80,
      portfolioBeta: 1.10,
      vn30FuturesPrice: 1300,
      kalmanHedgeRatio: 0.98,
      macroAndCrisisProb: 0.62,
    });
    assert.equal(hedgePlan.isHedgeTriggered, true);
    assert.equal(hedgePlan.contractMultiplierVnd, 100_000);
    assert.equal(hedgePlan.contractNotionalVnd, 130_000_000);
    assert.ok(hedgePlan.recommendedShortContracts >= 8 && hedgePlan.recommendedShortContracts <= 20);
  });

  it("P4-04: Precision Engine & Walk-Forward Harness preserve causal integrity and emit scenario-stratified attribution", () => {
    const bars: OhlcvBar[] = [];
    let p = 100;
    for (let i = 0; i < 90; i++) {
      const step = i % 7 === 0 ? -0.35 : 0.45;
      const open = p;
      const close = Number((p + step).toFixed(4));
      const high = Number((Math.max(open, close) + 0.25).toFixed(4));
      const low = Number((Math.min(open, close) - 0.20).toFixed(4));
      bars.push({ time: 1700000000 + i * 300, open, high, low, close, volume: 1000 + i * 15 });
      p = close;
    }

    // Causal invariance check: mutating future bars [70..89] must never alter scenario vector at bar 69
    const sliceAt69 = bars.slice(0, 70);
    const setupCausalA = evaluatePrecisionTradeSetup({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      barsExecution: sliceAt69,
    });
    const mutatedBars = bars.map((b, idx) =>
      idx >= 70 ? { ...b, close: b.close * 0.1, low: b.low * 0.05 } : { ...b },
    );
    const setupCausalB = evaluatePrecisionTradeSetup({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      barsExecution: mutatedBars.slice(0, 70),
    });

    assert.deepEqual(setupCausalA.scenario, setupCausalB.scenario);
    assert.deepEqual(setupCausalA.exitPolicy, setupCausalB.exitPolicy);

    const wfReport = runPurgedMetaLabelWalkForward({
      calibrationSeeds: [101],
      holdoutSeeds: [404],
    });
    assert.ok(wfReport.scenarioAttribution);
    assert.ok("S1_TREND_EXPANSION" in wfReport.scenarioAttribution);
    assert.ok("S2_MEAN_REVERT_RANGE" in wfReport.scenarioAttribution);
  });

  it("P4-05: Red-Team Adversarial & Security Audit on Phase 4 Math and Institutional Lab Endpoints", async () => {
    // 1) Poisoned NaN/Infinity/-Infinity inputs to Phase 4 functions never produce NaN
    const poisonedScenario = evaluateMarketScenarioVector({
      hmmProbabilities: {
        trendExpansion: Number.NaN,
        meanRevertLowVol: Number.POSITIVE_INFINITY,
        crisisHighVol: Number.NEGATIVE_INFINITY,
      },
      efficiencyRatio: Number.NaN,
      adx14: -999,
      harExpansionRatio: Number.POSITIVE_INFINITY,
      tailDegreesOfFreedom: -50,
      vpinOrToxicity: Number.NaN,
      spreadSpikeRatio: Number.POSITIVE_INFINITY,
      macroScore: Number.NaN,
      drawdownDeleverageScale: Number.NaN,
    });
    for (const val of Object.values(poisonedScenario.probabilities)) {
      assert.ok(Number.isFinite(val) && val >= 0 && val <= 1);
    }
    const poisonedExit = computeScenarioDynamicExitPolicy(poisonedScenario, Number.NaN);
    assert.equal(
      poisonedExit.tp1ClosePct + poisonedExit.tp2ClosePct + poisonedExit.tp3ClosePct,
      100,
    );
    const poisonedWeights = computeAdaptiveStrategyWeights({
      scenarioVector: poisonedScenario,
      learningRateEta: Number.NaN,
      forgettingGamma: Number.POSITIVE_INFINITY,
      empiricalScenarioSharpe: {
        TREND_BREAKOUT: { S1_TREND_EXPANSION: Number.NaN, S2_MEAN_REVERT_RANGE: Number.POSITIVE_INFINITY },
      },
    });
    for (const w of Object.values(poisonedWeights.weights)) {
      assert.ok(Number.isFinite(w) && w >= 0 && w <= 1);
    }

    const poisonedStress = runMultiScenarioPortfolioStressTest({
      positions: [
        {
          symbol: "BTCUSDT",
          assetType: "CRYPTO",
          direction: "BUY",
          notionalUsd: Number.NaN,
          stopDistancePct: -5,
        },
        {
          symbol: "EURUSD",
          assetType: "FOREX",
          direction: "SELL",
          notionalUsd: 5000,
          stopDistancePct: Number.POSITIVE_INFINITY,
        },
      ],
      accountBalanceUsd: Number.NaN,
      maxDailyLossUsd: -999,
      currentDailyRealizedPnlUsd: Number.NEGATIVE_INFINITY,
      crisisProbability: Number.NaN,
    });
    assert.ok(Number.isFinite(poisonedStress.scenarioWeightedExpectedShortfallUsd));
    assert.ok(Number.isFinite(poisonedStress.recommendedPositionScale));

    // 2) API route security test for scenario_synthesis & portfolio_stress_test
    const reqSynthesis = new Request("http://localhost/api/v1/quant/institutional-lab", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify({
        type: "scenario_synthesis",
        efficiencyRatio: "NaN",
        adx14: 999999,
        baseGrossRr: -50,
      }),
    }) as unknown as NextRequest;
    const resSynthesis = await institutionalLabPost(reqSynthesis);
    assert.equal(resSynthesis.status, 200);
    const jsonSynthesis = await resSynthesis.json();
    assert.equal(jsonSynthesis.success, true);
    assert.equal(
      jsonSynthesis.data.exitPolicy.tp1ClosePct +
        jsonSynthesis.data.exitPolicy.tp2ClosePct +
        jsonSynthesis.data.exitPolicy.tp3ClosePct,
      100,
    );

    const reqStress = new Request("http://localhost/api/v1/quant/institutional-lab", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.78" },
      body: JSON.stringify({
        type: "portfolio_stress_test",
        accountBalanceUsd: 20000,
        maxDailyLossUsd: 600,
        positions: [
          { symbol: "FPT", assetType: "VN_EQUITY", direction: "BUY", notionalUsd: 10000, isT2Locked: true },
          { symbol: "<script>alert(1)</script>", assetType: "CRYPTO", direction: "BUY", notionalUsd: 50000 },
        ],
      }),
    }) as unknown as NextRequest;
    const resStress = await institutionalLabPost(reqStress);
    assert.equal(resStress.status, 200);
    const jsonStress = await resStress.json();
    assert.equal(jsonStress.success, true);
    assert.ok(Number.isFinite(jsonStress.data.scenarioWeightedExpectedShortfallUsd));
  });
});
