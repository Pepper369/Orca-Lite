/**
 * Fundamental Quant Matrix Engine (Orca-Lite FA)
 * Deterministic quantitative fundamental analysis:
 * 1. Earnings Quality & Accruals Analysis (CFO / Net Profit conversion & FCF Yield)
 * 2. Capital Efficiency & Economic Moat (ROIC & DuPont 3-Way)
 * 3. Financial Fortress & Solvency (Interest Coverage Ratio ICR & Net Cash)
 * 4. Growth at Reasonable Price (PEG Ratio)
 * 5. Consensus Upside & CTCK Target Price Margin of Safety
 * 6. Joel Greenblatt's Magic Formula Percentile Score
 * 7. FA Master Classification & Health Rating
 */

import type { FundamentalSnapshot } from "../financial/snapshots";
import type { VietcapProfile } from "../providers/vietcap";

export type FaCategory =
  | "FORTRESS"
  | "CASH_MACHINE"
  | "MOAT_QUALITY"
  | "BUFFETT_COMPOUNDER"
  | "LYNCH_GROWTH"
  | "GRAHAM_NET_NET"
  | "DIVIDEND_ARISTOCRAT"
  | "WORKING_CAPITAL"
  | "UNDERVALUED_GROWTH"
  | "CONSENSUS_UPSIDE"
  | "VALUE_DIVIDEND"
  | "HIGH_RISK"
  | "STANDARD";

export interface FundamentalMatrixResult {
  // 1. Dòng tiền & Chất lượng Lợi nhuận
  cfoToNetProfit: number | null; // CFO / Net Profit (>= 1.0 = Tiền mặt thực chất)
  isQualityEarnings: boolean;
  ocfBillion: number | null; // in Billion VND
  fcfBillion: number | null; // in Billion VND
  fcfYieldPct: number | null; // FCF / Market Cap (%)

  // 2. Hiệu quả Vốn & Moat
  roic: number | null; // Return on Invested Capital (%)
  isHighRoic: boolean; // ROIC >= 15%
  dupontDrive: "MARGIN" | "TURNOVER" | "LEVERAGE" | "BALANCED";

  // 3. Đòn bẩy & Sức bền Tài chính
  interestCoverage: number | null; // EBIT / Interest (>= 4.0x = Siêu an toàn)
  isSafeDebt: boolean;
  isNetCash: boolean; // Tiền mặt > Tổng nợ vay
  netDebtToEbitda: number | null;

  // 4. Định giá & Tăng trưởng
  peg: number | null; // P/E / NI YoY% (< 1.0 = Hời Peter Lynch)
  isUndervaluedGrowth: boolean;

  // 5. Định giá Đồng thuận CTCK
  consensusTargetPrice: number | null;
  consensusUpsidePct: number | null; // % upside tới giá mục tiêu
  isConsensusDiscount: boolean; // Upside >= 20%

  // 6. Magic Formula Greenblatt Score (1 - 99)
  magicFormulaScore: number;

  // 7. Forensic Accounting & Chống gian lận (Beneish M-Score & Sloan Accruals)
  beneishMScore: number | null;
  isBeneishSafe: boolean; // M-Score < -2.22
  sloanAccrualRatio: number | null; // (Net Income - CFO) / Total Assets

  // 8. Warren Buffett Compounder (Siêu tích lũy vốn)
  isBuffettCompounder: boolean;
  buffettScore: number; // 0 - 100

  // 9. Peter Lynch Fast Grower
  isLynchFastGrower: boolean;

  // 10. Benjamin Graham Net-Net (NCAV)
  isGrahamNcav: boolean;
  ncavPerShare: number | null;

  // 11. Working Capital & Cash Conversion Cycle (CCC)
  cashConversionCycleDays: number | null;
  isWorkingCapitalChampion: boolean;

  // 12. Dividend Aristocrat (Quý tộc cổ tức)
  isDividendAristocrat: boolean;
  dividendPayoutRatio: number | null;

  // 13. Điểm uốn tăng trưởng quý (Quarterly Inflection)
  inflectionDelta: number | null;
  isQuarterlyInflection: boolean;

  // 14. Forensic Book-Tax Difference & Cash Realization (Phase 1)
  bookTaxDifference: number | null; // Pretax Income - (Tax Expense / 0.20) / Total Assets
  isBookTaxSafe: boolean; // BTD <= 0.04 & BTD >= -0.08
  cashRealizationRatio: number | null; // OCF / EBITDA (>= 0.85 = xuất sắc)

  // 15. Return on Incremental Invested Capital & Super Compounder (Phase 1)
  roiic3Y: number | null; // ROIIC (%)
  isSuperCompounder: boolean; // ROIIC >= 25% & ROIC >= 15% & Safe Debt

  // 16. Reverse DCF & Implied Growth Solver (Phase 2)
  impliedGrowthPct: number | null; // Tốc độ tăng trưởng FCF định giá ngụ ý (%)
  reverseDcfMarginPct: number | null; // Biên độ an toàn chiết khấu định giá (%)

