import test from "node:test";
import assert from "node:assert/strict";

import type { OhlcvBar } from "../types";
import { detectCandlePatterns, filterRecentReversals } from "../engines/candlestick-patterns";

function bar(time: number, open: number, high: number, low: number, close: number, volume = 100): OhlcvBar {
  return { time, open, high, low, close, volume };
}

function series(values: Array<[number, number, number, number]>, volume = 100): OhlcvBar[] {
  return values.map(([open, high, low, close], index) => bar(1_700_000_000_000 + index * 86_400_000, open, high, low, close, volume));
}

test("detectCandlePatterns: short or empty series is safe", () => {
  assert.deepEqual(detectCandlePatterns([]), []);
  assert.deepEqual(detectCandlePatterns(series([[10, 11, 9, 10], [10, 11, 9, 10], [10, 11, 9, 10]])), []);
});

test("detectCandlePatterns: identifies a bullish engulfing after a downtrend", () => {
  const bars = series([
    [110, 111, 108, 109],
    [108, 109, 106, 107],
    [106, 107, 104, 105],
    [104, 105, 102, 103],
    [103, 104, 100, 101],
    [101, 102, 99, 100],
    [99, 100, 97, 98],
    [98, 99, 96, 97],
    [96, 97, 94, 95],
    [96, 97, 93, 94.5],
    [94, 101, 93.5, 100],
  ], 1_000);

  const patterns = detectCandlePatterns(bars, { recentBars: 1 });
  const engulfing = patterns.find((pattern) => pattern.name === "Bullish Engulfing");
  assert.ok(engulfing);
  assert.equal(engulfing.category, "bullish_reversal");
  assert.equal(engulfing.type, "bullish");
  assert.equal(engulfing.candles, 2);
  assert.equal(engulfing.barIndex, bars.length - 1);
  assert.equal(engulfing.ageBars, 0);
  assert.ok(engulfing.score > 0);
});

test("detectCandlePatterns: identifies continuation clusters", () => {
  const bars = series([
    [100, 101, 98, 99],
    [99, 100, 97, 98],
    [98, 99, 96, 97],
    [97, 98, 95, 96],
    [96, 97, 94, 95],
    [95, 97, 94, 96.5],
    [96.5, 99, 96, 98],
    [98, 101, 97.5, 100],
  ], 2_000);

  const patterns = detectCandlePatterns(bars, { recentBars: 1 });
  const soldiers = patterns.find((pattern) => pattern.name === "Three White Soldiers");
  assert.ok(soldiers);
  assert.equal(soldiers.category, "continuation");
  assert.equal(soldiers.candles, 3);
});

test("filterRecentReversals: keeps fresh reversals and excludes stale/non-reversal patterns", () => {
  const patterns = [
    { name: "fresh", category: "bullish_reversal", ageBars: 1, candles: 2, score: 70 },
    { name: "stale", category: "bearish_reversal", ageBars: 4, candles: 2, score: 95 },
    { name: "continuation", category: "continuation", ageBars: 0, candles: 3, score: 99 },
    { name: "long", category: "bullish_reversal", ageBars: 0, candles: 4, score: 99 },
  ] as never[];

  const result = filterRecentReversals(patterns, 3);
  assert.deepEqual(result.map((pattern) => pattern.name), ["fresh"]);
});

test("detectCandlePatterns: identifies Bullish Harami and Harami Cross", () => {
  // Downtrend + large red + small green inside
  const bars = series([
    [105, 106, 103, 104],
    [104, 105, 101, 102],
    [102, 103, 99, 100],
    [100, 101, 97, 98],
    [98, 99, 95, 96],
    [96, 97, 91, 92], // Large red: Open 96, Close 92
    [93, 94.5, 92.8, 94], // Harami: Open 93, Close 94 inside [92, 96]
  ], 1_000);

  const patterns = detectCandlePatterns(bars, { recentBars: 1 });
  const harami = patterns.find((p) => p.name === "Bullish Harami");
  assert.ok(harami, "Should detect Bullish Harami");
  assert.equal(harami.category, "bullish_reversal");
  assert.equal(harami.type, "bullish");
  assert.equal(harami.candles, 2);
});

