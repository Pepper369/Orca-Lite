import test from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";

function makeSyntheticBars(count = 35, basePrice = 25): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const now = 1700000000;
  for (let i = 0; i < count; i++) {
    const p = basePrice + i * 0.15;
    bars.push({
      time: now + i * 86400,
      open: p,
      high: p + 0.4,
      low: p - 0.2,
      close: p + 0.2,
      volume: 150000,
    });
  }
  return bars;
}

test("Phase 2 Confluence: 5 Orthogonal Pillars & Setup Grade A+ detection", () => {
  const bars = makeSyntheticBars(40, 20);

  // Craft a bullish impulse from 20 to 30, then pullback to ~23.8 (approx 61.8% Golden Pocket)
  const lastIdx = bars.length - 1;

  // Bar at lastIdx - 1: Deep dip to 23.8 (touching 61.8% fibo)
  bars[lastIdx - 1] = {
    time: 1700000000 + (lastIdx - 1) * 86400,
    open: 24.5,
    high: 24.6,
    low: 23.8, // Golden pocket touch
    close: 24.0,
    volume: 120000,
  };

  // Last bar: Bullish Engulfing / Hammer rebound with high volume & long lower wick
  bars[lastIdx] = {
    time: 1700000000 + lastIdx * 86400,
    open: 23.9,
    high: 25.5,
    low: 23.7, // Liquidity sweep below previous low
    close: 25.4, // Closed near high
    volume: 350000, // Volume explosion (Absorption spike)
  };

  const row = analyzeMaCandleRow("SSI", bars, undefined, {
    activeBuyRatioPct: 65, // Strong aggressive buy
    isPrecisionMtfAligned: true,
    sectorRrgQuadrant: "LEADING",
  });

  assert.ok(row, "analyzeMaCandleRow must return a valid row");
  assert.ok(row.orthogonalPillarsPassed >= 4, "Must pass at least 4 orthogonal pillars");
  assert.ok(row.setupGrade === "A+" || row.setupGrade === "A", "Must be graded A or A+");
  assert.equal(row.orthogonalPillarDetails.momentumTrigger, true, "Momentum & Reversal candle trigger must pass");
  assert.equal(row.orthogonalPillarDetails.liquidityFlow, true, "Liquidity & active flow must pass");
});

test("Phase 2 Confluence: Indicator Redundancy Prevention (Orthogonal Pillars)", () => {
  const bars = makeSyntheticBars(30, 25);

  // Even if multiple momentum oscillators are bullish, they only count toward Pillar 4 (Momentum)
  const row = analyzeMaCandleRow("HPG", bars);
  assert.ok(row);

  // Orthogonal pillars are strictly boolean per pillar:
  assert.equal(typeof row.orthogonalPillarDetails.structureTrend, "boolean");
  assert.equal(typeof row.orthogonalPillarDetails.valueZone, "boolean");
  assert.equal(typeof row.orthogonalPillarDetails.liquidityFlow, "boolean");
  assert.equal(typeof row.orthogonalPillarDetails.momentumTrigger, "boolean");
  assert.equal(typeof row.orthogonalPillarDetails.mtfMacro, "boolean");

  // Total passed pillars must strictly equal sum of the 5 flags
  const expectedSum =
    (row.orthogonalPillarDetails.structureTrend ? 1 : 0) +
    (row.orthogonalPillarDetails.valueZone ? 1 : 0) +
    (row.orthogonalPillarDetails.liquidityFlow ? 1 : 0) +
    (row.orthogonalPillarDetails.momentumTrigger ? 1 : 0) +
    (row.orthogonalPillarDetails.mtfMacro ? 1 : 0);

  assert.equal(row.orthogonalPillarsPassed, expectedSum);
});

test("Phase 2 Confluence: Scenario classification includes Golden Pocket or Flip Zone", () => {
  const bars = makeSyntheticBars(35, 22);
  const row = analyzeMaCandleRow("VND", bars);
  assert.ok(row);

  // Valid scenario check
  const validScenarios = [
    "SMC_GOLDEN_POCKET",
    "FLIP_ZONE_RETEST",
    "BOTTOM_BULLISH_DIVERGENCE",
    "CHART_PATTERN_BREAKOUT",
    "SMC_SWEEP_RECLAIM",
    "VSA_NO_SUPPLY_TEST",
    "EMA_RIBBON_ALIGN",
    "MA50_BOUNCE",
    "MA20_BOUNCE",
    "MA200_RECLAIM",
    "GOLDEN_CROSS_CONFIRM",
    "MA_SQUEEZE_BREAKOUT",
    "TREND_PULLBACK",
  ];

  assert.ok(
    validScenarios.includes(row.scenario),
    `Scenario '${row.scenario}' must be one of the recognized confluence scenarios`,
  );
});
