/**
 * Storage & State Management for Orca Personal Finance
 * Tuân thủ B4 (mô hình dữ liệu) & B7 (quyền riêng tư, xuất/xóa dữ liệu).
 */

import {
  FinanceProfile,
  MonthlySnapshot,
  ExpenseItem,
  AssetItem,
  DebtItem,
  FinancialGoal,
  AssumptionSet,
  CalculatedMetrics,
  Insight,
} from '../types/finance.ts';
import { calculateTaxVn } from '../engines/taxVnEngine.ts';
import { calculateCashflow } from '../engines/cashflowEngine.ts';
import { calculateNetworth } from '../engines/networthEngine.ts';
import { calculateHealthScore } from '../engines/healthScoreEngine.ts';
import { generateQuantitativeAdvice } from '../engines/adviceEngine.ts';
import { DEFAULT_ASSUMPTIONS } from '../engines/projectionEngine.ts';
import { escapeCsvCell, safeJsonParse, sanitizeText } from '../../../lib/ai/sanitize.ts';

const STORAGE_KEY_PROFILE = 'orca_fin_profile_v1';
const STORAGE_KEY_SNAPSHOTS = 'orca_fin_snapshots_v1';
const STORAGE_KEY_ASSUMPTIONS = 'orca_fin_assumptions_v1';

export const INITIAL_EMPTY_PROFILE: FinanceProfile = {
  birthYear: 1996,
  maritalStatus: 'single',
  dependentsCount: 0,
  employmentType: 'salaried',
  riskTolerance: 'moderate',
  consentStorage: true,
  consentAI: true,
  consentOpenBanking: false,
  updatedAt: '06/10/2026',
};

// ==========================================
// DEMO DATASET (Gắn cờ DEMO rõ ràng theo B2)
// ==========================================
export const DEMO_PROFILE: FinanceProfile = {
  birthYear: 1994,
  maritalStatus: 'married',
  dependentsCount: 1, // 1 người phụ thuộc (con)
  employmentType: 'salaried',
  riskTolerance: 'growth',
  consentStorage: true,
  consentAI: true,
  consentOpenBanking: false,
  updatedAt: '06/10/2026',
};

