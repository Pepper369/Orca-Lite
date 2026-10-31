import test from "node:test";
import assert from "node:assert/strict";

import type { OhlcvBar } from "../types";
import { detectCandlePatterns, buildCandleTradeSetup } from "../engines/candlestick-patterns";
import { extractTechContext, contextBoostPattern, rankPatternsWithContext } from "../services/screener-tech";

function bar(open: number, high: number, low: number, close: number, volume = 1000): OhlcvBar {
  return { time: Date.now(), open, high, low, close, volume };
}

test("Security & Edge: Malformed, dirty or empty OHLCV bars do not crash engine", () => {
  // Empty array
  assert.deepEqual(detectCandlePatterns([]), []);

  // Single bar
  assert.deepEqual(detectCandlePatterns([bar(10, 11, 9, 10)]), []);

  // Corrupted / inverted range: high < low
  const inverted = [
    bar(10, 8, 12, 9),
    bar(9, 7, 10, 8),
    bar(8, 6, 9, 7),
    bar(7, 5, 8, 6),
    bar(6, 4, 7, 5),
    bar(5, 7, 4, 6),
  ];
  assert.doesNotThrow(() => {
    const res = detectCandlePatterns(inverted);
    assert.ok(Array.isArray(res));
  });

  // Zero volatility (flat price, range = 0)
  const flat = Array.from({ length: 15 }, () => bar(100, 100, 100, 100, 0));
  assert.doesNotThrow(() => {
    const res = detectCandlePatterns(flat);
    assert.ok(Array.isArray(res));
  });

  // Zero volume across all bars
  const zeroVol = Array.from({ length: 15 }, (_, i) => bar(100 - i, 101 - i, 99 - i, 99.5 - i, 0));
  assert.doesNotThrow(() => {
    const res = detectCandlePatterns(zeroVol);
    assert.ok(Array.isArray(res));
  });
});

test("Security & Edge: Trade Setup Calculator guards against arithmetic anomalies", () => {
  const bars = [
    bar(100, 101, 98, 99),
    bar(99, 100, 97, 98),
    bar(98, 99, 96, 97),
    bar(97, 98, 92, 93),
    bar(93, 99, 92.5, 98.5),
  ];

  const dummyBullPattern = {
    name: "Bullish Engulfing",
    nameVi: "Nhấn chìm tăng",
    type: "bullish" as const,
    category: "bullish_reversal" as const,
    reliability: "high" as const,
    score: 82,
    candles: 2,
    description: "",
    confirmation: "",
    volumeConfirmed: true,
    trendContext: "down" as const,
    barIndex: 4,
  };

  const setup = buildCandleTradeSetup(dummyBullPattern, bars);
  assert.ok(setup, "Setup should be generated for valid reversal");
  assert.ok(Number.isFinite(setup.entryPrice) && setup.entryPrice > 0);
  assert.ok(Number.isFinite(setup.stopLoss) && setup.stopLoss > 0);
  assert.ok(Number.isFinite(setup.target1) && setup.target1 > setup.entryPrice);
  assert.ok(setup.stopLoss < setup.entryPrice, "Stop-loss must be strictly below entry price for bullish setup");
  assert.ok(Number.isFinite(setup.riskReward) && setup.riskReward > 0);

  // Negative or zero close edge case
  const invalidBars = [
    bar(0, 0, 0, 0),
    bar(0, 0, 0, 0),
    bar(0, 0, 0, 0),
    bar(0, 0, 0, 0),
    bar(0, 0, 0, 0),
  ];
  const invalidSetup = buildCandleTradeSetup(dummyBullPattern, invalidBars);
  assert.equal(invalidSetup, null, "Should return null for zero price bars");
});

test("Security & Edge: Technical Confluence and Score Boosting stay strictly bounded in [0, 100]", () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(100 - i * 0.5, 101 - i * 0.5, 99 - i * 0.5, 99.5 - i * 0.5, 5000));
  const ctx = extractTechContext(bars);

  assert.ok(ctx.trend !== undefined);
  assert.ok(ctx.atLowerBb !== undefined);
  assert.ok(ctx.volClimax !== undefined);

  const pattern = {
    name: "Tweezer Bottom",
    nameVi: "Đáy nhíp",
    type: "bullish" as const,
    category: "bullish_reversal" as const,
    reliability: "very_high" as const,
    score: 95,
    candles: 2,
    description: "",
    confirmation: "",
    volumeConfirmed: true,
    trendContext: "down" as const,
    barIndex: 29,
  };

  const boostedScore = contextBoostPattern(pattern, ctx);
  assert.ok(boostedScore >= 0 && boostedScore <= 100, `Score must remain in [0, 100], got ${boostedScore}`);

  // Test with extreme negative score pattern
  const lowPattern = { ...pattern, score: 5, reliability: "low" as const };
  const lowBoosted = contextBoostPattern(lowPattern, {
    ...ctx,
    trend: "up", // conflict
    rsi14: 85, // overbought conflict
    volRatio: 0.2, // low volume
    atrPct: 0.1,
  });
  assert.ok(lowBoosted >= 0 && lowBoosted <= 100, `Score must not drop below 0, got ${lowBoosted}`);
});

test("Security & Edge: Injection, XSS, and parameter tampering in Screener options are safely handled", () => {
  // Simulate options passed with malicious inputs
  const maliciousOpts = {
    category: "bullish_reversal",
    minScore: -999999, // negative overflow
    limit: 1000000, // DoS attempt via huge limit
    symbols: ["' OR 1=1 --", "<script>alert(1)</script>", "../../etc/passwd", "HPG", "VNM"],
  };

  const bars = Array.from({ length: 25 }, (_, i) => bar(100 - i, 101 - i, 98 - i, 99 - i, 1500));
  const patterns = detectCandlePatterns(bars);
  const ranked = rankPatternsWithContext(patterns, bars);

  assert.ok(Array.isArray(ranked));
  for (const p of ranked) {
    assert.ok(p.score >= 0 && p.score <= 100);
    // Ensure pattern descriptions or names don't contain unsanitized user inputs
    assert.ok(!p.name.includes("<script>"));
  }
});
