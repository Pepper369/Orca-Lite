/**
 * Financial Calculation Suite for Orca-FA
 * High-precision, zero-external-dependency quantitative engine for:
 * 1. Vietnam Personal Income Tax (Thuế TNCN) & Net Salary
 * 2. Loan Amortization & Reducing Balance Schedule
 * 3. Position Sizing & Kelly Criterion (Risk Management)
 * 4. Corporate Valuation: WACC & Discounted Cash Flow (DCF)
 * 5. Forensic Financial Ratios (Altman Z-Score, Piotroski F-Score)
 */

export interface PitTaxResult {
  grossSalaryVnd: number;
  dependents: number;
  insurance: {
    bhxh: number; // 8% (capped at 20x base salary: 20 * 2.34M = 46.8M)
    bhyt: number; // 1.5% (capped at 20 * 2.34M = 46.8M)
    bhtn: number; // 1% (capped at 20x regional min salary: 20 * 4.96M = 99.2M for Region 1)
    totalInsurance: number;
  };
  deductions: {
    personal: number; // 11,000,000 VND
    dependents: number; // 4,400,000 VND * dependents
    totalFamilyDeduction: number;
  };
  taxableIncomeVnd: number; // Gross - Insurance - Deductions (>= 0)
  bracketBreakdown: Array<{
    bracket: number;
    range: string;
    ratePct: number;
    taxableInBracketVnd: number;
    taxVnd: number;
  }>;
  totalTaxVnd: number;
  effectiveTaxRatePct: number;
  netSalaryVnd: number;
}

export interface LoanAmortizationResult {
  principalVnd: number;
  annualRatePct: number;
  termMonths: number;
  monthlyPaymentVnd: number; // Fixed monthly annuity (PMT)
  totalInterestVnd: number;
  totalPaymentVnd: number;
  schedule: Array<{
    month: number;
    beginningBalanceVnd: number;
    principalPaymentVnd: number;
    interestPaymentVnd: number;
    totalPaymentVnd: number;
    endingBalanceVnd: number;
  }>;
}

export interface PositionSizingResult {
  capitalVnd: number;
  riskPct: number;
  entryPriceVnd: number;
  stopLossPriceVnd: number;
  targetPriceVnd?: number;
  capitalAtRiskVnd: number;
  riskPerShareVnd: number;
  lossPct: number;
  sharesToBuy: number; // Rounded down to lot size 100 on HOSE/HNX
  totalAllocatedVnd: number;
  portfolioWeightPct: number;
  rewardToRiskRatio?: number;
  potentialGainVnd?: number;
  kellyFractionPct?: number; // Optional theoretical Kelly sizing
}

export interface WaccResult {
  equityValueVnd: number;
  debtValueVnd: number;
  costOfEquityPct: number; // Ke
  costOfDebtPct: number; // Kd
  taxRatePct: number; // t (typically 20% in Vietnam)
  equityWeightPct: number; // E / (E + D)
  debtWeightPct: number; // D / (E + D)
  afterTaxCostOfDebtPct: number; // Kd * (1 - t)
  waccPct: number; // (E/V * Ke) + (D/V * Kd * (1 - t))
}

export interface DcfValuationResult {
  waccPct: number;
  terminalGrowthRatePct: number;
  projectedFcffVnd: number[]; // e.g. [year 1, year 2, year 3, ...]
  discountFactors: number[];
  discountedFcffVnd: number[];
  sumDiscountedFcffVnd: number;
  terminalValueVnd: number;
  discountedTerminalValueVnd: number;
  enterpriseValueVnd: number;
  netDebtVnd: number;
  equityValueVnd: number;
  sharesOutstanding: number;
  fairValuePerShareVnd: number;
}

// Vietnam Base Salary & Regional Min limits (2024 - 2026 current regulatory baseline)
const BASE_SALARY_VND = 2_340_000; // Mức lương cơ sở từ 01/07/2024
const MAX_BASE_INSURANCE_SALARY = 20 * BASE_SALARY_VND; // 46,800,000 VND (trần BHXH, BHYT)
const REGION_1_MIN_SALARY = 4_960_000; // Mức lương tối thiểu vùng I
const MAX_UNEMPLOYMENT_INSURANCE_SALARY = 20 * REGION_1_MIN_SALARY; // 99,200,000 VND (trần BHTN)

