import test from "node:test";
import assert from "node:assert/strict";

import type { OhlcvBar } from "../types";
import { detectChartPatterns } from "../engines/chart-patterns";

function bar(open: number, high: number, low: number, close: number, volume = 2000): OhlcvBar {
  return { time: Date.now(), open, high, low, close, volume };
}

test("Chart Patterns: Identifies Inverse Head and Shoulders pattern", () => {
  const bars: OhlcvBar[] = [];

  // Prefix 25 bars in mild decline from 58 to 50
  for (let i = 0; i < 25; i++) {
    const p = 58 - i * 0.32;
    bars.push(bar(p, p + 0.5, p - 0.4, p + 0.1, 1500));
  }

  // 1. Left shoulder: trough at ~45.0
  bars.push(bar(50, 50.2, 47.0, 47.2, 1400));
  bars.push(bar(47.2, 47.5, 46.0, 46.2, 1600));
  bars.push(bar(46.2, 46.5, 45.0, 45.4, 1800)); // L1 = 45.0
  bars.push(bar(45.4, 46.8, 45.2, 46.5, 1500));
  bars.push(bar(46.5, 48.0, 46.2, 47.8, 1500));
  bars.push(bar(47.8, 50.4, 47.5, 49.9, 1600)); // P1 = 50.4
  bars.push(bar(49.9, 50.0, 48.0, 48.5, 1400));

  // 2. Head: trough at ~40.0
  bars.push(bar(48.5, 48.8, 44.5, 44.8, 1700));
  bars.push(bar(44.8, 45.0, 42.0, 42.2, 2200));
  bars.push(bar(42.2, 42.5, 40.2, 40.6, 2800)); // L2 (Head) = 40.2
  bars.push(bar(40.6, 43.0, 40.4, 42.5, 2400));
  bars.push(bar(42.5, 45.5, 42.0, 45.0, 2000));
  bars.push(bar(45.0, 48.0, 44.8, 47.5, 1900));
  bars.push(bar(47.5, 50.5, 47.0, 50.0, 1800)); // P2 = 50.5
  bars.push(bar(50.0, 50.1, 48.5, 48.8, 1500));

  // 3. Right shoulder: trough at ~45.2
  bars.push(bar(48.8, 49.0, 46.5, 46.8, 1100));
  bars.push(bar(46.8, 47.0, 45.2, 45.8, 900)); // L3 = 45.2 (dry volume)
  bars.push(bar(45.8, 47.5, 45.6, 47.0, 1100));
  bars.push(bar(47.0, 48.8, 46.8, 48.2, 1300));
  bars.push(bar(48.2, 50.1, 48.0, 49.8, 2200)); // Near neckline ~ 50.5
  bars.push(bar(49.8, 50.4, 49.2, 50.1, 2400));

  assert.ok(bars.length >= 35, `Total bars ${bars.length} must be >= 35`);

  const patterns = detectChartPatterns(bars);
  const invHs = patterns.find((p) => p.kind === "inverse_head_and_shoulders");
  assert.ok(invHs, "Should detect Inverse Head and Shoulders pattern");
  assert.equal(invHs.type, "bullish");
  assert.ok(invHs.score >= 70, `Score ${invHs.score} should be >= 70`);
  assert.ok(invHs.breakoutPrice! >= 50, "Breakout price should be near neckline");
  assert.ok(invHs.stopLossPrice! <= 45.5, "Stop loss should protect below right shoulder");
  assert.ok(invHs.targetPrice! > invHs.breakoutPrice!, "Target should be above breakout price");
});

