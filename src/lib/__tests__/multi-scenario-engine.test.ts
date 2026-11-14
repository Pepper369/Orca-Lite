import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateScenarioMetrics,
  generateMultiScenarioReport,
  formatScenarioKaTeX,
  formatMultiScenarioMarkdown,
  getFptPracticalScenario,
  getVnIndexMacroScenario,
} from "../engines/multi-scenario-engine";

test("calculateScenarioMetrics accurately computes normalized probabilities, E[R], variance, and RRR", () => {
  // Case: Current price 100, Bull = 130 (+30%), Base = 110 (+10%), Bear = 80 (-20%)
  // Raw probs: 0.25, 0.50, 0.25 (Sum = 1.0)
  const metrics = calculateScenarioMetrics(100, 130, 0.25, 110, 0.5, 80, 0.25);

  assert.equal(metrics.normalizedProbs.bull, 0.25);
  assert.equal(metrics.normalizedProbs.base, 0.5);
  assert.equal(metrics.normalizedProbs.bear, 0.25);

  assert.equal(metrics.returns.bullPct, 30);
  assert.equal(metrics.returns.basePct, 10);
  assert.equal(metrics.returns.bearPct, -20);

  // E[R] = 0.25 * 30 + 0.50 * 10 + 0.25 * (-20) = 7.5 + 5.0 - 5.0 = 7.5%
  assert.equal(metrics.expectedReturnPct, 7.5);

  // Upside = 0.25 * 30 + 0.5 * 10 = 12.5
  // Downside = 0.25 * 20 = 5.0
  // RRR = 12.5 / 5.0 = 2.5
  assert.equal(metrics.riskRewardRatio, 2.5);

  // Check Verdict logic
  assert.ok(["STRONG_ACCUMULATE", "SELECTIVE_BUY"].includes(metrics.verdict));
});

test("calculateScenarioMetrics normalizes probabilities when sum is not 1.0", () => {
  // Raw probs: 30, 50, 20 (Sum = 100)
  const metrics = calculateScenarioMetrics(100, 140, 30, 110, 50, 90, 20);
  assert.equal(metrics.normalizedProbs.bull, 0.3);
  assert.equal(metrics.normalizedProbs.base, 0.5);
  assert.equal(metrics.normalizedProbs.bear, 0.2);
});

test("getFptPracticalScenario generates valid report with high expected return and multi-timeframe matrix", () => {
  const fptReport = getFptPracticalScenario();

  assert.equal(fptReport.symbol, "FPT");
  assert.equal(fptReport.currentPrice, 135000);
  assert.ok(fptReport.metrics.expectedReturnPct > 10, "FPT expected return should be > 10%");
  assert.ok(fptReport.metrics.riskRewardRatio >= 2.0, "FPT RRR should be favorable");
  assert.equal(fptReport.scenarios.bull.type, "BULL");
  assert.equal(fptReport.scenarios.base.type, "BASE");
  assert.equal(fptReport.scenarios.bear.type, "BEAR");

  // Invalidation points should be below current price for Bull/Base
  assert.ok(fptReport.scenarios.bull.invalidationPoint < fptReport.currentPrice);
  assert.ok(fptReport.scenarios.base.invalidationPoint < fptReport.currentPrice);

  // Timeframe matrix checks
  assert.equal(fptReport.timeframeMatrix.shortTerm.bias, "BULLISH");
  assert.equal(fptReport.timeframeMatrix.mediumTerm.bias, "BULLISH");
  assert.equal(fptReport.timeframeMatrix.longTerm.bias, "BULLISH");
  assert.equal(fptReport.timeframeMatrix.longTerm.moatRating, "WIDE");

  // Markdown & KaTeX test
  const md = formatMultiScenarioMarkdown(fptReport);
  assert.ok(md.includes("FPT"), "Markdown should contain FPT symbol");
  assert.ok(md.includes("Kỳ vọng lợi nhuận có trọng số"), "Markdown should contain E[R]");
  assert.ok(md.includes("MA TRẬN ĐA KHUNG THỜI GIAN"), "Markdown should contain MTF table");

  const katex = formatScenarioKaTeX(fptReport);
  assert.ok(katex.includes("E[R] = \\sum"), "KaTeX should contain summation equation");
  assert.ok(katex.includes("\\sigma = \\sqrt"), "KaTeX should contain volatility equation");
});

test("getVnIndexMacroScenario generates balanced macro scenario for VN-Index", () => {
  const vnindexReport = getVnIndexMacroScenario();

  assert.equal(vnindexReport.symbol, "VNINDEX");
  assert.equal(vnindexReport.currentPrice, 1280);
  assert.equal(vnindexReport.scenarios.bull.targetPrice, 1430);
  assert.equal(vnindexReport.scenarios.base.targetPrice, 1340);
  assert.equal(vnindexReport.scenarios.bear.targetPrice, 1180);

  // Check timeframe bias
  assert.equal(vnindexReport.timeframeMatrix.shortTerm.bias, "NEUTRAL");
  assert.equal(vnindexReport.timeframeMatrix.mediumTerm.bias, "BULLISH");
  assert.equal(vnindexReport.timeframeMatrix.longTerm.bias, "BULLISH");

  // Check allocation
  assert.ok(vnindexReport.allocation.equityPct > 0);
  assert.ok(vnindexReport.allocation.cashPct > 0);
  assert.equal(vnindexReport.allocation.equityPct + vnindexReport.allocation.cashPct, 100);
});
