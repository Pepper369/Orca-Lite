import test from "node:test";
import assert from "node:assert/strict";
import { STRATEGY_METADATA } from "../engines/screener-backtest-engine";
import { PRESET_EDGE_BENCHMARKS, PRESET_TABS } from "@/app/screener/screener-panels";

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
