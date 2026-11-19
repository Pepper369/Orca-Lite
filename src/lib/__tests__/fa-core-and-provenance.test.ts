import test from "node:test";
import assert from "node:assert/strict";
import type { FundamentalSnapshot } from "../financial/snapshots";
import {
  computeAvgBalance,
  computeDynamicWacc,
  computeRealizedEquityVolatility,
  resolveIndustryEvalTrack,
} from "../financial/fa-core";
import { computePiotroskiAltman } from "../engines/piotroski-altman";
import {
  computeFundamentalMatrix,
  QuantFaVectorStore,
} from "../engines/fundamental-quant-matrix";
import {
  computeAvailableDate,
  getLatestAvailableFaAsOf,
  runCausalFaBacktest,
  type CausalFaObservation,
  type FaPriceBar,
} from "../engines/fa-backtest-harness";

function makeBaseSnap(overrides: Partial<FundamentalSnapshot> = {}): FundamentalSnapshot {
  return {
    symbol: "FPT",
    reportDate: "2025-12-31",
    roe: 24,
    roa: 12,
    ros: 15,
    roic: 22,
    grossMargin: 38,
    netMargin: 15,
    operatingMargin: 18,
    debtEquity: 0.4,
    currentRatio: 1.8,
    quickRatio: 1.4,
    interestCoverage: 14,
    netDebtToEbitda: -0.5,
    fcfTtm: 4500,
    ocfTtm: 6000,
    revenue: 40000,
    netProfit: 5500,
    equity: 24000,
    totalDebt: 8000,
    cash: 11000,
    shares: 1_200_000_000,
    epsTtm: 4500,
    ebitdaTtm: 7500,
    revenueYoyPct: 18,
    niYoyPct: 22,
    revQoqPct: 5,
    niQoqPct: 8,
    health: null,
    growth: null,
    annualHistory: [],
    quarterlyHistory: [],
    ...overrides,
  };
}

test("FA Core: Industry evaluation track separates Financials, Real Estate, and Non-Financials", () => {
  assert.equal(resolveIndustryEvalTrack("VCB"), "FINANCIAL_BANK_SEC_INS");
  assert.equal(resolveIndustryEvalTrack("SSI"), "FINANCIAL_BANK_SEC_INS");
  assert.equal(resolveIndustryEvalTrack("BVH"), "FINANCIAL_BANK_SEC_INS");
  assert.equal(resolveIndustryEvalTrack("VHM"), "REAL_ESTATE");
  assert.equal(resolveIndustryEvalTrack("HPG"), "NON_FINANCIAL");
  assert.equal(computeAvgBalance(100, 120), 110);
});

test("Truth-in-Data: Missing BCTC fields stay null instead of being fabricated", () => {
  const sparse = computeFundamentalMatrix({
    snap: makeBaseSnap({
      pretaxIncome: null,
      taxExpense: null,
      totalAssets: null,
      ebitdaTtm: null,
      fcfTtm: -250,
      roiic3Y: null,
      deltaNopat: null,
      deltaIc: null,
      annualHistory: [],
      currentAssets: null,
      totalLiabilities: null,
    }),
    price: 90,
    marketCapBillion: 108000,
  });

  assert.equal(sparse.bookTaxDifference, null, "BTD must be null without pretax/tax/assets");
  assert.equal(sparse.isBookTaxSafe, null, "Missing BTD should remain null instead of guessing safe/unsafe");
  assert.equal(sparse.cashRealizationRatio, null, "CRR must be null without EBITDA");
  assert.equal(sparse.roiic3Y, null, "ROIIC must be null without multi-period ΔNOPAT/ΔIC");
  assert.equal(sparse.impliedGrowthPct, null, "Reverse DCF must reject negative FCF");
  assert.equal(sparse.ncavPerShare, null, "Graham NCAV must be null without CA and TL");
  assert.equal(sparse.beneishMScore, null, "Beneish M-Score requires multi-period variables");
});

