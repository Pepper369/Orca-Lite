import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateContStoikovMicroPrice,
  calculateConformalRiskBounds,
  calculateObizhaevaWangExecution,
} from "../engines/advanced-quant-math";

describe("Phase 8: Tier-1 Frontier Quant Engines (Cont-Stoikov, Conformal Risk, Obizhaeva-Wang)", () => {
  // P8-01: Cont-Stoikov Micro-Price & Markov Queue Depletion
  it("P8-01: calculateContStoikovMicroPrice predicts tick jump direction and microprice skew", () => {
    // Heavy Bid Book (Ask will deplete first -> UP_TICK)
    const heavyBids = [
      { price: 100.0, qty: 5000 },
      { price: 99.9, qty: 8000 },
      { price: 99.8, qty: 12000 },
    ];
    const thinAsks = [
      { price: 100.2, qty: 800 },
      { price: 100.3, qty: 1200 },
      { price: 100.4, qty: 1500 },
    ];

    const upRes = calculateContStoikovMicroPrice({
      bids: heavyBids,
      asks: thinAsks,
      tickSize: 0.1,
    });

    assert.ok(upRes.contStoikovMicroPrice > upRes.midPrice, "Microprice must skew above mid-price on heavy bid");
    assert.ok(upRes.upTickDepletionProbability > 0.60, `P(UpTick) should exceed 60%, got ${upRes.upTickDepletionProbability}`);
    assert.strictEqual(upRes.expectedTickJumpDirection, "UP_TICK");
    assert.ok(upRes.leadLagAlphaScore > 0);

    // Heavy Ask Book (Bid will deplete first -> DOWN_TICK)
    const thinBids = [
      { price: 100.0, qty: 600 },
      { price: 99.9, qty: 1000 },
    ];
    const heavyAsks = [
      { price: 100.2, qty: 9000 },
      { price: 100.3, qty: 15000 },
    ];

    const downRes = calculateContStoikovMicroPrice({
      bids: thinBids,
      asks: heavyAsks,
      tickSize: 0.1,
    });

    assert.ok(downRes.contStoikovMicroPrice < downRes.midPrice, "Microprice must skew below mid-price on heavy ask");
    assert.ok(downRes.upTickDepletionProbability < 0.40);
    assert.strictEqual(downRes.expectedTickJumpDirection, "DOWN_TICK");
    assert.ok(downRes.leadLagAlphaScore < 0);
  });

  // P8-02: Conformal Risk Control & Distribution-Free Bounds
  it("P8-02: calculateConformalRiskBounds guarantees non-parametric VaR & CVaR coverage", () => {
    // Generate synthetic non-normal fat-tailed returns with heavy negative skew
    const returns: number[] = [];
    let seed = 54321;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let i = 0; i < 150; i++) {
      const normalNoise = lcg() * 1.5;
      const jump = (i % 25 === 0) ? -5.5 : 0; // occasional extreme crash
      returns.push(normalNoise + jump);
    }

    const conformal = calculateConformalRiskBounds({
      historicalReturnsPct: returns,
      targetCoverageAlpha: 0.05, // 95% nominal coverage
    });

    assert.strictEqual(conformal.isCoverageGuaranteed, true);
    assert.strictEqual(conformal.nominalCoveragePct, 95);
    assert.ok(conformal.distributionFreeVaRPct > 0, "VaR must be positive loss magnitude");
    assert.ok(conformal.distributionFreeCVaRPct >= conformal.distributionFreeVaRPct, "CVaR must exceed or equal VaR");
    assert.ok(conformal.conformalPredictionInterval.lowerBoundReturnPct < 0);
    assert.ok(conformal.conformalPredictionInterval.upperBoundReturnPct > 0);
  });

  // P8-03: Obizhaeva-Wang Transient Impact & Resilient Execution
  it("P8-03: calculateObizhaevaWangExecution schedules initial/final blocks with book resilience", () => {
    const res = calculateObizhaevaWangExecution({
      totalShares: 100_000,
      totalTimeHours: 2.0,
      intervalsCount: 8,
      resilienceRatePerHour: 2.0,
      orderBookDepthPerDollar: 50_000,
      instantaneousImpactParam: 1e-5,
      currentPrice: 50.0,
    });

    assert.strictEqual(res.schedule.length, 9); // 0..N
    assert.ok(res.initialBlockShare > 0, "Initial block must be positive");
    assert.ok(res.finalBlockShare > 0, "Final block must be positive");
    assert.ok(res.totalCostImprovementOverTwapPct >= 5.0, "Must demonstrate cost saving over naive TWAP");

    // Total executed shares must sum to totalShares
    let totalExecuted = 0;
    for (const slice of res.schedule) {
      totalExecuted += slice.sharesToExecute;
    }
    assert.strictEqual(totalExecuted, 100_000, "All shares must be liquidated exactly");
    assert.strictEqual(res.schedule[res.schedule.length - 1].remainingShares, 0);
  });
});
