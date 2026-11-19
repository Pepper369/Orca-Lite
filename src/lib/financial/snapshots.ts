import "server-only";
import { WORKERS_BUDGET } from "../data-engine/workers-budget";
import { cached } from "../cache";
import { getFinancialPackage } from "./service";
import { hubFinancialPackage } from "../data-engine";
import { persistFinancialPackageAsync } from "./persist";
import type { FinancialPackage, NormalizedPeriod } from "./types";
import type { FinancialHealthResult } from "../engines/fundamental";
import type { GrowthSnapshot } from "./types";
import {
  computeInvestedCapital,
  computeNopat,
  resolveIndustryEvalTrack,
  type FaProvenance,
  type IndustryEvalTrack,
} from "./fa-core";

/**
 * Bulk fundamental snapshots — shared layer for screeners (Fundamental, CANSLIM, Valuation).
 * Default concurrency is Workers-safe (WORKERS_BUDGET.snapshotConcurrency).
 */

export type FaPeriodSlice = {
  period: string;
  year: number | null;
  quarter: number | null;
  revenue: number | null;
  cogs: number | null;
  grossProfit: number | null;
  ebit: number | null;
  ebitda: number | null;
  profitBeforeTax: number | null;
  taxExpense: number | null;
  netProfit: number | null;
  totalAssets: number | null;
  currentAssets: number | null;
  fixedAssets: number | null;
  receivables: number | null;
  inventory: number | null;
  currentLiabilities: number | null;
  totalLiabilities: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  totalDebt: number | null;
  equity: number | null;
  retainedEarnings: number | null;
  cash: number | null;
  ocf: number | null;
  capex: number | null;
  shares: number | null;
};

export type FundamentalSnapshot = {
  symbol: string;
  reportDate: string | null;
  roe: number | null;
  roa: number | null;
  ros: number | null;
  roic: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
  debtEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  interestCoverage: number | null;
  netDebtToEbitda: number | null;
  fcfTtm: number | null;
  ocfTtm: number | null;
  revenue: number | null;
  netProfit: number | null;
  equity: number | null;
  totalDebt: number | null;
  cash: number | null;
  shares: number | null;
  epsTtm: number | null;
  ebitdaTtm: number | null;
  pretaxIncome?: number | null;
  taxExpense?: number | null;
  totalAssets?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  totalLiabilities?: number | null;
  retainedEarnings?: number | null;
  inventory?: number | null;
  receivables?: number | null;
  payables?: number | null;
  fixedAssets?: number | null;
  cogs?: number | null;
  ebit?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  roiic3Y?: number | null;
  deltaNopat?: number | null;
  deltaIc?: number | null;
  annualHistory?: FaPeriodSlice[];
  quarterlyHistory?: FaPeriodSlice[];
  faProvenance?: FaProvenance;
  industryTrack?: IndustryEvalTrack;
  revenueYoyPct: number | null;
  niYoyPct: number | null;
  revenueQoqPct: number | null;
  niQoqPct: number | null;
  coverage: number;
  qualityScore: number | null;
  healthScore: number | null;
  hasGrowth: boolean;
  hasHealth: boolean;
};

export type PackageBundle = {
  symbol: string;
  pkg: FinancialPackage;
  health: FinancialHealthResult;
  growth: GrowthSnapshot | null;
  qualityScore: number | null;
};

const pct = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Number((v * 100).toFixed(2));

function growthPct(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  // computeGrowth stores changePct as a ratio (e.g. 4.0 = +400%), not as
  // mixed ratio/percent units. Always convert once at the snapshot boundary.
  return Number((raw * 100).toFixed(2));
}

function growthOf(g: GrowthSnapshot | null | undefined, metric: string, kind: "yoy" | "qoq"): number | null {
  if (!g) return null;
  const cell = (kind === "yoy" ? g.yoy : g.qoq).find((c) => c.metric === metric);
  return growthPct(cell?.changePct ?? null);
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()));
  return out;
}

export function normalizeSymbols(input: string[] | undefined, fallback: string[], max = 400): string[] {
  const src = input?.length ? input : fallback;
  return [
    ...new Set(
      src
        .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
        .filter((s) => s.length >= 2 && s.length <= 5),
    ),
  ].slice(0, Math.min(max, 1000));
}

function toPeriodSlice(p: NormalizedPeriod, sharesFallback: number | null): FaPeriodSlice {
  const m = p.metrics ?? {};
  const std = m.shortTermDebt ?? null;
  const ltd = m.longTermDebt ?? null;
  const totalDebt = std != null && ltd != null ? std + ltd : std ?? ltd ?? null;
  return {
    period: p.period,
    year: p.year ?? null,
    quarter: p.quarter ?? null,
    revenue: m.netRevenue ?? m.revenue ?? null,
    cogs: m.cogs ?? null,
    grossProfit: m.grossProfit ?? null,
    ebit: m.ebit ?? m.operatingProfit ?? null,
    ebitda: m.ebitda ?? null,
    profitBeforeTax: m.profitBeforeTax ?? null,
    taxExpense: m.taxExpense ?? null,
    netProfit: m.netIncome ?? m.netIncomeParent ?? null,
    totalAssets: m.totalAssets ?? null,
    currentAssets: m.currentAssets ?? null,
    fixedAssets: m.fixedAssets ?? null,
    receivables: m.receivables ?? null,
    inventory: m.inventory ?? null,
    currentLiabilities: m.currentLiabilities ?? null,
    totalLiabilities: m.totalLiabilities ?? null,
    shortTermDebt: std,
    longTermDebt: ltd,
    totalDebt,
    equity: m.equity ?? null,
    retainedEarnings: m.retainedEarnings ?? null,
    cash: m.cash ?? null,
    ocf: m.operatingCashFlow ?? null,
    capex: m.capex ?? null,
    shares: sharesFallback,
  };
}

