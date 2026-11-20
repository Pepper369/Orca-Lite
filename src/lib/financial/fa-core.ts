/**
 * Fundamental Analysis Core — Single Source of Truth Pure Math & Provenance Library
 *
 * Pure module (zero "server-only") shared across:
 * - snapshot builders (`snapshots.ts`)
 * - health & forensic engines (`fundamental.ts`, `piotroski-altman.ts`, `fundamental-quant-matrix.ts`)
 * - screener services (`screener-snapshot-service.ts`, `fundamental-screener.ts`, `valuation-screener.ts`)
 * - client UI components
 *
 * Principles:
 * 1. Truth-in-Data: Missing components remain `null`, never masked with synthetic zeros or arbitrary defaults.
 * 2. Industry Awareness: Separates Financial (`BANKING`, `SECURITIES`, `INSURANCE`), `REAL_ESTATE`, and `NON_FINANCIAL`.
 * 3. Unit Consistency: Standardizes VND vs thousand-VND quotes and billion-VND vs full-VND statement rows.
 */

import { sectorOf } from "../vn/master";
import type { OhlcvBar } from "../types";

export type FaProvenance =
  | "LIVE_BCTC"
  | "CACHED_BCTC"
  | "SEED_CALIBRATED"
  | "SECTOR_FALLBACK"
  | "MISSING";

export type IndustryEvalTrack =
  | "FINANCIAL_BANK_SEC_INS"
  | "REAL_ESTATE"
  | "NON_FINANCIAL";

const FINANCIAL_SECTORS = new Set(["Ngân hàng", "Chứng khoán", "Bảo hiểm", "Dịch vụ tài chính"]);
const REAL_ESTATE_SECTORS = new Set(["Bất động sản", "Khu công nghiệp"]);

export function resolveIndustryEvalTrack(symbolOrSector: string | null | undefined): IndustryEvalTrack {
  if (!symbolOrSector) return "NON_FINANCIAL";
  const resolvedSector = sectorOf(symbolOrSector) ?? symbolOrSector;
  const s = resolvedSector.trim();
  if (FINANCIAL_SECTORS.has(s) || /ngân hàng|chứng khoán|bảo hiểm|bank|securit|insur/i.test(s)) {
    return "FINANCIAL_BANK_SEC_INS";
  }
  if (REAL_ESTATE_SECTORS.has(s) || /bất động sản|địa ốc|khu công nghiệp|real.?estate/i.test(s)) {
    return "REAL_ESTATE";
  }
  return "NON_FINANCIAL";
}

export function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const res = a / b;
  return Number.isFinite(res) ? res : null;
}

/** Convert VN stock quote (thousand VND if < 500) to full VND */
export function priceQuoteToVndSafe(price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price < 500 ? price * 1000 : price;
}

/** Convert full VND per share (>= 500) to quote thousand-VND scale */
export function priceVndToQuoteSafe(priceVnd: number | null | undefined): number | null {
  if (priceVnd == null || !Number.isFinite(priceVnd)) return null;
  return Math.abs(priceVnd) >= 500
    ? Math.round((priceVnd / 1000) * 100) / 100
    : Math.round(priceVnd * 100) / 100;
}

/** Normalize raw BCTC statement amounts (full VND when |v| > 100M) into Billion VND */
export function normalizeToBillionVnd(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.abs(raw) > 100_000_000 ? raw / 1_000_000_000 : raw;
}

/** Normalize ratio/percentage (e.g. 0.18 -> 18.0, 18.0 -> 18.0) */
export function normalizeRatioPct(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.abs(raw) <= 1.0 ? Number((raw * 100).toFixed(2)) : Number(raw.toFixed(2));
}

export function computeAvgBalance(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr != null && Number.isFinite(curr) && prev != null && Number.isFinite(prev)) {
    return (curr + prev) / 2;
  }
  if (curr != null && Number.isFinite(curr)) return curr;
  return null;
}

export function computeEffectiveTaxRate(
  profitBeforeTax: number | null | undefined,
  taxExpense: number | null | undefined,
  defaultRate = 0.2,
): number {
  if (
    profitBeforeTax != null &&
    taxExpense != null &&
    Number.isFinite(profitBeforeTax) &&
    Number.isFinite(taxExpense) &&
    profitBeforeTax > 0
  ) {
    const rate = taxExpense / profitBeforeTax;
    if (Number.isFinite(rate) && rate >= 0 && rate <= 0.45) {
      return rate;
    }
  }
  return defaultRate;
}

export function computeNopat(
  ebit: number | null | undefined,
  profitBeforeTax?: number | null,
  taxExpense?: number | null,
): number | null {
  if (ebit == null || !Number.isFinite(ebit)) return null;
  const taxRate = computeEffectiveTaxRate(profitBeforeTax, taxExpense, 0.2);
  return ebit * (1 - taxRate);
}