test("Multi-period Piotroski & Altman Financial Exemption", () => {
  const bankSnap = makeBaseSnap({
    symbol: "VCB",
    industryTrack: "FINANCIAL_BANK_SEC_INS",
    currentRatio: null,
    grossMargin: null,
    annualHistory: [
      {
        period: "2025",
        year: 2025,
        quarter: null,
        revenue: 70000,
        cogs: null,
        grossProfit: null,
        ebit: null,
        ebitda: null,
        profitBeforeTax: 42000,
        taxExpense: 8400,
        netProfit: 33600,
        totalAssets: 1900000,
        currentAssets: null,
        fixedAssets: null,
        receivables: null,
        inventory: null,
        currentLiabilities: null,
        totalLiabilities: 1700000,
        shortTermDebt: null,
        longTermDebt: null,
        totalDebt: null,
        equity: 200000,
        retainedEarnings: 80000,
        cash: 300000,
        ocf: 40000,
        capex: null,
        shares: 5_589_000_000,
      },
      {
        period: "2024",
        year: 2024,
        quarter: null,
        revenue: 64000,
        cogs: null,
        grossProfit: null,
        ebit: null,
        ebitda: null,
        profitBeforeTax: 40000,
        taxExpense: 8000,
        netProfit: 31000,
        totalAssets: 1850000,
        currentAssets: null,
        fixedAssets: null,
        receivables: null,
        inventory: null,
        currentLiabilities: null,
        totalLiabilities: 1680000,
        shortTermDebt: null,
        longTermDebt: null,
        totalDebt: null,
        equity: 170000,
        retainedEarnings: 65000,
        cash: 260000,
        ocf: 35000,
        capex: null,
        shares: 5_589_000_000,
      },
    ],
  });

  const bankHealth = computePiotroskiAltman(bankSnap);
  assert.equal(bankHealth.altman.zone, "EXEMPT_FINANCIAL");
  assert.equal(bankHealth.altman.zScore, null);
  assert.equal(bankHealth.piotroski.isMultiPeriod, true);
  assert.equal(bankHealth.piotroski.criteriaEvaluated, 9, "Full 2Y bank history evaluates all 9 industry-adapted criteria");

  const sparseNonFin = computePiotroskiAltman(
    makeBaseSnap({
      roa: null,
      ocfTtm: null,
      debtEquity: null,
      totalDebt: null,
      currentRatio: null,
      grossMargin: null,
      revenueYoyPct: null,
      netMargin: null,
      shares: null,
      annualHistory: [],
    }),
  );
  assert.equal(sparseNonFin.piotroski.isMultiPeriod, false);
  assert.ok(sparseNonFin.piotroski.criteriaEvaluated <= 2, "Sparse snapshot must not receive free points from ?? 0");
});

test("Realized-Vol Merton DD, CAPM Dynamic WACC & 8-Var Beneish M-Score", () => {
  const synthBars = Array.from({ length: 80 }, (_, idx) => {
    const close = 50 + Math.sin(idx * 0.4) * 2.5 + idx * 0.05;
    return { time: 1700000000 + idx * 86400, open: close, high: close * 1.01, low: close * 0.99, close, volume: 100000 };
  });
  const vol = computeRealizedEquityVolatility(synthBars);
  assert.ok(vol != null && vol > 0.05 && vol < 1.2);

  const wacc = computeDynamicWacc({ beta: 1.15, debtToCapital: 0.25 });
  assert.ok(wacc >= 0.085 && wacc <= 0.165);

  const fullSnap = makeBaseSnap({
    cogs: 25000,
    receivables: 7000,
    inventory: 4500,
    payables: 3800,
    annualHistory: [
      {
        period: "2025",
        year: 2025,
        quarter: null,
        revenue: 42000,
        cogs: 25000,
        grossProfit: 17000,
        ebit: 7200,
        ebitda: 8500,
        profitBeforeTax: 7000,
        taxExpense: 1400,
        netProfit: 5600,
        totalAssets: 50000,
        currentAssets: 30000,
        fixedAssets: 12000,
        receivables: 7000,
        inventory: 4500,
        currentLiabilities: 15000,
        totalLiabilities: 20000,
        shortTermDebt: 3000,
        longTermDebt: 4000,
        totalDebt: 7000,
        equity: 30000,
        retainedEarnings: 14000,
        cash: 11000,
        ocf: 6500,
        capex: -1200,
        shares: 1_200_000_000,
      },
      {
        period: "2024",
        year: 2024,
        quarter: null,
        revenue: 36000,
        cogs: 22000,
        grossProfit: 14000,
        ebit: 6000,
        ebitda: 7100,
        profitBeforeTax: 5800,
        taxExpense: 1160,
        netProfit: 4640,
        totalAssets: 44000,
        currentAssets: 26000,
        fixedAssets: 11500,
        receivables: 6100,
        inventory: 4000,
        currentLiabilities: 14000,
        totalLiabilities: 19000,
        shortTermDebt: 3500,
        longTermDebt: 4500,
        totalDebt: 8000,
        equity: 25000,
        retainedEarnings: 11000,
        cash: 9000,
        ocf: 5200,
        capex: -1100,
        shares: 1_200_000_000,
      },
    ],
  });

  const res = computeFundamentalMatrix({
    snap: fullSnap,
    price: 90,
    pe: 16,
    marketCapBillion: 108000,
    realizedVolAnnual: vol,
  });

  assert.ok(res.beneishMScore != null && Number.isFinite(res.beneishMScore));
  assert.ok(res.beneishVarsAvailable >= 5);
  assert.ok(res.mertonDistanceToDefault != null && res.mertonDistanceToDefault > 1.5);
  assert.ok(res.cashConversionCycleDays != null && Number.isFinite(res.cashConversionCycleDays));
});

