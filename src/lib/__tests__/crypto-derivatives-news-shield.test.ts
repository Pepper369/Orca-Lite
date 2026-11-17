import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFundingRate,
  analyzeOpenInterestTrend,
  evaluateTrueLevel2Dom,
} from "../engines/crypto-derivatives-engine";
import {
  evaluateCryptoShield,
  calculateCryptoSlippageBufferUsd,
} from "../engines/crypto-news-shield";
import { calculateCryptoPositionSize } from "../engines/crypto-position-sizer";
import type { OrderBookSnapshot } from "../providers/binance";

test("Crypto Derivatives: analyzeFundingRate detects normal, overheat & short squeeze", () => {
  const normal = analyzeFundingRate(0.0001);
  assert.equal(normal.fundingBias, "NEUTRAL");
  assert.ok(normal.squeezeRiskScore <= 30);

  const overheat = analyzeFundingRate(0.00075);
  assert.equal(overheat.fundingBias, "EXTREME_LONG_OVERHEAT");
  assert.ok(overheat.squeezeRiskScore >= 80);
  assert.ok(overheat.annualizedPct > 50);

  const squeeze = analyzeFundingRate(-0.0006);
  assert.equal(squeeze.fundingBias, "EXTREME_SHORT_SQUEEZE");
  assert.ok(squeeze.squeezeRiskScore >= 80);
});

test("Crypto Derivatives: analyzeOpenInterestTrend identifies smart money flow states", () => {
  assert.equal(analyzeOpenInterestTrend(3.5, 5.0), "LONG_ACCUMULATION");
  assert.equal(analyzeOpenInterestTrend(4.0, -4.5), "SHORT_SQUEEZE");
  assert.equal(analyzeOpenInterestTrend(-3.0, 6.0), "SHORT_BUILDUP");
  assert.equal(analyzeOpenInterestTrend(-5.0, -8.0), "LONG_LIQUIDATION");
  assert.equal(analyzeOpenInterestTrend(0.2, 0.5), "NEUTRAL");
});

test("Crypto Derivatives: evaluateTrueLevel2Dom calculates OBI & detects Buy/Sell Walls", () => {
  const mockBook: OrderBookSnapshot = {
    lastUpdateId: 1000,
    bids: [
      { price: 90000, qty: 5.0 }, // 450,000 USD
      { price: 89900, qty: 10.0 }, // 899,000 USD (Buy wall)
      { price: 89800, qty: 2.0 },
      { price: 89700, qty: 1.0 },
      { price: 89600, qty: 1.0 },
    ],
    asks: [
      { price: 90100, qty: 1.0 }, // 90,100 USD
      { price: 90200, qty: 1.0 },
      { price: 90300, qty: 1.0 },
      { price: 90400, qty: 1.0 },
      { price: 90500, qty: 1.0 },
    ],
  };

  const result = evaluateTrueLevel2Dom(mockBook, 5);
  assert.equal(result.levels.length, 5);
  assert.ok(result.totalBidNotional > result.totalAskNotional);
  assert.ok(result.imbalanceRatio > 30);
  assert.equal(result.institutionalBias, "STRONG_BUY_WALL");
  assert.equal(result.nearestBuyWallPrice, 89900);
});

test("Crypto Shield: evaluateCryptoShield triggers on Macro News, Overheat & Rapid Cascade", () => {
  // 1. Normal state
  const normal = evaluateCryptoShield({ symbol: "BTCUSDT", fundingRate: 0.0001, recentPriceChangePct5m: 0.5 });
  assert.equal(normal.isLockout, false);
  assert.equal(normal.reason, "NONE");
  assert.equal(normal.stage, "NORMAL");

  // 2. Extreme funding rate overheat
  const overheat = evaluateCryptoShield({ symbol: "BTCUSDT", fundingRate: 0.00085 });
  assert.equal(overheat.isLockout, true);
  assert.equal(overheat.reason, "EXTREME_FUNDING_OVERHEAT");
  assert.equal(overheat.recommendedAction, "REDUCE_LEVERAGE");

  // 3. 5-minute rapid liquidation cascade (> 3.5%)
  const cascade = evaluateCryptoShield({ symbol: "BTCUSDT", recentPriceChangePct5m: -4.2 });
  assert.equal(cascade.isLockout, true);
  assert.equal(cascade.reason, "LIQUIDATION_CASCADE_ALERT");
  assert.equal(cascade.recommendedAction, "WAIT_VOLATILITY_COOLING");
});

test("Crypto Shield: calculateCryptoSlippageBufferUsd scales dynamically", () => {
  const btcPrice = 90_000;
  const normalBuffer = calculateCryptoSlippageBufferUsd(btcPrice, 0.05);
  assert.equal(normalBuffer.bufferUsd, 45); // 0.05% of 90k = $45
  assert.equal(normalBuffer.maxAllowedSlippageUsd, 112.5);

  const cascadeBuffer = calculateCryptoSlippageBufferUsd(btcPrice, 1.0);
  assert.equal(cascadeBuffer.bufferUsd, 900); // 1.0% of 90k = $900
  assert.equal(cascadeBuffer.maxAllowedSlippageUsd, 2250);
});

test("Crypto Position Sizer: calculates isolated margin, position qty & early liquidation safety", () => {
  // BTC Buy at $90,000, Stop Loss at $88,500 (Risk $1,500 / 1.67%)
  // Account $10,000, Risk 1% = $100
  // Leverage 5x
  const sizer5x = calculateCryptoPositionSize({
    accountBalance: 10_000,
    riskPercent: 1.0,
    entryPrice: 90_000,
    stopLossPrice: 88_500,
    leverage: 5,
    direction: "BUY",
  });

  assert.equal(sizer5x.riskAmountUsd, 100);
  assert.equal(sizer5x.priceRiskUsd, 1500);
  // Qty = 100 / 1500 = 0.066667 BTC
  assert.ok(Math.abs(sizer5x.positionQty - 0.066667) < 0.001);
  assert.ok(sizer5x.requiredMarginUsd > 1000 && sizer5x.requiredMarginUsd < 1300);
  // 5x liquidation is ~18% away (around $73,800), well below SL of $88,500
  assert.equal(sizer5x.isSafeFromEarlyLiquidation, true);
  assert.ok(sizer5x.liquidationSafetyRatio! > 5.0);

  // Take Profits
  assert.equal(sizer5x.takeProfit1Target?.riskRewardRatio, 1.2);
  assert.equal(sizer5x.takeProfit1Target?.projectedProfitUsd, 120);
  assert.equal(sizer5x.takeProfit2Target?.projectedProfitUsd, 200);
  assert.equal(sizer5x.takeProfit3Target?.projectedProfitUsd, 300);

  // Dangerous 50x leverage test where liquidation happens BEFORE stop loss
  const sizer50x = calculateCryptoPositionSize({
    accountBalance: 10_000,
    riskPercent: 1.0,
    entryPrice: 90_000,
    stopLossPrice: 88_000, // 2.22% risk
    leverage: 50, // 50x drops only 1.8% before liquidation!
    direction: "BUY",
  });

  assert.equal(sizer50x.isSafeFromEarlyLiquidation, false);
  assert.ok(sizer50x.advice.includes("NGUY HIỂM"));
});
