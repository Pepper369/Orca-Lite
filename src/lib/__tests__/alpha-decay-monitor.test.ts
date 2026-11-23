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
import type { OhlcvBar } from "../../types";

function generateSyntheticBars(n: number, trend = 0.001, noise = 0.01): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = 100.0;
  const now = Date.now();

  for (let i = 0; i < n; i++) {
    const shock = (Math.sin(i * 0.3) * noise + (Math.random() - 0.5) * noise * 0.5) + trend;
    const open = price;
    price = Math.max(10, price * (1 + shock));
    const close = price;
    const high = Math.max(open, close) * (1 + 0.003);
    const low = Math.min(open, close) * (1 - 0.003);
    const volume = 100_000 + Math.sin(i * 0.2) * 50_000 + 20_000;

    bars.push({
      time: now + i * 300_000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(volume),
    });
  }
  return bars;
}

test("Edge Discovery & Alpha Decay Monitor Engine (mphinance Parity)", async (t) => {
  await t.test("estimateAlphaHalfLife: calculates finite positive half-life from factor series", () => {
    // Generate an AR(1) series: x[t] = 0.85 * x[t-1] + e
    const series: number[] = [1.0];
    for (let i = 1; i < 100; i++) {
      series.push(0.85 * series[i - 1]! + (Math.sin(i) * 0.1));
    }

    const hl = estimateAlphaHalfLife(series);
    // For rho ~ 0.85, lambda = -ln(0.85) ~ 0.1625 -> Half life = ln(2) / 0.1625 ~ 4.2 periods
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

    // Exhausted ROC10 must be pruned to 0
    const rocProfile = rebalanced.find((p) => p.factorName === "ROC10")!;
    assert.equal(rocProfile.rebalancedWeight, 0);

    // Expanding VWAP_Spread must have highest weight
    const vwapProfile = rebalanced.find((p) => p.factorName === "VWAP_Spread")!;
    const kmidProfile = rebalanced.find((p) => p.factorName === "KMID")!;
    assert.ok(vwapProfile.rebalancedWeight > kmidProfile.rebalancedWeight);

    // Sum of admitted weights should be 1.0 (with slight float rounding tolerance)
    const sumW = rebalanced.reduce((s, p) => s + p.rebalancedWeight, 0);
    assert.ok(Math.abs(sumW - 1.0) < 0.005, `Weights must sum to 1.0, got ${sumW}`);
  });

  await t.test("monitorAlphaDecayAndRebalance: produces telemetry report with edge state and throttle multiplier", () => {
    const bars = generateSyntheticBars(120, 0.001, 0.015);
    const report = monitorAlphaDecayAndRebalance({
      symbol: "BTCUSDT",
      bars,
      horizon: 1,
      recentWindow: 30,
      historicalWindow: 60,
    });

    assert.equal(report.symbol, "BTCUSDT");
    assert.ok(report.evaluatedBarsCount === 120);
    assert.ok(
      ["EDGE_ROBUST", "EDGE_STABLE", "DECAY_WARNING", "EDGE_EXHAUSTED"].includes(report.overallEdgeHealth),
      `Unknown edge state: ${report.overallEdgeHealth}`,
    );
    assert.ok(
      report.strategyThrottleMultiplier >= 0.40 && report.strategyThrottleMultiplier <= 1.25,
      `Throttle out of range: ${report.strategyThrottleMultiplier}`,
    );
    assert.ok(report.factorProfiles.length > 0, "Should have evaluated factor profiles");
    assert.ok(report.cockpitTelemetryVi.includes("BTCUSDT"));
    assert.ok(report.actionableRecommendationVi.length > 10);

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
    assert.ok(weights !== null && Object.keys(weights).length > 0, "Weight map should be cached per symbol");
    clearAlphaDecayCache();
    assert.equal(getCachedAlphaDecayWeightMap("BTCUSDT"), null);
  });
});
