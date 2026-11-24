import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRequiredSpeedPace,
  evaluateCheapTailMispricing,
  generateMakerPeggingGuide,
  evaluateLateCandleResolution,
} from "../quant-reversal-pace";
import type { OhlcvBar } from "../../types";

function assertCloseTo(actual: number, expected: number, decimals = 4) {
  const tol = Math.pow(10, -decimals) / 2;
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `Expected ${actual} to be close to ${expected} (tol=${tol})`,
  );
}

describe("Quant Reversal Pace Engine (0x50f7 Model)", () => {
  it("calculates Required Speed and locks irreversible momentum when Z-Score >= 3.0", () => {
    const result = calculateRequiredSpeedPace({
      currentPrice: 1.0850,
      referencePrice: 1.0820,
      secondsRemaining: 40,
      microVolatilityPerSec: 0.0001,
      assetType: "FOREX",
      pipSize: 0.0001,
    });

    assertCloseTo(result.gap, 0.0030, 4);
    assertCloseTo(result.gapPipsOrPct, 30, 1);
    assertCloseTo(result.requiredSpeedPerSec, 0.0030 / 40, 5);
    assert.ok(result.zScoreSpeed > 3.0);
    assert.equal(result.isIrreversibleLock, true);
    assert.equal(result.lockDirection, "BULLISH_LOCKED");
    assert.ok(result.favoriteProbability > 0.99);
  });

  it("does not lock momentum if time remaining is large or gap is small", () => {
    const result = calculateRequiredSpeedPace({
      currentPrice: 1.0821,
      referencePrice: 1.0820,
      secondsRemaining: 240,
      microVolatilityPerSec: 0.0001,
      assetType: "FOREX",
      pipSize: 0.0001,
    });

    assert.equal(result.isIrreversibleLock, false);
    assert.equal(result.lockDirection, "UNLOCKED");
    assert.ok(result.favoriteProbability < 0.90);
  });

  it("detects cheap tail mispricing on extreme wick sweep with delta absorption", () => {
    const bars: OhlcvBar[] = [
      { time: 1700000000, open: 1.0800, high: 1.0810, low: 1.0790, close: 1.0805, volume: 100 },
      { time: 1700000300, open: 1.0805, high: 1.0815, low: 1.0800, close: 1.0812, volume: 120 },
      { time: 1700000600, open: 1.0812, high: 1.0820, low: 1.0810, close: 1.0818, volume: 110 },
      { time: 1700000900, open: 1.0818, high: 1.0825, low: 1.0815, close: 1.0820, volume: 130 },
      { time: 1700001200, open: 1.0820, high: 1.0822, low: 1.0780, close: 1.0815, volume: 300 },
    ];

    const pace = calculateRequiredSpeedPace({
      currentPrice: 1.0815,
      referencePrice: 1.0820,
      secondsRemaining: 60,
      microVolatilityPerSec: 0.0001,
      assetType: "FOREX",
    });

    const tail = evaluateCheapTailMispricing({
      symbol: "EURUSD",
      bars,
      currentPrice: 1.0815,
      paceMetrics: pace,
      orderFlowImbalance: 35,
      assetType: "FOREX",
    });

    assert.equal(tail.isCheapTailDetected, true);
    assert.equal(tail.tailSide, "BUY_REVERSAL");
    assert.ok(tail.asymmetricRewardRatio > 1.5);
    assert.ok(tail.edgeMultiplier > 1.5);
  });

  it("generates correct Maker Pegging limits", () => {
    const guide = generateMakerPeggingGuide({
      currentPrice: 1.0850,
      direction: "BUY",
      favoriteProbability: 0.985,
      tailProbability: 0.035,
      assetType: "FOREX",
    });

    assert.equal(guide.orderType, "POST_ONLY_LIMIT");
    assert.equal(guide.side, "BUY");
    assert.ok(guide.favoriteLimitUsd >= 0.96);
    assert.ok(guide.tailLimitUsd < 0.08);
  });

  it("evaluates late candle resolution and recommends LATE_EXPANSION_RIDER", () => {
    const bars: OhlcvBar[] = [
      { time: 1700000000, open: 1.0800, high: 1.0810, low: 1.0790, close: 1.0805, volume: 100 },
      { time: 1700000300, open: 1.0805, high: 1.0815, low: 1.0800, close: 1.0812, volume: 120 },
      { time: 1700000600, open: 1.0812, high: 1.0820, low: 1.0810, close: 1.0818, volume: 110 },
      { time: 1700000900, open: 1.0818, high: 1.0825, low: 1.0815, close: 1.0820, volume: 130 },
      { time: 1700001200, open: 1.0800, high: 1.0845, low: 1.0798, close: 1.0842, volume: 250 },
    ];

    const base = Math.floor(1700000000 / 300) * 300;
    const currentTimestampSec = base + 275;

    const result = evaluateLateCandleResolution({
      symbol: "EURUSD",
      timeframe: "5m",
      bars,
      currentTimestampSec,
      assetType: "FOREX",
    });

    assert.equal(result.timeRemainingSec, 25);
    assert.equal(result.recommendedAction, "LATE_EXPANSION_RIDER");
    assert.equal(result.actionDetails.direction, "BUY");
    assert.ok(result.actionDetails.expectedWinrate > 85);
  });
});
