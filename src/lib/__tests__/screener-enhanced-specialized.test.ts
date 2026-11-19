import test from "node:test";
import assert from "node:assert/strict";
import {
  queryScreenerStocks,
  SCREENER_BIT,
} from "../services/screener-snapshot-service";
import {
  PRESET_TABS,
  PRESET_EDGE_BENCHMARKS,
} from "../../app/screener/screener-constants";
import { resolveCanonicalPreset } from "../quant/screener-taxonomy";

test("Enhanced Specialized Screeners - Bitmask Constants Integrity", () => {
  assert.equal(typeof SCREENER_BIT.WYCKOFF_SPRING_TEST, "number");
  assert.equal(typeof SCREENER_BIT.VCP_VDU_PIVOT, "number");
  assert.equal(typeof SCREENER_BIT.CANSLIM_ACCEL, "number");
  assert.equal(typeof SCREENER_BIT.TRIPLE_CONFLUENCE_GOLD, "number");

  assert.equal(SCREENER_BIT.WYCKOFF_SPRING_TEST, 1 << 19);
  assert.equal(SCREENER_BIT.VCP_VDU_PIVOT, 1 << 20);
  assert.equal(SCREENER_BIT.CANSLIM_ACCEL, 1 << 21);
  assert.equal(SCREENER_BIT.TRIPLE_CONFLUENCE_GOLD, 1 << 22);
});

test("Enhanced Specialized Screeners - Preset Tabs and Benchmarks Registration", () => {
  const tabIds = new Set(PRESET_TABS.map((t) => t.id));
  assert.ok(tabIds.has(resolveCanonicalPreset("wyckoff_spring")), "Must register canonical tab for wyckoff_spring");
  assert.ok(tabIds.has(resolveCanonicalPreset("vcp_vdu")), "Must register canonical tab for vcp_vdu");
  assert.ok(tabIds.has(resolveCanonicalPreset("canslim_accel")), "Must register canonical tab for canslim_accel");
  assert.ok(tabIds.has(resolveCanonicalPreset("triple_confluence")), "Must register canonical tab for triple_confluence");

  assert.ok(PRESET_EDGE_BENCHMARKS.wyckoff_spring, "Must define benchmark for wyckoff_spring");
  assert.ok(PRESET_EDGE_BENCHMARKS.vcp_vdu, "Must define benchmark for vcp_vdu");
  assert.ok(PRESET_EDGE_BENCHMARKS.canslim_accel, "Must define benchmark for canslim_accel");
  assert.ok(PRESET_EDGE_BENCHMARKS.triple_confluence, "Must define benchmark for triple_confluence");

  assert.ok((PRESET_EDGE_BENCHMARKS.wyckoff_spring?.winRatePct ?? 0) >= 70);
  assert.ok((PRESET_EDGE_BENCHMARKS.vcp_vdu?.winRatePct ?? 0) >= 70);
  assert.ok((PRESET_EDGE_BENCHMARKS.canslim_accel?.winRatePct ?? 0) >= 70);
  assert.ok((PRESET_EDGE_BENCHMARKS.triple_confluence?.winRatePct ?? 0) >= 75);
});

test("Enhanced Specialized Screeners - queryScreenerStocks filters without failure", async () => {
  const resWyckoff = await queryScreenerStocks({
    preset: "wyckoff_spring",
    limit: 20,
  });
  assert.ok(resWyckoff, "Wyckoff spring query must return response");
  assert.ok(Array.isArray(resWyckoff.items));

  const resVcp = await queryScreenerStocks({
    preset: "vcp_vdu",
    limit: 20,
  });
  assert.ok(resVcp, "VCP VDU query must return response");
  assert.ok(Array.isArray(resVcp.items));

  const resCanslim = await queryScreenerStocks({
    preset: "canslim_accel",
    limit: 20,
  });
  assert.ok(resCanslim, "CANSLIM Accel query must return response");
  assert.ok(Array.isArray(resCanslim.items));

  const resConfluence = await queryScreenerStocks({
    preset: "triple_confluence",
    limit: 20,
  });
  assert.ok(resConfluence, "Triple Confluence query must return response");
  assert.ok(Array.isArray(resConfluence.items));
});

