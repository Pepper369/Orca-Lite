/**
 * Fundamental Quant Matrix Engine (Orca-Lite FA 2.0)
 *
 * Deterministic, Truth-in-Data quantitative fundamental analysis:
 * 1. Earnings Quality & Accruals Analysis (CFO / Net Profit, FCF Yield, Cash Realization OCF/EBITDA)
 * 2. Capital Efficiency & Economic Moat (ROIC, Multi-Year ROIIC ΔNOPAT/ΔIC, DuPont)
 * 3. Financial Fortress & Solvency (ICR, Net Cash, Realized-Vol Merton Distance-to-Default)
 * 4. Forensic Accounting (8-Var Beneish M-Score, Sloan Accruals, Book-Tax Difference)
 * 5. Working Capital (True DIO + DSO - DPO Cash Conversion Cycle & Graham NCAV)
 * 6. Enterprise-Consistent Reverse DCF (CAPM WACC & EV/FCFF or MarketCap/FCFE)
 * 7. Industry-Aware FA Master Classification
 */

import type { FundamentalSnapshot } from "../financial/snapshots";
import type { VietcapProfile } from "../providers/vietcap";
import {
  computeDynamicWacc,
  computeInvestedCapital,
  computeNopat,
  normalizeRatioPct,
  normalizeToBillionVnd,
  resolveIndustryEvalTrack,
  safeDiv,
  type IndustryEvalTrack,
} from "../financial/fa-core";

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
  industryTrack: IndustryEvalTrack;

  // 1. Dòng tiền & Chất lượng Lợi nhuận
  cfoToNetProfit: number | null;
  isQualityEarnings: boolean;
  ocfBillion: number | null;
  fcfBillion: number | null;
  fcfYieldPct: number | null;

  // 2. Hiệu quả Vốn & Moat
  roic: number | null;
  isHighRoic: boolean;
  dupontDrive: "MARGIN" | "TURNOVER" | "LEVERAGE" | "BALANCED";

  // 3. Đòn bẩy & Sức bền Tài chính
  interestCoverage: number | null;
  isSafeDebt: boolean;
  isNetCash: boolean;
  netDebtToEbitda: number | null;

  // 4. Định giá & Tăng trưởng
  peg: number | null;
  isUndervaluedGrowth: boolean;

  // 5. Định giá Đồng thuận CTCK
  consensusTargetPrice: number | null;
  consensusUpsidePct: number | null;
  isConsensusDiscount: boolean;

  // 6. Magic Formula Greenblatt Score (1 - 99)
  magicFormulaScore: number;

  // 7. Forensic Accounting & Chống gian lận (Beneish M-Score & Sloan Accruals)
  beneishMScore: number | null;
  beneishVarsAvailable: number;
  isBeneishSafe: boolean;
  sloanAccrualRatio: number | null;

  // 8. Warren Buffett Compounder
  isBuffettCompounder: boolean;
  buffettScore: number;

  // 9. Peter Lynch Fast Grower
  isLynchFastGrower: boolean;

  // 10. Benjamin Graham Net-Net (NCAV)
  isGrahamNcav: boolean;
  ncavPerShare: number | null;

  // 11. Working Capital & Cash Conversion Cycle (CCC = DIO + DSO - DPO)
  cashConversionCycleDays: number | null;
  dioDays: number | null;
  dsoDays: number | null;
  dpoDays: number | null;
  isWorkingCapitalChampion: boolean;

  // 12. Dividend Aristocrat
  isDividendAristocrat: boolean;
  dividendPayoutRatio: number | null;

  // 13. Điểm uốn tăng trưởng quý (Quarterly Inflection)
  inflectionDelta: number | null;
  isQuarterlyInflection: boolean;

  // 14. Forensic Book-Tax Difference & Cash Realization
  bookTaxDifference: number | null;
  isBookTaxSafe: boolean | null;
  cashRealizationRatio: number | null;

  // 15. Return on Incremental Invested Capital & Super Compounder
  roiic3Y: number | null;
  isSuperCompounder: boolean;

  // 16. Reverse DCF & Implied Growth Solver
  impliedGrowthPct: number | null;
  reverseDcfMarginPct: number | null;
  reverseDcfBasis: "EV_FCFF" | "MCAP_FCFE" | "UNAVAILABLE";
  waccUsedPct: number | null;

  // 17. Merton Distance-to-Default & Xác suất vỡ nợ
  mertonDistanceToDefault: number | null;
  mertonPdPct: number | null;
  isMertonSafe: boolean | null;

  // 18. Phân hạng Sức khỏe FA Tổng hợp
  faCategory: FaCategory;
  faBadgeVi: string;
  faSummaryVi: string;
}

/**
 * Forensic Book-Tax Difference: (Pretax Income - TaxExpense / 0.20) / Total Assets.
 * Truth-in-Data: Never fabricates pretax/tax or totalAssets=1000 when absent.
 */
