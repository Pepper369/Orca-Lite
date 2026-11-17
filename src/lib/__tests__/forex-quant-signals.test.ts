import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getForexPipSize,
  calculatePipValueUsd,
  calculateForexPositionSize,
} from "../engines/forex-position-sizer";
import { analyzeForexScalpSimple } from "../engines/forex-scalp";
import type { OhlcvBar } from "../types";

test("Forex Position Sizer: Pip Size & Pip Value for Direct, Indirect & Commodities", () => {
  // 1. Pip Size check
  assert.equal(getForexPipSize("EURUSD"), 0.0001);
  assert.equal(getForexPipSize("GBPUSD"), 0.0001);
  assert.equal(getForexPipSize("USDJPY"), 0.01);
  assert.equal(getForexPipSize("XAUUSD"), 0.1);
  assert.equal(getForexPipSize("USOIL"), 0.01);

  // 2. Pip Value in USD for 1 standard lot (100k)
  // EURUSD: Quote is USD -> 100,000 * 0.0001 = $10.00 per pip
  assert.equal(calculatePipValueUsd("EURUSD", 1.085), 10.0);

  // XAUUSD: 100 oz * $0.10 move = $10.00 per pip
  assert.equal(calculatePipValueUsd("XAUUSD", 2650.0), 10.0);

  // USDJPY: Base is USD -> 100,000 * 0.01 / 155.00 ~ $6.45 per pip
  const jpyPipVal = calculatePipValueUsd("USDJPY", 155.0);
  assert.ok(jpyPipVal > 6.0 && jpyPipVal < 7.0);
});

test("Forex Position Sizer: Institutional Lot Calculation & 1-2-3 Multi-Tier TP", () => {
  // Scenario: $10,000 balance, 1% risk ($100), EURUSD Entry: 1.0850, SL: 1.0825 (25 pips)
  const result = calculateForexPositionSize({
    accountBalance: 10_000,
    riskPercent: 1.0,
    pair: "EURUSD",
    entryPrice: 1.085,
    stopLossPrice: 1.0825,
    takeProfit1: 1.088, // 30 pips -> R:R 1.2
    takeProfit2: 1.09, // 50 pips -> R:R 2.0
    takeProfit3: 1.0925, // 75 pips -> R:R 3.0
    leverage: 100,
  });

  // Risk is $100
  assert.equal(result.riskAmountUsd, 100);
  assert.equal(result.stopLossPips, 25);
  // Pip value per lot is $10. 100 / (25 * 10) = 0.40 standard lots
  assert.equal(result.standardLots, 0.4);
  assert.equal(result.miniLots, 4.0);
  assert.equal(result.microLots, 40);

  // Margin required for 0.40 lot at 1:100: (40,000 * 1.085) / 100 = $434
  assert.ok(result.marginRequiredUsd > 400 && result.marginRequiredUsd < 450);

  // Check multi-tier targets
  assert.ok(result.takeProfitLevels.tp1 != null);
  assert.ok(result.takeProfitLevels.tp2 != null);
  assert.ok(result.takeProfitLevels.tp3 != null);

  assert.equal(result.takeProfitLevels.tp1?.rr, 1.2);
  assert.equal(result.takeProfitLevels.tp2?.rr, 2.0);
  assert.equal(result.takeProfitLevels.tp3?.rr, 3.0);

  // Projected profit
  assert.equal(result.takeProfitLevels.tp1?.projectedProfitUsd, 120); // 0.4 * 30 * 10 = $120
  assert.equal(result.takeProfitLevels.tp2?.projectedProfitUsd, 200); // 0.4 * 50 * 10 = $200

  // Actionable plan exists
  assert.ok(result.advice.actionablePlan.length >= 4);
});

test("Forex Scalp Quant Engine: Multi-Tier TP & Confidence Probability Output", () => {
  // Generate sample trend bars
  const bars: OhlcvBar[] = [];
  let basePrice = 1.08;
  for (let i = 0; i < 60; i++) {
    basePrice += 0.0003;
    bars.push({
      time: 1700000000000 + i * 300000,
      open: basePrice,
      high: basePrice + 0.0005,
      low: basePrice - 0.0002,
      close: basePrice + 0.0003,
      volume: 1000 + i * 10,
    });
  }

  const signal = analyzeForexScalpSimple("EURUSD", bars);
  assert.ok(signal != null);
  assert.equal(signal.pair, "EURUSD");

  // Verify multi-tier TPs are populated
  assert.ok(signal.tp1 != null);
  assert.ok(signal.tp2 != null);
  assert.ok(signal.tp3 != null);

  // For BUY signal: tp3 > tp2 > tp1 > entry > stopLoss
  if (signal.direction === "watch-long" && signal.primarySetup?.entry && signal.primarySetup?.stopLoss) {
    assert.ok((signal.tp1 as number) > signal.primarySetup.entry);
    assert.ok((signal.tp2 as number) > (signal.tp1 as number));
    assert.ok((signal.tp3 as number) > (signal.tp2 as number));
    assert.ok(signal.primarySetup.entry > signal.primarySetup.stopLoss);
  }

  // Confidence probability is bounded in reasonable quant range [45, 92]
  assert.ok(signal.probability != null && signal.probability >= 45 && signal.probability <= 92);
});

