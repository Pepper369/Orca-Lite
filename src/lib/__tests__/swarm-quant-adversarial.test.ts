import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySymmetricCusumFilter,
  calculateAlmgrenChrissExecution,
  calculateDeflatedSharpeRatio,
  calculateHRP,
  calculateNestedClusteredOptimization,
  calculateTripleBarrierLevels,
  calculateVaRAndCVaR,
  computeEmpiricalShrinkageCovariance,
  computeYangZhangVolatility,
  estimateOrnsteinUhlenbeck,
  estimateTailDegreesOfFreedom,
  evaluateContinuousDrawdownGovernor,
  evaluateFactorExposureBudget,
  filterOnlineRegimeHmm,
  forecastHarRealizedVolatility,
  studentTCdf,
  type OhlcBarLike,
} from "../engines/advanced-quant-math";
import {
  applyIsotonicCalibration,
  buildPurgedEmbargoedSplits,
  calculateCombinatorialPurgedPbo,
  computeBrierScore,
  computeSampleUniquenessWeights,
  fitIsotonicCalibration,
  predictMetaLabelProbability,
  trainPurgedMetaLabelClassifier,
  type MetaLabelFeatureVector,
  type MetaLabelTrainingSample,
} from "../engines/meta-labeling-calibration";

function assertAllFiniteNumbers(obj: unknown, path = "root", allowPositiveInfinityKeys: string[] = []): void {
  if (typeof obj === "number") {
    const key = path.split(".").pop() ?? "";
    if (allowPositiveInfinityKeys.includes(key) && obj === Infinity) {
      return;
    }
    assert.ok(Number.isFinite(obj), `Expected finite number at ${path}, got ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertAllFiniteNumbers(item, `${path}[${idx}]`, allowPositiveInfinityKeys));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      assertAllFiniteNumbers(v, `${path}.${k}`, allowPositiveInfinityKeys);
    }
  }
}

describe("Swarm Quant Adversarial Numerical & Edge-Case Hardening", () => {
  it("A1: calculateHRP & calculateNestedClusteredOptimization survive singular all-zero, NaN/Infinity, and malformed covariance matrices", () => {
    // Empty and 1-element arrays
    const emptyHrp = calculateHRP([], []);
    assert.deepEqual(emptyHrp.weights, {});
    const singleHrp = calculateHRP(["BTCUSDT"], [[0]]);
    assert.equal(singleHrp.weights.BTCUSDT, 1.0);

    const emptyNco = calculateNestedClusteredOptimization([], []);
    assert.deepEqual(emptyNco.weights, {});
    const singleNco = calculateNestedClusteredOptimization(["BTCUSDT"], [[NaN]]);
    assert.equal(singleNco.weights.BTCUSDT, 1.0);

    const symbols = ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSDT"];
    const singularZeroCov = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const poisonedCov = [
      [NaN, Infinity, -Infinity, 0],
      [Infinity, -0.05, NaN, 1e308],
      [-Infinity, NaN, 0, -1e308],
      [0, 1e308, -1e308, Infinity],
    ];
    const poisonedCorr = [
      [1, NaN, Infinity, -5],
      [NaN, 1, -Infinity, 5],
      [Infinity, -Infinity, 1, NaN],
      [-5, 5, NaN, 1],
    ];

    for (const cov of [singularZeroCov, poisonedCov, []]) {
      const hrp = calculateHRP(symbols, cov, poisonedCorr);
      assertAllFiniteNumbers(hrp);
      const hrpSum = Object.values(hrp.weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(hrpSum - 1.0) < 0.01, `HRP weights must sum to ~1.0, got ${hrpSum}`);

      const nco = calculateNestedClusteredOptimization(symbols, cov, NaN);
      assertAllFiniteNumbers(nco);
      const ncoSum = Object.values(nco.weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(ncoSum - 1.0) < 0.01, `NCO weights must sum to ~1.0, got ${ncoSum}`);
    }
  });

  it("A2: computeEmpiricalShrinkageCovariance handles NaN/Infinity returns, all-constant series, and extreme shrinkageAlpha", () => {
    assert.deepEqual(computeEmpiricalShrinkageCovariance([]).covMatrix, []);

    const adversarialReturns = [
      [NaN, Infinity, -Infinity, 0.01, -0.02, 0.015, 0.005, -0.01, 0.02, 0.01, -0.005, 0.003, 0.004, -0.002, 0.001],
      new Array(20).fill(0), // zero variance series
      new Array(20).fill(0.05), // constant non-zero series
      [1e9, -0.999999, NaN, 0.02, -0.01, 0.005, 0.01, -0.02, 0.015, -0.005, 0.002, 0.008, -0.004, 0.003, 0.001],
    ];
    const res = computeEmpiricalShrinkageCovariance(adversarialReturns, [NaN, -1, Infinity, 0], NaN);
    assertAllFiniteNumbers(res);
    assert.equal(res.covMatrix.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.ok(res.covMatrix[i]![i]! > 0, `Diagonal variance [${i}][${i}] must be strictly positive`);
    }

    // Short series fallback with poisoned fallbackDailyVols
    const shortRes = computeEmpiricalShrinkageCovariance([[NaN, 0.01], [Infinity]], [NaN, -5], Infinity);
    assertAllFiniteNumbers(shortRes);
    assert.equal(shortRes.isEmpirical, false);
  });

  it("A3: estimateOrnsteinUhlenbeck handles empty, 1-element, NaN/Infinity, negative/zero prices, and dt <= 0", () => {
    for (const s of [
      [],
      [100],
      [NaN, Infinity, -Infinity],
      [0, 0, 0, 0, 0, 0],
      [-50, -55, -48, -52, -49, -51, -50, -53],
      [100, 1e-9, 100, 1e-9, 100, 1e-9], // 99.999999% flash crash oscillation
      [100, 98, NaN, 101, Infinity, 99, 100, 99.5, 100.2],
    ]) {
      const ou = estimateOrnsteinUhlenbeck(s, -5);
      assertAllFiniteNumbers(ou, "ou", ["halfLife"]);
      const ouNanDt = estimateOrnsteinUhlenbeck(s, NaN);
      assertAllFiniteNumbers(ouNanDt, "ouNanDt", ["halfLife"]);
    }
  });

  it("A4: calculateAlmgrenChrissExecution avoids sinh(kappa*T) overflow and handles zero/negative/NaN parameters", () => {
    // Extreme kappa * T > 710 that would overflow Math.sinh to Infinity
    const extremeUrgency = calculateAlmgrenChrissExecution({
      totalShares: 500_000,
      totalTimeHours: 24,
      intervalsCount: 12,
      riskAversion: 100,
      dailyVolatilityPct: 150,
      tempImpactFactor: 1e-12,
      currentPrice: 50_000,
    });
    assertAllFiniteNumbers(extremeUrgency);
    const tradedSum = extremeUrgency.schedule.reduce((acc, s) => acc + s.sharesToTrade, 0);
    assert.equal(tradedSum, 500_000, "Extreme urgency schedule must still trade exact totalShares");

    // Zero / negative / NaN parameters
    const poisonedAc = calculateAlmgrenChrissExecution({
      totalShares: -1000,
      totalTimeHours: 0,
      intervalsCount: -5,
      riskAversion: NaN,
      dailyVolatilityPct: -20,
      tempImpactFactor: -1,
      currentPrice: NaN,
    });
    assertAllFiniteNumbers(poisonedAc);
    assert.equal(poisonedAc.schedule.reduce((a, s) => a + s.sharesToTrade, 0), 0);
  });

  it("A5: calculateDeflatedSharpeRatio, calculateVaRAndCVaR, studentTCdf, estimateTailDegreesOfFreedom, calculateTripleBarrierLevels", () => {
    // DSR with extreme skewness/kurtosis that could make raw varianceFactor negative
    const dsr = calculateDeflatedSharpeRatio({
      observedSharpe: 15,
      trialsCount: 1_000_000,
      sampleLengthBars: 2,
      skewness: 50,
      kurtosis: -10,
      varSharpeEstimates: -5,
    });
    assertAllFiniteNumbers(dsr);
    assert.ok(dsr.deflatedSharpeRatio >= 0 && dsr.deflatedSharpeRatio <= 1);

    const dsrNan = calculateDeflatedSharpeRatio({
      observedSharpe: NaN,
      trialsCount: NaN,
      sampleLengthBars: Infinity,
      skewness: NaN,
      kurtosis: Infinity,
      varSharpeEstimates: NaN,
    });
    assertAllFiniteNumbers(dsrNan);

    // VaR & CVaR with NaN, Infinity, constant returns, and -99.9% flash crash
    for (const rets of [
      [],
      [0.01],
      [NaN, Infinity, -Infinity, NaN, 0.01],
      [0, 0, 0, 0, 0, 0, 0],
      [-0.999, -0.999, 0.001, 0.002, -0.5, 0.003, -0.999, 500],
    ]) {
      const risk = calculateVaRAndCVaR(rets);
      assertAllFiniteNumbers(risk);
      assert.ok(risk.cvar95Pct >= risk.var95Pct);
      assert.ok(risk.cvar99Pct >= risk.var99Pct);
    }

    // Student-t CDF & Tail DoF with NaN / Infinity / extreme t
    assert.equal(studentTCdf(NaN, NaN), 0.5);
    assert.equal(studentTCdf(Infinity, 4), 1);
    assert.equal(studentTCdf(-Infinity, 4), 0);
    assert.ok(Number.isFinite(studentTCdf(1e300, 3)));
    assert.ok(Number.isFinite(studentTCdf(-1e300, -10)));

    assert.ok(Number.isFinite(estimateTailDegreesOfFreedom([], NaN)));
    assert.ok(Number.isFinite(estimateTailDegreesOfFreedom(new Array(25).fill(1e200), Infinity)));
    assert.ok(Number.isFinite(estimateTailDegreesOfFreedom(new Array(25).fill(0), -5)));

    // Triple Barrier with zero/negative/NaN prices and multipliers
    const tb = calculateTripleBarrierLevels(NaN, -5, 0, -2, NaN);
    assertAllFiniteNumbers(tb);
    assert.ok(tb.lowerBarrierPrice > 0);
  });

  it("A6: computeYangZhangVolatility, forecastHarRealizedVolatility, filterOnlineRegimeHmm, applySymmetricCusumFilter survive 99.9% flash-crash & poisoned OHLC bars", () => {
    const emptyBars: OhlcBarLike[] = [];
    const oneBar: OhlcBarLike[] = [{ open: 100, high: 105, low: 95, close: 102 }];
    const flashCrashAndPoisonedBars: OhlcBarLike[] = Array.from({ length: 30 }, (_, i) => {
      if (i === 5) return { open: NaN, high: Infinity, low: -Infinity, close: NaN };
      if (i === 10) return { open: 0, high: -10, low: -50, close: 0 };
      if (i === 15) return { open: 100, high: 100, low: 0.05, close: 0.1 }; // 99.9% flash crash bar!
      if (i === 16) return { open: 0.1, high: 95, low: 0.08, close: 90 }; // V-recovery
      // Inverted high < low bar
      if (i === 20) return { open: 100, high: 80, low: 120, close: 95 };
      return { open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i };
    });

    for (const b of [emptyBars, oneBar, flashCrashAndPoisonedBars]) {
      const yz = computeYangZhangVolatility(b, NaN, -252);
      assertAllFiniteNumbers(yz);
      assert.ok(yz.dailyVol > 0 && yz.annualizedVol > 0);

      const har = forecastHarRealizedVolatility(b, NaN);
      assertAllFiniteNumbers(har);
      assert.ok(har.forecastBarVolPct > 0);

      const hmm = filterOnlineRegimeHmm(b);
      assertAllFiniteNumbers(hmm);
      const pSum =
        hmm.probabilities.trendExpansion +
        hmm.probabilities.meanRevertLowVol +
        hmm.probabilities.crisisHighVol;
      assert.ok(Math.abs(pSum - 1.0) < 0.01, `HMM probabilities must sum to 1.0, got ${pSum}`);
      assert.ok(hmm.entropy >= 0 && hmm.entropy <= 1);

      const cusum = applySymmetricCusumFilter(b, NaN);
      assertAllFiniteNumbers(cusum);
      assert.ok(cusum.adaptiveThreshold > 0);
    }
  });

  it("A7: evaluateFactorExposureBudget & evaluateContinuousDrawdownGovernor survive NaN/Infinity/negative balances and reversed drawdown thresholds", () => {
    const factorRes = evaluateFactorExposureBudget({
      candidateSymbol: "EURUSD",
      candidateAssetType: "FOREX",
      candidateDirection: "BUY",
      candidateRiskPct: NaN,
      openPositions: [
        { symbol: "GBPUSD", assetType: "FOREX", direction: "BUY", riskFractionPct: NaN },
        { symbol: "XAUUSD", assetType: "FOREX", direction: "BUY", riskFractionPct: -50 },
      ],
      maxSameClusterPositions: NaN,
      maxClusterRiskPct: -10,
    });
    assertAllFiniteNumbers(factorRes);

    for (const ddParams of [
      {
        currentBalanceUsd: NaN,
        peakBalanceUsd: Infinity,
        dailyRealizedPnlUsd: -Infinity,
        maxDailyLossUsd: 0,
        portfolioAnnualizedVol: NaN,
        targetAnnualizedVol: -1,
        softDrawdownStartPct: 10,
        hardDrawdownLimitPct: 2, // Reversed soft > hard
        minDeleveragedScale: -5,
      },
      {
        currentBalanceUsd: -5000,
        peakBalanceUsd: -100,
        dailyRealizedPnlUsd: NaN,
        maxDailyLossUsd: -200,
        portfolioAnnualizedVol: Infinity,
      },
    ]) {
      const gov = evaluateContinuousDrawdownGovernor(ddParams);
      assertAllFiniteNumbers(gov);
      assert.ok(gov.recommendedSizeScale >= 0 && gov.recommendedSizeScale <= 1.25);
    }
  });

  it("A8: meta-labeling-calibration handles reversed startIdx > endIdx, NaN/Infinity indices, extreme spans, and poisoned features/matrices", () => {
    // Empty and 1-element events
    assert.deepEqual(computeSampleUniquenessWeights([]), []);
    assert.deepEqual(computeSampleUniquenessWeights([{ startIdx: 5, endIdx: 10 }]), [1]);
    assert.deepEqual(buildPurgedEmbargoedSplits([]), []);
    assert.deepEqual(buildPurgedEmbargoedSplits([{ startIdx: 0, endIdx: 5 }]), []);

    // Reversed startIdx > endIdx, negative indices, NaN/Infinity, and huge indices
    const adversarialEvents = [
      { startIdx: 50, endIdx: 10 }, // reversed!
      { startIdx: 45, endIdx: 15 }, // reversed and overlapping [10, 50]!
      { startIdx: -100, endIdx: -5 },
      { startIdx: NaN, endIdx: Infinity },
      { startIdx: 10, endIdx: 25 },
      { startIdx: 20, endIdx: 5 }, // reversed overlapping [5, 20]!
      { startIdx: 60, endIdx: 70 },
      { startIdx: 80, endIdx: 90 },
    ];
    const weights = computeSampleUniquenessWeights(adversarialEvents, NaN);
    assertAllFiniteNumbers(weights);
    assert.equal(weights.length, adversarialEvents.length);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(weightSum - adversarialEvents.length) < 0.05,
      `Uniqueness weights must sum to N (${adversarialEvents.length}), got ${weightSum}`,
    );

    const splits = buildPurgedEmbargoedSplits(adversarialEvents, NaN, -0.5);
    assertAllFiniteNumbers(splits);
    assert.ok(splits.length >= 2);
    // Verify reversed spans were properly purged when overlapping test fold
    for (const sp of splits) {
      for (const trIdx of sp.trainIndices) {
        assert.ok(!sp.testIndices.includes(trIdx));
      }
    }

    // Isotonic calibration with NaN / Infinity probabilities and weights
    const isoModel = fitIsotonicCalibration(
      [NaN, Infinity, -Infinity, 0.2, 0.8, 0.4, 0.9, -5],
      [0, 1, 0, 0, 1, 1, 1, 0],
      [NaN, -10, Infinity, 1, 2, 0, 1, 1],
    );
    assertAllFiniteNumbers(isoModel);
    for (const probe of [NaN, Infinity, -Infinity, -10, 0, 0.5, 1, 10]) {
      const calP = applyIsotonicCalibration(probe, isoModel);
      assert.ok(Number.isFinite(calP) && calP >= 0.05 && calP <= 0.96);
    }
    assert.ok(Number.isFinite(computeBrierScore([NaN, Infinity], [1, 0], [NaN, -1])));

    // Meta-Label training & prediction with poisoned features
    const poisonedFeatures: MetaLabelFeatureVector = {
      primaryScoreNorm: NaN,
      hmmTrendProb: Infinity,
      hmmCrisisProb: -Infinity,
      cusumAligned: NaN,
      efficiencyRatio: 999,
      harVolExpansionRatio: -50,
      orderFlowAligned: NaN,
      liquiditySweepConfirmed: Infinity,
      frictionR: NaN,
    };
    const predBefore = predictMetaLabelProbability(poisonedFeatures, null);
    assertAllFiniteNumbers(predBefore);
    assert.ok(predBefore.calibratedProbability >= 0.05 && predBefore.calibratedProbability <= 0.96);

    const poisonedSamples: MetaLabelTrainingSample[] = Array.from({ length: 16 }, (_, idx) => ({
      startIdx: idx % 2 === 0 ? idx * 5 + 10 : idx * 5, // half reversed startIdx > endIdx
      endIdx: idx % 2 === 0 ? idx * 5 : idx * 5 + 8,
      outcome: (idx % 2) as 0 | 1,
      netR: idx % 2 === 0 ? NaN : Infinity,
      features: idx % 3 === 0 ? poisonedFeatures : {
        primaryScoreNorm: 0.7,
        hmmTrendProb: 0.6,
        hmmCrisisProb: 0.1,
        cusumAligned: 1,
        efficiencyRatio: 0.5,
        harVolExpansionRatio: 1.1,
        orderFlowAligned: 0.4,
        liquiditySweepConfirmed: 1,
        frictionR: 0.05,
      },
    }));

    const trained = trainPurgedMetaLabelClassifier(poisonedSamples, NaN);
    assertAllFiniteNumbers(trained);
    const predAfter = predictMetaLabelProbability(poisonedFeatures, trained);
    assertAllFiniteNumbers(predAfter);

    // Combinatorial Purged PBO with NaN / Infinity / ragged / all-zero matrices
    for (const mat of [
      [],
      [[1, 2, 3, 4]],
      [
        [NaN, Infinity, -Infinity, 0, 1, -1],
        [0, 0, 0, 0, 0, 0],
        [-5, -5, -5, -5, -5, -5],
      ],
    ]) {
      const pboRes = calculateCombinatorialPurgedPbo(mat);
      assertAllFiniteNumbers(pboRes);
      assert.ok(pboRes.pbo >= 0 && pboRes.pbo <= 1);
    }
  });
});