export function calculateBookTaxDifference(
  snap?: Partial<FundamentalSnapshot> | null,
  totalAssetsFallback?: number | null,
): { bookTaxDifference: number | null; isBookTaxSafe: boolean | null } {
  if (!snap) return { bookTaxDifference: null, isBookTaxSafe: null };

  const pretaxBillion = normalizeToBillionVnd(snap.pretaxIncome);
  const taxBillion = normalizeToBillionVnd(snap.taxExpense);
  const assetsBillion =
    normalizeToBillionVnd(snap.totalAssets) ??
    (totalAssetsFallback != null && Number.isFinite(totalAssetsFallback) && totalAssetsFallback > 0
      ? normalizeToBillionVnd(totalAssetsFallback)
      : null);

  if (
    pretaxBillion == null ||
    taxBillion == null ||
    assetsBillion == null ||
    assetsBillion <= 0
  ) {
    return { bookTaxDifference: null, isBookTaxSafe: null };
  }

  // Vietnam corporate income tax statutory rate = 20%
  const btd = (pretaxBillion - taxBillion / 0.2) / assetsBillion;
  const bookTaxDifference = Number(btd.toFixed(3));
  const isBookTaxSafe = bookTaxDifference <= 0.04 && bookTaxDifference >= -0.08;

  return { bookTaxDifference, isBookTaxSafe };
}

/**
 * Operating Cash Flow / EBITDA. Returns null when genuine EBITDA > 0 is unavailable.
 */
export function calculateCashRealizationRatio(
  snap?: Partial<FundamentalSnapshot> | null,
  ocfBillion?: number | null,
): number | null {
  if (!snap) return null;
  const ebitdaBillion = normalizeToBillionVnd(snap.ebitdaTtm);
  const ocf = ocfBillion ?? normalizeToBillionVnd(snap.ocfTtm);

  if (ocf == null || ebitdaBillion == null || ebitdaBillion <= 0) return null;
  return Number((ocf / ebitdaBillion).toFixed(2));
}

/**
 * True Return on Incremental Invested Capital (ROIIC = ΔNOPAT / ΔInvestedCapital).
 * Uses precomputed `roiic3Y`, explicit `deltaNopat/deltaIc`, or `annualHistory`.
 * Never fabricates `roic * (1 + growth)` when incremental capital data is absent.
 */
export function calculateRoiic(params: {
  snap?: Partial<FundamentalSnapshot> | null;
  roic: number | null;
  niYoyPct?: number | null;
}): { roiic3Y: number | null; isSuperCompounder: boolean } {
  const { snap, roic } = params;
  let roiic3Y: number | null = null;

  if (snap?.roiic3Y != null && Number.isFinite(snap.roiic3Y)) {
    roiic3Y = Number(snap.roiic3Y.toFixed(1));
  } else if (
    snap?.deltaNopat != null &&
    snap?.deltaIc != null &&
    Number.isFinite(snap.deltaNopat) &&
    Number.isFinite(snap.deltaIc) &&
    snap.deltaIc > 0
  ) {
    roiic3Y = Number(Math.max(-100, Math.min(200, (snap.deltaNopat / snap.deltaIc) * 100)).toFixed(1));
  } else if (snap?.annualHistory && snap.annualHistory.length >= 2) {
    const newest = snap.annualHistory[0]!;
    const oldest = snap.annualHistory[Math.min(snap.annualHistory.length - 1, 3)]!;
    const nopatNew = computeNopat(newest.ebit, newest.profitBeforeTax, newest.taxExpense);
    const nopatOld = computeNopat(oldest.ebit, oldest.profitBeforeTax, oldest.taxExpense);
    const icNew = computeInvestedCapital(newest.totalDebt, newest.equity, newest.cash);
    const icOld = computeInvestedCapital(oldest.totalDebt, oldest.equity, oldest.cash);
    if (nopatNew != null && nopatOld != null && icNew != null && icOld != null) {
      const dIc = icNew - icOld;
      if (dIc > 0 && Math.abs(dIc) >= Math.max(1, icOld * 0.05)) {
        roiic3Y = Number(Math.max(-100, Math.min(200, ((nopatNew - nopatOld) / dIc) * 100)).toFixed(1));
      }
    }
  }

  const isSuperCompounder = Boolean(
    roiic3Y != null &&
    roiic3Y >= 25.0 &&
    roic != null &&
    roic >= 15.0,
  );

  return { roiic3Y, isSuperCompounder };
}

/**
 * Enterprise-Consistent Reverse DCF Implied Growth Solver.
 * - Rejects negative/missing FCF rather than masking with `netProfit * 0.85`.
 * - Uses Enterprise Value = MarketCap + NetDebt when debt & cash exist (FCFF basis).
 * - Uses dynamic CAPM WACC when explicit `wacc` is omitted.
 */