export function createSnapshotFromEntries(params: {
  period: string; // YYYY-MM
  profile: FinanceProfile;
  grossSalary: number;
  bonus?: number;
  otherIncome?: number;
  insuranceSalaryBase?: number;
  expenses: ExpenseItem[];
  assets: AssetItem[];
  debts: DebtItem[];
  goals: FinancialGoal[];
  isDemo?: boolean;
  prevSnapshotNetWorth?: number;
}): MonthlySnapshot {
  const {
    period,
    profile,
    grossSalary,
    bonus = 0,
    otherIncome = 0,
    insuranceSalaryBase,
    expenses,
    assets,
    debts,
    goals,
    isDemo = false,
    prevSnapshotNetWorth,
  } = params;

  // 1. Chạy Tax-VN engine
  const taxResult = calculateTaxVn(
    grossSalary,
    bonus,
    otherIncome,
    insuranceSalaryBase,
    profile.dependentsCount
  );

  const incomeEntry = {
    period,
    grossSalary,
    bonus,
    otherIncome,
    insuranceSalaryBase: taxResult.insuranceSalaryBase,
    dependentsCount: profile.dependentsCount,
    mandatoryInsurance: taxResult.mandatoryInsurance,
    personalIncomeTax: taxResult.personalIncomeTax,
    netTakeHome: taxResult.netTakeHome,
  };

  // 2. Chạy Networth engine
  const networthRes = calculateNetworth(assets, debts, prevSnapshotNetWorth);

  // 3. Chạy Cashflow engine
  const cashflowRes = calculateCashflow(
    taxResult.netTakeHome,
    expenses,
    networthRes.liquidAssets,
    period
  );

  // 4. Đánh giá quỹ khẩn cấp
  const essentialMonthlyExpenses = cashflowRes.fixedExpenses + cashflowRes.variableExpenses * 0.5;
  const emergencyFundMonths = essentialMonthlyExpenses > 0
    ? Number((networthRes.liquidAssets / essentialMonthlyExpenses).toFixed(1))
    : 0;

  const totalMinDebtPayment = debts.reduce((sum, d) => sum + d.minMonthlyPayment, 0);
  const debtToIncomeRatio = taxResult.netTakeHome > 0
    ? Number(((totalMinDebtPayment / taxResult.netTakeHome) * 100).toFixed(1))
    : 0;

  const hasHighInterestDebt = debts.some((d) => d.balance > 0 && d.interestRate >= 12);
  const investedAssetsRatio = networthRes.totalAssets > 0
    ? Number(((networthRes.investedAssets / networthRes.totalAssets) * 100).toFixed(1))
    : 0;

  // 5. Chạy Health-Score engine
  const healthRes = calculateHealthScore({
    netIncome: taxResult.netTakeHome,
    savingsRate: cashflowRes.savingsRate,
    fixedCostRatio: cashflowRes.fixedCostRatio,
    emergencyFundMonths,
    totalDebt: networthRes.totalDebt,
    debtToIncomeRatio,
    hasHighInterestDebt,
    netWorth: networthRes.netWorth,
    investedAssetsRatio,
    hasRecentCheckin: true,
    consecutiveCheckinsCount: 3,
  });

  const metrics: CalculatedMetrics = {
    totalGrossIncome: taxResult.totalGrossIncome,
    totalNetIncome: taxResult.netTakeHome,
    totalExpenses: cashflowRes.totalExpenses,
    fixedExpenses: cashflowRes.fixedExpenses,
    variableExpenses: cashflowRes.variableExpenses,
    monthlySavings: cashflowRes.monthlySavings,
    savingsRate: cashflowRes.savingsRate,
    fixedCostRatio: cashflowRes.fixedCostRatio,
    totalAssets: networthRes.totalAssets,
    liquidAssets: networthRes.liquidAssets,
    investedAssets: networthRes.investedAssets,
    totalDebt: networthRes.totalDebt,
    netWorth: networthRes.netWorth,
    emergencyFundMonths,
    debtToIncomeRatio,
    healthScore: {
      total: healthRes.total,
      cashflowScore: healthRes.cashflowScore,
      emergencyScore: healthRes.emergencyScore,
      debtScore: healthRes.debtScore,
      networthScore: healthRes.networthScore,
      disciplineScore: healthRes.disciplineScore,
      ratingText: healthRes.ratingBand,
    },
  };

  return {
    period,
    profile,
    income: incomeEntry,
    expenses,
    assets,
    debts,
    goals,
    metrics,
    engineVersion: 'orca-engine-v2026.1',
    timestamp: new Date().toISOString(),
    isDemo,
  };
}

