import test from "node:test";
import assert from "node:assert/strict";
import {
  trainHistoricalPriceAction,
  calculateUpDownVolumeRatio,
  type HistoricalPriceBar,
} from "../engines/historical-price-action-trainer";

test("calculateUpDownVolumeRatio accurately measures accumulation vs distribution", () => {
  // 10 bars with heavy volume on green days, light volume on red days
  const accumulationBars: HistoricalPriceBar[] = [
    { open: 10, high: 10.5, low: 9.8, close: 10, volume: 1000 },
    { open: 10, high: 10.8, low: 10, close: 10.6, volume: 5000 }, // +0.6, vol 5000
    { open: 10.6, high: 10.6, low: 10.3, close: 10.4, volume: 1000 }, // -0.2, vol 1000
    { open: 10.4, high: 11.2, low: 10.4, close: 11.0, volume: 6000 }, // +0.6, vol 6000
    { open: 11.0, high: 11.1, low: 10.8, close: 10.9, volume: 1200 }, // -0.1, vol 1200
    { open: 10.9, high: 11.6, low: 10.9, close: 11.5, volume: 7000 }, // +0.6, vol 7000
  ];

  const ratio = calculateUpDownVolumeRatio(accumulationBars, 10);
  assert.ok(ratio > 2.0, `Up/Down volume ratio ${ratio} should be strongly bullish (> 2.0)`);
});

test("trainHistoricalPriceAction evaluates uptrending asset with high edge score", () => {
  // Generate 60 bars of clean uptrend with healthy pullbacks to MA20 and breakouts
  const bars: HistoricalPriceBar[] = [];
  let price = 20;
  for (let i = 0; i < 70; i++) {
    const isUp = (i % 4 !== 0);
    const change = isUp ? 0.35 : -0.15;
    price = Math.max(15, price + change);
    const vol = isUp ? 15000 : 5000;
    bars.push({
      time: i * 86400,
      open: price - (isUp ? 0.2 : -0.1),
      high: price + 0.3,
      low: price - 0.2,
      close: price,
      volume: vol,
    });
  }

  const result = trainHistoricalPriceAction(bars);
  assert.ok(result.historicalEdgeScore >= 60, `Edge score ${result.historicalEdgeScore} should be >= 60`);
  assert.ok(result.upDownVolRatio >= 1.2, `Volume ratio ${result.upDownVolRatio} should be >= 1.2`);
  assert.ok(["HIGH_EDGE", "POSITIVE_EDGE"].includes(result.historicalEdgeBadge));
  assert.ok(result.empiricalBonus > 0, "Bonus should be positive for strong historical trend");
});

test("trainHistoricalPriceAction handles insufficient bars gracefully", () => {
  const shortBars: HistoricalPriceBar[] = [
    { open: 10, high: 11, low: 9, close: 10, volume: 1000 },
    { open: 10, high: 11, low: 9, close: 10.5, volume: 1200 },
  ];

  const result = trainHistoricalPriceAction(shortBars);
  assert.equal(result.historicalEdgeScore, 50);
  assert.equal(result.historicalEdgeBadge, "NEUTRAL");
  assert.equal(result.empiricalBonus, 0);
});
