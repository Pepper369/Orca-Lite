import test from "node:test";
import assert from "node:assert/strict";
import {
  REGIME_CONFIGS,
  getAdaptiveWeightRecommendation,
  type MarketRegimeType,
} from "../engines/screener-backtest-engine";

test("REGIME_CONFIGS covers all 4 historical market phases plus all-cycle", () => {
  const expectedRegimes: MarketRegimeType[] = [
    "all",
    "uptrend_2020_2021",
    "downtrend_2022",
    "sideway_2023_2024",
    "recent_2025_2026",
  ];

  for (const regime of expectedRegimes) {
    const cfg = REGIME_CONFIGS[regime];
    assert.ok(cfg, `Regime ${regime} must be defined`);
    assert.ok(cfg.label.length > 0);
    assert.ok(cfg.startDate <= cfg.endDate, `startDate must precede endDate for ${regime}`);
  }

  // Check specific VN market chronology
  assert.equal(REGIME_CONFIGS.uptrend_2020_2021.startDate, "2020-01-01");
  assert.equal(REGIME_CONFIGS.uptrend_2020_2021.endDate, "2021-12-31");
  assert.equal(REGIME_CONFIGS.downtrend_2022.startDate, "2022-01-01");
  assert.equal(REGIME_CONFIGS.downtrend_2022.endDate, "2022-12-31");
  assert.equal(REGIME_CONFIGS.sideway_2023_2024.startDate, "2023-01-01");
  assert.equal(REGIME_CONFIGS.sideway_2023_2024.endDate, "2024-12-31");
});

test("getAdaptiveWeightRecommendation tunes weights dynamically to each market phase", () => {
  // 1. Downtrend 2022: Must prioritize Wyckoff Spring & Fakeout protection, tighten sweet zone to <= 4.5%
  const down = getAdaptiveWeightRecommendation("downtrend_2022");
  assert.equal(down.regime, "downtrend_2022");
  assert.ok(down.weights.wyckoffSweetZoneWeight >= 35, "Wyckoff should have highest weight in brutal bear market");
  assert.ok(down.sweetZoneMaxExtensionPct <= 4.5, "Sweet zone extension must be tightened to <= 4.5% to avoid falling knives");
  assert.ok(down.minOverheadRoomPct >= 7.0, "Overhead resistance clearance must be at least 7.0%");

  // 2. Sideway 2023-2024: Must boost Quant OU Mean Reversion to catch box swings
  const side = getAdaptiveWeightRecommendation("sideway_2023_2024");
  assert.equal(side.regime, "sideway_2023_2024");
  assert.ok(side.weights.quantMeanReversionWeight >= 35, "Quant OU Mean Reversion should lead in sideway box market");
  assert.ok(side.sweetZoneMaxExtensionPct <= 6.5);

  // 3. Uptrend 2020-2021: Must boost Smart Money & Pocket Pivot momentum
  const up = getAdaptiveWeightRecommendation("uptrend_2020_2021");
  assert.equal(up.regime, "uptrend_2020_2021");
  assert.ok(up.weights.smartMoneyInflowWeight >= 40, "Smart money volume breakout should lead in mega bull run");
  assert.ok(up.sweetZoneMaxExtensionPct >= 8.0, "Sweet zone can extend up to 8.5% in strong momentum");

  // 4. All & Recent: Balanced gold standard
  const standard = getAdaptiveWeightRecommendation("all");
  assert.equal(standard.weights.wyckoffSweetZoneWeight, 30);
  assert.equal(standard.weights.quantMeanReversionWeight, 25);
  assert.equal(standard.weights.smartMoneyInflowWeight, 25);
  assert.equal(standard.weights.historicalPriceActionWeight, 20);
});

test("REGIME_CONFIGS validates chronological boundary separation without overlap anomalies", () => {
  const uptrend = REGIME_CONFIGS.uptrend_2020_2021;
  const downtrend = REGIME_CONFIGS.downtrend_2022;
  const sideway = REGIME_CONFIGS.sideway_2023_2024;
  const recent = REGIME_CONFIGS.recent_2025_2026;

  assert.ok(uptrend.endDate < downtrend.startDate);
  assert.ok(downtrend.endDate < sideway.startDate);
  assert.ok(sideway.endDate < recent.startDate);
});