export function generateDemoSnapshots(): MonthlySnapshot[] {
  // Demo Kỳ 2026-08
  const snap08 = createSnapshotFromEntries({
    period: '2026-08',
    profile: DEMO_PROFILE,
    grossSalary: 38000000,
    bonus: 0,
    otherIncome: 3000000,
    insuranceSalaryBase: 38000000,
    expenses: [
      { id: 'e1', category: 'housing', name: 'Thuê căn hộ & phí quản lý', amount: 9500000, isFixed: true },
      { id: 'e2', category: 'utilities', name: 'Điện, nước & internet', amount: 2200000, isFixed: true },
      { id: 'e3', category: 'food', name: 'Ăn uống gia đình & siêu thị', amount: 7500000, isFixed: false },
      { id: 'e4', category: 'transport', name: 'Xăng xe & bảo dưỡng', amount: 1800000, isFixed: false },
      { id: 'e5', category: 'education', name: 'Học phí mầm non bán công', amount: 3500000, isFixed: true },
      { id: 'e6', category: 'healthcare', name: 'Y tế & thực phẩm chức năng', amount: 1000000, isFixed: false },
      { id: 'e7', category: 'entertainment', name: 'Cuối tuần & cafe', amount: 2000000, isFixed: false },
      { id: 'e8', category: 'family_support', name: 'Biếu phụ mẫu 2 bên', amount: 2000000, isFixed: true },
    ],
    assets: [
      { id: 'a1', category: 'cash', name: 'Tài khoản thanh toán Techcombank', balance: 25000000, updatedAt: '31/08/2026' },
      { id: 'a2', category: 'savings', name: 'Tiết kiệm online VCB 6 tháng', balance: 60000000, updatedAt: '31/08/2026', interestRate: 4.5 },
      { id: 'a3', category: 'gold', name: '0.5 cây vàng nhẫn SJC 999.9', balance: 41000000, updatedAt: '31/08/2026' },
      { id: 'a4', category: 'stocks', name: 'Cổ phiếu FPT, HPG (SSI)', balance: 95000000, updatedAt: '31/08/2026' },
      { id: 'a5', category: 'funds', name: 'Chứng chỉ quỹ DCDS & VFMVN30', balance: 65000000, updatedAt: '31/08/2026' },
    ],
    debts: [
      { id: 'd1', category: 'credit_card', name: 'Thẻ tín dụng VIB CashBack', balance: 14000000, interestRate: 24.0, minMonthlyPayment: 2000000, remainingMonths: 7 },
      { id: 'd2', category: 'consumer_loan', name: 'Vay mua laptop trả góp FECredit', balance: 8000000, interestRate: 15.0, minMonthlyPayment: 1500000, remainingMonths: 6 },
    ],
    goals: [
      { id: 'g1', name: 'Quỹ dự phòng an toàn 6 tháng', targetAmount: 120000000, accumulatedAmount: 85000000, deadline: '2027-04', priority: 'high', status: 'on_track' },
      { id: 'g2', name: 'Tích lũy mua nhà sơ cấp', targetAmount: 800000000, accumulatedAmount: 160000000, deadline: '2029-12', priority: 'high', status: 'lagging' },
      { id: 'g3', name: 'Bảo hiểm nhân thọ gia đình', targetAmount: 30000000, accumulatedAmount: 22000000, deadline: '2026-12', priority: 'medium', status: 'on_track' },
    ],
    isDemo: true,
  });

  // Demo Kỳ 2026-09
  const snap09 = createSnapshotFromEntries({
    period: '2026-09',
    profile: DEMO_PROFILE,
    grossSalary: 38000000,
    bonus: 5000000, // Thưởng dự án
    otherIncome: 3000000,
    insuranceSalaryBase: 38000000,
    expenses: [
      { id: 'e1', category: 'housing', name: 'Thuê căn hộ & phí quản lý', amount: 9500000, isFixed: true },
      { id: 'e2', category: 'utilities', name: 'Điện, nước & internet', amount: 2100000, isFixed: true },
      { id: 'e3', category: 'food', name: 'Ăn uống gia đình & siêu thị', amount: 7200000, isFixed: false },
      { id: 'e4', category: 'transport', name: 'Xăng xe & bảo dưỡng', amount: 1600000, isFixed: false },
      { id: 'e5', category: 'education', name: 'Học phí mầm non bán công', amount: 3500000, isFixed: true },
      { id: 'e6', category: 'healthcare', name: 'Y tế & thực phẩm chức năng', amount: 800000, isFixed: false },
      { id: 'e7', category: 'entertainment', name: 'Cuối tuần & cafe', amount: 1800000, isFixed: false },
      { id: 'e8', category: 'family_support', name: 'Biếu phụ mẫu 2 bên', amount: 2000000, isFixed: true },
    ],
    assets: [
      { id: 'a1', category: 'cash', name: 'Tài khoản thanh toán Techcombank', balance: 32000000, updatedAt: '30/09/2026' },
      { id: 'a2', category: 'savings', name: 'Tiết kiệm online VCB 6 tháng', balance: 75000000, updatedAt: '30/09/2026', interestRate: 4.5 },
      { id: 'a3', category: 'gold', name: '0.5 cây vàng nhẫn SJC 999.9', balance: 42500000, updatedAt: '30/09/2026' },
      { id: 'a4', category: 'stocks', name: 'Cổ phiếu FPT, HPG (SSI)', balance: 102000000, updatedAt: '30/09/2026' },
      { id: 'a5', category: 'funds', name: 'Chứng chỉ quỹ DCDS & VFMVN30', balance: 72000000, updatedAt: '30/09/2026' },
    ],
    debts: [
      { id: 'd1', category: 'credit_card', name: 'Thẻ tín dụng VIB CashBack', balance: 9000000, interestRate: 24.0, minMonthlyPayment: 2000000, remainingMonths: 5 },
      { id: 'd2', category: 'consumer_loan', name: 'Vay mua laptop trả góp FECredit', balance: 6500000, interestRate: 15.0, minMonthlyPayment: 1500000, remainingMonths: 5 },
    ],
    goals: [
      { id: 'g1', name: 'Quỹ dự phòng an toàn 6 tháng', targetAmount: 120000000, accumulatedAmount: 107000000, deadline: '2027-04', priority: 'high', status: 'on_track' },
      { id: 'g2', name: 'Tích lũy mua nhà sơ cấp', targetAmount: 800000000, accumulatedAmount: 174000000, deadline: '2029-12', priority: 'high', status: 'lagging' },
      { id: 'g3', name: 'Bảo hiểm nhân thọ gia đình', targetAmount: 30000000, accumulatedAmount: 25000000, deadline: '2026-12', priority: 'medium', status: 'on_track' },
    ],
    isDemo: true,
    prevSnapshotNetWorth: snap08.metrics.netWorth,
  });

  // Demo Kỳ 2026-10 (Kỳ hiện tại)
  const snap10 = createSnapshotFromEntries({
    period: '2026-10',
    profile: DEMO_PROFILE,
    grossSalary: 40000000, // Tăng lương nhẹ
    bonus: 2000000,
    otherIncome: 3000000,
    insuranceSalaryBase: 40000000,
    expenses: [
      { id: 'e1', category: 'housing', name: 'Thuê căn hộ & phí quản lý', amount: 9500000, isFixed: true },
      { id: 'e2', category: 'utilities', name: 'Điện, nước & internet', amount: 2050000, isFixed: true },
      { id: 'e3', category: 'food', name: 'Ăn uống gia đình & siêu thị', amount: 7600000, isFixed: false },
      { id: 'e4', category: 'transport', name: 'Xăng xe & Grab', amount: 1500000, isFixed: false },
      { id: 'e5', category: 'education', name: 'Học phí mầm non bán công', amount: 3500000, isFixed: true },
      { id: 'e6', category: 'healthcare', name: 'Y tế & thực phẩm chức năng', amount: 900000, isFixed: false },
      { id: 'e7', category: 'entertainment', name: 'Cuối tuần & cafe', amount: 2100000, isFixed: false },
      { id: 'e8', category: 'family_support', name: 'Biếu phụ mẫu 2 bên', amount: 2000000, isFixed: true },
      { id: 'e9', category: 'shopping', name: 'Mua sắm gia dụng', amount: 1200000, isFixed: false },
    ],
    assets: [
      { id: 'a1', category: 'cash', name: 'Tài khoản thanh toán Techcombank', balance: 38000000, updatedAt: '05/10/2026' },
      { id: 'a2', category: 'savings', name: 'Tiết kiệm online VCB 6 tháng', balance: 90000000, updatedAt: '05/10/2026', interestRate: 4.5 },
      { id: 'a3', category: 'gold', name: '0.5 cây vàng nhẫn SJC 999.9', balance: 43250000, updatedAt: '05/10/2026' },
      { id: 'a4', category: 'stocks', name: 'Cổ phiếu FPT, HPG (SSI)', balance: 110000000, updatedAt: '05/10/2026' },
      { id: 'a5', category: 'funds', name: 'Chứng chỉ quỹ DCDS & VFMVN30', balance: 80000000, updatedAt: '05/10/2026' },
    ],
    debts: [
      { id: 'd1', category: 'credit_card', name: 'Thẻ tín dụng VIB CashBack', balance: 4500000, interestRate: 24.0, minMonthlyPayment: 2000000, remainingMonths: 3 },
      { id: 'd2', category: 'consumer_loan', name: 'Vay mua laptop trả góp FECredit', balance: 5000000, interestRate: 15.0, minMonthlyPayment: 1500000, remainingMonths: 4 },
    ],
    goals: [
      { id: 'g1', name: 'Quỹ dự phòng an toàn 6 tháng', targetAmount: 120000000, accumulatedAmount: 120000000, deadline: '2027-04', priority: 'high', status: 'completed' },
      { id: 'g2', name: 'Tích lũy mua nhà sơ cấp', targetAmount: 800000000, accumulatedAmount: 190000000, deadline: '2029-12', priority: 'high', status: 'lagging' },
      { id: 'g3', name: 'Bảo hiểm nhân thọ gia đình', targetAmount: 30000000, accumulatedAmount: 28000000, deadline: '2026-12', priority: 'medium', status: 'on_track' },
    ],
    isDemo: true,
    prevSnapshotNetWorth: snap09.metrics.netWorth,
  });

  return [snap08, snap09, snap10];
}