export function solveReverseDcfImpliedGrowth(params: {
  fcfBillion: number | null;
  netProfitBillion?: number | null;
  marketCapBillion: number | null;
  totalDebtBillion?: number | null;
  cashBillion?: number | null;
  beta?: number | null;
  wacc?: number;
  terminalGrowth?: number;
  expectedGrowth?: number | null;
}): {
  impliedGrowthPct: number | null;
  reverseDcfMarginPct: number | null;
  basis: "EV_FCFF" | "MCAP_FCFE" | "UNAVAILABLE";
  waccUsedPct: number | null;
} {
  const { fcfBillion, marketCapBillion, totalDebtBillion, cashBillion } = params;
  if (marketCapBillion == null || marketCapBillion <= 0 || fcfBillion == null || fcfBillion <= 0) {
    return { impliedGrowthPct: null, reverseDcfMarginPct: null, basis: "UNAVAILABLE", waccUsedPct: null };
  }

  let targetVal = marketCapBillion;
  let basis: "EV_FCFF" | "MCAP_FCFE" = "MCAP_FCFE";
  if (totalDebtBillion != null && cashBillion != null && Number.isFinite(totalDebtBillion) && Number.isFinite(cashBillion)) {
    const ev = marketCapBillion + totalDebtBillion - cashBillion;
    if (ev > 0) {
      targetVal = ev;
      basis = "EV_FCFF";
    }
  }

  const debtToCap =
    totalDebtBillion != null && totalDebtBillion > 0
      ? totalDebtBillion / (marketCapBillion + totalDebtBillion)
      : 0;
  const w = params.wacc ?? computeDynamicWacc({ beta: params.beta, debtToCapital: debtToCap });
  const gT = Math.min(params.terminalGrowth ?? 0.03, w - 0.015);
  const years = 5;

  function dcfVal(g: number): number {
    let pvForecast = 0;
    let cf_t = fcfBillion!;
    for (let t = 1; t <= years; t++) {
      cf_t *= 1 + g;
      pvForecast += cf_t / Math.pow(1 + w, t);
    }
    const terminalVal = (cf_t * (1 + gT)) / Math.max(0.01, w - gT);
    const pvTerminal = terminalVal / Math.pow(1 + w, years);
    return pvForecast + pvTerminal;
  }

  let low = -0.3;
  let high = 0.6;
  const valLow = dcfVal(low);
  const valHigh = dcfVal(high);

  let impliedG: number;
  if (targetVal <= valLow) {
    impliedG = low;
  } else if (targetVal >= valHigh) {
    impliedG = high;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      const v = dcfVal(mid);
      if (v < targetVal) {
        low = mid;
      } else {
        high = mid;
      }
    }
    impliedG = (low + high) / 2;
  }

  const impliedGrowthPct = Number((impliedG * 100).toFixed(1));
  const expG = params.expectedGrowth;
  const reverseDcfMarginPct = expG != null && Number.isFinite(expG)
    ? Number((expG - impliedGrowthPct).toFixed(1))
    : null;

  return {
    impliedGrowthPct,
    reverseDcfMarginPct,
    basis,
    waccUsedPct: Number((w * 100).toFixed(1)),
  };
}

/**
 * Merton Distance-to-Default using realized OHLCV equity volatility (when available).
 * Exempts Financial institutions (`BANKING | SECURITIES | INSURANCE`).
 */
