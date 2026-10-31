import test from "node:test";
import assert from "node:assert/strict";

import type { OhlcvBar } from "../types";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";

function bar(open: number, high: number, low: number, close: number, volume = 2000): OhlcvBar {
  return { time: Date.now(), open, high, low, close, volume };
}

test("MA & Candle Confluence: Identifies MA20 bounce with Bullish Engulfing", () => {
  // Generate 40 bars in an uptrend where MA20 is around 50
  // Recent bars pull back to ~50 (touching MA20), then form a Bullish Engulfing
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 35; i++) {
    const base = 40 + i * 0.35;
    bars.push(bar(base, base + 0.8, base - 0.5, base + 0.3, 1000));
  }
  // At bar 35, close is around 52. Pull back to 50 in bars 36-38:
  bars.push(bar(52, 52.5, 51, 51.2, 800));
  bars.push(bar(51.2, 51.5, 50.1, 50.3, 600)); // Pullback near MA20 ~ 50
  bars.push(bar(50.3, 50.6, 49.8, 50.0, 500)); // Touched 49.8 (test MA20)
  // Last 2 bars form Bullish Engulfing right at MA20
  bars.push(bar(50.2, 50.4, 49.7, 49.9, 800)); // Red candle: Open 50.2, Close 49.9, Low 49.7
  bars.push(bar(49.6, 52.0, 49.2, 51.2, 2500)); // Green candle engulfing: Open 49.6, Close 51.2, Volume surge

  const result = analyzeMaCandleRow("TEST_MA20", bars);
  assert.ok(result, "Should successfully detect MA & Candle confluence");
  assert.equal(result.symbol, "TEST_MA20");
  assert.ok(result.topPattern, "Should have a top bullish pattern");
  assert.ok(
    result.topPattern.name === "Bullish Engulfing" ||
      result.allPatterns.some((p) => p.name === "Bullish Engulfing"),
    "Should contain Bullish Engulfing pattern",
  );
  assert.ok(result.confluenceScore >= 60, `Score ${result.confluenceScore} should be >= 60`);
  assert.ok(result.stopLoss < result.entryPrice, "Stop loss must be below entry");
  assert.ok(result.target1 > result.entryPrice, "Target 1 must be above entry");
  assert.ok(result.riskReward > 0, "R:R ratio must be positive");
});

test("MA & Candle Confluence: Identifies MA50 Institutional Bounce with Hammer", () => {
  // Generate 60 bars where MA50 is around 70
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 50; i++) {
    const base = 60 + i * 0.25;
    bars.push(bar(base, base + 0.5, base - 0.4, base + 0.1, 1500));
  }
  // Downturn/pullback to ~70 (MA50 area)
  bars.push(bar(73.5, 73.8, 72.0, 72.2, 1200));
  bars.push(bar(72.2, 72.5, 71.0, 71.2, 1000));
  bars.push(bar(71.2, 71.5, 70.3, 70.5, 800));
  bars.push(bar(70.5, 70.8, 69.8, 70.0, 700));
  // Hammer at MA50: Long lower shadow probing 68.2, close back at 70.1 (body 0.1, lower 1.8, upper 0)
  bars.push(bar(70.0, 70.1, 68.2, 70.1, 2800));

  const result = analyzeMaCandleRow("TEST_MA50", bars);
  assert.ok(result, "Should detect confluence");
  assert.equal(result.anchorMa, "MA50");
  assert.equal(result.scenario, "MA50_BOUNCE");
  assert.ok(result.confluenceTags.some((t) => t.includes("MA50")));
  assert.ok(result.stopLoss <= result.anchorMaPrice!, "Stop loss should protect below MA50 support");
});

test("MA & Candle Confluence: Identifies MA200 Reclaim (Cycle Bottom Escape)", () => {
  // 60 bars in prolonged downtrend below MA200, then sudden reclaim with high volume
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 55; i++) {
    const base = 100 - i * 0.3; // downtrend
    bars.push(bar(base, base + 0.5, base - 0.5, base - 0.1, 1000));
  }
  // Dips to 82, then sharp reversal bar reclaiming MA
  bars.push(bar(83.5, 83.8, 81.5, 82.0, 1200));
  bars.push(bar(82.0, 82.4, 80.8, 81.0, 1100)); // Deep trough
  bars.push(bar(81.2, 85.5, 81.0, 85.2, 3500)); // Strong breakout / Belt hold

  const result = analyzeMaCandleRow("TEST_RECLAIM", bars);
  assert.ok(result, "Should detect a valid confluence row");
  assert.ok(Number.isFinite(result.confluenceScore));
  assert.ok(result.setupQuality === "A+" || result.setupQuality === "A" || result.setupQuality === "B");
});

test("MA & Candle Confluence: Identifies SMC Sweep & Reclaim with Foreign Flow and RS Leader", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 35; i++) {
    const base = 40 + i * 0.35;
    bars.push(bar(base, base + 0.8, base - 0.5, base + 0.3, 1000));
  }
  bars.push(bar(52, 52.5, 51, 51.2, 800));
  bars.push(bar(51.2, 51.5, 50.1, 50.3, 600));
  bars.push(bar(50.3, 50.6, 49.8, 50.0, 500));
  bars.push(bar(50.0, 50.2, 49.5, 49.7, 800));
  // Sweep Hammer bar at MA20: Open 50.0, High 50.5, Low 48.6 (sweeps below MA20 ~ 50), Close 50.4 (body 0.4, lower 1.4, upper 0.1)
  bars.push(bar(50.0, 50.5, 48.6, 50.4, 2800));

  // Simulated VN-Index bars (flat or lagging)
  const indexBars: OhlcvBar[] = Array.from({ length: 45 }, () => bar(1250, 1255, 1245, 1250, 50000));

  const result = analyzeMaCandleRow("TEST_SMC", bars, undefined, {
    foreign: {
      buyVolume: 450_000,
      sellVolume: 120_000,
      netVolume: 330_000,
      netValue: 19_200_000_000, // 19.2 tỷ
      buyRatioPct: 78.9,
    },
    indexBars,
  });

  assert.ok(result, "Should successfully detect SMC confluence setup");
  assert.equal(result.scenario, "SMC_SWEEP_RECLAIM");
  assert.equal(result.foreignAccumulating, true);
  assert.equal(result.foreignNetVal, 19.2);
  assert.ok(result.isMarketLeader, "Should be market leader vs flat index");
  assert.ok(result.pillars, "Should have 5-pillars breakdown");
  assert.ok(result.pillars.trend > 0);
  assert.ok(result.pillars.candle > 0);
  assert.ok(result.pillars.flow > 0);
  assert.ok(result.pillars.rs > 0);
  assert.equal(result.setupQuality, "A+");
});

test("MA & Candle Confluence: Edge cases with short or corrupted series are safe", () => {
  assert.equal(analyzeMaCandleRow("SHORT", []), null);
  assert.equal(analyzeMaCandleRow("SHORT_10", [bar(10, 11, 9, 10)]), null);

  // Flat price (zero movement)
  const flat = Array.from({ length: 40 }, () => bar(100, 100, 100, 100, 0));
  assert.doesNotThrow(() => {
    const res = analyzeMaCandleRow("FLAT", flat);
    assert.equal(res, null); // No reversal pattern in flat series
  });
});