// ==========================================
// STORE FUNCTIONS
// ==========================================

export function createZeroSnapshot(period = '2026-10'): MonthlySnapshot {
  return createSnapshotFromEntries({
    period,
    profile: INITIAL_EMPTY_PROFILE,
    grossSalary: 0,
    bonus: 0,
    otherIncome: 0,
    insuranceSalaryBase: 0,
    expenses: [],
    assets: [],
    debts: [],
    goals: [],
    isDemo: false,
  });
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeStoredProfile(raw: unknown): FinanceProfile {
  if (!isPlainRecord(raw)) return INITIAL_EMPTY_PROFILE;
  const marital = raw.maritalStatus === 'married' || raw.maritalStatus === 'has_children' ? raw.maritalStatus : 'single';
  const employment =
    raw.employmentType === 'freelance' || raw.employmentType === 'business_owner' || raw.employmentType === 'other'
      ? raw.employmentType
      : 'salaried';
  const risk =
    raw.riskTolerance === 'conservative' || raw.riskTolerance === 'growth' || raw.riskTolerance === 'aggressive'
      ? raw.riskTolerance
      : 'moderate';

  return {
    birthYear: Math.round(finiteNumber(raw.birthYear, INITIAL_EMPTY_PROFILE.birthYear, 1920, 2020)),
    maritalStatus: marital,
    dependentsCount: Math.round(finiteNumber(raw.dependentsCount, 0, 0, 20)),
    employmentType: employment,
    riskTolerance: risk,
    consentStorage: typeof raw.consentStorage === 'boolean' ? raw.consentStorage : INITIAL_EMPTY_PROFILE.consentStorage,
    consentAI: typeof raw.consentAI === 'boolean' ? raw.consentAI : INITIAL_EMPTY_PROFILE.consentAI,
    consentOpenBanking: typeof raw.consentOpenBanking === 'boolean' ? raw.consentOpenBanking : INITIAL_EMPTY_PROFILE.consentOpenBanking,
    updatedAt: sanitizeText(raw.updatedAt, 32) || INITIAL_EMPTY_PROFILE.updatedAt,
  };
}

export function sanitizeStoredAssumptions(raw: unknown): AssumptionSet {
  if (!isPlainRecord(raw)) return DEFAULT_ASSUMPTIONS;
  return {
    inflationRate: finiteNumber(raw.inflationRate, DEFAULT_ASSUMPTIONS.inflationRate, 0, 50),
    salaryGrowthRate: finiteNumber(raw.salaryGrowthRate, DEFAULT_ASSUMPTIONS.salaryGrowthRate, -50, 100),
    returnsConservative: finiteNumber(raw.returnsConservative, DEFAULT_ASSUMPTIONS.returnsConservative, -50, 100),
    returnsBase: finiteNumber(raw.returnsBase, DEFAULT_ASSUMPTIONS.returnsBase, -50, 100),
    returnsAggressive: finiteNumber(raw.returnsAggressive, DEFAULT_ASSUMPTIONS.returnsAggressive, -50, 100),
    retirementAge: Math.round(finiteNumber(raw.retirementAge, DEFAULT_ASSUMPTIONS.retirementAge, 40, 85)),
    lifeExpectancy: Math.round(finiteNumber(raw.lifeExpectancy, DEFAULT_ASSUMPTIONS.lifeExpectancy, 60, 110)),
    sourceNotes: sanitizeText(raw.sourceNotes, 300) || DEFAULT_ASSUMPTIONS.sourceNotes,
    updatedAt: sanitizeText(raw.updatedAt, 32) || DEFAULT_ASSUMPTIONS.updatedAt,
  };
}

function isValidSnapshotShape(v: unknown): v is MonthlySnapshot {
  if (!isPlainRecord(v)) return false;
  if (typeof v.period !== 'string' || !/^\d{4}-\d{2}$/.test(v.period)) return false;
  if (!isPlainRecord(v.income) || !isPlainRecord(v.metrics) || !isPlainRecord(v.metrics.healthScore)) return false;
  if (!Array.isArray(v.expenses) || !Array.isArray(v.assets) || !Array.isArray(v.debts) || !Array.isArray(v.goals)) {
    return false;
  }
  return true;
}

export function loadProfileFromStorage(): FinanceProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (parsed) return sanitizeStoredProfile(parsed);
    }
  } catch {
    // fallback
  }
  return INITIAL_EMPTY_PROFILE; // Khởi tạo với hồ sơ trắng của người dùng
}