test("QuantFaVectorStore handles NaN sentinels safely (does not confuse null with 0)", () => {
  const store = new QuantFaVectorStore([
    { symbol: "NULL_STK" },
    { symbol: "GOOD_STK", roic: 26, roiic3Y: 31, reverseDcfMarginPct: 12, mertonDistanceToDefault: 4.2 },
  ] as any);

  assert.deepEqual(store.filterByRange({ minRoic: 20 }), [1]);
  assert.deepEqual(store.filterByRange({ minRoiic: 25 }), [1]);
  assert.deepEqual(store.filterByRange({ minReverseDcfMargin: 5 }), [1]);
  assert.deepEqual(store.filterByRange({ minMertonDd: 2.0 }), [1]);
});

test("FA Backtest Harness: Enforces filing lag causality & Calibration/Holdout split", () => {
  assert.equal(computeAvailableDate("2024-12-31", "annual"), "2025-03-31");
  assert.equal(computeAvailableDate("2025-03-31", "quarterly"), "2025-05-15");

  const fpt2024 = makeBaseSnap({ symbol: "FPT", roe: 26, roic: 25, fcfTtm: 4500, ocfTtm: 6000 });
  const hpg2024 = makeBaseSnap({ symbol: "HPG", roe: 19, roic: 17, fcfTtm: 3000, ocfTtm: 5000 });
  const obsBySym: Record<string, CausalFaObservation[]> = {
    FPT: [
      { symbol: "FPT", sector: "Công nghệ", periodEndDate: "2023-12-31", periodType: "annual", pe: 12, snapshot: fpt2024 },
      { symbol: "FPT", sector: "Công nghệ", periodEndDate: "2024-12-31", periodType: "annual", pe: 13, snapshot: { ...fpt2024, roe: 28 } },
    ],
    HPG: [
      { symbol: "HPG", sector: "Thép", periodEndDate: "2023-12-31", periodType: "annual", pe: 11, snapshot: hpg2024 },
      { symbol: "HPG", sector: "Thép", periodEndDate: "2024-12-31", periodType: "annual", pe: 10, snapshot: hpg2024 },
    ],
  };

  // Before 2025-03-31, 2024-12-31 annual BCTC (90d lag) MUST NOT be visible
  const preFiling = getLatestAvailableFaAsOf(obsBySym.FPT!, "2025-02-15");
  assert.equal(preFiling?.periodEndDate, "2023-12-31");

  const dates: string[] = [];
  const fptBars: FaPriceBar[] = [];
  const hpgBars: FaPriceBar[] = [];
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2024, 3, 1 + i)).toISOString().slice(0, 10);
    dates.push(d);
    fptBars.push({ date: d, close: 100 + i * 0.25 });
    hpgBars.push({ date: d, close: 25 + i * 0.04 });
  }

  const report = runCausalFaBacktest(
    obsBySym,
    { FPT: fptBars, HPG: hpgBars },
    {
      strategy: "buffett_compounder",
      rebalanceDates: [dates[10]!, dates[80]!, dates[160]!, dates[240]!],
      holdingBars: 40,
      topK: 2,
    },
  );

  assert.ok(report.trades.length >= 2);
  for (const ev of report.rebalanceEvents) {
    if (ev.maxAvailableDateUsed) {
      assert.ok(ev.maxAvailableDateUsed <= ev.rebalanceDate, "Look-ahead violation in backtest");
    }
  }
  assert.ok(report.calibrationMetrics.rebalances >= 1);
  assert.ok(report.holdoutMetrics.rebalances >= 1);
});
