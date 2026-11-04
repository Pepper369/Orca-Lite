import test from "node:test";
import assert from "node:assert/strict";
import {
  trainHistoricalPriceAction,
  type HistoricalPriceBar,
} from "../engines/historical-price-action-trainer";
import {
  computeRawOrcaScore,
  calculateUniverseOrcaMaster,
  type OrcaMasterInput,
} from "../engines/orca-master-composite";

test("Historical Price Action Trainer modulates Orca Composite Master Score", () => {
  // Stock A: High historical win rate, institutional volume accumulation
  const inputHighEdge: OrcaMasterInput = {
    symbol: "STOCK_HIGH",
    rsRating: 85,
    smartMoneyScore: 80,
    piotroskiFScore: 8,
    altmanZone: "SAFE",
    roe: 22,
    confluenceScore: 78,
    isNearBuy: true,
    absBuyDiff: 1.2,
    maSignal: "BULLISH_ALIGN",
    historicalEdgeScore: 88, // High trained edge
    upDownVolRatio: 1.45,    // Strong accumulation
  };

  // Stock B: Same base RS and fundamental metrics, but poor historical edge (frequent bull-traps / distribution)
  const inputPoorEdge: OrcaMasterInput = {
    symbol: "STOCK_POOR",
    rsRating: 85,
    smartMoneyScore: 80,
    piotroskiFScore: 8,
    altmanZone: "SAFE",
    roe: 22,
    confluenceScore: 78,
    isNearBuy: true,
    absBuyDiff: 1.2,
    maSignal: "BULLISH_ALIGN",
    historicalEdgeScore: 35, // Low edge / high fakeout risk
    upDownVolRatio: 0.65,    // Stealth distribution
  };

  const rawA = computeRawOrcaScore(inputHighEdge);
  const rawB = computeRawOrcaScore(inputPoorEdge);

  assert.ok(
    rawA.rawScore > rawB.rawScore + 10,
    `Stock with high trained historical edge score (${rawA.rawScore}) must significantly outperform stock with poor historical edge (${rawB.rawScore})`
  );

  const universeMap = calculateUniverseOrcaMaster([inputHighEdge, inputPoorEdge]);
  const resA = universeMap.get("STOCK_HIGH");
  const resB = universeMap.get("STOCK_POOR");

  assert.ok(resA != null && resB != null);
  assert.ok(resA.compositeScore > resB.compositeScore);
  assert.ok(resA.primaryStrengthVi.includes("Lợi Thế Lịch Sử"));
});

test("trainHistoricalPriceAction detects fakeout traps correctly", () => {
  // Simulate stock in flat base around 50, then repeated false breakouts that quickly fail
  const bars: HistoricalPriceBar[] = [];
  for (let i = 0; i < 70; i++) {
    const isBreakout = (i === 30 || i === 45 || i === 60);
    const isImmediateFail = (i === 31 || i === 46 || i === 61);

    if (isBreakout) {
      // Huge breakout attempt above 52
      bars.push({
        time: i * 86400,
        open: 50,
        high: 56,
        low: 50,
        close: 55, // breaks 20-day high (51)
        volume: 30000,
      });
    } else if (isImmediateFail) {
      // Sudden collapse back down to 48 on heavy dump volume
      bars.push({
        time: i * 86400,
        open: 53,
        high: 53,
        low: 47,
        close: 48,
        volume: 45000,
      });
    } else {
      // Normal flat trading between 49 and 51
      bars.push({
        time: i * 86400,
        open: 50,
        high: 51,
        low: 49,
        close: 50,
        volume: 10000,
      });
    }
  }

  const metrics = trainHistoricalPriceAction(bars);
  assert.ok(
    metrics.fakeoutRiskPct >= 50,
    `Fakeout risk ${metrics.fakeoutRiskPct}% should be >= 50% for trap-prone stock`
  );
  assert.ok(
    metrics.historicalEdgeScore <= 55,
    `Historical edge score ${metrics.historicalEdgeScore} should be penalized (<= 55)`
  );
});
