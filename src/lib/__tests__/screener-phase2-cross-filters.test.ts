import test from "node:test";
import assert from "node:assert/strict";
import { queryScreenerStocks, type ScreenerStockItem } from "../services/screener-snapshot-service";

test("Giai đoạn 2 Cross-Filter - queryScreenerStocks supports setupGradeOnly and goldenPocketOnly", async () => {
  // Test query with setupGradeOnly filter
  const resGradeA = await queryScreenerStocks({
    preset: "all",
    setupGradeOnly: "A+",
    limit: 20,
  });

  assert.ok(resGradeA, "Response must exist");
  assert.ok(Array.isArray(resGradeA.items));
  // Every returned item must have setupGrade === 'A+'
  for (const item of resGradeA.items) {
    assert.equal(item.setupGrade, "A+", `Item ${item.symbol} must have grade A+, got ${item.setupGrade}`);
  }

  // Test query with goldenPocketOnly filter
  const resFibo = await queryScreenerStocks({
    preset: "all",
    goldenPocketOnly: true,
    limit: 10,
  });

  assert.ok(resFibo, "Response must exist");
  for (const item of resFibo.items) {
    assert.equal(item.isGoldenPocket, true, `Item ${item.symbol} must have isGoldenPocket = true`);
  }
});

test("Giai đoạn 2 Cross-Filter - queryScreenerStocks supports flipZoneOnly and smcOrderBlockOnly", async () => {
  const resFlip = await queryScreenerStocks({
    preset: "all",
    flipZoneOnly: true,
    limit: 10,
  });

  assert.ok(resFlip, "Response must exist");
  for (const item of resFlip.items) {
    assert.equal(item.isFlipZoneSupport, true, `Item ${item.symbol} must have isFlipZoneSupport = true`);
  }

  const resSmc = await queryScreenerStocks({
    preset: "all",
    smcOrderBlockOnly: true,
    limit: 10,
  });

  assert.ok(resSmc, "Response must exist");
  for (const item of resSmc.items) {
    assert.equal(item.isSmcOrderBlock, true, `Item ${item.symbol} must have isSmcOrderBlock = true`);
  }
});

test("Giai đoạn 2 Cross-Filter - queryScreenerStocks filters by sniperTriggerSubtype and minSniperRR", async () => {
  // Query only actionable buy triggers with minimum R:R >= 2.0x
  const resSniper = await queryScreenerStocks({
    preset: "all",
    buyTriggerOnly: true,
    minSniperRR: 2.0,
    limit: 15,
  });

  assert.ok(resSniper, "Response must exist");
  for (const item of resSniper.items) {
    assert.equal(item.isBuyTriggerNow, true, `Item ${item.symbol} must be an active buy trigger`);
    assert.ok(
      item.sniperRiskReward != null && item.sniperRiskReward >= 2.0,
      `Item ${item.symbol} must have R:R >= 2.0, got ${item.sniperRiskReward}`
    );
    assert.ok(
      item.sniperTriggerSubtype === "SNIPER_PULLBACK" ||
      item.sniperTriggerSubtype === "SQUEEZE_BREAKOUT" ||
      item.sniperTriggerSubtype === "SWEEP_RECLAIM",
      `Subtype must be one of 3 orthogonal sniper modes, got ${item.sniperTriggerSubtype}`
    );
  }
});