/**
 * 1. Calculate Vietnam Personal Income Tax (Thuế Thu Nhập Cá Nhân)
 */
export function calculatePitTax(grossSalaryVnd: number, dependents: number = 0): PitTaxResult {
  const safeGross = Math.max(0, grossSalaryVnd);
  const safeDependents = Math.max(0, dependents);

  // Mandatory social insurance calculation
  const salaryForSocialHealth = Math.min(safeGross, MAX_BASE_INSURANCE_SALARY);
  const salaryForUnemployment = Math.min(safeGross, MAX_UNEMPLOYMENT_INSURANCE_SALARY);

  const bhxh = Math.round(salaryForSocialHealth * 0.08); // 8%
  const bhyt = Math.round(salaryForSocialHealth * 0.015); // 1.5%
  const bhtn = Math.round(salaryForUnemployment * 0.01); // 1.0%
  const totalInsurance = bhxh + bhyt + bhtn;

  // Family allowances (Giảm trừ gia cảnh)
  const personalDeduction = 11_000_000;
  const dependentsDeduction = safeDependents * 4_400_000;
  const totalFamilyDeduction = personalDeduction + dependentsDeduction;

  // Taxable income (Thu nhập tính thuế)
  const taxableIncomeVnd = Math.max(0, safeGross - totalInsurance - totalFamilyDeduction);

  // 7-bracket progressive tax thresholds (VND / month)
  const brackets = [
    { bracket: 1, limit: 5_000_000, rate: 0.05, label: "Đến 5 triệu" },
    { bracket: 2, limit: 10_000_000, rate: 0.10, label: "Trên 5 đến 10 triệu" },
    { bracket: 3, limit: 18_000_000, rate: 0.15, label: "Trên 10 đến 18 triệu" },
    { bracket: 4, limit: 32_000_000, rate: 0.20, label: "Trên 18 đến 32 triệu" },
    { bracket: 5, limit: 52_000_000, rate: 0.25, label: "Trên 32 đến 52 triệu" },
    { bracket: 6, limit: 80_000_000, rate: 0.30, label: "Trên 52 đến 80 triệu" },
    { bracket: 7, limit: Infinity, rate: 0.35, label: "Trên 80 triệu" },
  ];

  let remainingTaxable = taxableIncomeVnd;
  let prevLimit = 0;
  let totalTaxVnd = 0;
  const breakdown: PitTaxResult["bracketBreakdown"] = [];

  for (const b of brackets) {
    if (remainingTaxable <= 0) break;
    const bracketSpan = b.limit - prevLimit;
    const taxableInBracket = Math.min(remainingTaxable, bracketSpan);
    const taxInBracket = Math.round(taxableInBracket * b.rate);

    breakdown.push({
      bracket: b.bracket,
      range: b.label,
      ratePct: b.rate * 100,
      taxableInBracketVnd: taxableInBracket,
      taxVnd: taxInBracket,
    });

    totalTaxVnd += taxInBracket;
    remainingTaxable -= taxableInBracket;
    prevLimit = b.limit;
  }

  const effectiveTaxRatePct = safeGross > 0 ? Number(((totalTaxVnd / safeGross) * 100).toFixed(2)) : 0;
  const netSalaryVnd = safeGross - totalInsurance - totalTaxVnd;

  return {
    grossSalaryVnd: safeGross,
    dependents: safeDependents,
    insurance: {
      bhxh,
      bhyt,
      bhtn,
      totalInsurance,
    },
    deductions: {
      personal: personalDeduction,
      dependents: dependentsDeduction,
      totalFamilyDeduction,
    },
    taxableIncomeVnd,
    bracketBreakdown: breakdown,
    totalTaxVnd,
    effectiveTaxRatePct,
    netSalaryVnd,
  };
}

/**
 * 2. Calculate Loan Amortization (Lãi suất theo dư nợ giảm dần - Fixed Monthly PMT)
 */