export function saveProfileToStorage(profile: FinanceProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function loadSnapshotsFromStorage(): MonthlySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(isValidSnapshotShape).map((s) => ({
          ...s,
          profile: sanitizeStoredProfile(s.profile),
          expenses: s.expenses.filter(isPlainRecord).map((e) => ({
            ...e,
            id: sanitizeText(e.id, 64) || 'exp',
            name: sanitizeText(e.name, 120),
            amount: finiteNumber(e.amount, 0, 0),
          })) as ExpenseItem[],
          assets: s.assets.filter(isPlainRecord).map((a) => ({
            ...a,
            id: sanitizeText(a.id, 64) || 'ast',
            name: sanitizeText(a.name, 120),
            balance: finiteNumber(a.balance, 0, 0),
            updatedAt: sanitizeText(a.updatedAt, 32),
            sourceNote: a.sourceNote ? sanitizeText(a.sourceNote, 200) : undefined,
          })) as AssetItem[],
          debts: s.debts.filter(isPlainRecord).map((d) => ({
            ...d,
            id: sanitizeText(d.id, 64) || 'debt',
            name: sanitizeText(d.name, 120),
            balance: finiteNumber(d.balance, 0, 0),
            interestRate: finiteNumber(d.interestRate, 0, 0, 200),
            minMonthlyPayment: finiteNumber(d.minMonthlyPayment, 0, 0),
            remainingMonths: Math.round(finiteNumber(d.remainingMonths, 0, 0, 600)),
          })) as DebtItem[],
          goals: s.goals.filter(isPlainRecord).map((g) => ({
            ...g,
            id: sanitizeText(g.id, 64) || 'goal',
            name: sanitizeText(g.name, 120),
            targetAmount: finiteNumber(g.targetAmount, 0, 0),
            accumulatedAmount: finiteNumber(g.accumulatedAmount, 0, 0),
            deadline: sanitizeText(g.deadline, 16),
          })) as FinancialGoal[],
        }));
        // Nếu toàn bộ là dữ liệu mẫu demo thì tự động chuyển sang số liệu 0 sạch
        const hasUserCustomData = valid.some((s) => s.isDemo === false);
        if (hasUserCustomData) {
          return valid;
        }
      }
    }
  } catch {
    // fallback
  }
  return [createZeroSnapshot()];
}

