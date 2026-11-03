import test from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import {
  resampleWeeklyBars,
  evaluateWeeklyBias,
  evaluateDailyBias,
  evaluateHourlyBias,
  evaluateMtfConsensus,
} from "../engines/mtf-consensus";

function makeDailyBars(count: number, basePrice = 20, step = 0.2): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const startMs = new Date("2025-01-06T09:00:00Z").getTime(); // Monday

  for (let i = 0; i < count; i++) {
    // 5 trading days per week (skip weekends)
    const weekIndex = Math.floor(i / 5);
    const dayOfWeek = i % 5;
    const time = startMs + (weekIndex * 7 + dayOfWeek) * 86_400_000;
    const close = basePrice + i * step;

    bars.push({
      time,
      open: close - 0.1,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 1_000_000 + i * 10_000,
    });
  }
  return bars;
}

test("resampleWeeklyBars converts daily bars to weekly OHLCV accurately", () => {
  const daily = makeDailyBars(25, 30, 0.5); // 5 weeks of 5 daily bars
  const weekly = resampleWeeklyBars(daily);

  assert.equal(weekly.length, 5);
  // Verify first week OHLC
  assert.equal(weekly[0].open, daily[0].open);
  assert.equal(weekly[0].close, daily[4].close);
  assert.equal(weekly[0].high, Math.max(...daily.slice(0, 5).map((b) => b.high)));
  assert.equal(weekly[0].low, Math.min(...daily.slice(0, 5).map((b) => b.low)));
  const sumVol = daily.slice(0, 5).reduce((s, b) => s + b.volume, 0);
  assert.equal(weekly[0].volume, sumVol);
});

test("evaluateMtfConsensus returns ALL_BULL when H1, D1, and W1 are all bullish", () => {
  const daily = makeDailyBars(60, 20, 0.3); // strong uptrend over 12 weeks
  const lastBar = daily[daily.length - 1];

  const result = evaluateMtfConsensus(daily, {
    price: lastBar.close,
    open: lastBar.open,
    high: lastBar.high,
    low: lastBar.low,
    volume: lastBar.volume,
    changePercent: 2.5,
  });

  assert.equal(result.isAligned, true);
  assert.equal(result.consensus, "ALL_BULL");
  assert.equal(result.score, 100);
  assert.equal(result.details.w1.bias, "BULL");
  assert.equal(result.details.d1.bias, "BULL");
  assert.equal(result.details.h1.bias, "BULL");
  assert.ok(result.badgeVi.includes("Đồng Thuận"));
});

test("evaluateMtfConsensus detects D1_W1_BULL when hourly is pulling back", () => {
  const daily = makeDailyBars(60, 20, 0.3); // weekly and daily in strong uptrend
  const lastBar = daily[daily.length - 1];

  // Intraday dumping to lows of the day
  const result = evaluateMtfConsensus(daily, {
    price: lastBar.low * 1.001,
    open: lastBar.high,
    high: lastBar.high,
    low: lastBar.low,
    volume: 500_000,
    quoteVolume: 500_000 * lastBar.high, // VWAP high
    changePercent: -1.8,
  });

  assert.equal(result.isAligned, false);
  assert.equal(result.consensus, "D1_W1_BULL");
  assert.equal(result.details.w1.bias, "BULL");
  assert.equal(result.details.d1.bias, "BULL");
  assert.equal(result.details.h1.bias, "BEAR");
  assert.equal(result.score, 75);
});

test("evaluateMtfConsensus detects BEAR_PRESSURE in downtrend", () => {
  const daily = makeDailyBars(60, 50, -0.4); // strong downtrend
  const lastBar = daily[daily.length - 1];

  const result = evaluateMtfConsensus(daily, {
    price: lastBar.close,
    open: lastBar.open,
    high: lastBar.high,
    low: lastBar.low,
    volume: 2_000_000,
    changePercent: -3.2,
  });

  assert.equal(result.isAligned, false);
  assert.equal(result.consensus, "BEAR_PRESSURE");
  assert.ok(result.score <= 30);
});
