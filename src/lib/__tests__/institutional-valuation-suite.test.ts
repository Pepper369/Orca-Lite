import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWaccFromComponents,
  computeScenarioDcf,
  generateDcfSensitivityMatrix,
  computeSotpValuation,
  computeRelativeMultiplesScorecard,
  runInstitutionalValuationSuite,
  type SotpSegmentInput,
} from "../engines/institutional-valuation-suite";

test("Institutional Valuation Skill Suite (himself65 Parity)", async (t) => {
  await t.test("calculateWaccFromComponents: computes consistent WACC via CAPM and debt weights", () => {
    const wacc = calculateWaccFromComponents({
      riskFreeRate: 0.045, // 4.5%
      beta: 1.2,
      equityRiskPremium: 0.065, // 6.5% -> Ke = 4.5% + 7.8% = 12.3%
      costOfDebtPreTax: 0.08, // 8.0% -> Kd after tax (20%) = 6.4%
      taxRate: 0.20,
      equityWeight: 0.70,
      debtWeight: 0.30,
    });

    // Ke = 0.123, Kd_after = 0.064
    // WACC = 0.70 * 0.123 + 0.30 * 0.064 = 0.0861 + 0.0192 = 0.1053 (10.53%)
    assert.ok(wacc >= 0.10 && wacc <= 0.11, `Expected WACC ~10.53%, got ${wacc}`);
  });

  await t.test("computeScenarioDcf: enforces Bear < Base < Bull valuation monotonicity and valid MOS", () => {
    const currentPrice = 50_000;
    const sharesOutstanding = 1_000_000_000;
    const initialFcf = 3_000_000_000_000; // 3,000 billion VND
    const netDebt = 5_000_000_000_000; // 5,000 billion VND

    const bear = computeScenarioDcf("BEAR", {
      currentPrice,
      sharesOutstanding,
      initialFcf: initialFcf * 0.85,
      netDebt,
      growthRates: [0.06, 0.05, 0.04, 0.03, 0.02],
      wacc: 0.12,
      terminalGrowth: 0.02,
      exitMultiple: 6.5,
    });

    const base = computeScenarioDcf("BASE", {
      currentPrice,
      sharesOutstanding,
      initialFcf,
      netDebt,
      growthRates: [0.12, 0.10, 0.08, 0.06, 0.05],
      wacc: 0.105,
      terminalGrowth: 0.025,
      exitMultiple: 8.5,
    });

    const bull = computeScenarioDcf("BULL", {
      currentPrice,
      sharesOutstanding,
      initialFcf: initialFcf * 1.15,
      netDebt,
      growthRates: [0.18, 0.15, 0.12, 0.10, 0.08],
      wacc: 0.095,
      terminalGrowth: 0.035,
      exitMultiple: 11.0,
    });

    assert.ok(bear.fairValuePerShare < base.fairValuePerShare, "Bear must be strictly lower than Base");
    assert.ok(base.fairValuePerShare < bull.fairValuePerShare, "Base must be strictly lower than Bull");
    assert.ok(base.projections.length === 5, "Should have 5 explicit projection years");
    assert.ok(typeof base.marginOfSafetyPct === "number", "Margin of safety must be calculated");
  });

  await t.test("generateDcfSensitivityMatrix: generates a valid 5x5 grid with inverse WACC relationship", () => {
    const matrix = generateDcfSensitivityMatrix({
      currentPrice: 30_000,
      sharesOutstanding: 500_000_000,
      initialFcf: 1_500_000_000_000,
      netDebt: 2_000_000_000_000,
      baseGrowthRates: [0.10, 0.08, 0.06, 0.05, 0.04],
      baseWacc: 0.10,
      baseTerminalGrowth: 0.025,
      exitMultiple: 8.0,
    });

    assert.equal(matrix.waccHeaders.length, 5);
    assert.equal(matrix.terminalGrowthHeaders.length, 5);
    assert.equal(matrix.fairValueGrid.length, 5);
    assert.equal(matrix.fairValueGrid[0]!.length, 5);

    // Higher WACC should decrease fair value (Column 0 row 0 vs row 4)
    const lowWaccVal = matrix.fairValueGrid[0]![2]!; // lower WACC
    const highWaccVal = matrix.fairValueGrid[4]![2]!; // higher WACC
    assert.ok(lowWaccVal > highWaccVal, "Lower WACC must yield higher fair value than higher WACC");
  });

  await t.test("computeSotpValuation: accurately aggregates segments with conglomerate discount and net debt", () => {
    const segments: SotpSegmentInput[] = [
      {
        name: "Software & Technology Services",
        segmentType: "CORE_OPERATIONS",
        metricType: "EBITDA",
        metricValue: 8_000_000_000_000, // 8,000 billion
        peerMultiple: 12.0, // EV = 96,000 billion
      },
      {
        name: "Telecommunication Infrastructure",
        segmentType: "CORE_OPERATIONS",
        metricType: "EBITDA",
        metricValue: 4_000_000_000_000, // 4,000 billion
        peerMultiple: 7.5, // EV = 30,000 billion
      },
      {
        name: "Education & AI Research",
        segmentType: "GROWTH_SUBSIDIARY",
        metricType: "REVENUE",
        metricValue: 3_000_000_000_000, // 3,000 billion
        peerMultiple: 3.0, // EV = 9,000 billion
      },
    ];

    const sotp = computeSotpValuation({
      segments,
      netDebt: 10_000_000_000_000, // 10,000 billion net debt
      sharesOutstanding: 1_200_000_000,
      currentPrice: 85_000,
      holdingCompanyDiscountPct: 0.15, // 15% discount
    });

    // Gross EV = 96,000 + 30,000 + 9,000 = 135,000 billion
    assert.equal(sotp.grossEnterpriseValue, 135_000_000_000_000);
    // 15% discount = 20,250 billion -> Adjusted EV = 114,750 billion
    assert.equal(sotp.holdingDiscountDeduction, 20_250_000_000_000);
    // Equity Value = 114,750 - 10,000 = 104,750 billion
    assert.equal(sotp.adjustedEquityValue, 104_750_000_000_000);
    // SOTP per share = 104,750 billion / 1.2 billion shares = ~87,291.67 VND
    assert.ok(sotp.sotpFairValuePerShare >= 87_000 && sotp.sotpFairValuePerShare <= 88_000);
    assert.ok(sotp.sotpUpsidePct > 0, "Upside should be positive against 85k price");
  });

  await t.test("computeRelativeMultiplesScorecard: detects undervaluation vs sector medians", () => {
    const scorecard = computeRelativeMultiplesScorecard({
      currentPrice: 28_000,
      pe: 9.5, // much cheaper than sector 14.5
      pb: 1.2, // cheaper than sector 1.8
      evEbitda: 6.2, // cheaper than sector 9.0
      sectorPe: 14.5,
      sectorPb: 1.8,
      sectorEvEbitda: 9.0,
      fcfYieldPct: 9.5, // higher than sector 5.5%
      sectorFcfYieldPct: 5.5,
    });

    assert.ok(scorecard.overallScore >= 45, `Expected high value score (>=45), got ${scorecard.overallScore}`);
    assert.equal(scorecard.valuationGrade, "DEEP_VALUE");
    assert.ok(scorecard.impliedFairValuePerShare > 28_000, "Implied fair value should be above current price");
    assert.ok(scorecard.upsidePct > 0, "Upside should be positive");
  });

  await t.test("runInstitutionalValuationSuite: produces cohesive blended report with actionable conviction", () => {
    const report = runInstitutionalValuationSuite({
      symbol: "HPG",
      currentPrice: 26_000,
      sharesOutstanding: 5_800_000_000,
      freeCashFlowTtm: 15_000_000_000_000,
      netDebt: 25_000_000_000_000,
      peRatio: 11.0,
      pbRatio: 1.4,
      evEbitdaRatio: 7.0,
      sectorPe: 15.0,
      sectorPb: 1.9,
      sectorEvEbitda: 9.2,
      baseWacc: 0.105,
      terminalGrowthRate: 0.025,
    });

    assert.equal(report.symbol, "HPG");
    assert.equal(report.dcfStatus, "REAL_FCF");
    assert.ok(report.dcf !== null, "Real FCF should populate DCF output");
    assert.ok(report.blendedFairValue > 0, "Blended fair value must be positive");
    assert.ok(typeof report.marginOfSafetyPct === "number");
    assert.ok(report.valuationDriversVi.length >= 3, "Should provide at least 3 analytical driver statements");
    assert.ok(report.executiveSummaryVi.includes("HPG"));
  });

  await t.test("runInstitutionalValuationSuite: enforces Truth-in-Data (EXEMPT_FINANCIAL & UNAVAILABLE_NO_FCF)", () => {
    const bankReport = runInstitutionalValuationSuite({
      symbol: "VCB",
      currentPrice: 92_000,
      isFinancialSector: true,
      peRatio: 14.0,
      pbRatio: 2.2,
      evEbitdaRatio: 10.0,
      sectorPe: 12.0,
      sectorPb: 1.7,
    });
    assert.equal(bankReport.dcfStatus, "EXEMPT_FINANCIAL");
    assert.equal(bankReport.dcf, null, "Banks must never run corporate FCFF DCF");
    assert.ok(
      bankReport.multiplesScorecard.multiples.every((m) => m.metric !== "EV/EBITDA"),
      "Banks must exclude EV/EBITDA multiple",
    );

    const noFcfReport = runInstitutionalValuationSuite({
      symbol: "HAG",
      currentPrice: 12_000,
      peRatio: 10.0,
      pbRatio: 1.3,
    });
    assert.equal(noFcfReport.dcfStatus, "UNAVAILABLE_NO_FCF");
    assert.equal(noFcfReport.dcf, null, "Missing FCF must never fabricate synthetic 6% FCF");
    assert.equal(
      noFcfReport.blendedFairValue,
      noFcfReport.multiplesScorecard.impliedFairValuePerShare,
      "Weight must redistribute 100% to Relative Multiples when DCF/SOTP unavailable",
    );
  });
});
