import { describe, it, expect } from "vitest";
import {
  calculateRequiredSpeedPace,
  evaluateCheapTailMispricing,
  generateMakerPeggingGuide,
  evaluateLateCandleResolution,
} from "../quant-reversal-pace";
import type { OhlcvBar } from "../../types";

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

    expect(result.gap).toBeCloseTo(0.0030, 4);
    expect(result.gapPipsOrPct).toBeCloseTo(30, 1);
    expect(result.requiredSpeedPerSec).toBeCloseTo(0.0030 / 40, 5);
    expect(result.zScoreSpeed).toBeGreaterThan(3.0);
    expect(result.isIrreversibleLock).toBe(true);
    expect(result.lockDirection).toBe("BULLISH_LOCKED");
    expect(result.favoriteProbability).toBeGreaterThan(0.99);
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

    expect(result.isIrreversibleLock).toBe(false);
    expect(result.lockDirection).toBe("UNLOCKED");
    expect(result.favoriteProbability).toBeLessThan(0.90);
  });

  it("detects cheap tail mispricing on extreme wick sweep with delta absorption", () => {
    const bars: OhlcvBar[] = [
      { time: 1000, open: 1.0800, high: 1.0810, low: 1.0790, close: 1.0805, volume: 100 },
      { time: 2000, open: 1.0805, high: 1.0815, low: 1.0800, close: 1.0812, volume: 120 },
      { time: 3000, open: 1.0812, high: 1.0820, low: 1.0810, close: 1.0818, volume: 110 },
      { time: 4000, open: 1.0818, high: 1.0825, low: 1.0815, close: 1.0820, volume: 130 },
      // Current bar sweeps low with a 65% lower wick and absorbs sell orders (+40 delta)
      { time: 5000, open: 1.0820, high: 1.0822, low: 1.0780, close: 1.0815, volume: 300 },
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
      orderFlowImbalance: 35, // Strong buyer absorption at low
      assetType: "FOREX",
    });

    expect(tail.isCheapTailDetected).toBe(true);
    expect(tail.tailSide).toBe("BUY_REVERSAL");
    expect(tail.asymmetricRewardRatio).toBeGreaterThan(1.5);
    expect(tail.edgeMultiplier).toBeGreaterThan(1.5);
  });

  it("generates correct Maker Pegging limits", () => {
    const guide = generateMakerPeggingGuide({
      currentPrice: 1.0850,
      direction: "BUY",
      favoriteProbability: 0.985,
      tailProbability: 0.035,
      assetType: "FOREX",
    });

    expect(guide.orderType).toBe("POST_ONLY_LIMIT");
    expect(guide.side).toBe("BUY");
    expect(guide.favoriteLimitUsd).toBeGreaterThanOrEqual(0.96);
    expect(guide.tailLimitUsd).toBeLessThan(0.08);
  });

  it("evaluates late candle resolution and recommends LATE_EXPANSION_RIDER", () => {
    const bars: OhlcvBar[] = [
      { time: 1000, open: 1.0800, high: 1.0810, low: 1.0790, close: 1.0805, volume: 100 },
      { time: 2000, open: 1.0805, high: 1.0815, low: 1.0800, close: 1.0812, volume: 120 },
      { time: 3000, open: 1.0812, high: 1.0820, low: 1.0810, close: 1.0818, volume: 110 },
      { time: 4000, open: 1.0818, high: 1.0825, low: 1.0815, close: 1.0820, volume: 130 },
      // Strong expansion candle
      { time: 5000, open: 1.0800, high: 1.0845, low: 1.0798, close: 1.0842, volume: 250 },
    ];

    // Timestamp with 25s left in 5m candle (base multiple of 300 + 275s)
    const base = Math.floor(1700000000 / 300) * 300;
    const currentTimestampSec = base + 275;

    const result = evaluateLateCandleResolution({
      symbol: "EURUSD",
      timeframe: "5m",
      bars,
      currentTimestampSec,
      assetType: "FOREX",
    });

    expect(result.timeRemainingSec).toBe(25);
    expect(result.recommendedAction).toBe("LATE_EXPANSION_RIDER");
    expect(result.actionDetails.direction).toBe("BUY");
    expect(result.actionDetails.expectedWinrate).toBeGreaterThan(85);
  });
});
