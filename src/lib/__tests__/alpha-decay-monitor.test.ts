import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateAlphaHalfLife,
  computeRollingRankIcSeries,
  rebalanceFactorWeights,
  monitorAlphaDecayAndRebalance,
  clearAlphaDecayCache,
  getCachedAlphaDecayWeightMap,
} from "../engines/alpha-decay-monitor";
import { loadRealBarsSync } from "./helpers/real-market-fixtures";

test("Edge Discovery & Alpha Decay Monitor Engine (mphinance Parity — Real Market Data)", async (t) => {
  await t.test("estimateAlphaHalfLife: calculates finite positive half-life from deterministic AR(1) series", () => {
    const series: number[] = [1.0];
    for (let i = 1; i < 100; i++) {
      series.push(0.85 * series[i - 1]! + Math.sin(i) * 0.1);
    }
    const hl = estimateAlphaHalfLife(series);
    assert.ok(hl >= 2.0 && hl <= 15.0, `Expected half life around 3-8 periods, got ${hl}`);
  });

  await t.test("computeRollingRankIcSeries: computes rolling rank correlations over sliding windows", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const y = [1.1, 2.2, 2.9, 4.1, 5.0, 6.2, 6.8, 8.1, 9.2, 9.9, 11.2, 12.0, 13.1, 14.0, 15.2];

    const ics = computeRollingRankIcSeries(x, y, 5);
    assert.equal(ics.length, 11);
    for (const ic of ics) {
      assert.ok(ic > 0.85, `Expected strong positive rank correlation, got ${ic}`);
    }
  });

  await t.test("rebalanceFactorWeights: eliminates decaying/exhausted alphas and sums weights to 1.0", () => {
    const raw = [
      {
        factorName: "VWAP_Spread",
        historicalRankIc: 0.04,
        recentRankIc: 0.06,
        deltaRankIc: 0.02,
        decayRatePct: 50.0,
        recentIcir: 0.65,
        halfLifeBars: 12.5,
        isDecaying: false,
        status: "EXPANDING" as const,
        statusVi: "Mở rộng hiệu quả",
      },
      {
        factorName: "ROC10",
        historicalRankIc: 0.05,
        recentRankIc: 0.01,
        deltaRankIc: -0.04,
        decayRatePct: -80.0,
        recentIcir: 0.12,
        halfLifeBars: 4.0,
        isDecaying: true,
        status: "EXHAUSTED" as const,
        statusVi: "Kiệt quệ",
      },
      {
        factorName: "KMID",
        historicalRankIc: 0.035,
        recentRankIc: 0.038,
        deltaRankIc: 0.003,
        decayRatePct: 8.5,
        recentIcir: 0.38,
        halfLifeBars: 8.0,
        isDecaying: false,
        status: "STABLE" as const,
        statusVi: "Ổn định",
      },
    ];

    const rebalanced = rebalanceFactorWeights(raw);
    assert.equal(rebalanced.length, 3);
    assert.equal(rebalanced.find((p) => p.factorName === "ROC10")!.rebalancedWeight, 0);
    assert.ok(
      rebalanced.find((p) => p.factorName === "VWAP_Spread")!.rebalancedWeight >
        rebalanced.find((p) => p.factorName === "KMID")!.rebalancedWeight,
    );
    const sumW = rebalanced.reduce((s, p) => s + p.rebalancedWeight, 0);
    assert.ok(Math.abs(sumW - 1.0) < 0.005, `Weights must sum to 1.0, got ${sumW}`);
  });

  await t.test("monitorAlphaDecayAndRebalance: evaluates REAL Binance BTCUSDT 15m data with O(1) bar-keyed cache", () => {
    clearAlphaDecayCache();
    const bars = loadRealBarsSync("BTCUSDT_15m", 150);
    assert.ok(bars.length >= 100, "Real BTCUSDT_15m fixture must have >= 100 bars");

    const report = monitorAlphaDecayAndRebalance({
      symbol: "BTCUSDT",
      bars,
      horizon: 1,
      recentWindow: 30,
      historicalWindow: 60,
    });

    assert.equal(report.symbol, "BTCUSDT");
    assert.equal(report.evaluatedBarsCount, bars.length);
    assert.ok(
      ["EDGE_ROBUST", "EDGE_STABLE", "DECAY_WARNING", "EDGE_EXHAUSTED"].includes(report.overallEdgeHealth),
      `Unknown edge state: ${report.overallEdgeHealth}`,
    );
    assert.ok(report.strategyThrottleMultiplier >= 0.40 && report.strategyThrottleMultiplier <= 1.25);
    assert.ok(report.factorProfiles.length > 0);
    assert.ok(Number.isFinite(report.aggregateMeanRankIc));
    assert.ok(Number.isFinite(report.aggregateIcir));

    // Verify bar-keyed TTL cache hit returns exact cached reference and populates weight map
    const cachedHit = monitorAlphaDecayAndRebalance({
      symbol: "BTCUSDT",
      bars,
      horizon: 1,
      recentWindow: 30,
      historicalWindow: 60,
    });
    assert.strictEqual(cachedHit, report, "Repeated calls on same candle must hit O(1) cache");
    const weights = getCachedAlphaDecayWeightMap("BTCUSDT");
    assert.ok(weights !== null && Object.keys(weights).length > 0);
    clearAlphaDecayCache();
    assert.equal(getCachedAlphaDecayWeightMap("BTCUSDT"), null);
  });
});
