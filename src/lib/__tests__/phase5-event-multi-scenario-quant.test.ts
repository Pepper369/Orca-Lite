import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextRequest } from "next/server";
import { POST as institutionalLabPost } from "@/app/api/v1/quant/institutional-lab/route";
import {
  evaluateMarketScenarioVector,
  orthogonalizeFactorMatrix,
  symmetricJacobiEigenvalues,
  updateScenarioVectorWithBayesianSurprise,
  computeVarianceInflationFactors,
  filterHighVifFactors,
  computeAssetMacroSensitivity,
} from "@/lib/engines/advanced-quant-math";
import { evaluateFullEventLifecycle } from "@/lib/engines/forex-news-shield";
import { projectUnifiedMacroScenarioReport } from "@/lib/engines/multi-scenario-engine";
import { computeVn30fScenarioTailHedge } from "@/lib/engines/derivatives-arbitrage-engine";

describe("Phase 5: Event-Driven Multi-Scenario Quant Engine & Factor Orthogonalization", () => {
  it("P5-01: Löwdin Symmetric Factor Orthogonalization eliminates cross-collinearity and preserves matrix dimensions", () => {
    // Generate N=100 observations of K=4 factors where Factor 0 and Factor 1 are highly correlated (rho ~ 0.85)
    const n = 100;
    const rawFactors: number[][] = [];
    for (let i = 0; i < n; i++) {
      const baseSignal = Math.sin(i * 0.15) + (i % 7) * 0.2;
      const f0 = baseSignal + (i % 3) * 0.1;
      const f1 = baseSignal * 0.9 + ((i * 3) % 5) * 0.05; // strongly correlated with f0
      const f2 = Math.cos(i * 0.2) + ((i * 2) % 4) * 0.15;
      const f3 = ((i * 5) % 11) * 0.3 - 1.5;
      rawFactors.push([f0, f1, f2, f3]);
    }

    const result = orthogonalizeFactorMatrix(rawFactors);

    assert.equal(result.orthogonalizedMatrix.length, n);
    assert.equal(result.orthogonalizedMatrix[0]!.length, 4);

    // Initial cross-correlation between f0 and f1 must be high
    assert.ok(
      result.maxAbsCrossCorrelationBefore >= 0.75,
      `Expected max initial corr >= 0.75, got ${result.maxAbsCrossCorrelationBefore}`
    );

    // After Löwdin orthogonalization, all off-diagonal correlations must collapse to near zero (< 0.01)
    assert.ok(
      result.maxAbsCrossCorrelationAfter <= 0.01,
      `Expected max final corr <= 0.01, got ${result.maxAbsCrossCorrelationAfter}`
    );

    // Diagonal elements of correlationMatrixAfter must be 1.0
    for (let k = 0; k < 4; k++) {
      assert.ok(
        Math.abs(result.correlationMatrixAfter[k]![k]! - 1.0) < 1e-4,
        `Diagonal element [${k}][${k}] should be 1.0`
      );
    }

    // Condition number must be finite and >= 1.0
    assert.ok(result.conditionNumber >= 1.0 && Number.isFinite(result.conditionNumber));
    assert.equal(result.eigenvalues.length, 4);
    // Eigenvalues should be sorted descending
    for (let k = 0; k < 3; k++) {
      assert.ok(result.eigenvalues[k]! >= result.eigenvalues[k + 1]!);
    }
  });

  it("P5-02: Bayesian Macro Surprise Engine updates posteriors, conserves simplex sum=1, and triggers hard lockout during CPI shock", () => {
    const priorSimplex = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.40, meanRevertLowVol: 0.45, crisisHighVol: 0.15 },
      efficiencyRatio: 0.42,
      adx14: 22,
    });

    // Case A: CPI inflation shock (+2.8 sigma surprise) arriving in 5 minutes
    const cpiShockResult = updateScenarioVectorWithBayesianSurprise(
      priorSimplex,
      [
        {
          eventId: "us-cpi-yoy",
          name: "US CPI YoY",
          currency: "USD",
          importance: "CRITICAL",
          category: "INFLATION",
          standardizedSurpriseScore: 2.8,
          minutesToEvent: -5, // 5 minutes before news
        },
      ],
      { targetAsset: "EURUSD" }
    );

    const sumA = Object.values(cpiShockResult.updatedProbabilities).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumA - 1.0) < 1e-3, `Expected simplex sum 1.0, got ${sumA}`);
    assert.equal(cpiShockResult.lifecyclePhase, "EVENT_SHOCK_FREEZE");
    assert.equal(cpiShockResult.isHardLockout, true);
    assert.equal(cpiShockResult.executionPolicy, "REJECT_MARKET_ORDERS");
    assert.equal(cpiShockResult.recommendedKellyScale, 0);
    assert.ok(cpiShockResult.updatedProbabilities.S4_MACRO_EVENT_SHOCK > 0.4);

    // Case B: Post-Event Drift (90 minutes after positive GDP release, +1.8 sigma)
    const gdpDriftResult = updateScenarioVectorWithBayesianSurprise(priorSimplex, [
      {
        eventId: "us-gdp-qoq",
        name: "US GDP QoQ",
        currency: "USD",
        importance: "HIGH",
        category: "GROWTH",
        standardizedSurpriseScore: 1.8,
        minutesToEvent: 90, // 90 minutes after release
      },
    ]);

    const sumB = Object.values(gdpDriftResult.updatedProbabilities).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumB - 1.0) < 1e-3, `Expected simplex sum 1.0, got ${sumB}`);
    assert.equal(gdpDriftResult.lifecyclePhase, "POST_EVENT_DRIFT");
    assert.equal(gdpDriftResult.isHardLockout, false);
    assert.equal(gdpDriftResult.executionPolicy, "ALLOW_ALL");
    assert.ok(gdpDriftResult.recommendedKellyScale > 0.5);
  });

  it("P5-03: evaluateFullEventLifecycle properly segregates 3-phase lifecycle and assigns dynamic slippage/spread buffers", () => {
    const mockEvents = [
      {
        name: "US Non-Farm Payrolls",
        time: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins before
        currency: "USD",
        importance: "high",
      },
    ];

    // Pre-event compression (30 mins before)
    const preResult = evaluateFullEventLifecycle("EURUSD", Date.now(), mockEvents);
    assert.equal(preResult.phase, "PRE_EVENT_COMPRESSION");
    assert.equal(preResult.isLockout, false);
    assert.equal(preResult.executionRule, "PASSIVE_LIMIT_ONLY");
    assert.ok(preResult.spreadMultiplier > 1.0);

    // Freeze (5 mins before)
    const freezeEvents = [
      {
        name: "FOMC Rate Decision",
        time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        currency: "USD",
        importance: "CRITICAL",
      },
    ];
    const freezeResult = evaluateFullEventLifecycle("USDJPY", Date.now(), freezeEvents);
    assert.equal(freezeResult.phase, "EVENT_SHOCK_FREEZE");
    assert.equal(freezeResult.isLockout, true);
    assert.equal(freezeResult.executionRule, "REJECT_MARKET_ORDERS");
    assert.ok(freezeResult.spreadMultiplier >= 3.0);

    // Recovery (35 mins after)
    const recoveryEvents = [
      {
        name: "US CPI",
        time: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        currency: "USD",
        importance: "high",
      },
    ];
    const recoveryResult = evaluateFullEventLifecycle("XAUUSD", Date.now(), recoveryEvents);
    assert.equal(recoveryResult.phase, "POST_EVENT_RECOVERY");
    assert.equal(recoveryResult.isLockout, false);
    assert.equal(recoveryResult.executionRule, "TWAP_ONLY");
  });

  it("P5-04: projectUnifiedMacroScenarioReport generates institutional reports, enforces T+2.5 liquidity haircut and VN30F tail hedging", () => {
    // 1. Benign VN-Index scenario
    const benignReport = projectUnifiedMacroScenarioReport({
      symbol: "VNINDEX",
      currentPrice: 1285,
      portfolioValueVND: 1_000_000_000, // 1 tỷ VND
      portfolioBeta: 1.1,
      vn30fIndexPrice: 1290,
      macroEvents: [
        {
          eventId: "vn-gdp",
          name: "Vietnam GDP Growth",
          currency: "VND",
          importance: "HIGH",
          standardizedSurpriseScore: 1.2,
          minutesToEvent: 120, // 2 hours after
        },
      ],
      marketScenarioInput: {
        efficiencyRatio: 0.55,
        adx14: 28,
      },
    });

    assert.equal(benignReport.symbol, "VNINDEX");
    assert.equal(benignReport.currentPrice, 1285);
    const probSum =
      benignReport.scenarios.bull.probability +
      benignReport.scenarios.base.probability +
      benignReport.scenarios.bear.probability;
    assert.ok(Math.abs(probSum - 1.0) < 1e-3, `Prob sum should be 1.0, got ${probSum}`);
    assert.ok(benignReport.metrics.netExpectedReturnPct > 0);
    assert.equal(benignReport.eventLifecycle.isHardLockout, false);

    // 2. Severe Macro Crisis Shock scenario (Fed Emergency Rate Hike + SBV tightening)
    const crisisReport = projectUnifiedMacroScenarioReport({
      symbol: "VNINDEX",
      currentPrice: 1285,
      portfolioValueVND: 1_000_000_000,
      portfolioBeta: 1.25,
      vn30fIndexPrice: 1290,
      macroEvents: [
        {
          eventId: "fed-hike",
          name: "Fed Rate Decision Shock",
          currency: "USD",
          importance: "CRITICAL",
          standardizedSurpriseScore: -3.2,
          minutesToEvent: 0, // In shock freeze
        },
      ],
      marketScenarioInput: {
        vpinOrToxicity: 0.82,
        spreadSpikeRatio: 3.5,
        tailDegreesOfFreedom: 2.8,
        drawdownDeleverageScale: 0.25,
      },
    });

    assert.equal(crisisReport.eventLifecycle.isHardLockout, true);
    assert.equal(crisisReport.eventLifecycle.phase, "EVENT_SHOCK_FREEZE");
    assert.equal(crisisReport.metrics.verdict, "DEFENSIVE_CASH");
    // Under crisis, cash allocation must be high (>= 80%)
    assert.ok(crisisReport.allocation.cashPct >= 80);
    // VN30F Tail Hedge must be activated
    assert.equal(crisisReport.tailRiskAndHedging.vn30fHedgeRequired, true);
    assert.ok(crisisReport.tailRiskAndHedging.recommendedShortContracts > 0);
    // Slippage haircut should be substantial (>= 14%)
    assert.ok(crisisReport.tailRiskAndHedging.estimatedFloorLockSlippagePct >= 14.0);
    // Net expected return must be lower than raw expected return
    assert.ok(crisisReport.metrics.netExpectedReturnPct < crisisReport.metrics.rawExpectedReturnPct);
  });

  it("P5-05: Institutional Lab API correctly routes and executes factor orthogonalization, Bayesian updates, and unified reports", async () => {
    // 1. Test factor_orthogonalization endpoint
    const factorReq = new Request("http://localhost/api/v1/quant/institutional-lab", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.88" },
      body: JSON.stringify({
        type: "factor_orthogonalization",
        factorMatrix: [
          [1.0, 1.2, 0.5],
          [2.0, 2.3, 0.9],
          [3.0, 3.1, 1.4],
          [4.0, 4.2, 2.0],
          [5.0, 4.9, 2.5],
        ],
        ridgeLambda: 1e-4,
      }),
    }) as unknown as NextRequest;

    const factorRes = await institutionalLabPost(factorReq);
    assert.equal(factorRes.status, 200);
    const factorData = await factorRes.json();
    assert.equal(factorData.success, true);
    assert.equal(factorData.data.orthogonalizedMatrix.length, 5);
    assert.equal(factorData.data.orthogonalizedMatrix[0].length, 3);
    assert.ok(factorData.data.conditionNumber >= 1.0);

    // 2. Test bayesian_macro_update endpoint
    const bayesReq = new Request("http://localhost/api/v1/quant/institutional-lab", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.88" },
      body: JSON.stringify({
        type: "bayesian_macro_update",
        macroEvents: [
          {
            eventId: "cpi-test",
            name: "US CPI",
            currency: "USD",
            importance: "CRITICAL",
            standardizedSurpriseScore: 2.5,
            minutesToEvent: -10,
          },
        ],
      }),
    }) as unknown as NextRequest;

    const bayesRes = await institutionalLabPost(bayesReq);
    assert.equal(bayesRes.status, 200);
    const bayesData = await bayesRes.json();
    assert.equal(bayesData.success, true);
    assert.equal(bayesData.data.lifecyclePhase, "EVENT_SHOCK_FREEZE");
    assert.equal(bayesData.data.isHardLockout, true);

    // 3. Test unified_macro_scenario endpoint
    const reportReq = new Request("http://localhost/api/v1/quant/institutional-lab", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.88" },
      body: JSON.stringify({
        type: "unified_macro_scenario",
        symbol: "FPT",
        currentPrice: 135_000,
        portfolioValueVND: 500_000_000,
        portfolioBeta: 1.15,
        vn30fIndexPrice: 1295,
      }),
    }) as unknown as NextRequest;

    const reportRes = await institutionalLabPost(reportReq);
    assert.equal(reportRes.status, 200);
    const reportData = await reportRes.json();
    assert.equal(reportData.success, true);
    assert.equal(reportData.data.symbol, "FPT");
    assert.ok(reportData.data.scenarios.bull.targetPrice > 135_000);
    assert.ok(reportData.data.scenarios.bear.targetPrice < 135_000);
  });

  it("P5-06: Variance Inflation Factors (VIF) and automated multicollinearity factor pruning filterHighVifFactors", () => {
    // Construct N=100 observations of 4 factors: F0, F1, F2, F3
    // where F1 is an almost exact linear replica of F0 (rho > 0.98), causing extreme VIF
    const n = 100;
    const factorMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const f0 = Math.sin(i * 0.2) + (i % 5) * 0.3;
      const f1 = f0 * 1.02 + ((i % 3) * 0.005); // Collinear with f0!
      const f2 = Math.cos(i * 0.15) * 2.0;
      const f3 = ((i * 7) % 13) * 0.25 - 1.5;
      factorMatrix.push([f0, f1, f2, f3]);
    }

    const factorNames = ["MOMENTUM_FAST", "MOMENTUM_REPLICA", "VOLATILITY_HAR", "OFI_IMBALANCE"];
    const pruningResult = filterHighVifFactors(factorMatrix, factorNames, 10.0);

    assert.equal(pruningResult.isPruned, true);
    assert.ok(pruningResult.removedFactorNames.length >= 1);
    // Either MOMENTUM_FAST or MOMENTUM_REPLICA should be pruned
    assert.ok(
      pruningResult.removedFactorNames.includes("MOMENTUM_REPLICA") ||
        pruningResult.removedFactorNames.includes("MOMENTUM_FAST")
    );
    assert.ok(pruningResult.maxVifAfter <= 10.0);
    assert.equal(pruningResult.cleanedMatrix[0]!.length, 3);
  });

  it("P5-07: Macro Cross-Asset Sensitivity and Hawkes Exponential Shock Dissipation", () => {
    // 1. Verify cross-asset sensitivity mapping
    assert.equal(computeAssetMacroSensitivity("VNINDEX", "VND"), 1.0);
    assert.equal(computeAssetMacroSensitivity("VNINDEX", "USD"), 0.70);
    assert.equal(computeAssetMacroSensitivity("EURUSD", "EUR"), 1.0);
    assert.equal(computeAssetMacroSensitivity("BTCUSDT", "USD"), 1.0); // USD pegged pair
    assert.equal(computeAssetMacroSensitivity("BTCUSDT", "EUR"), 0.45); // Cross-currency crypto
    assert.equal(computeAssetMacroSensitivity("XAUUSD", "USD"), 1.0);

    // 2. Verify Hawkes shock dissipation: shock at t=0 vs shock at t=180 minutes
    const priorSimplex = evaluateMarketScenarioVector({
      hmmProbabilities: { trendExpansion: 0.30, meanRevertLowVol: 0.50, crisisHighVol: 0.20 },
    });

    const immediateShock = updateScenarioVectorWithBayesianSurprise(
      priorSimplex,
      [
        {
          eventId: "us-cpi",
          name: "US CPI",
          currency: "USD",
          importance: "CRITICAL",
          standardizedSurpriseScore: 2.5,
          minutesToEvent: 0,
        },
      ],
      { targetAsset: "VNINDEX", hawkesDecayHalfLifeMins: 90 }
    );

    const dissipatedShock = updateScenarioVectorWithBayesianSurprise(
      priorSimplex,
      [
        {
          eventId: "us-cpi",
          name: "US CPI",
          currency: "USD",
          importance: "CRITICAL",
          standardizedSurpriseScore: 2.5,
          minutesToEvent: 180, // 2 half-lives later (25% residual strength)
        },
      ],
      { targetAsset: "VNINDEX", hawkesDecayHalfLifeMins: 90 }
    );

    // Immediate shock triggers hard lockout, while 180m dissipated shock allows trading
    assert.equal(immediateShock.isHardLockout, true);
    assert.equal(dissipatedShock.isHardLockout, false);
    assert.ok(
      immediateShock.updatedProbabilities.S4_MACRO_EVENT_SHOCK >
        dissipatedShock.updatedProbabilities.S4_MACRO_EVENT_SHOCK
    );
  });

  it("P5-08: Merged Cascade Blackout Windows & Real-time Spread Filter in evaluateFullEventLifecycle", () => {
    const baseTime = Date.now();
    // Two high-impact events separated by 25 minutes (overlapping freeze intervals)
    const cascadeEvents = [
      {
        name: "US Non-Farm Payrolls",
        time: new Date(baseTime + 10 * 60 * 1000).toISOString(), // in 10 mins
        currency: "USD",
        importance: "CRITICAL",
      },
      {
        name: "Fed Chair Powell Speech",
        time: new Date(baseTime + 35 * 60 * 1000).toISOString(), // in 35 mins (overlaps with post-NFP)
        currency: "USD",
        importance: "CRITICAL",
      },
    ];

    const cascadeResult = evaluateFullEventLifecycle("EURUSD", baseTime, cascadeEvents);
    assert.equal(cascadeResult.phase, "EVENT_SHOCK_FREEZE");
    assert.equal(cascadeResult.isLockout, true);
    assert.equal(cascadeResult.hasCascadeMerge, true);
    assert.equal(cascadeResult.executionRule, "REJECT_MARKET_ORDERS");

    // Real-time spread expansion check: event finished 30m ago, but spread is 5.5 pips (> max 2.8 pips)
    const singlePastEvent = [
      {
        name: "US CPI",
        time: new Date(baseTime - 30 * 60 * 1000).toISOString(),
        currency: "USD",
        importance: "HIGH",
      },
    ];
    const spreadBlownResult = evaluateFullEventLifecycle("GBPUSD", baseTime, singlePastEvent, {
      currentSpreadPips: 5.5,
      maxAllowedSpreadPips: 2.8,
    });
    assert.equal(spreadBlownResult.phase, "POST_EVENT_RECOVERY");
    assert.equal(spreadBlownResult.isSpreadExpanded, true);
    assert.equal(spreadBlownResult.executionRule, "PASSIVE_LIMIT_ONLY");
    assert.ok(spreadBlownResult.rationaleVi.includes("Cảnh báo dãn spread"));
  });

  it("P5-09: VN30F Basis Discount Cost Drag and Basis Damping in Tail Hedge Calculation", () => {
    // 1. Direct engine test in computeVn30fScenarioTailHedge
    const normalHedge = computeVn30fScenarioTailHedge({
      equityPortfolioVnd: 1_000_000_000,
      vn30FuturesPrice: 1300,
      macroAndCrisisProb: 0.65,
      vn30fBasisPoints: 0,
    });

    const discountedHedge = computeVn30fScenarioTailHedge({
      equityPortfolioVnd: 1_000_000_000,
      vn30FuturesPrice: 1300,
      macroAndCrisisProb: 0.65,
      vn30fBasisPoints: -18.0, // Deep discount of -18 points
    });

    assert.equal(normalHedge.isHedgeTriggered, true);
    assert.equal(discountedHedge.isHedgeTriggered, true);
    assert.ok(discountedHedge.basisDampingRatio! < 1.0);
    assert.ok(discountedHedge.estimatedBasisDragVnd! > 0);
    assert.ok(discountedHedge.recommendedShortContracts <= normalHedge.recommendedShortContracts);

    // 2. Report synthesizer integration in projectUnifiedMacroScenarioReport
    const report = projectUnifiedMacroScenarioReport({
      symbol: "VNINDEX",
      currentPrice: 1285,
      portfolioValueVND: 1_000_000_000,
      vn30fIndexPrice: 1290,
      vn30fBasisPoints: -14.5,
      macroEvents: [
        {
          eventId: "shock-1",
          name: "Emergency Rate Hike",
          currency: "VND",
          importance: "CRITICAL",
          standardizedSurpriseScore: -2.8,
          minutesToEvent: 0,
        },
      ],
    });

    assert.equal(report.tailRiskAndHedging.vn30fHedgeRequired, true);
    assert.equal(report.tailRiskAndHedging.basisPoints, -14.5);
    assert.ok(report.tailRiskAndHedging.estimatedBasisDragVnd > 0);
    assert.ok(report.tailRiskAndHedging.hedgeRationaleVi.includes("Basis Discount"));
  });
});