function extractHistory(periods: NormalizedPeriod[] | undefined, sharesFallback: number | null): {
  annualHistory: FaPeriodSlice[];
  quarterlyHistory: FaPeriodSlice[];
} {
  if (!periods?.length) return { annualHistory: [], quarterlyHistory: [] };
  const annualMap = new Map<number, FaPeriodSlice>();
  const quarterMap = new Map<string, FaPeriodSlice>();

  for (const p of periods) {
    if (p.periodType === "year" && p.year != null && !annualMap.has(p.year)) {
      annualMap.set(p.year, toPeriodSlice(p, sharesFallback));
    } else if (p.periodType === "quarter" && p.year != null && p.quarter != null) {
      const k = `${p.year}-Q${p.quarter}`;
      if (!quarterMap.has(k)) quarterMap.set(k, toPeriodSlice(p, sharesFallback));
    }
  }

  const annualHistory = [...annualMap.values()]
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 4);
  const quarterlyHistory = [...quarterMap.values()]
    .sort((a, b) => ((b.year ?? 0) * 10 + (b.quarter ?? 0)) - ((a.year ?? 0) * 10 + (a.quarter ?? 0)))
    .slice(0, 8);

  return { annualHistory, quarterlyHistory };
}

export function buildSnapshotFromBundle(b: PackageBundle): FundamentalSnapshot {
  const h = b.health;
  const g = b.growth;
  const p = h.groups.profitability;
  const liq = h.groups.liquidity;
  const lev = h.groups.leverage;
  const cf = h.groups.cashflow;
  const a = h.anchors;
  const headMetrics = (b.pkg.ttm ?? b.pkg.periods?.[0])?.metrics;
  const { annualHistory, quarterlyHistory } = extractHistory(b.pkg.periods, a.shares ?? null);

  // Compute genuine multi-year ROIIC (2Y-3Y window) when annual history supports it
  let deltaNopat: number | null = null;
  let deltaIc: number | null = null;
  let roiic3Y: number | null = null;
  if (annualHistory.length >= 2) {
    const newest = annualHistory[0]!;
    const oldest = annualHistory[Math.min(annualHistory.length - 1, 3)]!;
    const nopatNew = computeNopat(newest.ebit, newest.profitBeforeTax, newest.taxExpense);
    const nopatOld = computeNopat(oldest.ebit, oldest.profitBeforeTax, oldest.taxExpense);
    const icNew = computeInvestedCapital(newest.totalDebt, newest.equity, newest.cash);
    const icOld = computeInvestedCapital(oldest.totalDebt, oldest.equity, oldest.cash);
    if (nopatNew != null && nopatOld != null && icNew != null && icOld != null) {
      const dNopat = nopatNew - nopatOld;
      const dIc = icNew - icOld;
      // Denominator stability guard: |deltaIc| >= 5% of base invested capital
      if (Math.abs(dIc) >= Math.max(1, icOld * 0.05) && dIc > 0) {
        deltaNopat = dNopat;
        deltaIc = dIc;
        roiic3Y = Number(Math.max(-100, Math.min(200, (dNopat / dIc) * 100)).toFixed(1));
      }
    }
  }

  const currentLiabilities = headMetrics?.currentLiabilities ?? null;
  const shortTermDebt = headMetrics?.shortTermDebt ?? null;
  const payablesProxy =
    currentLiabilities != null && shortTermDebt != null && currentLiabilities >= shortTermDebt
      ? currentLiabilities - shortTermDebt
      : null;

  return {
    symbol: b.symbol,
    reportDate: b.pkg.meta.latestPeriod ?? null,
    roe: pct(p.roe),
    roa: pct(p.roa),
    ros: pct(p.netMargin),
    roic: pct(p.roic),
    grossMargin: pct(p.grossMargin),
    netMargin: pct(p.netMargin),
    operatingMargin: pct(p.operatingMargin),
    debtEquity: lev.debtToEquity != null ? Number(lev.debtToEquity.toFixed(2)) : null,
    currentRatio: liq.currentRatio != null ? Number(liq.currentRatio.toFixed(2)) : null,
    quickRatio: liq.quickRatio != null ? Number(liq.quickRatio.toFixed(2)) : null,
    interestCoverage: lev.interestCoverage != null ? Number(lev.interestCoverage.toFixed(2)) : null,
    netDebtToEbitda: lev.netDebtToEbitda != null ? Number(lev.netDebtToEbitda.toFixed(2)) : null,
    fcfTtm: cf.fcfTtm ?? null,
    ocfTtm: cf.ocfTtm ?? null,
    revenue: a.revenue,
    netProfit: a.netProfit,
    equity: a.equity,
    totalDebt: a.totalDebt,
    cash: a.cash,
    shares: a.shares,
    epsTtm: a.epsTtm,
    ebitdaTtm: a.ebitdaTtm,
    pretaxIncome: headMetrics?.profitBeforeTax ?? null,
    taxExpense: headMetrics?.taxExpense ?? null,
    totalAssets: headMetrics?.totalAssets ?? null,
    currentAssets: headMetrics?.currentAssets ?? null,
    currentLiabilities,
    totalLiabilities: headMetrics?.totalLiabilities ?? null,
    retainedEarnings: headMetrics?.retainedEarnings ?? null,
    inventory: headMetrics?.inventory ?? null,
    receivables: headMetrics?.receivables ?? null,
    payables: payablesProxy,
    fixedAssets: headMetrics?.fixedAssets ?? null,
    cogs: headMetrics?.cogs ?? null,
    ebit: headMetrics?.ebit ?? headMetrics?.operatingProfit ?? null,
    shortTermDebt,
    longTermDebt: headMetrics?.longTermDebt ?? null,
    roiic3Y,
    deltaNopat,
    deltaIc,
    annualHistory,
    quarterlyHistory,
    faProvenance: h.coverage > 0 ? "LIVE_BCTC" : "MISSING",
    industryTrack: resolveIndustryEvalTrack(b.symbol),
    revenueYoyPct: growthOf(g, "revenue", "yoy") ?? growthOf(g, "netRevenue", "yoy"),
    niYoyPct: growthOf(g, "netIncome", "yoy") ?? growthOf(g, "netIncomeParent", "yoy"),
    revenueQoqPct: growthOf(g, "revenue", "qoq") ?? growthOf(g, "netRevenue", "qoq"),
    niQoqPct: growthOf(g, "netIncome", "qoq") ?? growthOf(g, "netIncomeParent", "qoq"),
    coverage: h.coverage,
    qualityScore: b.qualityScore,
    healthScore: h.scores.overall,
    hasGrowth: Boolean(g && (g.yoy.length || g.qoq.length)),
    hasHealth: h.coverage > 0,
  };
}

