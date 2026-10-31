import test from "node:test";
import assert from "node:assert/strict";
import {
  normCdf,
  normInv,
  calculateHRP,
  estimateOrnsteinUhlenbeck,
  calculateAlmgrenChrissExecution,
  calculateDeflatedSharpeRatio,
  calculateTripleBarrierLevels,
  calculateVaRAndCVaR,
} from "../engines/advanced-quant-math";

test("normCdf & normInv are symmetric and mutually inverse", () => {
  assert.equal(normCdf(0), 0.5);
  assert.ok(Math.abs(normInv(0.5) - 0) < 1e-4);

  const z = 1.96;
  const p = normCdf(z);
  assert.ok(Math.abs(p - 0.975) < 0.001);
  const zInv = normInv(p);
  assert.ok(Math.abs(zInv - z) < 0.001);
});

test("calculateHRP allocates weights that sum to 1.0 and favors lower variance", () => {
  const symbols = ["FPT", "VNM", "SSI", "HPG"];
  // Covariance matrix where FPT and VNM have lower variance (0.0004) than SSI and HPG (0.0016)
  const cov = [
    [0.0004, 0.0001, 0.0002, 0.0002],
    [0.0001, 0.0004, 0.0001, 0.0002],
    [0.0002, 0.0001, 0.0016, 0.0008],
    [0.0002, 0.0002, 0.0008, 0.0016],
  ];

  const hrp = calculateHRP(symbols, cov);
  assert.equal(hrp.orderedSymbols.length, 4);

  const totalWeight = Object.values(hrp.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totalWeight - 1.0) < 0.01, "Weights must sum to 1.0");

  // Lower variance assets should get higher weight
  assert.ok(hrp.weights["FPT"] > hrp.weights["SSI"]);
  assert.ok(hrp.weights["VNM"] > hrp.weights["HPG"]);
});

test("estimateOrnsteinUhlenbeck calculates mean-reversion speed and half-life", () => {
  // Synthesize a mean-reverting series around 100 with noise
  const series: number[] = [100];
  const theta = 0.15;
  const mu = 100;
  for (let i = 1; i < 50; i++) {
    const prev = series[i - 1];
    const next = prev + theta * (mu - prev) + Math.sin(i) * 2;
    series.push(next);
  }

  const ou = estimateOrnsteinUhlenbeck(series);
  assert.ok(ou.isStationary, "Process should be stationary / mean reverting");
  assert.ok(ou.theta > 0, "Theta should be positive");
  assert.ok(ou.halfLife > 0 && ou.halfLife < Infinity, "Half-life should be a finite positive number");
  assert.ok(Math.abs(ou.mu - 100) < 5, "Long term mean should be near 100");
});

test("calculateAlmgrenChrissExecution schedules total shares accurately", () => {
  const params = {
    totalShares: 100000,
    totalTimeHours: 4.5,
    intervalsCount: 9,
    riskAversion: 1e-4,
    dailyVolatilityPct: 2.8,
    tempImpactFactor: 1e-6,
    currentPrice: 50000,
  };

  const ac = calculateAlmgrenChrissExecution(params);
  assert.equal(ac.schedule.length, 9);

  const totalTraded = ac.schedule.reduce((sum, s) => sum + s.sharesToTrade, 0);
  assert.equal(totalTraded, 100000, "Schedule must trade exactly total shares");

  // Front-loading check: first slice trades more than last slice under risk aversion
  assert.ok(ac.schedule[0].sharesToTrade >= ac.schedule[8].sharesToTrade);
});

test("calculateDeflatedSharpeRatio penalizes multiple trials", () => {
  const singleTrial = calculateDeflatedSharpeRatio({
    observedSharpe: 1.8,
    trialsCount: 1,
    sampleLengthBars: 252,
  });

  const multipleTrials = calculateDeflatedSharpeRatio({
    observedSharpe: 1.8,
    trialsCount: 100, // 100 trials tested -> high probability of data snooping
    sampleLengthBars: 252,
  });

  assert.ok(
    singleTrial.deflatedSharpeRatio > multipleTrials.deflatedSharpeRatio,
    "DSR must decrease when trial count increases (multiple testing penalty)"
  );
  assert.ok(multipleTrials.expectedMaxSharpeNull > 0);
});

test("calculateTripleBarrierLevels returns valid dynamic stop and take-profit", () => {
  const tb = calculateTripleBarrierLevels(50000, 2.5, 3.0, 2.0, 10);
  assert.equal(tb.targetReturnPct, 7.5);
  assert.equal(tb.stopLossReturnPct, 5.0);
  assert.equal(tb.upperBarrierPrice, 53750);
  assert.equal(tb.lowerBarrierPrice, 47500);
  assert.equal(tb.riskRewardRatio, 1.5);
});

test("calculateVaRAndCVaR returns consistent risk measures", () => {
  const returns = [-0.03, -0.02, -0.015, -0.01, 0.005, 0.01, 0.015, 0.02, -0.025, 0.03];
  const risk = calculateVaRAndCVaR(returns);

  assert.ok(risk.var95Pct > 0);
  assert.ok(risk.cvar95Pct >= risk.var95Pct, "CVaR (Expected Shortfall) must be >= VaR");
});
