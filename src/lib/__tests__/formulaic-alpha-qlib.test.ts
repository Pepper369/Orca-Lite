import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import {
  computePearsonCorr,
  computeSpearmanRankCorr,
  computeForwardReturns,
  extractQlibFormulaicAlphas,
  evaluateFactorQualityQlib,
  buildQlibCompositeAlpha,
} from "../engines/formulaic-alpha-qlib";

describe("Formulaic Alpha & Systematic Factor Quality Assessment (Qlib Parity)", () => {
  it("computes Pearson and Spearman rank correlation with fractional ranking precision", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    assert.equal(computePearsonCorr(x, y), 1.0);
    assert.equal(computeSpearmanRankCorr(x, y), 1.0);

    // Non-linear monotonic relationship
    const yMonotonic = [1, 4, 9, 16, 25];
    assert.equal(computeSpearmanRankCorr(x, yMonotonic), 1.0);
    assert.ok(computePearsonCorr(x, yMonotonic) > 0.95 && computePearsonCorr(x, yMonotonic) < 1.0);

    // Inverse relationship
    const yInv = [10, 8, 6, 4, 2];
    assert.equal(computePearsonCorr(x, yInv), -1.0);
    assert.equal(computeSpearmanRankCorr(x, yInv), -1.0);
  });

  it("extracts standardized Qlib formulaic alphas from synthetic OHLCV bars", () => {
    const bars: OhlcvBar[] = [];
    let p = 100;
    for (let i = 0; i < 50; i++) {
      const open = p;
      const close = p + (i % 2 === 0 ? 1.5 : -0.8);
      const high = Math.max(open, close) + 0.5;
      const low = Math.min(open, close) - 0.5;
      const volume = 1000 + (i % 5) * 200;
      bars.push({ time: i, open, high, low, close, volume });
      p = close;
    }

    const alphas = extractQlibFormulaicAlphas(bars);
    assert.equal(alphas.KMID.length, 50);
    assert.equal(alphas.ROC5.length, 50);
    assert.equal(alphas.VWAP_Spread.length, 50);
    assert.equal(alphas.MoneyFlowRatio20.length, 50);

    // Check mathematical boundaries
    assert.ok(Number.isFinite(alphas.KMID[25]!));
    assert.ok(alphas.MoneyFlowRatio20[30]! >= 0 && alphas.MoneyFlowRatio20[30]! <= 1.0);
    assert.ok(alphas.STD5[10]! >= 0);
  });

  it("evaluates factor quality: admits strong predictive factor and rejects noisy/flat factor", () => {
    const n = 60;
    const goodFactor: number[] = [];
    const forwardRet: number[] = [];
    const noiseFactor: number[] = [];

    for (let i = 0; i < n; i++) {
      const signal = (i % 5) - 2; // -2, -1, 0, 1, 2
      goodFactor.push(signal);
      forwardRet.push(signal * 0.02 + ((i % 3) - 1) * 0.002); // Strongly correlated with forward return
      noiseFactor.push(Math.sin(i * 1.7)); // Uncorrelated noise
    }

    // 1. Good factor evaluation
    const goodReport = evaluateFactorQualityQlib("GOOD_ALPHA", goodFactor, forwardRet, {
      minRankIc: 0.035,
      minIcir: 0.50,
      minMonotonicity: 0.70,
    });

    assert.equal(goodReport.isAdmitted, true);
    assert.ok(goodReport.meanRankIc > 0.5);
    assert.ok(goodReport.icir > 1.0);
    assert.ok(goodReport.monotonicityScore >= 0.8);
    assert.ok(goodReport.longShortSpreadPct > 0);

    // 2. Noisy factor evaluation
    const noiseReport = evaluateFactorQualityQlib("NOISE_ALPHA", noiseFactor, forwardRet, {
      minRankIc: 0.035,
      minIcir: 0.50,
      minMonotonicity: 0.70,
    });

    assert.equal(noiseReport.isAdmitted, false);
    assert.ok(noiseReport.rejectionReason !== undefined);
  });

  it("buildQlibCompositeAlpha: weights admitted factors by ICIR and computes normalized composite score", () => {
    const n = 40;
    const factor1 = Array.from({ length: n }, (_, i) => Math.sin(i * 0.2));
    const factor2 = Array.from({ length: n }, (_, i) => Math.cos(i * 0.2));

    const report1 = evaluateFactorQualityQlib("F1", factor1, factor1.map((v) => v * 0.03));
    const report2 = evaluateFactorQualityQlib("F2", factor2, factor2.map((v) => -v * 0.03));

    const composite = buildQlibCompositeAlpha({
      factors: { F1: factor1, F2: factor2 },
      reports: { F1: report1, F2: report2 },
      useOnlyAdmitted: false,
    });

    assert.equal(composite.compositeScoreSeries.length, n);
    const sumW = Object.values(composite.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumW - 1.0) < 1e-3, `Weights must sum to 1.0, got ${sumW}`);
    assert.ok(composite.latestPercentileRank >= 0 && composite.latestPercentileRank <= 100);
  });
});
