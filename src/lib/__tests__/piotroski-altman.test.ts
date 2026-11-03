import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePiotroskiScore,
  calculateAltmanZScore,
  computePiotroskiAltman,
} from "../engines/piotroski-altman";
import type { FundamentalSnapshot } from "../financial/snapshots";

test("calculatePiotroskiScore awards 8-9 points for strong fundamental companies", () => {
  const healthySnap: FundamentalSnapshot = {
    symbol: "FPT",
    reportDate: "2024-12-31",
    roe: 26.5,
    roa: 11.2,
    ros: 18.0,
    roic: 22.0,
    grossMargin: 38.5,
    netMargin: 15.4,
    operatingMargin: 19.0,
    debtEquity: 0.45,
    currentRatio: 1.65,
    quickRatio: 1.45,
    interestCoverage: 12.0,
    netDebtToEbitda: 0.3,
    fcfTtm: 5_200_000_000,
    ocfTtm: 7_800_000_000,
    revenue: 52_000_000_000,
    netProfit: 6_500_000_000,
    equity: 30_000_000_000,
    totalDebt: 12_000_000_000,
    cash: 8_000_000_000,
    shares: 1_300_000_000,
    epsTtm: 5000,
    ebitdaTtm: 8_500_000_000,
    revenueYoyPct: 22.5,
    niYoyPct: 21.0,
    revenueQoqPct: 5.2,
    niQoqPct: 4.8,
    coverage: 1.0,
    qualityScore: 92,
    healthScore: 88,
    hasGrowth: true,
    hasHealth: true,
  };

  const res = calculatePiotroskiScore(healthySnap);

  assert.ok(res.fScore >= 8, `F-Score should be >= 8, got ${res.fScore}`);
  assert.equal(res.rating, "EXCELLENT");
  assert.equal(res.criteria.positiveRoa, true);
  assert.equal(res.criteria.positiveCfo, true);
  assert.equal(res.criteria.cashQuality, true);
});

test("calculateAltmanZScore classifies healthy vs distressed companies properly", () => {
  const safeSnap: FundamentalSnapshot = {
    symbol: "VNM",
    reportDate: "2024-12-31",
    roe: 28.0,
    roa: 16.0,
    ros: 15.0,
    roic: 24.0,
    grossMargin: 42.0,
    netMargin: 16.0,
    operatingMargin: 18.0,
    debtEquity: 0.25,
    currentRatio: 2.1,
    quickRatio: 1.8,
    interestCoverage: 20.0,
    netDebtToEbitda: 0.1,
    fcfTtm: 8_000_000_000,
    ocfTtm: 9_500_000_000,
    revenue: 60_000_000_000,
    netProfit: 9_000_000_000,
    equity: 40_000_000_000,
    totalDebt: 8_000_000_000,
    cash: 15_000_000_000,
    shares: 2_000_000_000,
    epsTtm: 4500,
    ebitdaTtm: 11_000_000_000,
    revenueYoyPct: 5.0,
    niYoyPct: 7.0,
    revenueQoqPct: 2.0,
    niQoqPct: 3.0,
    coverage: 1.0,
    qualityScore: 90,
    healthScore: 95,
    hasGrowth: true,
    hasHealth: true,
  };

  const altman = calculateAltmanZScore(safeSnap);
  assert.ok(altman.zScore != null && altman.zScore >= 2.6, `Z-Score should be >= 2.6, got ${altman.zScore}`);
  assert.equal(altman.zone, "SAFE");
  assert.equal(altman.zoneVi, "An Toàn");
});
