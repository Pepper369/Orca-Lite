import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAvellanedaStoikovSkew,
  calculateInventorySizingMultiplier,
  evaluateHangingOrderRisk,
  adjustTradeSetupWithInventorySkew,
} from "../engines/bot-inventory-skew-engine";

describe("Bot Inventory Skew & Asymmetric Risk Engine (Hummingbot Parity)", () => {
  it("calculateAvellanedaStoikovSkew: behaves symmetrically for neutral, long-heavy and short-heavy inventory", () => {
    const mid = 50000;
    const capacity = 10;

    // 1. Delta Neutral (q = 0)
    const neutral = calculateAvellanedaStoikovSkew({
      midPrice: mid,
      netInventory: 0,
      maxInventoryCapacity: capacity,
      volatilitySigma: 0.02,
    });
    assert.equal(neutral.inventoryRatio, 0);
    assert.equal(neutral.inventoryRegime, "DELTA_NEUTRAL");
    assert.ok(Math.abs(neutral.reservationPrice - mid) <= 0.01);
    assert.ok(neutral.optimalBidPrice < mid);
    assert.ok(neutral.optimalAskPrice > mid);
    assert.equal(neutral.bidSpreadFromMid, neutral.askSpreadFromMid);

    // 2. Long Heavy (q = +5 contracts, 50% saturation)
    const longHeavy = calculateAvellanedaStoikovSkew({
      midPrice: mid,
      netInventory: 5,
      maxInventoryCapacity: capacity,
      volatilitySigma: 0.02,
    });
    assert.equal(longHeavy.inventoryRatio, 0.5);
    assert.equal(longHeavy.inventoryRegime, "LONG_HEAVY_SKEW_DOWN");
    // Reservation price MUST shift downward to incentivize selling and discourage buying
    assert.ok(longHeavy.reservationPrice < mid);
    assert.ok(longHeavy.inventoryPriceShift < 0);
    // Bid distance from mid should be wider than ask distance from mid
    assert.ok(longHeavy.bidSpreadFromMid > longHeavy.askSpreadFromMid);

    // 3. Short Heavy (q = -5 contracts, -50% saturation)
    const shortHeavy = calculateAvellanedaStoikovSkew({
      midPrice: mid,
      netInventory: -5,
      maxInventoryCapacity: capacity,
      volatilitySigma: 0.02,
    });
    assert.equal(shortHeavy.inventoryRatio, -0.5);
    assert.equal(shortHeavy.inventoryRegime, "SHORT_HEAVY_SKEW_UP");
    // Reservation price MUST shift upward to incentivize covering
    assert.ok(shortHeavy.reservationPrice > mid);
    assert.ok(shortHeavy.inventoryPriceShift > 0);
    // Ask distance from mid should be wider than bid distance from mid
    assert.ok(shortHeavy.askSpreadFromMid > shortHeavy.bidSpreadFromMid);
  });

  it("calculateInventorySizingMultiplier: enforces capacity block, dampening, and rebalancing boost", () => {
    const baseLots = 1.0;
    const capacity = 10;

    // Case 1: Hard cutoff when inventory >= 90%
    const blockedBuy = calculateInventorySizingMultiplier({
      direction: "BUY",
      baseLotsOrQty: baseLots,
      netInventory: 9.2, // 92% of capacity
      maxInventoryCapacity: capacity,
      hardCutoffRatio: 0.90,
    });
    assert.equal(blockedBuy.isBlockedByCapacity, true);
    assert.equal(blockedBuy.adjustedLotsOrQty, 0);
    assert.equal(blockedBuy.sizeMultiplier, 0);

    // Case 2: Dampen buy size when already 50% net long
    const dampenedBuy = calculateInventorySizingMultiplier({
      direction: "BUY",
      baseLotsOrQty: baseLots,
      netInventory: 5.0, // 50%
      maxInventoryCapacity: capacity,
    });
    assert.equal(dampenedBuy.isBlockedByCapacity, false);
    assert.ok(dampenedBuy.sizeMultiplier < 1.0);
    assert.ok(dampenedBuy.adjustedLotsOrQty < baseLots);

    // Case 3: Rebalance boost when buying while net short (-40%)
    const rebalanceBuy = calculateInventorySizingMultiplier({
      direction: "BUY",
      baseLotsOrQty: baseLots,
      netInventory: -4.0, // -40%
      maxInventoryCapacity: capacity,
    });
    assert.equal(rebalanceBuy.isBlockedByCapacity, false);
    assert.ok(rebalanceBuy.sizeMultiplier > 1.0);
    assert.ok(rebalanceBuy.adjustedLotsOrQty > baseLots);

    // Case 4: Symmetrical for SELL when net short
    const blockedSell = calculateInventorySizingMultiplier({
      direction: "SELL",
      baseLotsOrQty: baseLots,
      netInventory: -9.5,
      maxInventoryCapacity: capacity,
    });
    assert.equal(blockedSell.isBlockedByCapacity, true);
    assert.equal(blockedSell.sizeMultiplier, 0);
  });

  it("evaluateHangingOrderRisk: detects stale hanging orders exceeding adverse ratio", () => {
    // Normal drift: 1.0x ATR -> SAFE
    const safeOrder = evaluateHangingOrderRisk({
      orderDirection: "BUY",
      limitPrice: 99.0,
      currentPrice: 100.0,
      atrOrSpread: 1.5, // drift = 1.0 / 1.5 = 0.67x ATR <= 2.5x
    });
    assert.equal(safeOrder.shouldCancel, false);

    // Toxic drift: price ran away 5.0 pts (5.0 / 1.5 = 3.33x ATR > 2.5x) -> CANCEL
    const hangingOrder = evaluateHangingOrderRisk({
      orderDirection: "BUY",
      limitPrice: 95.0,
      currentPrice: 100.0,
      atrOrSpread: 1.5,
    });
    assert.equal(hangingOrder.shouldCancel, true);
    assert.ok(hangingOrder.driftRatio > 2.5);
    assert.ok(hangingOrder.reason.includes("exceeds safety tolerance"));
  });

  it("adjustTradeSetupWithInventorySkew: adjusts entry price and TP1 for inventory rebalancing", () => {
    const setup = adjustTradeSetupWithInventorySkew({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      entryPrice: 60000,
      stopLossPrice: 59000,
      takeProfit1: 62000,
      baseLotsOrQty: 0.5,
      netInventory: 4.0, // 40% net long
      maxInventoryCapacity: 10.0,
      atr: 600,
    });

    assert.equal(setup.direction, "BUY");
    assert.ok(setup.sizeMultiplier < 1.0, "Size multiplier should be dampened for long-heavy inventory");
    assert.ok(setup.adjustedLotsOrQty < 0.5, "Adjusted lots should be lower than original 0.5");
    assert.ok(setup.asymmetricTakeProfit1 < 62000, "TP1 should be tightened to offload inventory faster");
    assert.ok(setup.rationale.includes("Net Long"));
  });
});