export function saveSnapshotsToStorage(snapshots: MonthlySnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots));
  } catch {
    // ignore
  }
}

export function resetAllToZero(period = '2026-10'): MonthlySnapshot[] {
  const zeroSnap = createZeroSnapshot(period);
  saveSnapshotsToStorage([zeroSnap]);
  saveProfileToStorage(INITIAL_EMPTY_PROFILE);
  try {
    localStorage.removeItem('orca_global_finance_custom_config_v1');
  } catch {
    // ignore
  }
  return [zeroSnap];
}

export function loadAssumptionsFromStorage(): AssumptionSet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ASSUMPTIONS);
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (parsed) return sanitizeStoredAssumptions(parsed);
    }
  } catch {
    // fallback
  }
  return DEFAULT_ASSUMPTIONS;
}

export function saveAssumptionsToStorage(assumptions: AssumptionSet): void {
  try {
    localStorage.setItem(STORAGE_KEY_ASSUMPTIONS, JSON.stringify(assumptions));
  } catch {
    // ignore
  }
}

/**
 * Xóa toàn bộ dữ liệu người dùng một chạm (One-click wipe B7)
 */
export function wipeAllUserData(): void {
  localStorage.removeItem(STORAGE_KEY_PROFILE);
  localStorage.removeItem(STORAGE_KEY_SNAPSHOTS);
  localStorage.removeItem(STORAGE_KEY_ASSUMPTIONS);
  localStorage.removeItem('orca_global_finance_custom_config_v1');
}