export async function getFinancialPackagesBulk(
  symbols: string[],
  opts?: { concurrency?: number; persist?: boolean },
): Promise<Map<string, PackageBundle>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const concurrency = opts?.concurrency ?? WORKERS_BUDGET.snapshotConcurrency;
  const doPersist = opts?.persist !== false;
  const map = new Map<string, PackageBundle>();

  await mapPool(uniq, concurrency, async (symbol) => {
    try {
      const r = await hubFinancialPackage(symbol);
      if (!r) return;
      const has =
        r.pkg.income.length + r.pkg.balance.length + r.pkg.cashflow.length > 0 ||
        (r.pkg.periods?.length ?? 0) > 0;
      if (!has && r.health.coverage <= 0) return;
      map.set(symbol, {
        symbol,
        pkg: r.pkg,
        health: r.health,
        growth: r.pkg.growth,
        qualityScore: r.quality?.score ?? r.pkg.meta.qualityScore ?? null,
      });
      if (doPersist) persistFinancialPackageAsync(r.pkg);
    } catch {
      /* skip */
    }
  });

  return map;
}

export async function getFundamentalSnapshots(
  symbols: string[],
  opts?: { concurrency?: number; persist?: boolean },
): Promise<{ snapshots: FundamentalSnapshot[]; packages: Map<string, PackageBundle>; scanned: number; hit: number }> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const packages = await getFinancialPackagesBulk(uniq, {
    concurrency: opts?.concurrency ?? WORKERS_BUDGET.snapshotConcurrency,
    persist: opts?.persist,
  });

  const entries = [...packages.entries()];
  const snapshots = (await mapPool(entries, Math.max(1, Math.min(4, opts?.concurrency ?? WORKERS_BUDGET.snapshotConcurrency)), async ([symbol, bundle]) => {
    const key = `fin:snap:v4:${symbol}`;
    try {
      const res = await cached(key, {
        ttlMs: 18 * 3_600_000,
        staleMs: 14 * 24 * 3_600_000,
        softSwr: true,
        producer: async () => buildSnapshotFromBundle(bundle),
      });
      return res.value;
    } catch {
      return buildSnapshotFromBundle(bundle);
    }
  })).filter((snapshot): snapshot is FundamentalSnapshot => snapshot != null);

  return {
    snapshots,
    packages,
    scanned: uniq.length,
    hit: packages.size,
  };
}

export async function warmFundamentalSnapshots(
  symbols: string[],
  opts?: { concurrency?: number },
): Promise<{ warmed: number; scanned: number }> {
  const r = await getFundamentalSnapshots(symbols, { ...opts, persist: true });
  return { warmed: r.hit, scanned: r.scanned };
}
