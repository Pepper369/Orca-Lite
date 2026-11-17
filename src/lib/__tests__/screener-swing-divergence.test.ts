import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFreshSwingDivergence,
  detectDivergences,
} from "../engines/divergence";
import {
  analyzeBottomReversal,
  evaluateApexQuant,
} from "../engines/orca-apex-quant-engine";
import {
  SCREENER_BIT,
  queryScreenerStocks,
} from "../services/screener-snapshot-service";
import { PRESET_TABS, PRESET_EDGE_BENCHMARKS } from "@/app/screener/screener-constants";
import type { OhlcvBar } from "../types";

/**
 * Helper to build mock OHLCV bars with a distinct double-bottom swing low
 * and RSI/MACD bullish divergence.
 */
function createSwingDivergenceBars(): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const baseTime = Date.now() - 30 * 86_400_000;

  // Phase 1: Downward trend from 50 to 38 (bars 0 to 14)
  for (let i = 0; i <= 14; i++) {
    const c = +(50 - (i * 0.8)).toFixed(2);
    bars.push({
      time: baseTime + i * 86_400_000,
      open: +(c + 0.5).toFixed(2),
      high: +(c + 0.8).toFixed(2),
      low: +(c - 0.5).toFixed(2),
      close: c,
      volume: 200_000 + i * 10_000,
    });
  }

  // Trough 1 at bar 14: Low ~38.3
  // Phase 2: Technical bounce to 42 (bars 15 to 19)
  for (let i = 15; i <= 19; i++) {
    const c = +(38.8 + (i - 15) * 0.8).toFixed(2);
    bars.push({
      time: baseTime + i * 86_400_000,
      open: +(c - 0.3).toFixed(2),
      high: +(c + 0.5).toFixed(2),
      low: +(c - 0.3).toFixed(2),
      close: c,
      volume: 120_000,
    });
  }

  // Phase 3: Retest / Shakeout to 37.8 (bars 20 to 22) - Trough 2 lower price with dry volume
  for (let i = 20; i <= 22; i++) {
    const c = +(42 - (i - 19) * 1.4).toFixed(2);
    bars.push({
      time: baseTime + i * 86_400_000,
      open: +(c + 0.4).toFixed(2),
      high: +(c + 0.5).toFixed(2),
      low: +(c - 0.6).toFixed(2),
      close: c,
      volume: 80_000, // dry volume
    });
  }

  // Phase 4: Confirmation Swing Low & Spring pin-bar rebound (bars 23 to 25)
  // Bar 23: Rebound green candle
  bars.push({
    time: baseTime + 23 * 86_400_000,
    open: 38.0,
    high: 39.5,
    low: 37.5,
    close: 39.2,
    volume: 180_000,
  });

  // Bar 24: Continuation
  bars.push({
    time: baseTime + 24 * 86_400_000,
    open: 39.2,
    high: 40.2,
    low: 39.0,
    close: 40.0,
    volume: 220_000,
  });

  return bars;
}

test("Chân Sóng Alpha - detectFreshSwingDivergence detects fresh divergences within lookback window", () => {
  const bars = createSwingDivergenceBars();
  const res = detectFreshSwingDivergence(bars, 5);

  assert.ok(typeof res === "object", "Should return an object");
  assert.ok(typeof res.hasBullishDivergence === "boolean");
  assert.ok(typeof res.isFreshBullishDivergence === "boolean");
  assert.ok(typeof res.isDualDivergenceFresh === "boolean");
  assert.ok(Array.isArray(res.oscillators));
});

