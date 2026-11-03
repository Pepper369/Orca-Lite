import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMtfCandleCluster } from "../engines/mtf-candle-cluster";
import type { OhlcvBar } from "../types";

test("evaluateMtfCandleCluster detects VSA No Supply when volume and spread dry up near support", () => {
  const bars: OhlcvBar[] = [];
  const baseTime = 1700000000;

  // 20 normal bars
  for (let i = 0; i < 20; i++) {
    bars.push({
      time: baseTime + i * 86400,
      open: 50,
      high: 52,
      low: 49,
      close: 51,
      volume: 1_000_000,
    });
  }

  // 21st bar: narrow spread (51.2 - 50.8 = 0.4), dry volume (300_000 vs 1M avg)
  bars.push({
    time: baseTime + 20 * 86400,
    open: 51,
    high: 51.3,
    low: 50.9,
    close: 51.2,
    volume: 300_000,
  });

  const res = evaluateMtfCandleCluster({
    dailyBars: bars,
    quote: {
      price: 51.2,
      open: 51,
      high: 51.3,
      low: 50.9,
      volume: 300_000,
    },
    ma20: 50.5,
  });

  assert.equal(res.vsaSignal, "NO_SUPPLY");
  assert.ok(res.vsaSignalVi?.includes("Cạn cung"));
});

test("evaluateMtfCandleCluster calculates Overhead Resistance Room accurately", () => {
  const bars: OhlcvBar[] = [];
  const baseTime = 1700000000;

  for (let i = 0; i < 30; i++) {
    bars.push({
      time: baseTime + i * 86400,
      open: 40,
      high: 50, // 60-day resistance is 50
      low: 39,
      close: 41,
      volume: 500_000,
    });
  }

  const res = evaluateMtfCandleCluster({
    dailyBars: bars,
    quote: {
      price: 40,
      open: 40,
      high: 42,
      low: 39.5,
      volume: 400_000,
    },
  });

  assert.equal(res.nearestResistance, 50);
  // (50 - 40) / 40 * 100 = 25%
  assert.equal(res.overheadRoomPct, 25.0);
});