export function calculateMertonDistanceToDefault(params: {
  marketCapBillion?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  beta?: number | null;
  realizedVolAnnual?: number | null;
  isNetCash?: boolean;
  industryTrack?: IndustryEvalTrack;
}): {
  mertonDistanceToDefault: number | null;
  mertonPdPct: number | null;
  isMertonSafe: boolean | null;
} {
  if (params.industryTrack === "FINANCIAL_BANK_SEC_INS") {
    return { mertonDistanceToDefault: null, mertonPdPct: null, isMertonSafe: null };
  }

  const { marketCapBillion, totalDebt, cash, beta, realizedVolAnnual, isNetCash } = params;
  const debtBillion = normalizeToBillionVnd(totalDebt) ?? 0;
  const cashBillion = normalizeToBillionVnd(cash) ?? 0;

  if (isNetCash || (totalDebt != null && debtBillion <= 0) || (cashBillion > 0 && cashBillion >= debtBillion && debtBillion > 0)) {
    return {
      mertonDistanceToDefault: 8.0,
      mertonPdPct: 0.001,
      isMertonSafe: true,
    };
  }

  if (marketCapBillion == null || marketCapBillion <= 0 || totalDebt == null) {
    return {
      mertonDistanceToDefault: null,
      mertonPdPct: null,
      isMertonSafe: null,
    };
  }

  const va = marketCapBillion + debtBillion;
  const d = Math.max(0.1, debtBillion);
  const sigmaE =
    realizedVolAnnual != null && Number.isFinite(realizedVolAnnual) && realizedVolAnnual > 0
      ? Math.max(0.15, Math.min(0.95, realizedVolAnnual))
      : beta != null && Number.isFinite(beta)
        ? Math.max(0.18, Math.min(0.75, beta * 0.28))
        : 0.32;
  const sigmaA = Math.max(0.08, Math.min(0.60, sigmaE * (marketCapBillion / va)));
  const r = 0.055; // VN 10Y risk-free baseline
  const T = 1.0;

  const numerator = Math.log(va / d) + (r - 0.5 * sigmaA * sigmaA) * T;
  const denominator = sigmaA * Math.sqrt(T);
  const rawDD = numerator / denominator;
  const mertonDistanceToDefault = Number(Math.max(-5.0, Math.min(10.0, rawDD)).toFixed(2));

  function stdNormCdf(x: number): number {
    const b1 = 0.31938153;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;

    if (x >= 0.0) {
      const t = 1.0 / (1.0 + p * x);
      return 1.0 - c * Math.exp((-x * x) / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    } else {
      const t = 1.0 / (1.0 - p * x);
      return c * Math.exp((-x * x) / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
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

/**
 * Vectorized TypedArray store using `NaN` as missing-value sentinel (no `-999` collision).
 */
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

  constructor(
    items: Array<{
      symbol: string;
      roic?: number | null;
      roiic3Y?: number | null;
      bookTaxDifference?: number | null;
      cashRealizationRatio?: number | null;
      impliedGrowthPct?: number | null;
      reverseDcfMarginPct?: number | null;
      mertonDistanceToDefault?: number | null;
      quantFaBitFlags?: number | null;
    }>,
  ) {
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
      const it = items[i]!;
      this.symbols[i] = it.symbol;
      this.roic[i] = it.roic ?? Number.NaN;
      this.roiic3Y[i] = it.roiic3Y ?? Number.NaN;
      this.bookTaxDiff[i] = it.bookTaxDifference ?? Number.NaN;
      this.cashRealizationRatio[i] = it.cashRealizationRatio ?? Number.NaN;
      this.impliedGrowth[i] = it.impliedGrowthPct ?? Number.NaN;
      this.reverseDcfMargin[i] = it.reverseDcfMarginPct ?? Number.NaN;
      this.mertonDD[i] = it.mertonDistanceToDefault ?? Number.NaN;
      this.bitFlags[i] = it.quantFaBitFlags ?? 0;
    }
  }

  filterByBitmask(requiredMask: number): number[] {
    const res: number[] = [];
    const flags = this.bitFlags;
    const len = flags.length;
    for (let i = 0; i < len; i++) {
      if ((flags[i]! & requiredMask) === requiredMask) {
        res.push(i);
      }
    }
    return res;
  }

  filterByRange(params: {
    minRoic?: number;
    minRoiic?: number;
    maxImpliedGrowth?: number;
    minReverseDcfMargin?: number;
    minMertonDd?: number;
  }): number[] {
    const res: number[] = [];
    const len = this.capacity;
    const { minRoic, minRoiic, maxImpliedGrowth, minReverseDcfMargin, minMertonDd } = params;

    for (let i = 0; i < len; i++) {
      if (minRoic != null) {
        const v = this.roic[i]!;
        if (Number.isNaN(v) || v < minRoic) continue;
      }
      if (minRoiic != null) {
        const v = this.roiic3Y[i]!;
        if (Number.isNaN(v) || v < minRoiic) continue;
      }
      if (maxImpliedGrowth != null) {
        const v = this.impliedGrowth[i]!;
        if (Number.isNaN(v) || v > maxImpliedGrowth) continue;
      }
      if (minReverseDcfMargin != null) {
        const v = this.reverseDcfMargin[i]!;
        if (Number.isNaN(v) || v < minReverseDcfMargin) continue;
      }
      if (minMertonDd != null) {
        const v = this.mertonDD[i]!;
        if (Number.isNaN(v) || v < minMertonDd) continue;
      }
      res.push(i);
    }
    return res;
  }
}

export function computeFundamentalMatrix(params: {
  snap?: Partial<FundamentalSnapshot> | null;
  symbol?: string;
  price?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  niYoyPct?: number | null;
  revenueYoyPct?: number | null;
  marketCapBillion?: number | null;
  beta?: number | null;
  realizedVolAnnual?: number | null;
  industryTrack?: IndustryEvalTrack;
  vietcapProfile?: VietcapProfile | null;
}): FundamentalMatrixResult {
  const { snap, price, pe, dividendYield, niYoyPct, revenueYoyPct, marketCapBillion, vietcapProfile } = params;
  const industryTrack =
    params.industryTrack ??
    snap?.industryTrack ??
    resolveIndustryEvalTrack(params.symbol ?? snap?.symbol);
  const isFinancial = industryTrack === "FINANCIAL_BANK_SEC_INS";
  const effectiveRevenueYoy = revenueYoyPct ?? snap?.revenueYoyPct ?? null;
  const effectiveNiYoy = niYoyPct ?? snap?.niYoyPct ?? null;

  // 1. Cash Flow & Earnings Quality
  let cfoToNetProfit: number | null = null;
  if (snap?.ocfTtm != null && snap.netProfit != null && snap.netProfit > 0) {
    cfoToNetProfit = Number((snap.ocfTtm / snap.netProfit).toFixed(2));
  }

  const ocfBillion = snap?.ocfTtm != null ? Math.round(normalizeToBillionVnd(snap.ocfTtm)!) : null;
  const fcfBillion = snap?.fcfTtm != null ? Math.round(normalizeToBillionVnd(snap.fcfTtm)!) : null;

  let fcfYieldPct: number | null = null;
  if (fcfBillion != null && marketCapBillion != null && marketCapBillion > 0) {
    fcfYieldPct = Number(((fcfBillion / marketCapBillion) * 100).toFixed(1));
  }

  const isQualityEarnings = Boolean(
    cfoToNetProfit != null && cfoToNetProfit >= 0.8 && (fcfBillion == null || fcfBillion > 0),
  );

  // 2. Capital Efficiency & Moat (ROIC)
  let roic: number | null = null;
  if (!isFinancial) {
    if (snap?.roic != null && Number.isFinite(snap.roic)) {
      roic = Number(normalizeRatioPct(snap.roic)!.toFixed(1));
    } else if (snap?.roe != null && snap.debtEquity != null && snap.debtEquity >= 0) {
      roic = Number((snap.roe / (1 + snap.debtEquity * 0.7)).toFixed(1));
    }
  }
  const isHighRoic = roic != null && roic >= 15.0;

  const netMargin =
    snap?.netMargin != null
      ? snap.netMargin
      : snap?.netProfit != null && snap?.revenue != null && snap.revenue > 0
        ? (snap.netProfit / snap.revenue) * 100
        : null;
  const roe = snap?.roe ?? roic ?? null;

  let dupontDrive: FundamentalMatrixResult["dupontDrive"] = "BALANCED";
  const de = snap?.debtEquity ?? null;
  if (netMargin != null && netMargin >= 18 && (de == null || de <= 1.2)) {
    dupontDrive = "MARGIN";
  } else if (de != null && de > 2.2) {
    dupontDrive = "LEVERAGE";
  } else if (roe != null && roe >= 18 && netMargin != null && netMargin < 10) {
    dupontDrive = "TURNOVER";
  }

  // 3. Leverage & Solvency
  const interestCoverage = snap?.interestCoverage != null ? Number(snap.interestCoverage.toFixed(1)) : null;
  const isNetCash = Boolean(
    !isFinancial && snap?.cash != null && snap.totalDebt != null && snap.cash > snap.totalDebt,
  );
  const netDebtToEbitda =
    !isFinancial && snap?.netDebtToEbitda != null ? Number(snap.netDebtToEbitda.toFixed(2)) : null;

  const isSafeDebt = isFinancial
    ? Boolean(roe != null && roe >= 8)
    : Boolean(
        isNetCash ||
          (interestCoverage != null && interestCoverage >= 3.5) ||
          (netDebtToEbitda != null && netDebtToEbitda <= 2.0) ||
          (interestCoverage == null && netDebtToEbitda == null && de != null && de >= 0 && de <= 1.2),
      );

  // 4. Growth at Reasonable Price (PEG)
  let peg: number | null = null;
  if (pe != null && pe > 0 && effectiveNiYoy != null && effectiveNiYoy > 5.0) {
    peg = Number((pe / effectiveNiYoy).toFixed(2));
  }
  const isUndervaluedGrowth = peg != null && peg > 0 && peg <= 1.0;

  // 5. Consensus Target Upside
  const targetRaw = vietcapProfile?.targetPrice ?? null;
  let consensusTargetPrice: number | null = null;
  let consensusUpsidePct: number | null = null;
  if (targetRaw && targetRaw > 0 && price && price > 0) {
    let normTarget = targetRaw;
    if (price < 1000 && targetRaw > 1000) normTarget = targetRaw / 1000;
    else if (price > 1000 && targetRaw < 1000) normTarget = targetRaw * 1000;
    consensusTargetPrice = Number(normTarget.toFixed(2));
    consensusUpsidePct = Number((((consensusTargetPrice - price) / price) * 100).toFixed(1));
  }
  const isConsensusDiscount = consensusUpsidePct != null && consensusUpsidePct >= 20.0;

  // 6. Greenblatt Magic Formula (1 - 99)
  let mfScore = 50;
  const yieldMetric = isFinancial ? roe : roic;
  if (yieldMetric != null) {
    if (yieldMetric >= 25) mfScore += 25;
    else if (yieldMetric >= 18) mfScore += 18;
    else if (yieldMetric >= 12) mfScore += 10;
    else if (yieldMetric < 5) mfScore -= 15;
  }
  if (pe != null && pe > 0) {
    const ey = (1 / pe) * 100;
    if (ey >= 15) mfScore += 25;
    else if (ey >= 10) mfScore += 18;
    else if (ey >= 6.5) mfScore += 10;
    else if (ey < 4) mfScore -= 15;
  }
  if (isQualityEarnings) mfScore += 8;
  if (isNetCash) mfScore += 6;
  const magicFormulaScore = Math.max(1, Math.min(99, Math.round(mfScore)));

  // 7. Forensic Accounting (True 8-Var Beneish M-Score & Sloan Accruals)
  const netProfitBillion = normalizeToBillionVnd(snap?.netProfit);
  const ocfNormBillion = normalizeToBillionVnd(snap?.ocfTtm);
  const assetsNormBillion =
    normalizeToBillionVnd(snap?.totalAssets) ??
    (snap?.equity != null && snap?.debtEquity != null
      ? Math.max(1, normalizeToBillionVnd(snap.equity)! * (1 + Math.max(0, snap.debtEquity)))
      : null);

  let sloanAccrualRatio: number | null = null;
  if (netProfitBillion != null && ocfNormBillion != null && assetsNormBillion != null && assetsNormBillion > 0) {
    sloanAccrualRatio = Number(((netProfitBillion - ocfNormBillion) / assetsNormBillion).toFixed(3));
  }

  let beneishMScore: number | null = null;
  let beneishVarsAvailable = 0;
  const hist = snap?.annualHistory ?? [];
  const curr = hist[0];
  const prev = hist[1];

  if (!isFinancial && curr && prev) {
    const revC = curr.revenue;
    const revP = prev.revenue;
    const dsri =
      curr.receivables != null && prev.receivables != null && revC && revP
        ? safeDiv(curr.receivables / revC, prev.receivables / revP)
        : null;
    const gmC = curr.grossProfit != null && revC ? curr.grossProfit / revC : null;
    const gmP = prev.grossProfit != null && revP ? prev.grossProfit / revP : null;
    const gmi = gmC != null && gmP != null && gmC > 0 ? gmP / gmC : null;
    const nonCurrC =
      curr.totalAssets && curr.currentAssets != null && curr.fixedAssets != null
        ? 1 - (curr.currentAssets + curr.fixedAssets) / curr.totalAssets
        : null;
    const nonCurrP =
      prev.totalAssets && prev.currentAssets != null && prev.fixedAssets != null
        ? 1 - (prev.currentAssets + prev.fixedAssets) / prev.totalAssets
        : null;
    const aqi = nonCurrC != null && nonCurrP != null && nonCurrP !== 0 ? nonCurrC / nonCurrP : null;
    const sgi = revC != null && revP != null && revP > 0 ? revC / revP : null;
    const levC = curr.totalDebt != null && curr.totalAssets ? curr.totalDebt / curr.totalAssets : null;
    const levP = prev.totalDebt != null && prev.totalAssets ? prev.totalDebt / prev.totalAssets : null;
    const lvgi = levC != null && levP != null && levP > 0 ? levC / levP : null;
    const tata =
      curr.netProfit != null && curr.ocf != null && curr.totalAssets
        ? (curr.netProfit - curr.ocf) / curr.totalAssets
        : sloanAccrualRatio;

    const components = [dsri, gmi, aqi, sgi, lvgi, tata];
    beneishVarsAvailable = components.filter((v) => v != null && Number.isFinite(v)).length;

    if (beneishVarsAvailable >= 3 && tata != null) {
      const clampIdx = (v: number | null, fallback = 1.0) =>
        v != null && Number.isFinite(v) ? Math.max(0.4, Math.min(2.5, v)) : fallback;
      const rawM =
        -4.84 +
        0.92 * clampIdx(dsri) +
        0.528 * clampIdx(gmi) +
        0.404 * clampIdx(aqi) +
        0.892 * clampIdx(sgi) +
        0.115 * 1.0 - // DEPI neutral when depreciation schedule unavailable
        0.172 * 1.0 + // SGAI neutral when SG&A split unavailable
        4.679 * Math.max(-0.4, Math.min(0.4, tata)) -
        0.327 * clampIdx(lvgi);
      beneishMScore = Number(rawM.toFixed(2));
    }
  }
  const isBeneishSafe = beneishMScore != null && beneishMScore < -2.22;

  // 14. Book-Tax Difference & Cash Realization
  const { bookTaxDifference, isBookTaxSafe } = calculateBookTaxDifference(snap, snap?.totalAssets);
  const cashRealizationRatio = calculateCashRealizationRatio(snap, ocfBillion);

  // 15. Multi-Year ROIIC & Super-Compounder
  const roiicRes = calculateRoiic({ snap, roic, niYoyPct: effectiveNiYoy });
  const roiic3Y = roiicRes.roiic3Y;
  const isSuperCompounder = Boolean(
    roiicRes.isSuperCompounder &&
      isSafeDebt &&
      (cfoToNetProfit == null || cfoToNetProfit >= 0.8),
  );

  // 16. Reverse DCF & Implied Growth Solver
  const expectedGrowthBenchmark =
    effectiveNiYoy ?? effectiveRevenueYoy ?? (roe != null ? Math.max(5, Math.min(25, roe * 0.65)) : null);
  const totalDebtBillion = normalizeToBillionVnd(snap?.totalDebt);
  const cashBillion = normalizeToBillionVnd(snap?.cash);
  const betaVal = params.beta ?? (vietcapProfile as { beta?: number | null } | null)?.beta ?? null;

  const rDcf = solveReverseDcfImpliedGrowth({
    fcfBillion,
    netProfitBillion,
    marketCapBillion,
    totalDebtBillion,
    cashBillion,
    beta: betaVal,
    expectedGrowth: expectedGrowthBenchmark,
  });

  // 17. Merton Distance-to-Default
  const mertonRes = calculateMertonDistanceToDefault({
    marketCapBillion,
    totalDebt: snap?.totalDebt,
    cash: snap?.cash,
    beta: betaVal,
    realizedVolAnnual: params.realizedVolAnnual,
    isNetCash,
    industryTrack,
  });

  // 8. Buffett Compounder
  const isBuffettCompounder = Boolean(
    isHighRoic &&
      roe != null &&
      roe >= 18 &&
      ((netMargin != null && netMargin >= 12) || (snap?.grossMargin != null && snap.grossMargin >= 22)) &&
      (isNetCash || isSafeDebt) &&
      (cfoToNetProfit == null || cfoToNetProfit >= 0.85) &&
      (effectiveRevenueYoy == null || effectiveRevenueYoy >= 6),
  );
  let bScore = 40;
  if (roic != null && roic >= 20) bScore += 25;
  else if (roic != null && roic >= 15) bScore += 15;
  if (roe != null && roe >= 20) bScore += 20;
  if (isNetCash) bScore += 15;
  if (isQualityEarnings) bScore += 10;
  if (netMargin != null && netMargin >= 15) bScore += 10;
  if (isSuperCompounder) bScore += 10;
  const buffettScore = Math.min(99, bScore);

  // 9. Peter Lynch Fast Grower
  const growthRate = Math.max(effectiveNiYoy ?? 0, snap?.niQoqPct ?? 0);
  const isLynchFastGrower = Boolean(
    growthRate >= 20 &&
      peg != null &&
      peg > 0 &&
      peg <= 0.85 &&
      (de == null || de <= 1.0) &&
      (effectiveRevenueYoy == null || effectiveRevenueYoy >= 10),
  );

  // 10. True Benjamin Graham Net-Net (NCAV = (Current Assets - Total Liabilities) / Shares)
  let normNcavPerShare: number | null = null;
  const sharesVal = snap?.shares ?? 0;
  const ca =
    snap?.currentAssets ??
    (snap?.cash != null && snap?.receivables != null && snap?.inventory != null
      ? snap.cash + snap.receivables + snap.inventory
      : null);
  const tl = snap?.totalLiabilities ?? null;
  if (!isFinancial && ca != null && tl != null && sharesVal > 0) {
    const ncavTotal = ca - tl;
    let rawNcavPs = Number((ncavTotal / sharesVal).toFixed(2));
    if (price != null && price > 0) {
      if (price < 500 && rawNcavPs > 500) rawNcavPs /= 1000;
      else if (price > 500 && rawNcavPs < 500) rawNcavPs *= 1000;
    }
    normNcavPerShare = Number(rawNcavPs.toFixed(2));
  }
  const isGrahamNcav = Boolean(
    normNcavPerShare != null &&
      normNcavPerShare > 0 &&
      price != null &&
      price > 0 &&
      price <= normNcavPerShare * 1.1 &&
      (netProfitBillion == null || netProfitBillion > 0),
  );

  // 11. Working Capital & True Cash Conversion Cycle (CCC = DIO + DSO - DPO)
  let dioDays: number | null = null;
  let dsoDays: number | null = null;
  let dpoDays: number | null = null;
  let cashConversionCycleDays: number | null = null;
  if (!isFinancial && snap?.revenue != null && snap.revenue > 0) {
    const cogs =
      snap.cogs ??
      (snap.grossMargin != null ? snap.revenue * (1 - snap.grossMargin / 100) : null);
    if (snap.inventory != null && cogs != null && cogs > 0) {
      dioDays = Math.round((snap.inventory / cogs) * 365);
    }
    if (snap.receivables != null) {
      dsoDays = Math.round((snap.receivables / snap.revenue) * 365);
    }
    if (snap.payables != null && cogs != null && cogs > 0) {
      dpoDays = Math.round((snap.payables / cogs) * 365);
    }
    if (dioDays != null || dsoDays != null) {
      cashConversionCycleDays = (dioDays ?? 0) + (dsoDays ?? 0) - (dpoDays ?? 0);
    }
  }
  const isWorkingCapitalChampion = Boolean(
    !isFinancial &&
      snap?.currentRatio != null &&
      snap.currentRatio >= 1.25 &&
      (snap.quickRatio == null || snap.quickRatio >= 0.85) &&
      cfoToNetProfit != null &&
      cfoToNetProfit >= 1.0 &&
      (cashConversionCycleDays == null || cashConversionCycleDays <= 65),
  );

  // 12. Dividend Aristocrat
  const isDividendAristocrat = Boolean(
    dividendYield != null &&
      dividendYield >= 5.5 &&
      (pe == null || pe <= 16) &&
      isSafeDebt &&
      (cfoToNetProfit == null || cfoToNetProfit >= 0.8),
  );
  const dividendPayoutRatio =
    dividendYield != null && pe != null && pe > 0
      ? Number(Math.min(100, Math.max(0, dividendYield * pe)).toFixed(1))
      : null;

  // 13. Quarterly Inflection
  let inflectionDelta: number | null = null;
  if (snap?.niQoqPct != null && effectiveNiYoy != null) {
    inflectionDelta = Number((snap.niQoqPct - effectiveNiYoy).toFixed(1));
  }
  const isQuarterlyInflection = Boolean(
    inflectionDelta != null && inflectionDelta >= 15.0 && (snap?.niQoqPct ?? 0) >= 20.0,
  );

  // 14. Master FA Health Category
  let faCategory: FaCategory = "STANDARD";
  let faBadgeVi = "Cơ Bản Chuẩn";
  let faSummaryVi = "Chỉ số tài chính nằm trong ngưỡng cân bằng.";

  const isAltmanDistress = !isFinancial && snap?.coverage != null && snap.coverage > 0 && (de ?? 0) > 3.0;
  const isDangerousDebt =
    !isFinancial &&
    ((interestCoverage != null && interestCoverage < 1.3) || (de != null && de > 3.5));

  if (
    isDangerousDebt ||
    isAltmanDistress ||
    (beneishMScore != null && beneishMScore >= -1.78) ||
    (bookTaxDifference != null && bookTaxDifference > 0.08)
  ) {
    faCategory = "HIGH_RISK";
    faBadgeVi = "Cảnh Báo Rủi Ro";
    faSummaryVi = `Đòn bẩy nợ cao hoặc tín hiệu biến dạng BCTC (${beneishMScore != null ? `M-Score ${beneishMScore}` : ""}${bookTaxDifference != null && bookTaxDifference > 0.08 ? `, BTD ${bookTaxDifference}` : ""}).`;
  } else if (isNetCash && (interestCoverage == null || interestCoverage >= 4.0) && (roe ?? 0) >= 12) {
    faCategory = "FORTRESS";
    faBadgeVi = "Pháo Đài Tiền Mặt";
    faSummaryVi = "Doanh nghiệp tiền mặt ròng dồi dào, không áp lực nợ vay, sức đề kháng kinh tế cực mạnh.";
  } else if (isQualityEarnings && cfoToNetProfit != null && cfoToNetProfit >= 1.1 && (netMargin ?? 0) >= 10) {
    faCategory = "CASH_MACHINE";
    faBadgeVi = "Cỗ Máy Sinh Tiền";
    faSummaryVi = `Dòng tiền thuần HĐKD gấp ${cfoToNetProfit}x Lợi nhuận ròng, tiền thật về két dồi dào.`;
  } else if (isBuffettCompounder && isHighRoic && (roe ?? 0) >= 20) {
    faCategory = "BUFFETT_COMPOUNDER";
    faBadgeVi = "Siêu Tích Lũy Vốn";
    faSummaryVi = `Compounder ROIC ${roic}%, ROIIC ${roiic3Y ?? "—"}%, con hào kinh tế bền vững.`;
  } else if (isHighRoic && (roe ?? 0) >= 16 && isSafeDebt) {
    faCategory = "MOAT_QUALITY";
    faBadgeVi = "Con Hào Kinh Tế";
    faSummaryVi = `ROIC ${roic}% vượt trội chi phí vốn WACC, lợi thế cạnh tranh bền vững.`;
  } else if (isLynchFastGrower) {
    faCategory = "LYNCH_GROWTH";
    faBadgeVi = "Tăng Trưởng Peter Lynch";
    faSummaryVi = `Tăng trưởng LN +${growthRate}% với PEG chỉ ${peg}x (< 0.85).`;
  } else if (isGrahamNcav) {
    faCategory = "GRAHAM_NET_NET";
    faBadgeVi = "Net-Net Benjamin Graham";
    faSummaryVi = "Thị giá dưới tài sản ngắn hạn trừ toàn bộ nợ phải trả (NCAV).";
  } else if (isDividendAristocrat && dividendYield != null && dividendYield >= 6.5) {
    faCategory = "DIVIDEND_ARISTOCRAT";
    faBadgeVi = "Quý Tộc Cổ Tức";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), dòng tiền CFO bảo đảm chi trả an toàn.`;
  } else if (isWorkingCapitalChampion && (snap?.currentRatio ?? 0) >= 1.8) {
    faCategory = "WORKING_CAPITAL";
    faBadgeVi = "Tối Ưu Vốn Lưu Động";
    faSummaryVi = `Quản trị vốn lưu động xuất sắc, chu kỳ tiền mặt CCC ${cashConversionCycleDays ?? "—"} ngày.`;
  } else if (isUndervaluedGrowth && (effectiveNiYoy ?? 0) >= 20) {
    faCategory = "UNDERVALUED_GROWTH";
    faBadgeVi = "Tăng Trưởng Hời";
    faSummaryVi = `Tăng trưởng LN +${effectiveNiYoy}% với PEG chỉ ${peg}x (< 1.0).`;
  } else if (isConsensusDiscount) {
    faCategory = "CONSENSUS_UPSIDE";
    faBadgeVi = "Biên An Toàn CTCK";
    faSummaryVi = `Giá mục tiêu CTCK ${consensusTargetPrice?.toLocaleString("vi-VN")}, kỳ vọng tăng +${consensusUpsidePct}%.`;
  } else if (dividendYield != null && dividendYield >= 6.0 && (pe == null || pe <= 12) && isSafeDebt) {
    faCategory = "VALUE_DIVIDEND";
    faBadgeVi = "Cổ Tức & Giá Trị";
    faSummaryVi = `Cổ tức tiền mặt cao (${dividendYield}%), định giá phòng thủ an toàn.`;
  }

  return {
    industryTrack,
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
    beneishVarsAvailable,
    isBeneishSafe,
    sloanAccrualRatio,
    isBuffettCompounder,
    buffettScore,
    isLynchFastGrower,
    isGrahamNcav,
    ncavPerShare: normNcavPerShare,
    cashConversionCycleDays,
    dioDays,
    dsoDays,
    dpoDays,
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
    impliedGrowthPct: rDcf.impliedGrowthPct,
    reverseDcfMarginPct: rDcf.reverseDcfMarginPct,
    reverseDcfBasis: rDcf.basis,
    waccUsedPct: rDcf.waccUsedPct,
    mertonDistanceToDefault: mertonRes.mertonDistanceToDefault,
    mertonPdPct: mertonRes.mertonPdPct,
    isMertonSafe: mertonRes.isMertonSafe,
    faCategory,
    faBadgeVi,
    faSummaryVi,
  };
}
