import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";
import type { OhlcvBar } from "../types";

function makeBar(date: string, open: number, high: number, low: number, close: number, volume: number): OhlcvBar {
  return { time: date, open, high, low, close, volume };
}

function generateTrendBars(n = 50, startPrice = 30.0, step = 0.15): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const o = price;
    const h = price + 0.4;
    const l = price - 0.2;
    const c = price + step;
    bars.push(makeBar(`2026-02-${String((i % 28) + 1).padStart(2, "0")}`, o, h, l, c, 1_000_000));
    price = c;
  }
  return bars;
}

function generatePullbackBars(): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = 20.0;
  // Uptrend 40 bars from 20 to ~29
  for (let i = 0; i < 40; i++) {
    const o = price;
    const h = price + 0.3;
    const l = price - 0.1;
    const c = price + 0.22;
    bars.push(makeBar(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, o, h, l, c, 1_000_000));
    price = c;
  }
  // Pullback 8 bars towards MA20 (~27.5)
  for (let i = 0; i < 8; i++) {
    const o = price;
    const h = price + 0.1;
    const l = price - 0.25;
    const c = price - 0.18;
    bars.push(makeBar(`2026-02-${String((i % 28) + 1).padStart(2, "0")}`, o, h, l, c, 500_000));
    price = c;
  }
  return bars;
}

test("Sniper Buy Trigger - Subtype 1: SNIPER_PULLBACK (Golden Pocket Fibo 0.618 - 0.65 with VSA No Supply)", () => {
  const bars = generatePullbackBars();
  const lastPrice = bars[bars.length - 1].close;
  // Gentle bounce candle right at MA20 with shallow dip and dry volume
  bars.push(makeBar("2026-03-01", lastPrice, lastPrice + 0.35, lastPrice - 0.2, lastPrice + 0.25, 400_000));

  const quote = {
    symbol: "FPT",
    price: lastPrice + 0.25,
    change: 0.25,
    changePercent: 0.9,
    volume: 400_000,
  };

  const row = analyzeMaCandleRow("FPT", bars, quote);
  assert.ok(row, "Row should be analyzed");
  assert.ok(row.sniperTrigger, "Sniper trigger must exist");
  assert.equal(row.sniperTrigger.isTriggerNow, true, "Should trigger actionable buy signal");
  assert.equal(row.sniperTrigger.subtype, "SNIPER_PULLBACK");
  assert.ok(row.sniperTrigger.subtypeLabelVi.includes("Vùng Vàng") || row.sniperTrigger.subtypeLabelVi.includes("Flip"));
  assert.ok(row.sniperTrigger.triggerScore >= 70, `Trigger score should be >= 70, got ${row.sniperTrigger.triggerScore}`);
  assert.ok(row.sniperTrigger.entryZone.min <= row.sniperTrigger.entryZone.max);
  assert.ok(row.sniperTrigger.invalidationStopLoss < row.entryPrice);
  assert.ok(row.sniperTrigger.target1 > row.entryPrice);
  assert.ok(row.sniperTrigger.riskReward >= 1.5, `R:R should be >= 1.5x, got ${row.sniperTrigger.riskReward}`);
});

test("Sniper Buy Trigger - Subtype 2: SQUEEZE_BREAKOUT (Ribbon Squeeze with Volume Ignition)", () => {
  const bars = generateTrendBars(60, 40.0, 0.05);
  const lastPrice = bars[bars.length - 1].close;
  // Breakout candle with volume spike from compression
  bars.push(makeBar("2026-03-02", lastPrice, lastPrice + 1.2, lastPrice - 0.1, lastPrice + 1.0, 2_500_000));

  const quote = {
    symbol: "MWG",
    price: lastPrice + 1.0,
    change: 1.0,
    changePercent: 2.3,
    volume: 2_500_000,
  };

  const row = analyzeMaCandleRow("MWG", bars, quote, {
    squeezeState: "fired_bull",
    activeBuyRatioPct: 68,
  });

  assert.ok(row, "Row should be analyzed");
  assert.ok(row.sniperTrigger, "Sniper trigger must exist");
  assert.equal(row.sniperTrigger.isTriggerNow, true, "Should trigger buy now on squeeze breakout");
  assert.equal(row.sniperTrigger.subtype, "SQUEEZE_BREAKOUT");
  assert.ok(row.sniperTrigger.subtypeLabelVi.includes("Nén"));
  assert.ok(row.sniperTrigger.reasonsVi.some((r) => r.includes("Nén") || r.includes("Vol")));
  assert.ok(row.sniperTrigger.invalidationStopLoss < row.entryPrice);
  assert.ok(row.sniperTrigger.target2 > row.sniperTrigger.target1);
});

test("Sniper Buy Trigger - Subtype 3: SWEEP_RECLAIM (Liquidity Sweep & Wyckoff Spring Rebound)", () => {
  const bars = generateTrendBars(60, 50.0, 0.15);
  const lastPrice = bars[bars.length - 1].close;
  // Deep sweep below support and violent reclaim with huge lower wick
  bars.push(makeBar("2026-03-03", lastPrice - 0.2, lastPrice + 0.8, lastPrice - 2.5, lastPrice + 0.6, 3_000_000));

  const quote = {
    symbol: "TCB",
    price: lastPrice + 0.6,
    change: 0.6,
    changePercent: 1.1,
    volume: 3_000_000,
  };

  const row = analyzeMaCandleRow("TCB", bars, quote, {
    activeBuyRatioPct: 72,
  });

  assert.ok(row, "Row should be analyzed");
  assert.ok(row.sniperTrigger, "Sniper trigger must exist");
  assert.equal(row.sniperTrigger.isTriggerNow, true, "Should trigger buy now on liquidity sweep");
  assert.equal(row.sniperTrigger.subtype, "SWEEP_RECLAIM");
  assert.ok(row.sniperTrigger.subtypeLabelVi.includes("Quét Rũ"));
  assert.ok(row.sniperTrigger.invalidationStopLoss <= bars[bars.length - 1].low);
});

test("Sniper Buy Trigger - Guards against chasing overextended runaway pumps (> 5%)", () => {
  const bars = generateTrendBars(60, 20.0, 0.2);
  const lastPrice = bars[bars.length - 1].close;
  // Overheated candle pumped 6.8%
  bars.push(makeBar("2026-03-04", lastPrice, lastPrice + 1.8, lastPrice, lastPrice + 1.7, 5_000_000));

  const quote = {
    symbol: "VIX",
    price: lastPrice + 1.7,
    change: 1.7,
    changePercent: 6.8, // Runaway pump
    volume: 5_000_000,
  };

  const row = analyzeMaCandleRow("VIX", bars, quote);
  assert.ok(row, "Row should be analyzed");
  // Should NOT trigger sniper entry because price is overextended (> 4.5%)
  assert.equal(row.sniperTrigger.isTriggerNow, false, "Should not trigger on chasing extended pump");
  assert.equal(row.sniperTrigger.subtype, "NONE");
});
