import test from "node:test";
import assert from "node:assert/strict";
import { calculatePositionSizing } from "../engines/wyckoff-position-sizing";
import { analyzeVsaBars } from "../engines/vsa-engine";
import { analyzeWyckoff, computeWyckoffRS, computeMarketRoro } from "../engines/wyckoff-elliott";
import { buildWyckoffOverlay } from "../../chart/wyckoff-overlay";
import type { OhlcvBar } from "../types";

test("Security & Edge: calculatePositionSizing rejects NaN, Infinity, negative and inverted inputs", () => {
  // NaN / Infinity NAV
  assert.equal(calculatePositionSizing({ nav: NaN, entryPrice: 30000, stopLossPrice: 28000 }), null);
  assert.equal(calculatePositionSizing({ nav: Infinity, entryPrice: 30000, stopLossPrice: 28000 }), null);
  assert.equal(calculatePositionSizing({ nav: -50000000, entryPrice: 30000, stopLossPrice: 28000 }), null);
  assert.equal(calculatePositionSizing({ nav: 0, entryPrice: 30000, stopLossPrice: 28000 }), null);

  // NaN / Zero / Inverted Prices
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: NaN, stopLossPrice: 28000 }), null);
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: NaN }), null);
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: 0, stopLossPrice: 28000 }), null);
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: 0 }), null);
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: 30000 }), null); // SL == Entry
  assert.equal(calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: 35000 }), null); // SL > Entry

  // Invalid maxRiskNavPct falls back to safe default (1.25%)
  const res1 = calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: 27000, maxRiskNavPct: NaN });
  assert.ok(res1);
  assert.ok(res1.actualRiskNavPct <= 1.25);

  const res2 = calculatePositionSizing({ nav: 100000000, entryPrice: 30000, stopLossPrice: 27000, maxRiskNavPct: -5 });
  assert.ok(res2);
  assert.ok(res2.actualRiskNavPct <= 1.25);
});

test("Security & Edge: analyzeVsaBars handles zero-spread, zero-volume, empty or single-bar datasets", () => {
  // Empty array
  const resEmpty = analyzeVsaBars([]);
  assert.equal(resEmpty.latestSignal, null);
  assert.equal(resEmpty.recentSignals.length, 0);

  // Under 20 bars
  const resFew = analyzeVsaBars([{ time: 1000, open: 10, high: 10, low: 10, close: 10, volume: 0 }]);
  assert.equal(resFew.latestSignal, null);

  // 30 bars with zero spread (High == Low) and zero volume (no division by zero)
  const zeroSpreadBars: OhlcvBar[] = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 20,
    high: 20,
    low: 20,
    close: 20,
    volume: 0,
  }));
  const resZero = analyzeVsaBars(zeroSpreadBars);
  assert.ok(resZero);
  // Must not throw or produce NaN
  assert.ok(typeof resZero.summaryVi === "string");
});

test("Security & Edge: computeWyckoffRS and computeMarketRoro handle degenerate benchmark datasets", () => {
  const stockBars: OhlcvBar[] = Array.from({ length: 50 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 25,
    high: 26,
    low: 24,
    close: 25,
    volume: 5000,
  }));

  // Benchmark with zero close (should not divide by zero or throw)
  const dirtyIndexBars: OhlcvBar[] = Array.from({ length: 50 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  }));

  const rs = computeWyckoffRS(stockBars, dirtyIndexBars);
  assert.ok(rs);
  assert.ok(Number.isFinite(rs.rsScore ?? 0));

  const roroDirty = computeMarketRoro(dirtyIndexBars);
  assert.ok(roroDirty);
  assert.ok(Number.isFinite(roroDirty.roroValue));
});

test("Security & Edge: analyzeWyckoff handles completely flat data without crashing", () => {
  const flatBars: OhlcvBar[] = Array.from({ length: 60 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 15,
    high: 15,
    low: 15,
    close: 15,
    volume: 0,
  }));

  const res = analyzeWyckoff(flatBars);
  assert.ok(res);
  assert.ok(Number.isFinite(res.confidence));
  assert.ok(Number.isFinite(res.target1 ?? 0));
  assert.ok(Number.isFinite(res.target2 ?? 0));
  assert.ok(Number.isFinite(res.stopLoss ?? 0));
  assert.ok(Number.isFinite(res.rr1 ?? 0));
});

test("Security & Edge: buildWyckoffOverlay handles degenerate data safely", () => {
  const flatBars: OhlcvBar[] = Array.from({ length: 40 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 20,
    high: 20,
    low: 20,
    close: 20,
    volume: 100,
  }));

  const overlay = buildWyckoffOverlay(flatBars);
  assert.ok(overlay);
  assert.ok(Array.isArray(overlay.levels));
  assert.ok(Array.isArray(overlay.markers));
  for (const lv of overlay.levels) {
    assert.ok(Number.isFinite(lv.price));
    assert.ok(lv.price > 0);
  }
});