  // 17. Merton Distance-to-Default & Xác suất vỡ nợ (Phase 3)
  mertonDistanceToDefault: number | null; // Khoảng cách tới ngưỡng vỡ nợ (DD)
  mertonPdPct: number | null; // Xác suất vỡ nợ ngụ ý thị trường (%)
  isMertonSafe: boolean; // DD >= 2.5 & PD < 0.15% (hoặc Net Cash)

  // 18. Phân hạng Sức khỏe FA Tổng hợp
  faCategory: FaCategory;
  faBadgeVi: string;
  faSummaryVi: string;
}

export function calculateBookTaxDifference(
  snap?: Partial<FundamentalSnapshot> | null,
  totalAssetsFallback?: number
): { bookTaxDifference: number | null; isBookTaxSafe: boolean } {
  if (!snap) return { bookTaxDifference: null, isBookTaxSafe: true };
  const rawPretax = snap.pretaxIncome;
  const rawTax = snap.taxExpense;
  const rawNetProfit = snap.netProfit ?? 0;

  let pretaxBillion: number | null = null;
  let taxBillion: number | null = null;

  if (rawPretax != null && rawTax != null) {
    pretaxBillion = Math.abs(rawPretax) > 100_000_000 ? rawPretax / 1_000_000_000 : rawPretax;
    taxBillion = Math.abs(rawTax) > 100_000_000 ? rawTax / 1_000_000_000 : rawTax;
  } else if (rawNetProfit !== 0) {
    const npBillion = Math.abs(rawNetProfit) > 100_000_000 ? rawNetProfit / 1_000_000_000 : rawNetProfit;
    pretaxBillion = npBillion / 0.8;
    taxBillion = pretaxBillion * 0.2;
  }

  if (pretaxBillion == null || taxBillion == null) {
    return { bookTaxDifference: null, isBookTaxSafe: true };
  }

  const rawTotalAssets = snap.totalAssets;
  let assetsBillion =
    rawTotalAssets != null
      ? Math.abs(rawTotalAssets) > 100_000_000
        ? rawTotalAssets / 1_000_000_000
        : rawTotalAssets
      : totalAssetsFallback ?? 1000;
  if (assetsBillion <= 0) assetsBillion = 1000;

  // Corporate income tax standard rate in Vietnam is 20%
  const btd = (pretaxBillion - taxBillion / 0.2) / assetsBillion;
  const bookTaxDifference = Number(btd.toFixed(3));
  const isBookTaxSafe = bookTaxDifference <= 0.04 && bookTaxDifference >= -0.08;

  return { bookTaxDifference, isBookTaxSafe };
}

export function calculateCashRealizationRatio(
  snap?: Partial<FundamentalSnapshot> | null,
  ocfBillion?: number | null
): number | null {
  if (!snap) return null;
  const rawEbitda = snap.ebitdaTtm;
  let ebitdaBillion: number | null = null;
  if (rawEbitda != null && rawEbitda !== 0) {
    ebitdaBillion = Math.abs(rawEbitda) > 100_000_000 ? rawEbitda / 1_000_000_000 : rawEbitda;
  } else if (snap.netProfit != null && snap.netProfit > 0) {
    const npBillion = Math.abs(snap.netProfit) > 100_000_000 ? snap.netProfit / 1_000_000_000 : snap.netProfit;
    ebitdaBillion = npBillion * 1.25;
  }

  const ocf =
    ocfBillion ??
    (snap.ocfTtm != null
      ? Math.abs(snap.ocfTtm) > 100_000_000
        ? snap.ocfTtm / 1_000_000_000
        : snap.ocfTtm
      : null);

  if (ocf == null || ebitdaBillion == null || ebitdaBillion <= 0) return null;
  return Number((ocf / ebitdaBillion).toFixed(2));
}

export function calculateRoiic(params: {
  snap?: Partial<FundamentalSnapshot> | null;
  roic: number | null;
  niYoyPct: number | null;
}): { roiic3Y: number | null; isSuperCompounder: boolean } {
  const { snap, roic, niYoyPct } = params;
  let roiic3Y: number | null = null;

  if (snap?.roiic3Y != null && Number.isFinite(snap.roiic3Y)) {
    roiic3Y = Number(snap.roiic3Y.toFixed(1));
  } else if (snap?.deltaNopat != null && snap?.deltaIc != null && snap.deltaIc > 0) {
    roiic3Y = Number(((snap.deltaNopat / snap.deltaIc) * 100).toFixed(1));
  } else if (roic != null && Number.isFinite(roic)) {
    const growth = niYoyPct != null ? Math.max(-50, Math.min(100, niYoyPct)) : 10;
    const modeled = roic * (1 + growth / 100);
    roiic3Y = Number(Math.max(-50, Math.min(100, modeled)).toFixed(1));
  }

  const isSuperCompounder = Boolean(
    roiic3Y != null &&
    roiic3Y >= 25.0 &&
    roic != null &&
    roic >= 15.0
  );

  return { roiic3Y, isSuperCompounder };
}

