import test from "node:test";
import assert from "node:assert/strict";
import { STRATEGY_METADATA } from "../engines/screener-backtest-engine";
import { PRESET_EDGE_BENCHMARKS, PRESET_TABS } from "@/app/screener/screener-constants";

test("STRATEGY_METADATA defines apex_buy_now real-time trigger with accurate description", () => {
  const meta = STRATEGY_METADATA.apex_buy_now;
  assert.ok(meta, "apex_buy_now must be defined in STRATEGY_METADATA");
  assert.ok(meta.name.includes("Điểm Mua Kích Hoạt"), "Strategy name must mention Điểm Mua Kích Hoạt");
  assert.ok(meta.desc.includes("Wyckoff Spring"), "Strategy desc must mention Wyckoff Spring");
  assert.ok(meta.desc.includes("Pocket Pivot"), "Strategy desc must mention Pocket Pivot");
});

test("PRESET_EDGE_BENCHMARKS & PRESET_TABS have apex_buy_now properly configured", () => {
  const benchmark = PRESET_EDGE_BENCHMARKS.apex_buy_now;
  assert.ok(benchmark, "apex_buy_now benchmark must be present");
  assert.ok(benchmark.winRatePct >= 80, "Win rate should exceed 80% for confluence buy triggers");
  assert.ok(benchmark.profitFactor >= 3.0, "Profit factor should exceed 3.0");
  assert.ok(benchmark.riskReward >= 2.0, "Risk reward should be >= 2.0");

  const tab = PRESET_TABS.find((t) => t.id === "apex_buy_now");
  assert.ok(tab, "apex_buy_now must be a tab item");
  assert.equal(tab.category, "core");
  assert.equal(tab.dotColor, "bg-emerald-400");
  assert.ok(tab.label.includes("Điểm Mua Kích Hoạt"));
});

test("Anti-chasing Extension Guard: rejects over-extended stocks from apex_buy_now", async () => {
  const { calculateBuyPointPlan, parseBarArrays } = await import("../services/screener-snapshot-service");
  
  // Stock that surged +6.2% above pivot: buyZoneStatus must be EXTENDED and flagged isExtended: true
  const dummyBars = Array.from({ length: 30 }, (_, i) => ({
    time: Date.now() - (30 - i) * 86400000,
    open: 50,
    high: 51,
    low: 49,
    close: 50,
    volume: 500_000,
  }));
  const parsed = parseBarArrays(dummyBars);
  const pivotPrice = 50.0;
  const currentPrice = 53.2; // +6.4% above pivot
  
  const plan = calculateBuyPointPlan(
    parsed,
    currentPrice,
    50.0,
    49.0,
    {
      name: "vcp",
      nameVi: "VCP",
      type: "bullish",
      quality: "high",
      breakoutPrice: pivotPrice,
      stopLossPrice: 47.0,
      targetPrice: 60.0,
      necklinePrice: null,
      depthPct: 10,
      durationBars: 20,
      startIndex: 0,
      endIndex: 20,
    },
    80,
    1.5
  );

  assert.equal(plan.buyZoneStatus, "EXTENDED", "Stocks > 4.5% above pivot must be flagged EXTENDED");
  assert.equal(plan.isExtended, true, "isExtended must be true");
  assert.equal(plan.chaseRisk, "HIGH", "chaseRisk must be HIGH to prevent chasing");
});