test("Chart Patterns: Identifies Ascending Triangle pattern", () => {
  const bars: OhlcvBar[] = [];

  // Prefix 15 bars in consolidation
  for (let i = 0; i < 15; i++) {
    bars.push(bar(52, 53, 51, 52, 1000));
  }

  // Low 1: 50.0 -> High 1: 60.0
  bars.push(bar(52, 52.5, 49.8, 50.2, 1000)); // L1 = 49.8
  bars.push(bar(50.5, 55, 50.2, 54.5, 1200));
  bars.push(bar(54.5, 60.1, 54.0, 59.8, 1500)); // H1 = 60.1
  bars.push(bar(59.5, 59.8, 55.0, 55.5, 900));

  // Low 2: 53.4 -> High 2: 60.0
  bars.push(bar(55.2, 55.5, 53.4, 53.8, 850)); // L2 = 53.4
  bars.push(bar(54, 58, 53.8, 57.5, 1100));
  bars.push(bar(57.5, 60.0, 57.0, 59.7, 1300)); // H2 = 60.0
  bars.push(bar(59, 59.2, 57.0, 57.2, 800));

  // Low 3: 56.6 -> High 3: 59.8
  bars.push(bar(57.0, 57.4, 56.6, 57.0, 750)); // L3 = 56.6
  bars.push(bar(57.2, 59.9, 57.0, 59.6, 1400)); // H3 = 59.9

  assert.ok(bars.length >= 25, `Total bars ${bars.length} must be >= 25`);

  const patterns = detectChartPatterns(bars);
  const ascTri = patterns.find((p) => p.kind === "ascending_triangle");
  assert.ok(ascTri, "Should detect Ascending Triangle pattern");
  assert.equal(ascTri.type, "bullish");
  assert.ok(ascTri.score >= 70, `Score ${ascTri.score} should be >= 70`);
  assert.ok(ascTri.breakoutPrice! >= 59.5, "Breakout price should be at ceiling");
  assert.ok(ascTri.stopLossPrice! <= 57.0, "Stop loss should protect below higher low");
});

test("Chart Patterns: Identifies Double Bottom pattern", () => {
  const bars: OhlcvBar[] = [];

  // Prefix 20 bars in downtrend
  for (let i = 0; i < 20; i++) {
    const p = 70 - i * 0.8;
    bars.push(bar(p, p + 0.5, p - 0.5, p - 0.2, 1000));
  }

  // Bottom 1 at ~50.0 (index 23)
  bars.push(bar(54, 54.2, 52.5, 53.0, 1100));
  bars.push(bar(53, 53.2, 51.5, 52.0, 1100));
  bars.push(bar(52.0, 52.2, 49.8, 50.2, 1600)); // L1 = 49.8
  bars.push(bar(50.2, 52.0, 50.0, 51.8, 1300));
  bars.push(bar(51.8, 54.0, 51.5, 53.5, 1200));

  // Neckline Peak at ~58.0 (index 28)
  bars.push(bar(53.5, 56.0, 53.0, 55.5, 1200));
  bars.push(bar(55.5, 58.2, 55.0, 57.8, 1500)); // Peak ~ 58.2
  bars.push(bar(57.8, 58.0, 55.5, 56.0, 1100));
  bars.push(bar(56.0, 56.5, 53.5, 54.0, 1000));
  bars.push(bar(54.0, 54.5, 52.0, 52.5, 1000));

  // Bottom 2 at ~50.1 (index 33, dist = 10 bars from L1)
  bars.push(bar(52.5, 52.8, 50.1, 50.5, 950)); // L2 = 50.1
  bars.push(bar(50.5, 53.0, 50.3, 52.8, 1200));
  bars.push(bar(52.8, 55.0, 52.5, 54.5, 1400));
  bars.push(bar(54.5, 57.5, 54.0, 57.0, 1800)); // Recovering towards peak
  bars.push(bar(57.0, 58.0, 56.5, 57.6, 2000));

  const patterns = detectChartPatterns(bars);
  const db = patterns.find((p) => p.kind === "double_bottom");
  assert.ok(db, "Should detect Double Bottom pattern");
  assert.ok(db.score >= 70, `Score ${db.score} should be >= 70`);
  assert.ok(db.breakoutPrice! >= 57.5, "Breakout should be at neckline peak");
});