export function solveReverseDcfImpliedGrowth(params: {
  fcfBillion: number | null;
  netProfitBillion: number | null;
  marketCapBillion: number | null;
  wacc?: number;
  terminalGrowth?: number;
  expectedGrowth?: number | null;
}): { impliedGrowthPct: number | null; reverseDcfMarginPct: number | null } {
  const { fcfBillion, netProfitBillion, marketCapBillion } = params;
  if (marketCapBillion == null || marketCapBillion <= 0) {
    return { impliedGrowthPct: null, reverseDcfMarginPct: null };
  }

  const baseCf =
    fcfBillion != null && fcfBillion > 0
      ? fcfBillion
      : netProfitBillion != null && netProfitBillion > 0
      ? netProfitBillion * 0.85
      : null;

  if (baseCf == null || baseCf <= 0) {
    return { impliedGrowthPct: null, reverseDcfMarginPct: null };
  }

  const w = params.wacc ?? 0.1; // 10.0% WACC
  const gT = params.terminalGrowth ?? 0.03; // 3.0% perpetual growth
  const years = 5;

  function dcfVal(g: number): number {
    let pvForecast = 0;
    let cf_t = baseCf!;
    for (let t = 1; t <= years; t++) {
      cf_t *= 1 + g;
      pvForecast += cf_t / Math.pow(1 + w, t);
    }
    const terminalVal = (cf_t * (1 + gT)) / (w - gT);
    const pvTerminal = terminalVal / Math.pow(1 + w, years);
    return pvForecast + pvTerminal;
  }

  let low = -0.3;
  let high = 0.6;
  const valLow = dcfVal(low);
  const valHigh = dcfVal(high);

  let impliedG: number;
  if (marketCapBillion <= valLow) {
    impliedG = low;
  } else if (marketCapBillion >= valHigh) {
    impliedG = high;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      const v = dcfVal(mid);
      if (v < marketCapBillion) {
        low = mid;
      } else {
        high = mid;
      }
    }
    impliedG = (low + high) / 2;
  }

  const impliedGrowthPct = Number((impliedG * 100).toFixed(1));
  const expG = params.expectedGrowth ?? 12.0;
  const reverseDcfMarginPct = Number((expG - impliedGrowthPct).toFixed(1));

  return { impliedGrowthPct, reverseDcfMarginPct };
}

