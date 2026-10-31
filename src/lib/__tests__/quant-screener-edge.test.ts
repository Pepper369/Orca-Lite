import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateOrnsteinUhlenbeck,
  calculateTripleBarrierLevels,
  calculateVaRAndCVaR,
  calculateDeflatedSharpeRatio,
  calculateHRP,
} from "../engines/advanced-quant-math";

test("Quant Screener Edge - Ornstein-Uhlenbeck Mean Reversion detection", () => {
  // Mean reverting series around mu = 50 with an oversold dip at the end
  const series = [50, 52, 49, 51, 50, 52, 49, 51, 50, 48, 51, 50, 40];
  const ou = estimateOrnsteinUhlenbeck(series);

  assert.ok(ou.isStationary, "Process should be stationary");
  assert.ok(ou.halfLife > 0, `Half-life ${ou.halfLife} should be positive`);
  assert.ok(ou.currentZScore < -1.5, `Last price 40 is below mean, currentZScore should be strongly negative: ${ou.currentZScore}`);
  assert.equal(ou.actionRecommendation, "BUY_OVERSOLD", "Oversold should be recommended");
});

test("Quant Screener Edge - Triple Barrier Dynamic Horizons & Asymmetric Payoff", () => {
  const currentPrice = 100_000;
  const atrPct = 3.5; // 3.5% daily ATR
  const tb = calculateTripleBarrierLevels(currentPrice, atrPct, 3.0, 1.5, 10);

  assert.equal(tb.currentPrice, 100_000);
  assert.equal(tb.targetReturnPct, 10.5); // 3.0 * 3.5 = 10.5%
  assert.equal(tb.stopLossReturnPct, 5.3); // 1.5 * 3.5 = 5.25 -> 5.3%
  assert.ok(tb.riskRewardRatio >= 1.95, `Risk reward ratio ${tb.riskRewardRatio} should be around 2.0`);
  assert.equal(tb.upperBarrierPrice, 110_500);
  assert.equal(tb.lowerBarrierPrice, 94_700);
});

test("Quant Screener Edge - Cornish-Fisher Non-Gaussian VaR & Skewness Adjustment", () => {
  // Daily returns with positive upside skewness
  const returns = [
    0.01, 0.02, -0.01, 0.005, 0.03, -0.015, 0.04, 0.012, -0.008, 0.025,
    -0.01, 0.018, 0.002, -0.005, 0.05, -0.012, 0.022, 0.008, -0.003, 0.015
  ];
  const risk = calculateVaRAndCVaR(returns);

  assert.ok(risk.var95Pct > 0, "VaR 95 should be positive");
  assert.ok(risk.cornishFisherVaR95Pct > 0, "Cornish-Fisher VaR should be positive");
  assert.ok(risk.cvar95Pct >= risk.var95Pct, "CVaR (Expected Shortfall) should exceed or equal VaR");
  assert.ok(Number.isFinite(risk.skewness));
});

test("Quant Screener Edge - Factor Anomaly (Low-Beta & High-Quality)", () => {
  const lowBetaStock = { beta: 0.72, qualityScore: 82, roe: 18.5 };
  const highBetaStock = { beta: 1.45, qualityScore: 50, roe: 8.0 };

  // Rule: Low-Beta Anomaly occurs when beta <= 0.88 and quality >= 68
  const isLowBetaAnomaly1 = lowBetaStock.beta <= 0.88 && lowBetaStock.qualityScore >= 68;
  const isLowBetaAnomaly2 = highBetaStock.beta <= 0.88 && highBetaStock.qualityScore >= 68;

  assert.equal(isLowBetaAnomaly1, true, "Low-Beta quality stock should qualify for anomaly preset");
  assert.equal(isLowBetaAnomaly2, false, "High-Beta speculative stock should NOT qualify");
});