export function calculateLoanAmortization(
  principalVnd: number,
  annualRatePct: number,
  termMonths: number
): LoanAmortizationResult {
  const safePrincipal = Math.max(0, principalVnd);
  const safeTerm = Math.max(1, Math.round(termMonths));
  const monthlyRate = (annualRatePct / 100) / 12;

  let monthlyPaymentVnd = 0;
  if (monthlyRate === 0) {
    monthlyPaymentVnd = Math.round(safePrincipal / safeTerm);
  } else {
    // PMT formula: P * (r * (1 + r)^n) / ((1 + r)^n - 1)
    const factor = Math.pow(1 + monthlyRate, safeTerm);
    monthlyPaymentVnd = Math.round(safePrincipal * ((monthlyRate * factor) / (factor - 1)));
  }

  let balance = safePrincipal;
  let totalInterestVnd = 0;
  const schedule: LoanAmortizationResult["schedule"] = [];

  for (let m = 1; m <= safeTerm; m++) {
    const interest = Math.round(balance * monthlyRate);
    let principalPaid = monthlyPaymentVnd - interest;

    // Last month adjustment to clear small rounding differences
    if (m === safeTerm || principalPaid > balance) {
      principalPaid = balance;
      monthlyPaymentVnd = principalPaid + interest;
    }

    const endingBalance = Math.max(0, balance - principalPaid);
    totalInterestVnd += interest;

    schedule.push({
      month: m,
      beginningBalanceVnd: balance,
      principalPaymentVnd: principalPaid,
      interestPaymentVnd: interest,
      totalPaymentVnd: monthlyPaymentVnd,
      endingBalanceVnd: endingBalance,
    });

    balance = endingBalance;
  }

  return {
    principalVnd: safePrincipal,
    annualRatePct,
    termMonths: safeTerm,
    monthlyPaymentVnd,
    totalInterestVnd,
    totalPaymentVnd: safePrincipal + totalInterestVnd,
    schedule,
  };
}

/**
 * 3. Calculate Position Sizing & Risk Management (Quản lý vốn chuyên nghiệp)
 * Sizing = (Capital * Risk%) / (Entry - StopLoss)
 */
export function calculatePositionSizing(
  capitalVnd: number,
  riskPct: number, // e.g. 1% or 2%
  entryPriceVnd: number,
  stopLossPriceVnd: number,
  targetPriceVnd?: number,
  winRatePct?: number // For Kelly criterion
): PositionSizingResult {
  const capitalAtRiskVnd = Math.round(capitalVnd * (riskPct / 100));
  const riskPerShareVnd = Math.abs(entryPriceVnd - stopLossPriceVnd);

  if (riskPerShareVnd === 0 || entryPriceVnd <= 0) {
    throw new Error("Entry price must be positive and different from stop loss price.");
  }

  const lossPct = Number(((riskPerShareVnd / entryPriceVnd) * 100).toFixed(2));
  
  // Exact shares needed to cap loss at capitalAtRisk
  const rawShares = capitalAtRiskVnd / riskPerShareVnd;
  // Floor to standard Vietnam stock lot size (100 shares per lot)
  const sharesToBuy = Math.floor(rawShares / 100) * 100;

  const totalAllocatedVnd = sharesToBuy * entryPriceVnd;
  const portfolioWeightPct = Number(((totalAllocatedVnd / capitalVnd) * 100).toFixed(2));

  let rewardToRiskRatio: number | undefined;
  let potentialGainVnd: number | undefined;
  let kellyFractionPct: number | undefined;

  if (targetPriceVnd && targetPriceVnd > entryPriceVnd) {
    const rewardPerShare = targetPriceVnd - entryPriceVnd;
    rewardToRiskRatio = Number((rewardPerShare / riskPerShareVnd).toFixed(2));
    potentialGainVnd = sharesToBuy * rewardPerShare;

    if (winRatePct !== undefined && winRatePct > 0) {
      // Kelly Criterion: f* = (p * b - q) / b
      // where b = rewardToRiskRatio, p = winRate, q = 1 - winRate
      const p = winRatePct / 100;
      const q = 1 - p;
      const b = rewardToRiskRatio;
      const f = (p * b - q) / b;
      kellyFractionPct = Number((Math.max(0, f) * 100).toFixed(2));
    }
  }

  return {
    capitalVnd,
    riskPct,
    entryPriceVnd,
    stopLossPriceVnd,
    targetPriceVnd,
    capitalAtRiskVnd,
    riskPerShareVnd,
    lossPct,
    sharesToBuy,
    totalAllocatedVnd,
    portfolioWeightPct,
    rewardToRiskRatio,
    potentialGainVnd,
    kellyFractionPct,
  };
}

