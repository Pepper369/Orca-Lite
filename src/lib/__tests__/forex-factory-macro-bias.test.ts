import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNewsSurprise } from "../providers/forex-factory-calendar";
import { calculateCurrencyStrengthMatrix, type PairPriceInput } from "../engines/forex-currency-strength";

test("Forex Factory Macro Engine: evaluateNewsSurprise detects economic surprises causally", () => {
  // 1. Economic growth indicator (NFP / Payrolls): Actual > Forecast -> Bullish
  const nfpRes = evaluateNewsSurprise("Non-Farm Employment Change", "250K", "180K");
  assert.ok(nfpRes);
  assert.equal(nfpRes.direction, "BULLISH");
  assert.ok(nfpRes.descriptionVi.includes("vượt kỳ vọng"));

  // 2. Inverse indicator (Unemployment Rate): Actual > Forecast -> Bearish (Tỷ lệ thất nghiệp tăng là xấu)
  const unempRes = evaluateNewsSurprise("Unemployment Rate", "4.4%", "4.1%");
  assert.ok(unempRes);
  assert.equal(unempRes.direction, "BEARISH");
  assert.ok(unempRes.descriptionVi.includes("thấp hơn kỳ vọng") || unempRes.descriptionVi.includes("Áp lực giảm giá"));

  // 3. Inverse indicator (Initial Jobless Claims): Actual < Forecast -> Bullish (Ít người nộp đơn trợ cấp hơn là tốt)
  const claimsRes = evaluateNewsSurprise("Unemployment Claims", "205K", "225K");
  assert.ok(claimsRes);
  assert.equal(claimsRes.direction, "BULLISH");

  // 4. Exact match: Actual == Forecast -> Neutral
  const neutralRes = evaluateNewsSurprise("US CPI m/m", "0.3%", "0.3%");
  assert.ok(neutralRes);
  assert.equal(neutralRes.direction, "NEUTRAL");
});

test("Currency Strength Matrix: Blends 70% Price Action Momentum with 30% Forex Factory Macro Catalyst", () => {
  const dummyPairs: PairPriceInput[] = [
    { pair: "EURUSD", price: 1.085, changePercent: -0.2 },
    { pair: "GBPUSD", price: 1.305, changePercent: -0.3 },
    { pair: "USDJPY", price: 154.5, changePercent: +0.4 },
    { pair: "AUDUSD", price: 0.655, changePercent: -0.1 },
    { pair: "USDCAD", price: 1.385, changePercent: +0.2 },
  ];

  // Baseline CSM without macro bias
  const baseCsm = calculateCurrencyStrengthMatrix(dummyPairs);
  const baseUsd = baseCsm.scores.find((s) => s.currency === "USD")!;
  assert.ok(baseUsd.score > 0);

  // Blended CSM with strong Bullish USD Macro Bias (+3.0 points from positive NFP/CPI surprise)
  const macroBiases = new Map([
    ["USD", { biasScore: 3.0 }],
    ["EUR", { biasScore: -2.0 }],
  ]);
  const blendedCsm = calculateCurrencyStrengthMatrix(dummyPairs, macroBiases);
  const blendedUsd = blendedCsm.scores.find((s) => s.currency === "USD")!;
  const blendedEur = blendedCsm.scores.find((s) => s.currency === "EUR")!;

  // USD blended score must be boosted by positive macro news bias
  assert.ok(
    blendedUsd.score >= baseUsd.score,
    `Blended USD score (${blendedUsd.score}) should be >= base score (${baseUsd.score})`,
  );
  // Spread between EUR and USD must widen under divergent macro catalysts
  const spread = blendedEur.score - blendedUsd.score;
  assert.ok(spread < 0, `EUR - USD spread (${spread}) should be strongly negative under USD macro catalyst`);
});