test("detectCandlePatterns: identifies Tweezer Bottom at support", () => {
  const bars = series([
    [105, 106, 103, 104],
    [104, 105, 101, 102],
    [102, 103, 99, 100],
    [100, 101, 97, 98],
    [98, 99, 94.9, 95.5], // Red bar reaching Low 94.9
    [95.5, 98, 94.9, 97.5], // Green bar with matching Low 94.9
  ], 1_000);

  const patterns = detectCandlePatterns(bars, { recentBars: 1 });
  const tweezer = patterns.find((p) => p.name === "Tweezer Bottom");
  assert.ok(tweezer, "Should detect Tweezer Bottom");
  assert.equal(tweezer.category, "bullish_reversal");
  assert.equal(tweezer.candles, 2);
});

test("detectCandlePatterns: identifies Bullish Belt Hold and Kicker", () => {
  // Downtrend followed by Belt Hold (opens at low, pushes to high without lower shadow)
  const beltBars = series([
    [105, 106, 103, 104],
    [104, 105, 101, 102],
    [102, 103, 99, 100],
    [100, 101, 97, 98],
    [98, 99, 95, 96],
    [93, 99, 93, 98.8], // Belt hold: Open 93, Low 93, High 99, Close 98.8
  ], 1_000);

  const beltPatterns = detectCandlePatterns(beltBars, { recentBars: 1 });
  const belt = beltPatterns.find((p) => p.name === "Bullish Belt Hold");
  assert.ok(belt, "Should detect Bullish Belt Hold");
  assert.equal(belt.category, "bullish_reversal");

  // Bullish Kicker: sharp red followed by gap up green
  const kickerBars = series([
    [105, 106, 103, 104],
    [104, 105, 101, 102],
    [102, 103, 99, 100],
    [100, 101, 97, 98],
    [98, 98.5, 92, 92.5], // Red: Open 98, Close 92.5
    [98.5, 102, 98.4, 101.5], // Gap up green: Open 98.5, Close 101.5
  ], 1_000);

  const kickerPatterns = detectCandlePatterns(kickerBars, { recentBars: 1 });
  const kicker = kickerPatterns.find((p) => p.name === "Bullish Kicker");
  assert.ok(kicker, "Should detect Bullish Kicker");
  assert.equal(kicker.category, "bullish_reversal");
});

test("detectCandlePatterns: identifies Three Inside Up and Three Outside Up", () => {
  // Three Inside Up: Red -> Harami inside -> Confirmation close above
  const insideBars = series([
    [105, 106, 103, 104],
    [104, 105, 101, 102],
    [102, 103, 99, 100],
    [100, 101, 93, 94], // Large red: Open 100, Close 94
    [95, 97, 94.8, 96.5], // Harami inside [94, 100]
    [96.5, 101, 96, 100.5], // Confirmed close above
  ], 1_000);

  const insidePatterns = detectCandlePatterns(insideBars, { recentBars: 1 });
  const insideUp = insidePatterns.find((p) => p.name === "Three Inside Up");
  assert.ok(insideUp, "Should detect Three Inside Up");
  assert.equal(insideUp.category, "bullish_reversal");
  assert.equal(insideUp.candles, 3);
});

test("detectCandlePatterns: output contract is stable and bounded", () => {
  const bars = series(Array.from({ length: 40 }, (_, i) => [100 + i, 101 + i, 99 + i, 100.5 + i] as [number, number, number, number]));
  const patterns = detectCandlePatterns(bars);
  assert.ok(patterns.length <= 10);
  for (const pattern of patterns) {
    assert.ok(pattern.name.length > 0);
    assert.ok(["bullish_reversal", "bearish_reversal", "continuation", "neutral"].includes(pattern.category));
    assert.ok(pattern.score >= 10 && pattern.score <= 100);
    assert.ok(pattern.ageBars !== undefined && pattern.ageBars >= 0);
  }
});