export function calculateMertonDistanceToDefault(params: {
  marketCapBillion?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  beta?: number | null;
  isNetCash?: boolean;
}): {
  mertonDistanceToDefault: number | null;
  mertonPdPct: number | null;
  isMertonSafe: boolean;
} {
  const { marketCapBillion, totalDebt, cash, beta, isNetCash } = params;

  const debtBillion = totalDebt != null
    ? (Math.abs(totalDebt) > 100_000_000 ? totalDebt / 1_000_000_000 : totalDebt)
    : 0;
  const cashBillion = cash != null
    ? (Math.abs(cash) > 100_000_000 ? cash / 1_000_000_000 : cash)
    : 0;

  if (isNetCash || debtBillion <= 0 || (cashBillion > 0 && cashBillion >= debtBillion)) {
    return {
      mertonDistanceToDefault: 8.0,
      mertonPdPct: 0.001,
      isMertonSafe: true,
    };
  }

  if (marketCapBillion == null || marketCapBillion <= 0) {
    return {
      mertonDistanceToDefault: null,
      mertonPdPct: null,
      isMertonSafe: debtBillion <= 0,
    };
  }

  const va = marketCapBillion + debtBillion;
  const d = Math.max(0.1, debtBillion);
  const rawBeta = beta != null && Number.isFinite(beta) ? beta : 1.0;
  const sigmaE = Math.max(0.18, Math.min(0.65, rawBeta * 0.25));
  const sigmaA = Math.max(0.08, Math.min(0.50, sigmaE * (marketCapBillion / va)));
  const r = 0.045;
  const T = 1.0;

  const numerator = Math.log(va / d) + (r - 0.5 * sigmaA * sigmaA) * T;
  const denominator = sigmaA * Math.sqrt(T);
  const rawDD = numerator / denominator;
  const mertonDistanceToDefault = Number(Math.max(-5.0, Math.min(10.0, rawDD)).toFixed(2));

  function stdNormCdf(x: number): number {
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;

    if (x >= 0.0) {
      const t = 1.0 / (1.0 + p * x);
      return (1.0 - c * Math.exp(-x * x / 2.0) * t *
        (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    } else {
      const t = 1.0 / (1.0 - p * x);
      return (c * Math.exp(-x * x / 2.0) * t *
        (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    }
  }

  const pd = stdNormCdf(-mertonDistanceToDefault);
  const mertonPdPct = Number((pd * 100).toFixed(3));
  const isMertonSafe = mertonDistanceToDefault >= 2.5 && mertonPdPct < 0.15;

  return {
    mertonDistanceToDefault,
    mertonPdPct,
    isMertonSafe,
  };
}

export const QUANT_FA_BIT = {
  SUPER_COMPOUNDER: 1 << 0,
  BOOK_TAX_CLEAN: 1 << 1,
  MISPRICED_GROWTH: 1 << 2,
  MERTON_SAFE: 1 << 3,
  HIGH_ROIIC: 1 << 4,
  DEEP_VALUE_DCF: 1 << 5,
  QUALITY_EARNINGS: 1 << 6,
  SAFE_DEBT: 1 << 7,
} as const;

export class QuantFaVectorStore {
  readonly capacity: number;
  readonly symbols: string[];
  readonly roic: Float32Array;
  readonly roiic3Y: Float32Array;
  readonly bookTaxDiff: Float32Array;
  readonly cashRealizationRatio: Float32Array;
  readonly impliedGrowth: Float32Array;
  readonly reverseDcfMargin: Float32Array;
  readonly mertonDD: Float32Array;
  readonly bitFlags: Uint32Array;

  constructor(items: Array<{
    symbol: string;
    roic?: number | null;
    roiic3Y?: number | null;
    bookTaxDifference?: number | null;
    cashRealizationRatio?: number | null;
    impliedGrowthPct?: number | null;
    reverseDcfMarginPct?: number | null;
    mertonDistanceToDefault?: number | null;
    quantFaBitFlags?: number | null;
  }>) {
    const size = items.length;
    this.capacity = size;
    this.symbols = new Array(size);
    this.roic = new Float32Array(size);
    this.roiic3Y = new Float32Array(size);
    this.bookTaxDiff = new Float32Array(size);
    this.cashRealizationRatio = new Float32Array(size);
    this.impliedGrowth = new Float32Array(size);
    this.reverseDcfMargin = new Float32Array(size);
    this.mertonDD = new Float32Array(size);
    this.bitFlags = new Uint32Array(size);

    for (let i = 0; i < size; i++) {
      const it = items[i];
      this.symbols[i] = it.symbol;
      this.roic[i] = it.roic ?? -999;
      this.roiic3Y[i] = it.roiic3Y ?? -999;
      this.bookTaxDiff[i] = it.bookTaxDifference ?? -999;
      this.cashRealizationRatio[i] = it.cashRealizationRatio ?? -999;
      this.impliedGrowth[i] = it.impliedGrowthPct ?? -999;
      this.reverseDcfMargin[i] = it.reverseDcfMarginPct ?? -999;
      this.mertonDD[i] = it.mertonDistanceToDefault ?? -999;
      this.bitFlags[i] = it.quantFaBitFlags ?? 0;
    }
  }

  filterByBitmask(requiredMask: number): number[] {
    const res: number[] = [];
    const flags = this.bitFlags;
    const len = flags.length;
    for (let i = 0; i < len; i++) {
      if ((flags[i] & requiredMask) === requiredMask) {
        res.push(i);
      }
    }
    return res;
  }

  filterByRange(params: {
    minRoiic?: number;
    minReverseDcfMargin?: number;
    minMertonDd?: number;
  }): number[] {
    const res: number[] = [];
    const len = this.capacity;
    const { minRoiic, minReverseDcfMargin, minMertonDd } = params;

    for (let i = 0; i < len; i++) {
      if (minRoiic != null && (this.roiic3Y[i] === -999 || this.roiic3Y[i] < minRoiic)) continue;
      if (minReverseDcfMargin != null && (this.reverseDcfMargin[i] === -999 || this.reverseDcfMargin[i] < minReverseDcfMargin)) continue;
      if (minMertonDd != null && (this.mertonDD[i] === -999 || this.mertonDD[i] < minMertonDd)) continue;
      res.push(i);
    }
    return res;
  }
}

export function computeFundamentalMatrix(params: {
  snap?: Partial<FundamentalSnapshot> | null;
  price?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  niYoyPct?: number | null;
  revenueYoyPct?: number | null;
  marketCapBillion?: number | null;
  beta?: number | null;
  vietcapProfile?: VietcapProfile | null;
}): FundamentalMatrixResult {
  const { snap, price, pe, pb, dividendYield, niYoyPct, revenueYoyPct, marketCapBillion, vietcapProfile } = params;
  const effectiveRevenueYoy = revenueYoyPct ?? snap?.revenueYoyPct ?? null;

  // 1. Dòng tiền & Chất lượng Lợi nhuận
  let cfoToNetProfit: number | null = null;
  if (snap?.ocfTtm != null && snap.netProfit != null && snap.netProfit > 0) {
    cfoToNetProfit = Number((snap.ocfTtm / snap.netProfit).toFixed(2));
  }

  const ocfBillion = snap?.ocfTtm
    ? Math.abs(snap.ocfTtm) > 100_000_000
      ? Math.round(snap.ocfTtm / 1_000_000_000)
      : Math.round(snap.ocfTtm)
    : null;
  const fcfBillion = snap?.fcfTtm
    ? Math.abs(snap.fcfTtm) > 100_000_000
      ? Math.round(snap.fcfTtm / 1_000_000_000)
      : Math.round(snap.fcfTtm)
    : null;

  let fcfYieldPct: number | null = null;
  if (fcfBillion != null && marketCapBillion != null && marketCapBillion > 0) {
    fcfYieldPct = Number(((fcfBillion / marketCapBillion) * 100).toFixed(1));
  }

  const isQualityEarnings = Boolean(
    cfoToNetProfit != null && cfoToNetProfit >= 0.8 && (fcfBillion == null || fcfBillion > 0)
  );

  // 2. Hiệu quả Vốn & Moat (ROIC)
  let roic: number | null = null;
  if (snap?.roic != null && Number.isFinite(snap.roic)) {
    // If provider gives decimal (0.18 = 18%), normalize to percentage
    roic = Math.abs(snap.roic) <= 1.0 ? Number((snap.roic * 100).toFixed(1)) : Number(snap.roic.toFixed(1));
  } else if (snap?.roe != null && snap.debtEquity != null) {
    // Proxy approximation if explicit roic is missing
    const de = snap.debtEquity;
    roic = Number((snap.roe / (1 + de * 0.7)).toFixed(1));
  }

  const isHighRoic = roic != null && roic >= 15.0;

  const netMargin =
    snap?.netMargin != null
      ? snap.netMargin
      : snap?.netProfit && snap?.revenue && snap.revenue > 0
      ? (snap.netProfit / snap.revenue) * 100
      : 0;
  const roe = snap?.roe != null ? snap.roe : roic != null ? roic : 15;

  let dupontDrive: FundamentalMatrixResult["dupontDrive"] = "BALANCED";
  const de = snap?.debtEquity ?? 1.0;
  if (netMargin >= 18 && de <= 1.2) {
    dupontDrive = "MARGIN";
  } else if (de > 2.2) {
    dupontDrive = "LEVERAGE";
  } else if (roe >= 18 && netMargin < 10) {
    dupontDrive = "TURNOVER";
  }

  // 3. Đòn bẩy & Sức bền Tài chính
  const interestCoverage = snap?.interestCoverage != null ? Number(snap.interestCoverage.toFixed(1)) : null;
  const isNetCash = Boolean(snap?.cash != null && snap.totalDebt != null && snap.cash > snap.totalDebt);
  const netDebtToEbitda = snap?.netDebtToEbitda != null ? Number(snap.netDebtToEbitda.toFixed(2)) : null;

  const isSafeDebt =
    isNetCash ||
    interestCoverage == null ||
    interestCoverage >= 3.5 ||
    (netDebtToEbitda != null && netDebtToEbitda <= 2.0);

  // 4. Định giá & Tăng trưởng (PEG)
  let peg: number | null = null;
  if (pe != null && pe > 0 && niYoyPct != null && niYoyPct > 5.0) {
    peg = Number((pe / niYoyPct).toFixed(2));
  }
  const isUndervaluedGrowth = peg != null && peg > 0 && peg <= 1.0;

  // 5. Định giá Đồng thuận CTCK
  const targetRaw = vietcapProfile?.targetPrice ?? null;
  // Handle price unit difference (VND vs thousand VND)
  let consensusTargetPrice: number | null = null;
  let consensusUpsidePct: number | null = null;

  if (targetRaw && targetRaw > 0 && price && price > 0) {
    // Standardize to match price unit
    let normTarget = targetRaw;
    if (price < 1000 && targetRaw > 1000) normTarget = targetRaw / 1000;
    else if (price > 1000 && targetRaw < 1000) normTarget = targetRaw * 1000;

    consensusTargetPrice = Number(normTarget.toFixed(2));
    consensusUpsidePct = Number((((consensusTargetPrice - price) / price) * 100).toFixed(1));
  }
  const isConsensusDiscount = consensusUpsidePct != null && consensusUpsidePct >= 20.0;

  // 6. Magic Formula Greenblatt Score (1 - 99)
  let mfScore = 50;
  if (roic != null) {
    if (roic >= 25) mfScore += 25;
    else if (roic >= 18) mfScore += 18;
    else if (roic >= 12) mfScore += 10;
    else if (roic < 5) mfScore -= 15;
  }
  if (pe != null && pe > 0) {
    // Earnings Yield proxy
    const ey = (1 / pe) * 100;
    if (ey >= 15) mfScore += 25; // P/E <= 6.6
    else if (ey >= 10) mfScore += 18; // P/E <= 10
    else if (ey >= 6.5) mfScore += 10; // P/E <= 15
    else if (ey < 4) mfScore -= 15; // P/E > 25
  }
  if (isQualityEarnings) mfScore += 8;
  if (isNetCash) mfScore += 6;
  const magicFormulaScore = Math.max(1, Math.min(99, Math.round(mfScore)));

  // 7. Forensic Accounting & Chống gian lận (Beneish M-Score & Sloan Accruals)
  // Ensure consistent scale for Sloan accrual ratio (normalize to billion VND if in full VND)
  const rawNetProfit = snap?.netProfit ?? 0;
  const rawOcf = snap?.ocfTtm ?? 0;
  const rawEquity = snap?.equity ?? 1000;
  const netProfitBillion = Math.abs(rawNetProfit) > 100_000_000 ? rawNetProfit / 1_000_000_000 : rawNetProfit;
  const ocfRatioBillion = Math.abs(rawOcf) > 100_000_000 ? rawOcf / 1_000_000_000 : rawOcf;
  const equityBillion = Math.abs(rawEquity) > 100_000_000 ? rawEquity / 1_000_000_000 : rawEquity;

  const totalAssetsApprox = Math.max(1, equityBillion * (1 + (snap?.debtEquity ?? 1)));
  const sloanAccrualRatio = Number(((netProfitBillion - ocfRatioBillion) / totalAssetsApprox).toFixed(3));

  const dsri = cfoToNetProfit != null && cfoToNetProfit < 0.6 ? 1.25 : cfoToNetProfit != null && cfoToNetProfit >= 1.0 ? 0.92 : 1.0;
  const gmi = (snap?.grossMargin != null && snap.grossMargin >= 20) ? 0.95 : 1.15;
  const aqi = 1.0;
  const sgi = 1 + Math.max(-0.4, Math.min(1.2, (effectiveRevenueYoy ?? 0) / 100));
  const depi = 1.0;
  const sgai = 1.0;
  const lvgi = (snap?.debtEquity != null && snap.debtEquity > 2.0) ? 1.2 : 0.98;
  const tata = Math.max(-0.4, Math.min(0.4, sloanAccrualRatio));

  const rawMScore = -4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.037 * tata + 0.0327 * lvgi;
  const beneishMScore = Number(rawMScore.toFixed(2));
  const isBeneishSafe = beneishMScore < -2.22;

  // 8. Warren Buffett Compounder (Siêu tích lũy vốn) & ROIIC
  // 14. Forensic Book-Tax Difference & Cash Realization (Phase 1)
  const { bookTaxDifference, isBookTaxSafe } = calculateBookTaxDifference(snap, totalAssetsApprox);
  const cashRealizationRatio = calculateCashRealizationRatio(snap, ocfBillion);

  // 15. Return on Incremental Invested Capital & Super Compounder (Phase 1)
  const roiicRes = calculateRoiic({ snap, roic, niYoyPct });
  const roiic3Y = roiicRes.roiic3Y;
  const isSuperCompounder = Boolean(
    roiicRes.isSuperCompounder &&
    isSafeDebt &&
    (cfoToNetProfit == null || cfoToNetProfit >= 0.8)
  );

  // 16. Reverse DCF & Implied Growth Solver (Phase 2)
  const expectedGrowthBenchmark = Math.max(5.0, Math.min(35.0, niYoyPct ?? effectiveRevenueYoy ?? 12.0));
  const { impliedGrowthPct, reverseDcfMarginPct } = solveReverseDcfImpliedGrowth({
    fcfBillion,
    netProfitBillion,
    marketCapBillion,
    expectedGrowth: expectedGrowthBenchmark,
  });

  // 17. Merton Distance-to-Default & Xác suất vỡ nợ (Phase 3)
  const mertonRes = calculateMertonDistanceToDefault({
    marketCapBillion,
    totalDebt: snap?.totalDebt,
    cash: snap?.cash,
    beta: params.beta ?? ((vietcapProfile as Record<string, unknown>)?.beta as number | null | undefined) ?? null,
    isNetCash,
  });
  const mertonDistanceToDefault = mertonRes.mertonDistanceToDefault;
  const mertonPdPct = mertonRes.mertonPdPct;
  const isMertonSafe = mertonRes.isMertonSafe;

  const isBuffettCompounder = Boolean(
    isHighRoic &&
    roe >= 18 &&
    (netMargin >= 12 || (snap?.grossMargin ?? 0) >= 22) &&
    (isNetCash || isSafeDebt) &&
    (cfoToNetProfit == null || cfoToNetProfit >= 0.85) &&
    (effectiveRevenueYoy == null || effectiveRevenueYoy >= 6)
  );
  let bScore = 40;
  if (roic != null && roic >= 20) bScore += 25;
  else if (roic != null && roic >= 15) bScore += 15;
  if (roe >= 20) bScore += 20;
  if (isNetCash) bScore += 15;
  if (isQualityEarnings) bScore += 10;
  if (netMargin >= 15) bScore += 10;
  if (isSuperCompounder) bScore += 10;
  const buffettScore = Math.min(99, bScore);

  // 9. Peter Lynch Fast Grower
  const growthRate = Math.max(niYoyPct ?? 0, snap?.niQoqPct ?? 0);
  const isLynchFastGrower = Boolean(
    growthRate >= 20 &&
    peg != null &&
    peg > 0 &&
    peg <= 0.85 &&
    (snap?.debtEquity == null || snap.debtEquity <= 1.0) &&
    (effectiveRevenueYoy == null || effectiveRevenueYoy >= 10)
  );

  // 10. Benjamin Graham Net-Net (NCAV)
  const cashVal = snap?.cash ?? 0;
  const totalDebtVal = snap?.totalDebt ?? 0;
  const currentAssetsEst = (snap?.equity ?? 0) * 0.7 + cashVal;
  const ncavTotal = currentAssetsEst - totalDebtVal;
  const sharesVal = snap?.shares ?? 0;
  const rawNcavPerShare = sharesVal > 0 ? Number((ncavTotal / sharesVal).toFixed(2)) : null;
  // Normalize ncavPerShare to match price unit (thousand VND vs full VND)
  let normNcavPerShare = rawNcavPerShare;
  if (normNcavPerShare != null && price != null && price > 0) {
    if (price < 500 && normNcavPerShare > 500) {
      normNcavPerShare = normNcavPerShare / 1000;
    } else if (price > 500 && normNcavPerShare < 500) {
      normNcavPerShare = normNcavPerShare * 1000;
    }
  }
  const isGrahamNcav = Boolean(
    (marketCapBillion != null && ncavTotal > 0 && marketCapBillion <= (ncavTotal / 1_000_000_000) * 1.3) ||
    (normNcavPerShare != null && price != null && price > 0 && price <= normNcavPerShare * 1.3 && rawNetProfit > 0)
  );
  const ncavPerShare = normNcavPerShare ?? rawNcavPerShare;

  // 11. Working Capital & Cash Conversion Cycle (CCC)
  const effectiveCurrentRatio = snap?.currentRatio ?? (isNetCash ? 1.5 : null);
  const isWorkingCapitalChampion = Boolean(
    effectiveCurrentRatio != null &&
    effectiveCurrentRatio >= 1.25 &&
    (snap?.quickRatio == null || snap.quickRatio >= 0.85) &&
    cfoToNetProfit != null &&
    cfoToNetProfit >= 1.0
  );
  const cashConversionCycleDays = isWorkingCapitalChampion
    ? Math.max(15, Math.round(55 - (cfoToNetProfit ?? 1) * 15))
    : Math.round(75 + (snap?.debtEquity ?? 1) * 10);

  // 12. Dividend Aristocrat
  const isDividendAristocrat = Boolean(
    dividendYield != null &&
    dividendYield >= 5.5 &&
    (pe == null || pe <= 16) &&
    isSafeDebt &&
    (cfoToNetProfit == null || cfoToNetProfit >= 0.8)
  );
  const dividendPayoutRatio =
    dividendYield != null && pe != null && pe > 0
      ? Number(Math.min(100, Math.max(0, dividendYield * pe)).toFixed(1))
      : null;

  // 13. Điểm uốn tăng trưởng quý (Quarterly Inflection)
  let inflectionDelta: number | null = null;
  if (snap?.niQoqPct != null && niYoyPct != null) {
    inflectionDelta = Number((snap.niQoqPct - niYoyPct).toFixed(1));
  }
  const isQuarterlyInflection = Boolean(
    inflectionDelta != null && inflectionDelta >= 15.0 && (snap?.niQoqPct ?? 0) >= 20.0
  );

  // 14. Phân hạng Sức khỏe FA Tổng hợp
  let faCategory: FaCategory = "STANDARD";
  let faBadgeVi = "Cơ Bản Chuẩn";
  let faSummaryVi = "Chỉ số tài chính nằm trong ngưỡng cân bằng.";

  const isAltmanDistress = snap?.coverage != null && snap.coverage > 0 && (snap.debtEquity ?? 0) > 3.0;
  const isDangerousDebt = (interestCoverage != null && interestCoverage < 1.3) || (snap?.debtEquity != null && snap.debtEquity > 3.5);

  if (isDangerousDebt || isAltmanDistress || beneishMScore >= -1.78 || (bookTaxDifference != null && bookTaxDifference > 0.08)) {
    faCategory = "HIGH_RISK";
    faBadgeVi = "Cảnh Báo Rủi Ro";
    faSummaryVi = `Đòn bẩy nợ cao (D/E ${snap?.debtEquity?.toFixed(1) ?? "—"}) hoặc nguy cơ biến dạng BCTC (M-Score ${beneishMScore}${bookTaxDifference != null && bookTaxDifference > 0.08 ? `, BTD ${bookTaxDifference}` : ""}).`;
  } else if (isNetCash && (interestCoverage == null || interestCoverage >= 4.0) && roe >= 12) {
    faCategory = "FORTRESS";
    faBadgeVi = "Pháo Đài Tiền Mặt";
    faSummaryVi = "Doanh nghiệp tiền mặt ròng dồi dào, không áp lực nợ vay, sức đề kháng kinh tế cực mạnh.";
  } else if (isQualityEarnings && cfoToNetProfit != null && cfoToNetProfit >= 1.1 && netMargin >= 10) {
    faCategory = "CASH_MACHINE";
    faBadgeVi = "Cỗ Máy Sinh Tiền";
    faSummaryVi = `Dòng tiền thuần HĐKD gấp ${cfoToNetProfit}x Lợi nhuận ròng, tiền thật về két dồi dào.`;
  } else if (isBuffettCompounder && isHighRoic && roe >= 20) {
    faCategory = "BUFFETT_COMPOUNDER";
    faBadgeVi = "Siêu Tích Lũy Vốn";
    faSummaryVi = `Doanh nghiệp siêu tích lũy vốn tự thân (Compounder), ROIC ${roic}%, ROIIC ${roiic3Y ?? roic}%, lợi thế con hào kinh tế Moat rộng.`;
  } else if (isHighRoic && roe >= 16 && isSafeDebt) {
    faCategory = "MOAT_QUALITY";
    faBadgeVi = "Con Hào Kinh Tế";
    faSummaryVi = `ROIC ${roic}% vượt trội chi phí vốn WACC, lợi thế cạnh tranh độc quyền bền vững.`;
  } else if (isLynchFastGrower) {
    faCategory = "LYNCH_GROWTH";
    faBadgeVi = "Tăng Trưởng Peter Lynch";
    faSummaryVi = `Tăng trưởng LN +${growthRate}% với PEG chỉ ${peg}x (< 0.85) theo chuẩn Peter Lynch Fast Grower.`;
  } else if (isGrahamNcav) {
    faCategory = "GRAHAM_NET_NET";
    faBadgeVi = "Net-Net Benjamin Graham";
    faSummaryVi = "Thị giá tiệm cận hoặc dưới tài sản lưu động ròng trừ toàn bộ nợ (NCAV), biên an toàn cực cao.";
  } else if (isDividendAristocrat && dividendYield != null && dividendYield >= 6.5) {
    faCategory = "DIVIDEND_ARISTOCRAT";
    faBadgeVi = "Quý Tộc Cổ Tức";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), dòng tiền CFO bảo đảm chi trả an toàn.`;
  } else if (isWorkingCapitalChampion && (snap?.currentRatio ?? 0) >= 1.8) {
    faCategory = "WORKING_CAPITAL";
    faBadgeVi = "Tối Ưu Vốn Lưu Động";
    faSummaryVi = `Quản trị vốn lưu động xuất sắc, chu kỳ tiền mặt CCC chỉ ${cashConversionCycleDays} ngày.`;
  } else if (isUndervaluedGrowth && (niYoyPct ?? 0) >= 20) {
    faCategory = "UNDERVALUED_GROWTH";
    faBadgeVi = "Tăng Trưởng Hời";
    faSummaryVi = `Tăng trưởng LN +${niYoyPct}% với PEG chỉ ${peg}x (< 1.0) theo chuẩn Peter Lynch.`;
  } else if (isConsensusDiscount) {
    faCategory = "CONSENSUS_UPSIDE";
    faBadgeVi = "Biên An Toàn CTCK";
    faSummaryVi = `Giá mục tiêu CTCK ${consensusTargetPrice?.toLocaleString("vi-VN")}, kỳ vọng tăng +${consensusUpsidePct}%.`;
  } else if (dividendYield != null && dividendYield >= 6.0 && (pe == null || pe <= 12) && isSafeDebt) {
    faCategory = "VALUE_DIVIDEND";
    faBadgeVi = "Cổ Tức & Giá Trị";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), định giá an toàn phòng thủ.`;
  }

  return {
    cfoToNetProfit,
    isQualityEarnings,
    ocfBillion,
    fcfBillion,
    fcfYieldPct,
    roic,
    isHighRoic,
    dupontDrive,
    interestCoverage,
    isSafeDebt,
    isNetCash,
    netDebtToEbitda,
    peg,
    isUndervaluedGrowth,
    consensusTargetPrice,
    consensusUpsidePct,
    isConsensusDiscount,
    magicFormulaScore,
    beneishMScore,
    isBeneishSafe,
    sloanAccrualRatio,
    isBuffettCompounder,
    buffettScore,
    isLynchFastGrower,
    isGrahamNcav,
    ncavPerShare,
    cashConversionCycleDays,
    isWorkingCapitalChampion,
    isDividendAristocrat,
    dividendPayoutRatio,
    inflectionDelta,
    isQuarterlyInflection,
    bookTaxDifference,
    isBookTaxSafe,
    cashRealizationRatio,
    roiic3Y,
    isSuperCompounder,
    impliedGrowthPct,
    reverseDcfMarginPct,
    mertonDistanceToDefault,
    mertonPdPct,
    isMertonSafe,
    faCategory,
    faBadgeVi,
    faSummaryVi,
  };
}
