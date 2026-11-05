import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string, ...rest: unknown[]) {
  if (id === "server-only") return {};
  return originalRequire.call(this, id, ...rest);
};

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStockTradePlan } from "../engines/stock-trade-plan";
import type { DetectedChartPattern } from "../engines/chart-patterns";

describe("Stock Detail Trade Plan & Screener Synchronization", () => {
  it("prioritizes chart pattern pivot breakout in both Screener and Stock Detail trade plan", async () => {
    const { calculateBuyPointPlan, parseBarArrays } = await import("../services/screener-snapshot-service");
    const lastPrice = 50.0;
    const patternPivot = 49.5; // Within 4.5% of 50.0
    const topChartPattern: DetectedChartPattern = {
      name: "vcp",
      nameVi: "Mô hình thu hẹp biến động (VCP)",
      type: "bullish",
      quality: "high",
      breakoutPrice: patternPivot,
      stopLossPrice: 47.0,
      targetPrice: 58.0,
      necklinePrice: null,
      depthPct: 15,
      durationBars: 35,
      startIndex: 0,
      endIndex: 35,
    };

    // 1. Screener calculation
    const dummyBars = Array.from({ length: 30 }, (_, i) => ({
      time: i * 86400000,
      open: 48 + i * 0.05,
      high: 49 + i * 0.05,
      low: 47 + i * 0.05,
      close: 48.5 + i * 0.05,
      volume: 1_000_000,
    }));
    const parsed = parseBarArrays(dummyBars);

    const screenerPlan = calculateBuyPointPlan(
      parsed,
      lastPrice,
      49.0, // ma20
      48.0, // ma50
      topChartPattern,
      80, // confluenceScore
      1.5 // volRatio20
    );

    // 2. Stock Detail Trade Plan calculation
    const detailPlan = buildStockTradePlan("buy", {
      last: lastPrice,
      atr14: 1.2,
      support: [48.0, 47.0],
      resistance: [52.0, 55.0],
      topChartPattern,
      sma20: 49.0,
      sma50: 48.0,
      trendScore: 80,
    });

    assert.ok(detailPlan != null, "Detail plan must be generated for buy signal");
    assert.equal(detailPlan.entry, screenerPlan.buyPoint, "Entry price must match screener buyPoint");
    assert.equal(detailPlan.buyPoint, screenerPlan.buyPoint, "detailPlan.buyPoint must match screenerPlan.buyPoint");
    assert.deepEqual(detailPlan.entryZone, screenerPlan.buyRange, "Entry zone must match screener buyRange");
    assert.equal(detailPlan.stopLoss, screenerPlan.stopLoss, "Stop loss must match screener stopLoss");
    assert.equal(detailPlan.takeProfit, screenerPlan.targetPrice, "Take profit must match screener targetPrice");
    assert.equal(detailPlan.riskReward, screenerPlan.riskReward, "R:R must match screener riskReward");
    assert.equal(detailPlan.buyZoneStatus, screenerPlan.buyZoneStatus, "Buy zone status must match screener");
  });

  it("evaluates buy zone status consistently without premature 'wait pullback' false alarms", () => {
    const buyPoint = 50.0;
    const atr14 = 1.0;

    // Case A: Price is at buyPoint (+0.0%)
    const planAtPoint = buildStockTradePlan("buy", {
      last: 50.0,
      atr14,
      support: [49.0],
      resistance: [54.0],
      topChartPattern: {
        breakoutPrice: buyPoint,
        stopLossPrice: 47.5,
        targetPrice: 56.0,
      },
    });
    assert.equal(planAtPoint?.buyZoneStatus, "AT_BUY_POINT", "0% diff must be AT_BUY_POINT");

    // Case B1: Price is +1.2% above buy point (50.6) -> within buyRange [49.5, 50.75] -> AT_BUY_POINT
    const planAtZone = buildStockTradePlan("buy", {
      last: 50.6,
      atr14,
      support: [49.0],
      resistance: [54.0],
      topChartPattern: {
        breakoutPrice: buyPoint,
        stopLossPrice: 47.5,
        targetPrice: 56.0,
      },
    });
    assert.equal(planAtZone?.buyZoneStatus, "AT_BUY_POINT", "+1.2% inside buyRange must be AT_BUY_POINT");

    // Case B2: Price is +2.0% above buy point (51.0) -> outside buyRange but within 2.5% safe accumulation zone -> NEAR_BUY_POINT
    const planNearPoint = buildStockTradePlan("buy", {
      last: 51.0,
      atr14,
      support: [49.0],
      resistance: [54.0],
      topChartPattern: {
        breakoutPrice: buyPoint,
        stopLossPrice: 47.5,
        targetPrice: 56.0,
      },
    });
    assert.equal(planNearPoint?.buyZoneStatus, "NEAR_BUY_POINT", "+2.0% must be NEAR_BUY_POINT (not wait pullback)");
    assert.ok(planNearPoint?.buyPointDiffPct != null && planNearPoint.buyPointDiffPct <= 2.5);

    // Case C: Price ran away by +3.2% (51.6) -> exceeds 2.5% threshold -> WAIT_PULLBACK
    const planWaitPullback = buildStockTradePlan("buy", {
      last: 51.6,
      atr14,
      support: [49.0],
      resistance: [54.0],
      topChartPattern: {
        breakoutPrice: buyPoint,
        stopLossPrice: 47.5,
        targetPrice: 56.0,
      },
    });
    assert.equal(planWaitPullback?.buyZoneStatus, "WAIT_PULLBACK", "+3.2% (> 2.5%) must trigger WAIT_PULLBACK");

    // Case D: Price broke below support (-3.0%, 48.5) -> BELOW_SUPPORT
    const planBelowSupport = buildStockTradePlan("buy", {
      last: 48.5,
      atr14,
      support: [47.0],
      resistance: [54.0],
      topChartPattern: {
        breakoutPrice: buyPoint,
        stopLossPrice: 47.5,
        targetPrice: 56.0,
      },
    });
    assert.equal(planBelowSupport?.buyZoneStatus, "BELOW_SUPPORT", "-3.0% must be BELOW_SUPPORT");
  });

  it("propagates trigger scores and reasons into StockTradePlan correctly", () => {
    const planWithTrigger = buildStockTradePlan("buy", {
      last: 50.0,
      atr14: 1.0,
      isBuyTriggerNow: true,
      buyTriggerScore: 92,
      buyTriggerReasonVi: "Chạm chuẩn điểm mua · Nén Squeeze (6P) · Ngành dẫn dắt RRG",
    });

    assert.ok(planWithTrigger != null);
    assert.equal(planWithTrigger.isBuyTriggerNow, true);
    assert.equal(planWithTrigger.buyTriggerScore, 92);
    assert.equal(planWithTrigger.buyTriggerReasonVi, "Chạm chuẩn điểm mua · Nén Squeeze (6P) · Ngành dẫn dắt RRG");
  });
});
