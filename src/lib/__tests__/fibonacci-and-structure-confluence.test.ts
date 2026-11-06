import test from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import {
  calculateRetracements,
  calculateExtensions,
  detectFiboClusters,
  analyzeFibonacciConfluence,
} from "../engines/fibonacci-confluence";
import {
  getPsychologicalRoundNumber,
  detectFlipZones,
  analyzeStructureLevelsConfluence,
} from "../engines/structure-levels";

test("Fibonacci Retracements: Golden Pocket (0.618 - 0.65) calculates accurately", () => {
  // Bullish impulse from 100 to 200
  const retracements = calculateRetracements(100, 200, true);
  const fib618 = retracements.find((r) => r.ratio === 0.618);
  const fib65 = retracements.find((r) => r.ratio === 0.65);
  const eq50 = retracements.find((r) => r.ratio === 0.5);

  assert.ok(fib618);
  assert.ok(fib65);
  assert.ok(eq50);

  // 200 - 100 * 0.5 = 150
  assert.equal(eq50?.price, 150);
  // 200 - 100 * 0.618 = 138.2
  assert.equal(fib618?.price, 138.2);
  // 200 - 100 * 0.65 = 135
  assert.equal(fib65?.price, 135);
  assert.equal(fib618?.isGoldenPocket, true);
});

test("Fibonacci Extensions: TP1 (127.2%) and TP2 (161.8%) projection", () => {
  // Impulse 100 -> 150 (size 50), pullback to 120
  const extensions = calculateExtensions(100, 150, 120, true);
  const tp1 = extensions.find((e) => e.ratio === 1.272);
  const tp2 = extensions.find((e) => e.ratio === 1.618);

  assert.ok(tp1);
  assert.ok(tp2);
  // 120 + 50 * 1.272 = 183.6
  assert.equal(tp1?.price, 183.6);
  // 120 + 50 * 1.618 = 200.9
  assert.equal(tp2?.price, 200.9);
});

test("Fibonacci Clusters: Multi-Swing level confluence detection", () => {
  const levelSets = [
    {
      swingIndex: 1,
      levels: [
        { type: "RETRACEMENT" as const, ratio: 0.618, price: 138.2, label: "Fibo 61.8%" },
        { type: "RETRACEMENT" as const, ratio: 0.5, price: 150.0, label: "Fibo 50%" },
      ],
    },
    {
      swingIndex: 2,
      levels: [
        { type: "EXTENSION" as const, ratio: 1.618, price: 138.8, label: "Ext 161.8%" }, // Very close to 138.2 (diff 0.4%)
        { type: "RETRACEMENT" as const, ratio: 0.382, price: 120.0, label: "Fibo 38.2%" },
      ],
    },
  ];

  const clusters = detectFiboClusters(levelSets, 0.01);
  assert.ok(clusters.length >= 1);
  const topCluster = clusters[0]!;
  assert.equal(topCluster.strength, 2);
  assert.ok(topCluster.price >= 138.0 && topCluster.price <= 139.0);
  assert.match(topCluster.descriptionVi, /Hợp lưu Fibo 2 yếu tố/i);
});

test("Psychological Round Numbers: Accurate step classification by asset class", () => {
  // VN Stock at 24.8 -> Step is 5 -> Nearest round number is 25
  const stockRound = getPsychologicalRoundNumber(24.8, "stock");
  assert.equal(stockRound.level, 25);
  assert.equal(stockRound.isAtRoundNumber, true);

  // VN Stock at 82.0 -> Step is 10 -> Nearest round is 80
  const largeStock = getPsychologicalRoundNumber(82.0, "stock");
  assert.equal(largeStock.level, 80);

  // BTC at 69,800 -> Step is 5,000 -> Nearest round is 70,000
  const btcRound = getPsychologicalRoundNumber(69800, "crypto");
  assert.equal(btcRound.level, 70000);
  assert.equal(btcRound.isAtRoundNumber, true);

  // Gold at 2698 -> Step is 50 -> Nearest round is 2700
  const goldRound = getPsychologicalRoundNumber(2698, "commodity");
  assert.equal(goldRound.level, 2700);
  assert.equal(goldRound.isAtRoundNumber, true);
});

test("Flip Zone (Role Reversal) detection on synthetic OHLCV bars", () => {
  const bars: OhlcvBar[] = [];
  const now = 1700000000;

  // Base bars leading up to swing high at 25.0 (index 0 to 9)
  for (let i = 0; i < 10; i++) {
    bars.push({
      time: now + i * 86400,
      open: 20 + i * 0.4,
      high: 20 + i * 0.4 + 0.3,
      low: 20 + i * 0.4 - 0.2,
      close: 20 + i * 0.4 + 0.1,
      volume: 100000,
    });
  }
  // High pivot at index 10: high 25.0
  bars.push({
    time: now + 10 * 86400,
    open: 24.5,
    high: 25.0,
    low: 24.3,
    close: 24.8,
    volume: 120000,
  });
  // Pullback bars (index 11 to 14)
  for (let i = 11; i < 15; i++) {
    bars.push({
      time: now + i * 86400,
      open: 24.0,
      high: 24.2,
      low: 23.5,
      close: 23.8,
      volume: 80000,
    });
  }
  // Strong breakout above 25.0 at index 15
  bars.push({
    time: now + 15 * 86400,
    open: 24.0,
    high: 28.0,
    low: 23.9,
    close: 27.8, // decisive break above 25.0
    volume: 350000,
  });
  // Retest bars touching 25.0 and holding (index 16 to 19)
  bars.push({
    time: now + 16 * 86400,
    open: 27.5,
    high: 27.6,
    low: 25.05, // retest level 25.0
    close: 25.8, // held above 25.0
    volume: 180000,
  });
  bars.push({
    time: now + 17 * 86400,
    open: 25.8,
    high: 26.5,
    low: 25.6,
    close: 26.3,
    volume: 200000,
  });
  bars.push({
    time: now + 18 * 86400,
    open: 26.3,
    high: 27.0,
    low: 26.1,
    close: 26.9,
    volume: 220000,
  });
  bars.push({
    time: now + 19 * 86400,
    open: 26.9,
    high: 27.5,
    low: 26.7,
    close: 27.4,
    volume: 250000,
  });

  const flipZones = detectFlipZones(bars);
  assert.ok(flipZones.length >= 1, "Must detect at least 1 Flip Zone");
  const fz = flipZones[0]!;
  assert.equal(fz.type, "BULLISH_ROLE_REVERSAL");
  assert.equal(fz.level, 25.0);
  assert.equal(fz.isConfirmedHolding, true);
});

test("Structure & Levels Confluence: Combined Flip Zone + Round Number score", () => {
  const bars: OhlcvBar[] = [];
  const now = 1700000000;
  for (let i = 0; i < 20; i++) {
    bars.push({
      time: now + i * 86400,
      open: 24,
      high: 25,
      low: 23.8,
      close: 24.9,
      volume: 100000,
    });
  }

  const result = analyzeStructureLevelsConfluence(bars, "stock");
  assert.ok(result);
  assert.equal(result.roundNumber.level, 25);
  assert.equal(result.roundNumber.isAtRoundNumber, true);
  assert.ok(result.confluenceScore > 20);
});
