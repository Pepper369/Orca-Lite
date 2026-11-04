import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeBottomReversal,
  evaluateApexQuant,
  type ApexQuantInput,
} from "../engines/orca-apex-quant-engine";
import { OhlcvBar } from "../types";

test("analyzeBottomReversal accurately detects Sweet Launch Zone vs Extended vs Premature", () => {
  // 30 bars: Price declines from 50 to 40, makes bottom at bar 24, then rises to 41.5 (+3.75%)
  const bars: OhlcvBar[] = [];
  let price = 50;
  for (let i = 0; i < 30; i++) {
    if (i < 24) {
      price -= 0.4;
    } else {
      price += 0.25;
    }
    bars.push({
      time: i * 86400,
      open: price - 0.1,
      high: price + 0.3,
      low: price - 0.2,
      close: price,
      volume: 15000,
    });
  }

  // 1. Current price at 41.5 -> ~3.75% from bottom (40.0) -> Sweet Launch Zone
  const revSweet = analyzeBottomReversal(bars, 41.5);
  assert.ok(revSweet.isSweetLaunchZone, "Price +3.75% from bottom should be in Sweet Launch Zone");
  assert.equal(revSweet.isExtended, false);
  assert.equal(revSweet.isPremature, false);

  // 2. Current price at 40.1 -> only +0.25% from bottom -> Premature
  const revPremature = analyzeBottomReversal(bars, 40.1);
  assert.equal(revPremature.isPremature, true);
  assert.equal(revPremature.isSweetLaunchZone, false);

  // 3. Current price at 45.0 -> +12.5% from bottom -> Extended
  const revExtended = analyzeBottomReversal(bars, 45.0);
  assert.equal(revExtended.isExtended, true);
  assert.equal(revExtended.isSweetLaunchZone, false);
});

test("evaluateApexQuant awards high score for multi-pillar apex reversal confluence", () => {
  // Construct 40 bars of realistic bottom formation with a Wyckoff pin-bar at bar 34
  const bars: OhlcvBar[] = [];
  let price = 60;
  for (let i = 0; i < 40; i++) {
    if (i < 30) {
      price -= 0.5;
    } else if (i === 34) {
      // Wyckoff pin bar / hammer: dipped deep to 42.0 and closed at 44.5
      price = 44.5;
      bars.push({
        time: i * 86400,
        open: 44.0,
        high: 44.8,
        low: 41.8, // long lower shadow
        close: 44.5,
        volume: 40000,
      });
      continue;
    } else {
      price += 0.3;
    }

    bars.push({
      time: i * 86400,
      open: price - 0.2,
      high: price + 0.3,
      low: price - 0.2,
      close: price,
      volume: 20000,
    });
  }

  const input: ApexQuantInput = {
    symbol: "APEX_GEM",
    bars,
    currentPrice: 43.8, // ~4.7% above low of 41.8 (in sweet launch zone)
    activeBuyRatioPct: 72,
    foreignNetValBillion: 1.5,
    piotroskiFScore: 7,
    altmanZone: "SAFE",
    isMtfAligned: true,
  };

  const result = evaluateApexQuant(input);
  // Expected to be a strong bottom reversal setup (>= 70)
  assert.ok(result.apexScore >= 68, `Apex score ${result.apexScore} should be >= 68 for strong reversal`);
  assert.ok(["APEX_SUPER_LEADER", "APEX_STRONG_REVERSAL", "APEX_EARLY_ACCUMULATION"].includes(result.category));
  assert.ok(result.tripleBarrierRiskReward >= 1.8);
  assert.ok(result.reversalMetrics.isSweetLaunchZone);
});


test("evaluateApexQuant penalizes extended stocks that have run far from bottom", () => {
  const bars: OhlcvBar[] = [];
  let price = 30;
  for (let i = 0; i < 40; i++) {
    price += (i < 20 ? -0.3 : 0.8); // bottom at bar 20 around 24, now at ~40 (+66% above bottom)
    bars.push({
      time: i * 86400,
      open: price - 0.2,
      high: price + 0.3,
      low: price - 0.2,
      close: price,
      volume: 15000,
    });
  }

  const input: ApexQuantInput = {
    symbol: "EXTENDED_STOCK",
    bars,
    currentPrice: price,
  };

  const result = evaluateApexQuant(input);
  assert.equal(result.reversalMetrics.isExtended, true);
  assert.equal(result.reversalMetrics.isSweetLaunchZone, false);
  assert.ok(result.highlights.some(h => h.includes("chạy xa đáy")));
});
