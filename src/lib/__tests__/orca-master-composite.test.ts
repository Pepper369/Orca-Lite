import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRawOrcaScore,
  calculateUniverseOrcaMaster,
  type OrcaMasterInput,
} from "../engines/orca-master-composite";

test("computeRawOrcaScore awards high score for multi-pillar confluence", () => {
  const eliteStock: OrcaMasterInput = {
    symbol: "HPG",
    rsRating: 94,
    smartMoneyScore: 88,
    piotroskiFScore: 8,
    altmanZone: "SAFE",
    roe: 22.0,
    confluenceScore: 85,
    isMtfAligned: true,
    absBuyDiff: 0.8,
    isNearBuy: true,
    pe: 9.5,
    pb: 1.2,
    dividendYield: 4.5,
    maSignal: "GOLDEN_CROSS",
  };

  const { rawScore, breakdown } = computeRawOrcaScore(eliteStock);

  assert.ok(rawScore >= 80, `Raw score should be >= 80, got ${rawScore}`);
  assert.ok(breakdown.technicalScore >= 85, "Technical score should be high");
  assert.ok(breakdown.smartMoneyScore >= 80, "Smart money score should be high");
  assert.ok(breakdown.fundamentalScore >= 80, "Fundamental score should be high");
});

test("calculateUniverseOrcaMaster scales scores into 1 - 99 percentile ranking", () => {
  const universe: OrcaMasterInput[] = [
    { symbol: "ELITE", rsRating: 96, smartMoneyScore: 90, piotroskiFScore: 9, isNearBuy: true },
    { symbol: "GOOD", rsRating: 82, smartMoneyScore: 75, piotroskiFScore: 7 },
    { symbol: "AVERAGE", rsRating: 55, smartMoneyScore: 50, piotroskiFScore: 5 },
    { symbol: "WEAK", rsRating: 25, smartMoneyScore: 30, piotroskiFScore: 3 },
  ];

  const results = calculateUniverseOrcaMaster(universe);

  assert.equal(results.size, 4);
  const elite = results.get("ELITE")!;
  const weak = results.get("WEAK")!;

  assert.ok(elite.compositeScore >= 90, `Elite score should be >= 90, got ${elite.compositeScore}`);
  assert.equal(elite.category, "SUPER_ELITE");

  assert.ok(weak.compositeScore <= 15, `Weak score should be <= 15, got ${weak.compositeScore}`);
  assert.equal(weak.category, "AVOID");
});