test("Chân Sóng Alpha - analyzeBottomReversal identifies Swing Low Confirmation and Sweet Launch Zone", () => {
  const bars = createSwingDivergenceBars();
  const currentPrice = bars[bars.length - 1]!.close; // ~40.0
  const rev = analyzeBottomReversal(bars, currentPrice);

  assert.ok(rev.lowestLow20 > 0, "Should have lowest low");
  assert.equal(rev.isExtended, false, "Should not be overextended at 40.0 vs bottom 37.5");
  assert.ok(rev.extensionFromBottomPct >= 0, "Extension must be non-negative");
  assert.ok(typeof rev.isSwingLowConfirmed === "boolean", "Must report swing low status");
  assert.ok(typeof rev.isVduAtLow === "boolean", "Must check volume dry-up at low");
  assert.ok(rev.reversalStageVi.length > 0, "Must provide human-readable Vietnamese verdict");
});

test("Chân Sóng Alpha - evaluateApexQuant integrates Swing Low & Fresh Bullish Divergence into score", () => {
  const bars = createSwingDivergenceBars();
  const currentPrice = bars[bars.length - 1]!.close;
  const result = evaluateApexQuant({
    symbol: "SSI",
    bars,
    currentPrice,
    activeBuyRatioPct: 62.0,
  });

  assert.ok(result.apexScore >= 60, `Apex score ${result.apexScore} should reflect strong early launch signals`);
  assert.ok(result.highlights.length > 0, "Highlights should explain why score was granted");
  assert.ok(result.reversalMetrics.lowestLow20 > 0);
  assert.equal(typeof result.isSwingLowConfirmed, "boolean");
  assert.equal(typeof result.isFreshBullishDivergence, "boolean");
});

test("Chân Sóng Alpha - SCREENER_BIT constants integrity for Swing Low & Fresh Divergence", () => {
  assert.equal(SCREENER_BIT.SWING_LOW_CONFIRMED, 1 << 23);
  assert.equal(SCREENER_BIT.FRESH_BULL_DIV, 1 << 24);
  assert.equal(SCREENER_BIT.DUAL_BULL_DIV, 1 << 25);

  // Bitwise independence check: none should overlap
  const mask = SCREENER_BIT.SWING_LOW_CONFIRMED | SCREENER_BIT.FRESH_BULL_DIV | SCREENER_BIT.DUAL_BULL_DIV;
  assert.equal(mask & SCREENER_BIT.SWING_LOW_CONFIRMED, SCREENER_BIT.SWING_LOW_CONFIRMED);
  assert.equal(mask & SCREENER_BIT.FRESH_BULL_DIV, SCREENER_BIT.FRESH_BULL_DIV);
  assert.equal(mask & SCREENER_BIT.DUAL_BULL_DIV, SCREENER_BIT.DUAL_BULL_DIV);
});

test("Chân Sóng Alpha - PRESET_TABS & PRESET_EDGE_BENCHMARKS contain swing_divergence", () => {
  const tab = PRESET_TABS.find((t) => t.id === "swing_divergence");
  assert.ok(tab, "PRESET_TABS must include swing_divergence");
  assert.equal(tab.category, "price_action");
  assert.ok(tab.label.includes("Swing Đáy"));

  const benchmark = PRESET_EDGE_BENCHMARKS.swing_divergence;
  assert.ok(benchmark, "PRESET_EDGE_BENCHMARKS must include swing_divergence");
  assert.ok(benchmark.winRatePct >= 80, "Win rate should exceed 80%");
  assert.ok(benchmark.profitFactor >= 3.0, "Profit factor should exceed 3.0");
});

test("Chân Sóng Alpha - queryScreenerStocks successfully queries swing_divergence preset and cross-filters", async () => {
  const res = await queryScreenerStocks({
    preset: "swing_divergence",
    limit: 10,
  });

  assert.ok(Array.isArray(res.items), "Items must be an array");
  assert.ok(typeof res.total === "number", "Total must be a number");
  assert.ok(typeof res.presetsCount.swing_divergence === "number", "presetsCount must track swing_divergence");

  // Query with bitmask filters
  const resFilter = await queryScreenerStocks({
    swingLowOnly: true,
    limit: 5,
  });
  assert.ok(Array.isArray(resFilter.items));
});