/**
 * Xuất toàn bộ dữ liệu dưới dạng JSON (B7)
 */
export function exportDataAsJson(profile: FinanceProfile, snapshots: MonthlySnapshot[]): string {
  const exportPayload = {
    brand: 'Orca Financial',
    system: 'Orca Personal Finance',
    exportedAt: new Date().toISOString(),
    pdpdCompliance: 'Nghị định 13/2023/NĐ-CP & Luật Bảo vệ dữ liệu cá nhân 2025',
    profile,
    snapshots,
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Xuất dữ liệu lịch sử dòng tiền & tài sản ròng dưới dạng CSV (B7)
 */
export function exportDataAsCsv(snapshots: MonthlySnapshot[]): string {
  const headers = [
    'Ky (Period)',
    'Thu nhap Gross (VND)',
    'Bao hiem bat buoc (VND)',
    'Thue TNCN (VND)',
    'Thu nhap Thuc nhan (VND)',
    'Tong Chi tieu (VND)',
    'Chi co dinh (VND)',
    'Tiet kiem (VND)',
    'Ty le Tiet kiem (%)',
    'Tong Tai san (VND)',
    'Tong No (VND)',
    'Tai san rong (VND)',
    'Diem suc khoe (0-100)',
    'Quy khan cap (Thang)',
  ];

  const rows = snapshots.map((s) => [
    s.period,
    s.metrics.totalGrossIncome,
    s.income.mandatoryInsurance.total,
    s.income.personalIncomeTax,
    s.metrics.totalNetIncome,
    s.metrics.totalExpenses,
    s.metrics.fixedExpenses,
    s.metrics.monthlySavings,
    s.metrics.savingsRate,
    s.metrics.totalAssets,
    s.metrics.totalDebt,
    s.metrics.netWorth,
    s.metrics.healthScore.total,
    s.metrics.emergencyFundMonths,
  ]);

  return [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
}
