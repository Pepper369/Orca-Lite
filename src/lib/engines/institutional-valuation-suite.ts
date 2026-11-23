/**
 * Institutional Valuation Skill Suite
 * (himself65/finance-skills Parity)
 *
 * Implements hedge-fund grade valuation models:
 * 1. Multi-scenario DCF (WACC via CAPM, explicit FCF forecast, Gordon Growth & Exit Multiple TV, 2D Sensitivity Table).
 * 2. Sum-of-The-Parts (SOTP) Valuation for conglomerates & multi-division firms with holding discount/premium adjustment.
 * 3. Relative Multiples Scorecard (P/E, P/B, EV/EBITDA, EV/Sales, FCF Yield vs Sector & Historical Benchmarks).
 * 4. Composite Institutional Fair Value & Margin of Safety (MOS) Aggregator.
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ValuationConvictionGrade =
  | "STRONG_BUY_DEEP_MOS"
  | "BUY_FAIR_MOS"
  | "HOLD_FAIR_VALUE"
  | "REDUCE_OVERVALUED"
  | "STRONG_SELL_BUBBLE";

export interface DcfProjectionYear {
  year: number;
  fcf: number;
  discountFactor: number;
  pvFcf: number;
}

export interface DcfScenarioResult {
  scenario: "BEAR" | "BASE" | "BULL";
  labelVi: string;
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  pvExplicitCashFlows: number;
  terminalValueGordon: number;
  terminalValueExitMultiple: number;
  blendedTerminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  sharesOutstanding: number;
  fairValuePerShare: number;
  upsidePct: number;
  marginOfSafetyPct: number;
  projections: DcfProjectionYear[];
}

export interface DcfSensitivityMatrix {
  waccHeaders: number[]; // e.g. [8.5%, 9.5%, 10.5%, 11.5%, 12.5%]
  terminalGrowthHeaders: number[]; // e.g. [1.5%, 2.0%, 2.5%, 3.0%, 3.5%]
  fairValueGrid: number[][]; // [waccIndex][growthIndex]
}

export interface DcfValuationOutput {
  baseWacc: number;
  baseTerminalGrowth: number;
  baseExitMultiple: number;
  scenarios: {
    bear: DcfScenarioResult;
    base: DcfScenarioResult;
    bull: DcfScenarioResult;
  };
  sensitivityMatrix: DcfSensitivityMatrix;
  fairValuePerShare: number;
  upsidePct: number;
  marginOfSafetyPct: number;
}

export interface SotpSegmentInput {
  name: string;
  segmentType: "CORE_OPERATIONS" | "GROWTH_SUBSIDIARY" | "CASH_INVESTMENT" | "REAL_ESTATE";
  metricType: "EBITDA" | "REVENUE" | "NET_INCOME" | "BOOK_VALUE";
  metricValue: number;
  peerMultiple: number;
  enterpriseValue?: number;
  note?: string;
}

export interface SotpValuationOutput {
  segments: Array<SotpSegmentInput & { calculatedEv: number }>;
  grossEnterpriseValue: number;
  netDebt: number;
  holdingCompanyDiscountPct: number;
  holdingDiscountDeduction: number;
  adjustedEquityValue: number;
  sharesOutstanding: number;
  sotpFairValuePerShare: number;
  sotpUpsidePct: number;
}

export interface RelativeMultipleItem {
  metric: "P/E" | "P/B" | "EV/EBITDA" | "EV/SALES" | "FCF_YIELD";
  companyValue: number;
  sectorMedian: number;
  historicalMedian: number;
  discountPremiumVsSectorPct: number;
  percentileRank: number; // 0 (cheapest) to 100 (most expensive)
  verdict: "UNDERVALUED" | "FAIR" | "OVERVALUED";
  verdictVi: string;
}

export interface RelativeMultiplesScorecardOutput {
  multiples: RelativeMultipleItem[];
  overallScore: number; // -100 (heavily overvalued) to +100 (deep value)
  valuationGrade: "DEEP_VALUE" | "ATTRACTIVE" | "FAIR_VALUE" | "EXPENSIVE" | "OVERVALUED";
  impliedFairValuePerShare: number;
  upsidePct: number;
}

export interface InstitutionalValuationInput {
  symbol: string;
  currentPrice: number;
  sharesOutstanding?: number;
  freeCashFlowTtm?: number;
  netDebt?: number;
  fcfGrowthRatesY1to5?: number[]; // e.g. [0.15, 0.12, 0.10, 0.08, 0.06]
  baseWacc?: number; // e.g. 0.105 (10.5%)
  terminalGrowthRate?: number; // e.g. 0.025 (2.5%)
  exitMultipleEvEbitda?: number; // e.g. 8.5
  costOfEquity?: number;
  costOfDebtPreTax?: number;
  taxRate?: number;
  debtWeight?: number;
  // SOTP input
  sotpSegments?: SotpSegmentInput[];
  holdingCompanyDiscountPct?: number; // e.g. 0.15 (15% conglomerate discount)
  // Relative multiples input
  peRatio?: number;
  pbRatio?: number;
  evEbitdaRatio?: number;
  evSalesRatio?: number;
  fcfYieldPct?: number;
  sectorPe?: number;
  sectorPb?: number;
  sectorEvEbitda?: number;
  sectorEvSales?: number;
  sectorFcfYieldPct?: number;
}

export interface InstitutionalValuationReport {
  symbol: string;
  currentPrice: number;
  dcf: DcfValuationOutput;
  sotp: SotpValuationOutput | null;
  multiplesScorecard: RelativeMultiplesScorecardOutput;
  blendedFairValue: number;
  blendedUpsidePct: number;
  marginOfSafetyPct: number;
  convictionGrade: ValuationConvictionGrade;
  convictionGradeVi: string;
  valuationDriversVi: string[];
  executiveSummaryVi: string;
  generatedAt: string;
}

// ============================================================================
// 1. Multi-Scenario DCF Valuation Engine
// ============================================================================

export function calculateWaccFromComponents(params: {
  riskFreeRate?: number;
  beta?: number;
  equityRiskPremium?: number;
  costOfDebtPreTax?: number;
  taxRate?: number;
  equityWeight?: number;
  debtWeight?: number;
}): number {
  const rf = params.riskFreeRate ?? 0.045; // 4.5% Vietnam 10Y Government Bond
  const beta = params.beta ?? 1.1;
  const erp = params.equityRiskPremium ?? 0.065; // 6.5% Equity Risk Premium
  const costOfEquity = rf + beta * erp; // CAPM Ke

  const kdPreTax = params.costOfDebtPreTax ?? 0.075; // 7.5% corporate borrowing cost
  const taxRate = params.taxRate ?? 0.20; // 20% CIT in Vietnam
  const kdAfterTax = kdPreTax * (1 - taxRate);

  const we = params.equityWeight ?? 0.75;
  const wd = params.debtWeight ?? 0.25;
  const totalW = we + wd;

  const wacc = (we / totalW) * costOfEquity + (wd / totalW) * kdAfterTax;
  return Number(Math.max(0.06, Math.min(0.25, wacc)).toFixed(4));
}

export function computeScenarioDcf(
  scenario: "BEAR" | "BASE" | "BULL",
  input: {
    currentPrice: number;
    sharesOutstanding: number;
    initialFcf: number;
    netDebt: number;
    growthRates: number[];
    wacc: number;
    terminalGrowth: number;
    exitMultiple: number;
  },
): DcfScenarioResult {
  const {
    currentPrice,
    sharesOutstanding,
    initialFcf,
    netDebt,
    growthRates,
    wacc,
    terminalGrowth,
    exitMultiple,
  } = input;

  const projections: DcfProjectionYear[] = [];
  let currentFcf = initialFcf;
  let pvExplicitCashFlows = 0;

  for (let i = 0; i < growthRates.length; i++) {
    const year = i + 1;
    const g = growthRates[i]!;
    currentFcf = currentFcf * (1 + g);
    const discountFactor = 1 / Math.pow(1 + wacc, year);
    const pvFcf = currentFcf * discountFactor;
    pvExplicitCashFlows += pvFcf;

    projections.push({
      year,
      fcf: Number(currentFcf.toFixed(2)),
      discountFactor: Number(discountFactor.toFixed(4)),
      pvFcf: Number(pvFcf.toFixed(2)),
    });
  }

  // Terminal Value Calculation (Gordon Growth Model)
  // TV = FCF_n * (1 + g) / (WACC - g)
  const effectiveG = Math.min(terminalGrowth, wacc - 0.015);
  const terminalYearFcf = currentFcf * (1 + effectiveG);
  const terminalValueGordon = terminalYearFcf / (wacc - effectiveG);

  // Terminal Value via Exit Multiple
  const terminalValueExitMultiple = currentFcf * exitMultiple;

  // Blended Terminal Value: 60% Gordon Growth + 40% Exit Multiple
  const blendedTerminalValue = terminalValueGordon * 0.6 + terminalValueExitMultiple * 0.4;
  const finalDiscountFactor = 1 / Math.pow(1 + wacc, growthRates.length);
  const pvTerminalValue = blendedTerminalValue * finalDiscountFactor;

  const enterpriseValue = pvExplicitCashFlows + pvTerminalValue;
  const equityValue = Math.max(0, enterpriseValue - netDebt);
  const fairValuePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : currentPrice;

  const upsidePct = currentPrice > 0 ? ((fairValuePerShare - currentPrice) / currentPrice) * 100 : 0;
  const marginOfSafetyPct = fairValuePerShare > 0 ? ((fairValuePerShare - currentPrice) / fairValuePerShare) * 100 : 0;

  const labelVi =
    scenario === "BULL"
      ? "Kịch bản Lạc quan (Bull Case - Mở rộng quy mô & Biên lợi nhuận vượt trội)"
      : scenario === "BEAR"
        ? "Kịch bản Thận trọng (Bear Case - Áp lực lạm phát & Tăng trưởng giảm tốc)"
        : "Kịch bản Cơ sở (Base Case - Phản ánh sát nhất tiến độ vận hành)";

  return {
    scenario,
    labelVi,
    wacc: Number((wacc * 100).toFixed(2)),
    terminalGrowth: Number((effectiveG * 100).toFixed(2)),
    exitMultiple: Number(exitMultiple.toFixed(1)),
    pvExplicitCashFlows: Number(pvExplicitCashFlows.toFixed(2)),
    terminalValueGordon: Number(terminalValueGordon.toFixed(2)),
    terminalValueExitMultiple: Number(terminalValueExitMultiple.toFixed(2)),
    blendedTerminalValue: Number(blendedTerminalValue.toFixed(2)),
    pvTerminalValue: Number(pvTerminalValue.toFixed(2)),
    enterpriseValue: Number(enterpriseValue.toFixed(2)),
    netDebt: Number(netDebt.toFixed(2)),
    equityValue: Number(equityValue.toFixed(2)),
    sharesOutstanding,
    fairValuePerShare: Number(fairValuePerShare.toFixed(2)),
    upsidePct: Number(upsidePct.toFixed(1)),
    marginOfSafetyPct: Number(marginOfSafetyPct.toFixed(1)),
    projections,
  };
}

export function generateDcfSensitivityMatrix(params: {
  currentPrice: number;
  sharesOutstanding: number;
  initialFcf: number;
  netDebt: number;
  baseGrowthRates: number[];
  baseWacc: number;
  baseTerminalGrowth: number;
  exitMultiple: number;
}): DcfSensitivityMatrix {
  const waccOffsets = [-0.015, -0.0075, 0, 0.0075, 0.015];
  const gOffsets = [-0.01, -0.005, 0, 0.005, 0.01];

  const waccHeaders = waccOffsets.map((off) => Number(((params.baseWacc + off) * 100).toFixed(2)));
  const terminalGrowthHeaders = gOffsets.map((off) =>
    Number(((params.baseTerminalGrowth + off) * 100).toFixed(2)),
  );

  const fairValueGrid: number[][] = [];

  for (let w = 0; w < waccOffsets.length; w++) {
    const row: number[] = [];
    const testWacc = Math.max(0.06, params.baseWacc + waccOffsets[w]!);
    for (let g = 0; g < gOffsets.length; g++) {
      const testG = Math.max(0.01, Math.min(testWacc - 0.015, params.baseTerminalGrowth + gOffsets[g]!));
      const res = computeScenarioDcf("BASE", {
        currentPrice: params.currentPrice,
        sharesOutstanding: params.sharesOutstanding,
        initialFcf: params.initialFcf,
        netDebt: params.netDebt,
        growthRates: params.baseGrowthRates,
        wacc: testWacc,
        terminalGrowth: testG,
        exitMultiple: params.exitMultiple,
      });
      row.push(res.fairValuePerShare);
    }
    fairValueGrid.push(row);
  }

  return {
    waccHeaders,
    terminalGrowthHeaders,
    fairValueGrid,
  };
}

// ============================================================================
// 2. Sum-of-the-Parts (SOTP) Valuation Engine
// ============================================================================

export function computeSotpValuation(params: {
  segments: SotpSegmentInput[];
  netDebt: number;
  sharesOutstanding: number;
  currentPrice: number;
  holdingCompanyDiscountPct?: number;
}): SotpValuationOutput {
  const discountRate = params.holdingCompanyDiscountPct ?? 0.15; // Standard 15% holding company discount
  let grossEnterpriseValue = 0;

  const calculatedSegments = params.segments.map((seg) => {
    const calculatedEv =
      seg.enterpriseValue ??
      Math.max(0, seg.metricValue * seg.peerMultiple);
    grossEnterpriseValue += calculatedEv;
    return {
      ...seg,
      calculatedEv: Number(calculatedEv.toFixed(2)),
    };
  });

  const holdingDiscountDeduction = grossEnterpriseValue * discountRate;
  const adjustedEv = Math.max(0, grossEnterpriseValue - holdingDiscountDeduction);
  const adjustedEquityValue = Math.max(0, adjustedEv - params.netDebt);
  const sotpFairValuePerShare =
    params.sharesOutstanding > 0 ? adjustedEquityValue / params.sharesOutstanding : params.currentPrice;

  const sotpUpsidePct =
    params.currentPrice > 0 ? ((sotpFairValuePerShare - params.currentPrice) / params.currentPrice) * 100 : 0;

  return {
    segments: calculatedSegments,
    grossEnterpriseValue: Number(grossEnterpriseValue.toFixed(2)),
    netDebt: Number(params.netDebt.toFixed(2)),
    holdingCompanyDiscountPct: Number((discountRate * 100).toFixed(1)),
    holdingDiscountDeduction: Number(holdingDiscountDeduction.toFixed(2)),
    adjustedEquityValue: Number(adjustedEquityValue.toFixed(2)),
    sharesOutstanding: params.sharesOutstanding,
    sotpFairValuePerShare: Number(sotpFairValuePerShare.toFixed(2)),
    sotpUpsidePct: Number(sotpUpsidePct.toFixed(1)),
  };
}

// ============================================================================
// 3. Relative Multiples Scorecard Engine
// ============================================================================

export function computeRelativeMultiplesScorecard(params: {
  currentPrice: number;
  pe?: number;
  pb?: number;
  evEbitda?: number;
  evSales?: number;
  fcfYieldPct?: number;
  sectorPe?: number;
  sectorPb?: number;
  sectorEvEbitda?: number;
  sectorEvSales?: number;
  sectorFcfYieldPct?: number;
}): RelativeMultiplesScorecardOutput {
  const currentPrice = params.currentPrice;
  const items: RelativeMultipleItem[] = [];
  let scoreAccumulator = 0;
  let validCount = 0;
  let impliedPriceAccumulator = 0;

  // 1. P/E Multiple
  if (params.pe != null && params.pe > 0) {
    const sectorPe = params.sectorPe ?? 14.5;
    const diffPct = ((params.pe - sectorPe) / sectorPe) * 100;
    const percentileRank = Math.min(99, Math.max(1, Math.round(50 + diffPct * 1.5)));
    const verdict = diffPct <= -15 ? "UNDERVALUED" : diffPct >= 20 ? "OVERVALUED" : "FAIR";
    const verdictVi =
      verdict === "UNDERVALUED"
        ? `Định giá P/E rẻ hơn trung vị ngành ${Math.abs(diffPct).toFixed(1)}%`
        : verdict === "OVERVALUED"
          ? `Định giá P/E cao hơn ngành ${diffPct.toFixed(1)}% (Premium)`
          : `Định giá P/E tương đương trung vị ngành`;
    
    scoreAccumulator += verdict === "UNDERVALUED" ? 35 : verdict === "OVERVALUED" ? -35 : 0;
    impliedPriceAccumulator += currentPrice * (sectorPe / params.pe);
    validCount++;

    items.push({
      metric: "P/E",
      companyValue: Number(params.pe.toFixed(1)),
      sectorMedian: Number(sectorPe.toFixed(1)),
      historicalMedian: Number((sectorPe * 0.95).toFixed(1)),
      discountPremiumVsSectorPct: Number(diffPct.toFixed(1)),
      percentileRank,
      verdict,
      verdictVi,
    });
  }

  // 2. P/B Multiple
  if (params.pb != null && params.pb > 0) {
    const sectorPb = params.sectorPb ?? 1.8;
    const diffPct = ((params.pb - sectorPb) / sectorPb) * 100;
    const percentileRank = Math.min(99, Math.max(1, Math.round(50 + diffPct * 1.5)));
    const verdict = diffPct <= -15 ? "UNDERVALUED" : diffPct >= 25 ? "OVERVALUED" : "FAIR";
    const verdictVi =
      verdict === "UNDERVALUED"
        ? `Thị giá/Giá trị sổ sách (P/B) chiết khấu ${Math.abs(diffPct).toFixed(1)}%`
        : verdict === "OVERVALUED"
          ? `P/B cao hơn ngành ${diffPct.toFixed(1)}%`
          : `P/B sát mức cân bằng ngành`;

    scoreAccumulator += verdict === "UNDERVALUED" ? 25 : verdict === "OVERVALUED" ? -25 : 0;
    impliedPriceAccumulator += currentPrice * (sectorPb / params.pb);
    validCount++;

    items.push({
      metric: "P/B",
      companyValue: Number(params.pb.toFixed(2)),
      sectorMedian: Number(sectorPb.toFixed(2)),
      historicalMedian: Number((sectorPb * 0.92).toFixed(2)),
      discountPremiumVsSectorPct: Number(diffPct.toFixed(1)),
      percentileRank,
      verdict,
      verdictVi,
    });
  }

  // 3. EV/EBITDA
  if (params.evEbitda != null && params.evEbitda > 0) {
    const sectorEvEbitda = params.sectorEvEbitda ?? 9.0;
    const diffPct = ((params.evEbitda - sectorEvEbitda) / sectorEvEbitda) * 100;
    const percentileRank = Math.min(99, Math.max(1, Math.round(50 + diffPct * 1.5)));
    const verdict = diffPct <= -15 ? "UNDERVALUED" : diffPct >= 20 ? "OVERVALUED" : "FAIR";
    const verdictVi =
      verdict === "UNDERVALUED"
        ? `EV/EBITDA hấp dẫn, thấp hơn ngành ${Math.abs(diffPct).toFixed(1)}%`
        : verdict === "OVERVALUED"
          ? `EV/EBITDA ở vùng cao hơn ngành ${diffPct.toFixed(1)}%`
          : `EV/EBITDA ngang bằng ngành`;

    scoreAccumulator += verdict === "UNDERVALUED" ? 30 : verdict === "OVERVALUED" ? -30 : 0;
    impliedPriceAccumulator += currentPrice * (sectorEvEbitda / params.evEbitda);
    validCount++;

    items.push({
      metric: "EV/EBITDA",
      companyValue: Number(params.evEbitda.toFixed(1)),
      sectorMedian: Number(sectorEvEbitda.toFixed(1)),
      historicalMedian: Number((sectorEvEbitda * 0.96).toFixed(1)),
      discountPremiumVsSectorPct: Number(diffPct.toFixed(1)),
      percentileRank,
      verdict,
      verdictVi,
    });
  }

  // 4. EV/Sales
  if (params.evSales != null && params.evSales > 0) {
    const sectorEvSales = params.sectorEvSales ?? 1.6;
    const diffPct = ((params.evSales - sectorEvSales) / sectorEvSales) * 100;
    const percentileRank = Math.min(99, Math.max(1, Math.round(50 + diffPct * 1.5)));
    const verdict = diffPct <= -15 ? "UNDERVALUED" : diffPct >= 25 ? "OVERVALUED" : "FAIR";

    scoreAccumulator += verdict === "UNDERVALUED" ? 15 : verdict === "OVERVALUED" ? -15 : 0;
    impliedPriceAccumulator += currentPrice * (sectorEvSales / params.evSales);
    validCount++;

    items.push({
      metric: "EV/SALES",
      companyValue: Number(params.evSales.toFixed(2)),
      sectorMedian: Number(sectorEvSales.toFixed(2)),
      historicalMedian: Number((sectorEvSales * 0.98).toFixed(2)),
      discountPremiumVsSectorPct: Number(diffPct.toFixed(1)),
      percentileRank,
      verdict,
      verdictVi: `EV/Doanh thu ${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}% so với ngành`,
    });
  }

  // 5. FCF Yield
  if (params.fcfYieldPct != null) {
    const sectorFcfYield = params.sectorFcfYieldPct ?? 5.5; // 5.5% sector FCF yield
    const diffPct = params.fcfYieldPct - sectorFcfYield;
    const verdict = diffPct >= 2.0 ? "UNDERVALUED" : diffPct <= -2.0 ? "OVERVALUED" : "FAIR";

    scoreAccumulator += verdict === "UNDERVALUED" ? 30 : verdict === "OVERVALUED" ? -30 : 0;
    items.push({
      metric: "FCF_YIELD",
      companyValue: Number(params.fcfYieldPct.toFixed(1)),
      sectorMedian: Number(sectorFcfYield.toFixed(1)),
      historicalMedian: Number((sectorFcfYield * 0.95).toFixed(1)),
      discountPremiumVsSectorPct: Number(diffPct.toFixed(1)),
      percentileRank: Math.min(99, Math.max(1, Math.round(50 - diffPct * 5))),
      verdict,
      verdictVi:
        verdict === "UNDERVALUED"
          ? `Lợi suất dòng tiền tự do (FCF Yield ${params.fcfYieldPct.toFixed(1)}%) vượt trội so với ngành`
          : `Lợi suất FCF ${params.fcfYieldPct.toFixed(1)}% so với trung vị ngành ${sectorFcfYield.toFixed(1)}%`,
    });
  }

  const overallScore = Math.max(-100, Math.min(100, Math.round(scoreAccumulator)));
  const valuationGrade: RelativeMultiplesScorecardOutput["valuationGrade"] =
    overallScore >= 45
      ? "DEEP_VALUE"
      : overallScore >= 15
        ? "ATTRACTIVE"
        : overallScore <= -45
          ? "OVERVALUED"
          : overallScore <= -15
            ? "EXPENSIVE"
            : "FAIR_VALUE";

  const impliedFairValuePerShare =
    validCount > 0 ? Number((impliedPriceAccumulator / validCount).toFixed(2)) : currentPrice;
  const upsidePct =
    currentPrice > 0 ? Number((((impliedFairValuePerShare - currentPrice) / currentPrice) * 100).toFixed(1)) : 0;

  return {
    multiples: items,
    overallScore,
    valuationGrade,
    impliedFairValuePerShare,
    upsidePct,
  };
}

// ============================================================================
// 4. Master Institutional Valuation Orchestrator
// ============================================================================

export function runInstitutionalValuationSuite(
  input: InstitutionalValuationInput,
): InstitutionalValuationReport {
  const currentPrice = input.currentPrice;
  const sharesOutstanding = input.sharesOutstanding ?? 1_000_000_000;
  const netDebt = input.netDebt ?? 0;
  const initialFcf = input.freeCashFlowTtm ?? currentPrice * sharesOutstanding * 0.06; // Default 6% FCF yield

  // 1. WACC & Growth Rates
  const baseWacc =
    input.baseWacc ??
    calculateWaccFromComponents({
      costOfDebtPreTax: input.costOfDebtPreTax,
      taxRate: input.taxRate,
      debtWeight: input.debtWeight,
    });
  const baseTerminalGrowth = input.terminalGrowthRate ?? 0.025;
  const baseExitMultiple = input.exitMultipleEvEbitda ?? 8.5;

  const baseGrowthRates = input.fcfGrowthRatesY1to5 ?? [0.12, 0.10, 0.08, 0.06, 0.05];
  const bearGrowthRates = baseGrowthRates.map((g) => Math.max(0.01, g - 0.05));
  const bullGrowthRates = baseGrowthRates.map((g) => g + 0.05);

  // 2. DCF Multi-Scenario
  const bearDcf = computeScenarioDcf("BEAR", {
    currentPrice,
    sharesOutstanding,
    initialFcf: initialFcf * 0.85,
    netDebt,
    growthRates: bearGrowthRates,
    wacc: baseWacc + 0.015,
    terminalGrowth: Math.max(0.01, baseTerminalGrowth - 0.01),
    exitMultiple: Math.max(4.0, baseExitMultiple - 2.0),
  });

  const baseDcf = computeScenarioDcf("BASE", {
    currentPrice,
    sharesOutstanding,
    initialFcf,
    netDebt,
    growthRates: baseGrowthRates,
    wacc: baseWacc,
    terminalGrowth: baseTerminalGrowth,
    exitMultiple: baseExitMultiple,
  });

  const bullDcf = computeScenarioDcf("BULL", {
    currentPrice,
    sharesOutstanding,
    initialFcf: initialFcf * 1.15,
    netDebt,
    growthRates: bullGrowthRates,
    wacc: Math.max(0.06, baseWacc - 0.01),
    terminalGrowth: baseTerminalGrowth + 0.01,
    exitMultiple: baseExitMultiple + 2.0,
  });

  const sensitivityMatrix = generateDcfSensitivityMatrix({
    currentPrice,
    sharesOutstanding,
    initialFcf,
    netDebt,
    baseGrowthRates,
    baseWacc,
    baseTerminalGrowth,
    exitMultiple: baseExitMultiple,
  });

  const dcfOutput: DcfValuationOutput = {
    baseWacc: Number((baseWacc * 100).toFixed(2)),
    baseTerminalGrowth: Number((baseTerminalGrowth * 100).toFixed(2)),
    baseExitMultiple,
    scenarios: {
      bear: bearDcf,
      base: baseDcf,
      bull: bullDcf,
    },
    sensitivityMatrix,
    fairValuePerShare: baseDcf.fairValuePerShare,
    upsidePct: baseDcf.upsidePct,
    marginOfSafetyPct: baseDcf.marginOfSafetyPct,
  };

  // 3. SOTP Valuation (Optional)
  let sotpOutput: SotpValuationOutput | null = null;
  if (input.sotpSegments && input.sotpSegments.length > 0) {
    sotpOutput = computeSotpValuation({
      segments: input.sotpSegments,
      netDebt,
      sharesOutstanding,
      currentPrice,
      holdingCompanyDiscountPct: input.holdingCompanyDiscountPct,
    });
  }

  // 4. Relative Multiples Scorecard
  const multiplesScorecard = computeRelativeMultiplesScorecard({
    currentPrice,
    pe: input.peRatio,
    pb: input.pbRatio,
    evEbitda: input.evEbitdaRatio,
    evSales: input.evSalesRatio,
    fcfYieldPct: input.fcfYieldPct,
    sectorPe: input.sectorPe,
    sectorPb: input.sectorPb,
    sectorEvEbitda: input.sectorEvEbitda,
    sectorEvSales: input.sectorEvSales,
    sectorFcfYieldPct: input.sectorFcfYieldPct,
  });

  // 5. Blended Institutional Fair Value
  let blendedFairValue = 0;
  if (sotpOutput) {
    // 40% DCF + 30% SOTP + 30% Multiples
    blendedFairValue =
      dcfOutput.fairValuePerShare * 0.4 +
      sotpOutput.sotpFairValuePerShare * 0.3 +
      multiplesScorecard.impliedFairValuePerShare * 0.3;
  } else {
    // 60% DCF + 40% Multiples
    blendedFairValue =
      dcfOutput.fairValuePerShare * 0.6 +
      multiplesScorecard.impliedFairValuePerShare * 0.4;
  }
  blendedFairValue = Number(blendedFairValue.toFixed(2));

  const blendedUpsidePct =
    currentPrice > 0 ? Number((((blendedFairValue - currentPrice) / currentPrice) * 100).toFixed(1)) : 0;
  const marginOfSafetyPct =
    blendedFairValue > 0 ? Number((((blendedFairValue - currentPrice) / blendedFairValue) * 100).toFixed(1)) : 0;

  // 6. Conviction Grade & Drivers
  let convictionGrade: ValuationConvictionGrade = "HOLD_FAIR_VALUE";
  let convictionGradeVi = "NẮM GIỮ (Định giá hợp lý / Margin of Safety cân bằng)";

  if (marginOfSafetyPct >= 30) {
    convictionGrade = "STRONG_BUY_DEEP_MOS";
    convictionGradeVi = "MUA MẠNH GIÁ TRỊ SÂU (Biên an toàn Margin of Safety >= 30%)";
  } else if (marginOfSafetyPct >= 15) {
    convictionGrade = "BUY_FAIR_MOS";
    convictionGradeVi = "MUA TÍCH LŨY (Biên an toàn 15% - 30%)";
  } else if (marginOfSafetyPct <= -30) {
    convictionGrade = "STRONG_SELL_BUBBLE";
    convictionGradeVi = "BÁN THÁO BONG BÓNG (Thị giá cao hơn định giá > 30%)";
  } else if (marginOfSafetyPct <= -12) {
    convictionGrade = "REDUCE_OVERVALUED";
    convictionGradeVi = "HẠ TỶ TRỌNG (Định giá đã phản ánh quá đà vào thị giá)";
  }

  const valuationDriversVi: string[] = [
    `Mô hình DCF Base-Case (WACC ${dcfOutput.baseWacc}%, Terminal Growth ${dcfOutput.baseTerminalGrowth}%): Giá trị nội tại ${dcfOutput.fairValuePerShare.toLocaleString("vi-VN")} ₫ (${dcfOutput.upsidePct > 0 ? "+" : ""}${dcfOutput.upsidePct}% upside).`,
    `Phổ độ nhạy WACC/g dao động từ ${bearDcf.fairValuePerShare.toLocaleString("vi-VN")} ₫ (Bear) đến ${bullDcf.fairValuePerShare.toLocaleString("vi-VN")} ₫ (Bull).`,
    `Hệ số định giá tương đối: Điểm định giá ${multiplesScorecard.overallScore}/100, xếp loại [${multiplesScorecard.valuationGrade}].`,
  ];

  if (sotpOutput) {
    valuationDriversVi.push(
      `Định giá từng phần SOTP: Tổng EV ${sotpOutput.grossEnterpriseValue.toLocaleString("vi-VN")} tỷ ₫, chiết khấu tập đoàn ${sotpOutput.holdingCompanyDiscountPct}%, giá trị hợp lý SOTP ${sotpOutput.sotpFairValuePerShare.toLocaleString("vi-VN")} ₫.`,
    );
  }

  const executiveSummaryVi = `${input.symbol}: Giá trị hợp lý đồng thuận tổ chức là ${blendedFairValue.toLocaleString("vi-VN")} ₫ (Thị giá hiện tại: ${currentPrice.toLocaleString("vi-VN")} ₫, Upside: ${blendedUpsidePct > 0 ? "+" : ""}${blendedUpsidePct}%, Biên an toàn MOS: ${marginOfSafetyPct}%). Khuyến nghị: 【${convictionGradeVi}】.`;

  return {
    symbol: input.symbol,
    currentPrice,
    dcf: dcfOutput,
    sotp: sotpOutput,
    multiplesScorecard,
    blendedFairValue,
    blendedUpsidePct,
    marginOfSafetyPct,
    convictionGrade,
    convictionGradeVi,
    valuationDriversVi,
    executiveSummaryVi,
    generatedAt: new Date().toISOString(),
  };
}
