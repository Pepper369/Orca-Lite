import test from "node:test";
import assert from "node:assert/strict";
import { computeFundamentalMatrix } from "../engines/fundamental-quant-matrix";

test("Fundamental Quant Matrix Engine", async (t) => {
  await t.test("Identifies FORTRESS: high net cash and strong interest coverage", () => {
    const res = computeFundamentalMatrix({
      snap: {
        roic: 18.5,
        interestCoverage: 12.0,
        netDebtToEbitda: -1.5,
        ocfTtm: 2500,
        fcfTtm: 1800,
        cash: 5000,
        totalDebt: 800,
        netProfit: 1500,
        revenue: 12000,
        qualityScore: 85,
        healthScore: 90,
      },
      price: 95.0,
      pe: 14.5,
      pb: 2.8,
      dividendYield: 4.5,
      niYoyPct: 22.0,
      marketCapBillion: 45000,
      vietcapProfile: {
        targetPrice: 125.0,
        rating: "BUY",
        ratingAsOf: "2026-03-15",
        marketCap: 45000,
        freeFloatPct: 40,
      },
    });

    assert.equal(res.isNetCash, true);
    assert.equal(res.isSafeDebt, true);
    assert.equal(res.isQualityEarnings, true);
    assert.equal(res.faCategory, "FORTRESS");
    assert.equal(res.roic, 18.5);
    assert.equal(res.interestCoverage, 12.0);
    assert.ok(res.cfoToNetProfit != null && res.cfoToNetProfit > 1.0);
    assert.ok(res.consensusUpsidePct != null && res.consensusUpsidePct > 30);
    assert.ok(res.peg != null && res.peg < 1.0);
    assert.ok(res.magicFormulaScore != null && res.magicFormulaScore >= 70);
  });

  await t.test("Identifies CASH_MACHINE: high CFO to NP conversion and positive FCF", () => {
    const res = computeFundamentalMatrix({
      snap: {
        roic: 12.0,
        interestCoverage: 3.5,
        netDebtToEbitda: 0.8,
        ocfTtm: 3200,
        fcfTtm: 2100,
        cash: 1000,
        totalDebt: 1800,
        netProfit: 2000,
        revenue: 15000,
        qualityScore: 78,
        healthScore: 70,
      },
      price: 45.0,
      pe: 10.0,
      pb: 1.5,
      dividendYield: 5.5,
      niYoyPct: 15.0,
      marketCapBillion: 20000,
    });

    assert.equal(res.isNetCash, false);
    assert.equal(res.isQualityEarnings, true);
    assert.equal(res.faCategory, "CASH_MACHINE");
    assert.equal(res.cfoToNetProfit, 1.6);
    assert.ok(res.fcfYieldPct != null && res.fcfYieldPct > 0);
  });

  await t.test("Identifies MOAT_QUALITY: high ROIC >= 15% with decent Greenblatt ranking", () => {
    const res = computeFundamentalMatrix({
      snap: {
        roic: 26.5,
        interestCoverage: 8.0,
        netDebtToEbitda: 0.2,
        ocfTtm: 1500,
        fcfTtm: 1100,
        cash: 1000,
        totalDebt: 1800,
        netProfit: 1600,
        revenue: 18000,
        qualityScore: 88,
        healthScore: 82,
      },
      price: 80.0,
      pe: 12.0,
      pb: 3.2,
      dividendYield: 3.5,
      niYoyPct: 18.0,
      marketCapBillion: 30000,
    });

    assert.equal(res.faCategory, "MOAT_QUALITY");
    assert.equal(res.roic, 26.5);
    assert.ok(res.magicFormulaScore != null && res.magicFormulaScore >= 80);
  });

  await t.test("Identifies HIGH_RISK: low interest coverage and negative CFO", () => {
    const res = computeFundamentalMatrix({
      snap: {
        roic: 2.1,
        interestCoverage: 0.8,
        netDebtToEbitda: 6.5,
        ocfTtm: -800,
        fcfTtm: -1200,
        cash: 200,
        totalDebt: 5000,
        netProfit: 150,
        revenue: 8000,
        qualityScore: 25,
        healthScore: 30,
      },
      price: 15.0,
      pe: 35.0,
      pb: 1.8,
      dividendYield: 0,
      niYoyPct: -45.0,
      marketCapBillion: 5200,
    });

    assert.equal(res.faCategory, "HIGH_RISK");
    assert.equal(res.isSafeDebt, false);
    assert.equal(res.isNetCash, false);
    assert.equal(res.isQualityEarnings, false);
  });
});