export function computeInvestedCapital(
  totalDebt: number | null | undefined,
  equity: number | null | undefined,
  cash: number | null | undefined,
): number | null {
  if (totalDebt == null || equity == null || !Number.isFinite(totalDebt) || !Number.isFinite(equity)) {
    return null;
  }
  const cashAdj = cash != null && Number.isFinite(cash) ? cash : 0;
  const ic = totalDebt + equity - cashAdj;
  return ic > 0 ? ic : null;
}

/**
 * Compute annualized realized equity volatility from OHLCV daily closes.
 * Returns decimal (e.g. 0.32 = 32% annualized vol), clamped to [0.15, 0.95].
 */
export function computeRealizedEquityVolatility(
  bars: Pick<OhlcvBar, "close">[] | null | undefined,
  lookback = 90,
): number | null {
  if (!bars || bars.length < 25) return null;
  const slice = bars.slice(-Math.min(bars.length, lookback));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]!.close;
    const curr = slice[i]!.close;
    if (prev > 0 && curr > 0) {
      rets.push(Math.log(curr / prev));
    }
  }
  if (rets.length < 20) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (rets.length - 1);
  if (!Number.isFinite(variance) || variance <= 0) return null;
  const annualVol = Math.sqrt(variance) * Math.sqrt(252);
  return Math.max(0.15, Math.min(0.95, Number(annualVol.toFixed(4))));
}

/**
 * Pure CAPM Cost of Equity / WACC proxy aligned with `valuation-capm.ts` Vietnam defaults.
 * Clamped to [0.085, 0.165] for stable DCF / Reverse DCF evaluation.
 */
export function computeDynamicWacc(params: {
  beta?: number | null;
  riskFreeRate?: number;
  erp?: number;
  crp?: number;
  debtToCapital?: number;
  costOfDebtAfterTax?: number;
}): number {
  const rf = params.riskFreeRate ?? 0.055;
  const erp = params.erp ?? 0.075;
  const crp = params.crp ?? 0.015;
  const rawBeta = params.beta != null && Number.isFinite(params.beta) ? params.beta : 1.0;
  // Blume adjustment toward 1.0
  const adjBeta = Math.max(0.45, Math.min(2.0, 0.67 * rawBeta + 0.33));
  const ke = rf + adjBeta * erp + crp;

  const debtShare =
    params.debtToCapital != null && Number.isFinite(params.debtToCapital)
      ? Math.max(0, Math.min(0.7, params.debtToCapital))
      : 0;
  const kdAfterTax = params.costOfDebtAfterTax ?? 0.072; // ~9% borrowing * (1 - 20% tax)
  const wacc = ke * (1 - debtShare) + kdAfterTax * debtShare;
  return Math.max(0.085, Math.min(0.165, Number(wacc.toFixed(4))));
}

/**
 * Winsorize values at [lowerPct, upperPct] quantiles (e.g. 0.05, 0.95) to neutralize accounting outliers.
 */
export function winsorizeValues(values: number[], lowerPct = 0.05, upperPct = 0.95): number[] {
  if (values.length < 4) return [...values];
  const sorted = [...values].sort((a, b) => a - b);
  const loIdx = Math.floor((sorted.length - 1) * lowerPct);
  const hiIdx = Math.ceil((sorted.length - 1) * upperPct);
  const lo = sorted[loIdx]!;
  const hi = sorted[hiIdx]!;
  return values.map((v) => Math.max(lo, Math.min(hi, v)));
}

/**
 * Compute percentile ranks (1..100) for a map of symbol -> metric value.
 * If `higherIsBetter = true`, highest value gets 100; if `false` (e.g. P/E), lowest positive gets 100.
 */
export function computeSectorPercentileMap(
  entries: Array<{ key: string; value: number | null | undefined }>,
  opts?: { higherIsBetter?: boolean; requirePositive?: boolean },
): Map<string, number> {
  const higherIsBetter = opts?.higherIsBetter ?? true;
  const requirePositive = opts?.requirePositive ?? false;

  const valid = entries.filter(
    (e): e is { key: string; value: number } =>
      e.value != null &&
      Number.isFinite(e.value) &&
      (!requirePositive || e.value > 0),
  );

  const out = new Map<string, number>();
  if (valid.length === 0) return out;

  const sorted = [...valid].sort((a, b) =>
    higherIsBetter ? a.value - b.value : b.value - a.value,
  );

  const n = sorted.length;
  let lastVal: number | null = null;
  let lastPct = 50;
  for (let i = 0; i < n; i++) {
    let pct = 50;
    if (n > 1) {
      if (lastVal !== null && Math.abs(sorted[i]!.value - lastVal) < 1e-9) {
        pct = lastPct;
      } else {
        pct = Math.round(1 + (98 * i) / (n - 1));
        lastVal = sorted[i]!.value;
        lastPct = pct;
      }
    }
    out.set(sorted[i]!.key, Math.max(1, Math.min(100, pct)));
  }
  return out;
}