/**
 * 4. Calculate WACC (Weighted Average Cost of Capital)
 * WACC = (E / V) * Ke + (D / V) * Kd * (1 - t)
 */
export function calculateWacc(
  equityValueVnd: number,
  debtValueVnd: number,
  costOfEquityPct: number,
  costOfDebtPct: number,
  taxRatePct: number = 20
): WaccResult {
  const totalValue = equityValueVnd + debtValueVnd;
  if (totalValue <= 0) throw new Error("Total enterprise value must be greater than zero.");

  const equityWeight = equityValueVnd / totalValue;
  const debtWeight = debtValueVnd / totalValue;
  const afterTaxCostOfDebt = costOfDebtPct * (1 - taxRatePct / 100);

  const wacc = equityWeight * costOfEquityPct + debtWeight * afterTaxCostOfDebt;

  return {
    equityValueVnd,
    debtValueVnd,
    costOfEquityPct,
    costOfDebtPct,
    taxRatePct,
    equityWeightPct: Number((equityWeight * 100).toFixed(2)),
    debtWeightPct: Number((debtWeight * 100).toFixed(2)),
    afterTaxCostOfDebtPct: Number(afterTaxCostOfDebt.toFixed(2)),
    waccPct: Number(wacc.toFixed(2)),
  };
}

/**
 * 5. Calculate DCF (Discounted Cash Flow Valuation)
 */
export function calculateDcf(
  projectedFcffVnd: number[], // FCFF for Year 1..N
  terminalGrowthRatePct: number, // g (typically 2-4%)
  waccPct: number, // discount rate
  netDebtVnd: number = 0,
  sharesOutstanding: number = 1
): DcfValuationResult {
  const r = waccPct / 100;
  const g = terminalGrowthRatePct / 100;

  if (r <= g) {
    throw new Error("WACC must be strictly greater than terminal growth rate (g).");
  }

  const discountFactors: number[] = [];
  const discountedFcffVnd: number[] = [];
  let sumDiscountedFcffVnd = 0;

  projectedFcffVnd.forEach((fcff, index) => {
    const year = index + 1;
    const df = 1 / Math.pow(1 + r, year);
    const pv = fcff * df;
    discountFactors.push(Number(df.toFixed(4)));
    discountedFcffVnd.push(Math.round(pv));
    sumDiscountedFcffVnd += pv;
  });

  // Terminal Value at year N = FCFF_N * (1 + g) / (r - g)
  const lastFcff = projectedFcffVnd[projectedFcffVnd.length - 1] || 0;
  const terminalValue = (lastFcff * (1 + g)) / (r - g);
  
  // Discount TV back to year 0
  const tvDiscountFactor = 1 / Math.pow(1 + r, projectedFcffVnd.length);
  const discountedTerminalValue = terminalValue * tvDiscountFactor;

  const enterpriseValue = sumDiscountedFcffVnd + discountedTerminalValue;
  const equityValue = enterpriseValue - netDebtVnd;
  const fairValuePerShare = sharesOutstanding > 0 ? Math.round(equityValue / sharesOutstanding) : 0;

  return {
    waccPct,
    terminalGrowthRatePct,
    projectedFcffVnd,
    discountFactors,
    discountedFcffVnd,
    sumDiscountedFcffVnd: Math.round(sumDiscountedFcffVnd),
    terminalValueVnd: Math.round(terminalValue),
    discountedTerminalValueVnd: Math.round(discountedTerminalValue),
    enterpriseValueVnd: Math.round(enterpriseValue),
    netDebtVnd,
    equityValueVnd: Math.round(equityValue),
    sharesOutstanding,
    fairValuePerShareVnd: fairValuePerShare,
  };
}

/**
 * Formatter helper for Vietnamese Currency
 */
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

