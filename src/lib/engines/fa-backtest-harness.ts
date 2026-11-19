import type { FundamentalSnapshot } from "../financial/snapshots";
import {
  computeSectorPercentileMap,
  normalizeToBillionVnd,
  resolveIndustryEvalTrack,
  type IndustryEvalTrack,
} from "../financial/fa-core";
import { computePiotroskiAltman } from "./piotroski-altman";
import { computeFundamentalMatrix } from "./fundamental-quant-matrix";

export type FaBacktestStrategy =
  | "piotroski_diamonds"
  | "buffett_compounder"
  | "earnings_quality"
  | "deep_value";

export interface FaPriceBar {
  /** ISO date string YYYY-MM-DD */
  date: string;
  close: number;
}

export interface CausalFaObservation {
  symbol: string;
  sector: string;
  periodEndDate: string; // YYYY-MM-DD
  periodType: "quarterly" | "annual";
  /** Override filing lag days; defaults to 45d (quarterly) or 90d (annual) */
  filingLagDays?: number;
  /** Optional market capitalization in Billion VND as of reporting; falls back to price * shares */
  marketCapBillion?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  snapshot: FundamentalSnapshot;
}

export interface FaBacktestConfig {
  strategy: FaBacktestStrategy;
  /** Rebalance dates (YYYY-MM-DD). Should span calibration & holdout periods. */
  rebalanceDates: string[];
  /** Number of trading bars ahead for forward return measurement (default: 60) */
  holdingBars?: number;
  /** Maximum top-ranked positions held per rebalance (default: 5) */
  topK?: number;
  /** Round-trip transaction cost in basis points (default: 30 bps = 0.30%) */
  transactionCostBps?: number;
  /** Default quarterly filing lag days if observation doesn't override (default: 45) */
  quarterlyLagDays?: number;
  /** Default annual filing lag days if observation doesn't override (default: 90) */
  annualLagDays?: number;
  /** Chronological fraction used for in-sample Calibration vs Out-of-Sample Holdout (default: 0.6) */
  calibrationSplitRatio?: number;
  /** Minimum available symbols per rebalance date to emit a trade cohort (default: 2) */
  minUniverseSize?: number;
}

export interface FaCohortTrade {
  rebalanceDate: string;
  exitDate: string;
  symbol: string;
  sector: string;
  industryTrack: IndustryEvalTrack;
  periodEndUsed: string;
  availableDateUsed: string;
  entryPrice: number;
  exitPrice: number;
  grossReturnPct: number;
  netReturnPct: number;
  score: number;
  sectorPercentile: number;
}

export interface FaWindowMetrics {
  rebalances: number;
  totalTrades: number;
  winRatePct: number;
  meanReturnPct: number;
  medianReturnPct: number;
  cumulativeReturnPct: number;
  sharpeProxy: number;
  maxDrawdownPct: number;
}

export interface FaBacktestReport {
  strategy: FaBacktestStrategy;
  filingLagQuarterlyDays: number;
  filingLagAnnualDays: number;
  calibrationMetrics: FaWindowMetrics;
  holdoutMetrics: FaWindowMetrics;
  rebalanceEvents: {
    rebalanceDate: string;
    phase: "calibration" | "holdout";
    eligibleUniverseCount: number;
    selectedCount: number;
    maxPeriodEndUsed: string | null;
    maxAvailableDateUsed: string | null;
    cohortReturnPct: number | null;
  }[];
  trades: FaCohortTrade[];
  antiOverfitVerdict: "PASS" | "WARN_OOS_DECAY" | "INSUFFICIENT_OBSERVATIONS";
  verdictDetail: string;
}

export function computeAvailableDate(
  periodEndDate: string,
  periodType: "quarterly" | "annual",
  overrideLagDays?: number,
  defaultQuarterlyLagDays = 45,
  defaultAnnualLagDays = 90,
): string {
  const lag =
    overrideLagDays ??
    (periodType === "annual" ? defaultAnnualLagDays : defaultQuarterlyLagDays);
  const [y, m, d] = periodEndDate.split("-").map(Number);
  const utc = Date.UTC(y || 1970, (m || 1) - 1, (d || 1) + lag);
  const dt = new Date(utc);
  return dt.toISOString().slice(0, 10);
}

/**
 * Strictly causal lookup: selects the newest observation whose `availableDate <= asOfDate`.
 */
export function getLatestAvailableFaAsOf(
  observations: CausalFaObservation[],
  asOfDate: string,
  quarterlyLagDays = 45,
  annualLagDays = 90,
): (CausalFaObservation & { availableDate: string }) | null {
  let best: (CausalFaObservation & { availableDate: string }) | null = null;
  for (const obs of observations) {
    const avail = computeAvailableDate(
      obs.periodEndDate,
      obs.periodType,
      obs.filingLagDays,
      quarterlyLagDays,
      annualLagDays,
    );
    if (avail > asOfDate) continue; // Strict causality: no future BCTC allowed
    if (!best || obs.periodEndDate > best.periodEndDate) {
      best = { ...obs, availableDate: avail };
    }
  }
  return best;
}

function summarizeWindowMetrics(cohortReturnsPct: number[], trades: FaCohortTrade[]): FaWindowMetrics {
  if (trades.length === 0 || cohortReturnsPct.length === 0) {
    return {
      rebalances: cohortReturnsPct.length,
      totalTrades: 0,
      winRatePct: 0,
      meanReturnPct: 0,
      medianReturnPct: 0,
      cumulativeReturnPct: 0,
      sharpeProxy: 0,
      maxDrawdownPct: 0,
    };
  }

  const wins = trades.filter((t) => t.netReturnPct > 0).length;
  const sortedTrades = [...trades].sort((a, b) => a.netReturnPct - b.netReturnPct);
  const mid = Math.floor(sortedTrades.length / 2);
  const medianReturnPct =
    sortedTrades.length % 2 === 1
      ? sortedTrades[mid]!.netReturnPct
      : (sortedTrades[mid - 1]!.netReturnPct + sortedTrades[mid]!.netReturnPct) / 2;

  const meanReturnPct =
    cohortReturnsPct.reduce((acc, v) => acc + v, 0) / cohortReturnsPct.length;

  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  for (const r of cohortReturnsPct) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDd) maxDd = dd;
  }

  const variance =
    cohortReturnsPct.length > 1
      ? cohortReturnsPct.reduce((acc, r) => acc + (r - meanReturnPct) ** 2, 0) /
        (cohortReturnsPct.length - 1)
      : 0;
  const std = Math.sqrt(variance);
  const sharpeProxy = std > 0.0001 ? Number(((meanReturnPct / std) * Math.sqrt(4)).toFixed(2)) : 0;

  return {
    rebalances: cohortReturnsPct.length,
    totalTrades: trades.length,
    winRatePct: Number(((wins / trades.length) * 100).toFixed(2)),
    meanReturnPct: Number(meanReturnPct.toFixed(2)),
    medianReturnPct: Number(medianReturnPct.toFixed(2)),
    cumulativeReturnPct: Number((equity - 100).toFixed(2)),
    sharpeProxy,
    maxDrawdownPct: Number(maxDd.toFixed(2)),
  };
}

function findEntryAndExitBar(
  bars: FaPriceBar[],
  rebalanceDate: string,
  holdingBars: number,
): { entry: FaPriceBar; exit: FaPriceBar } | null {
  const entryIdx = bars.findIndex((b) => b.date >= rebalanceDate && b.close > 0);
  if (entryIdx < 0) return null;
  const exitIdx = Math.min(bars.length - 1, entryIdx + holdingBars);
  if (exitIdx <= entryIdx || bars[exitIdx]!.close <= 0) return null;
  return { entry: bars[entryIdx]!, exit: bars[exitIdx]! };
}

/**
 * Runs a point-in-time causal Fundamental Analysis backtest with explicit
 * BCTC filing lags, sector-neutral peer ranking, financial-track exemptions,
 * and Calibration vs Out-of-Sample Holdout verification.
 */
export function runCausalFaBacktest(
  observationsBySymbol: Record<string, CausalFaObservation[]>,
  priceSeriesBySymbol: Record<string, FaPriceBar[]>,
  config: FaBacktestConfig,
): FaBacktestReport {
  const qLag = config.quarterlyLagDays ?? 45;
  const aLag = config.annualLagDays ?? 90;
  const holdingBars = Math.max(5, config.holdingBars ?? 60);
  const topK = Math.max(1, config.topK ?? 5);
  const txCostPct = (config.transactionCostBps ?? 30) / 100;
  const splitRatio = Math.min(0.85, Math.max(0.3, config.calibrationSplitRatio ?? 0.6));
  const minUniverseSize = Math.max(1, config.minUniverseSize ?? 2);

  const sortedDates = [...config.rebalanceDates].sort();
  const splitIdx = Math.max(1, Math.floor(sortedDates.length * splitRatio));

  const sortedPrices: Record<string, FaPriceBar[]> = {};
  for (const [sym, bars] of Object.entries(priceSeriesBySymbol)) {
    sortedPrices[sym] = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  }

  const allTrades: FaCohortTrade[] = [];
  const calTrades: FaCohortTrade[] = [];
  const holdTrades: FaCohortTrade[] = [];
  const calCohortReturns: number[] = [];
  const holdCohortReturns: number[] = [];
  const rebalanceEvents: FaBacktestReport["rebalanceEvents"] = [];

  for (let dIdx = 0; dIdx < sortedDates.length; dIdx++) {
    const rebalanceDate = sortedDates[dIdx]!;
    const phase: "calibration" | "holdout" = dIdx < splitIdx ? "calibration" : "holdout";

    interface Candidate {
      symbol: string;
      sector: string;
      track: IndustryEvalTrack;
      obs: CausalFaObservation & { availableDate: string };
      barsWindow: { entry: FaPriceBar; exit: FaPriceBar };
      score: number;
      qualifies: boolean;
      rankAxisValue: number | null;
    }

    const universeCandidates: Candidate[] = [];

    for (const [symbol, obsList] of Object.entries(observationsBySymbol)) {
      const latestObs = getLatestAvailableFaAsOf(obsList, rebalanceDate, qLag, aLag);
      if (!latestObs) continue;

      const bars = sortedPrices[symbol];
      if (!bars || bars.length === 0) continue;
      const barsWindow = findEntryAndExitBar(bars, rebalanceDate, holdingBars);
      if (!barsWindow) continue;

      const entryPrice = barsWindow.entry.close;
      const snap = latestObs.snapshot;
      const track = snap.industryTrack ?? resolveIndustryEvalTrack(symbol);
      const isFinancial = track === "FINANCIAL_BANK_SEC_INS";

      const mcapBillion =
        latestObs.marketCapBillion ??
        (snap.shares && snap.shares > 0
          ? normalizeToBillionVnd(entryPrice * (entryPrice < 500 ? 1000 : 1) * snap.shares)
          : null);

      const health = computePiotroskiAltman(snap);
      const matrix = computeFundamentalMatrix({
        snap,
        symbol,
        price: entryPrice,
        pe: latestObs.pe ?? null,
        pb: latestObs.pb ?? null,
        dividendYield: latestObs.dividendYield ?? null,
        niYoyPct: snap.niYoyPct ?? null,
        revenueYoyPct: snap.revenueYoyPct ?? null,
        marketCapBillion: mcapBillion,
        industryTrack: track,
      });

      let qualifies = false;
      let score = 0;
      let rankAxisValue: number | null = snap.roe ?? null;

      if (config.strategy === "piotroski_diamonds") {
        const altmanOk = isFinancial
          ? health.altman.zone === "EXEMPT_FINANCIAL"
          : health.altman.zone === "SAFE" || health.altman.zScore == null || health.altman.zScore >= 1.8;
        qualifies = health.piotroski.fScore >= 6 && altmanOk;
        score = health.piotroski.fScore * 10 + (matrix.buffettScore ?? 0) * 0.2;
        rankAxisValue = health.piotroski.fScore;
      } else if (config.strategy === "buffett_compounder") {
        qualifies = matrix.isBuffettCompounder || (matrix.buffettScore >= 72 && matrix.isHighRoic);
        score = matrix.buffettScore;
        rankAxisValue = matrix.roic ?? snap.roe ?? null;
      } else if (config.strategy === "earnings_quality") {
        const beneishOk = isFinancial || matrix.isBeneishSafe || matrix.beneishMScore == null;
        const btdOk = matrix.isBookTaxSafe;
        qualifies = (matrix.isQualityEarnings || (matrix.cfoToNetProfit != null && matrix.cfoToNetProfit >= 0.9)) && beneishOk && btdOk;
        score = (matrix.cfoToNetProfit ?? 0.5) * 35 + health.piotroski.fScore * 5;
        rankAxisValue = matrix.cfoToNetProfit ?? null;
      } else if (config.strategy === "deep_value") {
        const peOk = latestObs.pe != null && latestObs.pe > 0 && latestObs.pe <= 14;
        const fcfOk = matrix.fcfYieldPct != null && matrix.fcfYieldPct >= 6;
        const rDcfOk = matrix.reverseDcfMarginPct != null && matrix.reverseDcfMarginPct > 0;
        qualifies = Boolean((peOk || matrix.isGrahamNcav) && (fcfOk || rDcfOk || health.piotroski.fScore >= 5));
        score =
          (latestObs.pe && latestObs.pe > 0 ? Math.max(0, 25 - latestObs.pe) * 2 : 0) +
          (matrix.fcfYieldPct ?? 0) * 2 +
          health.piotroski.fScore * 4;
        rankAxisValue = matrix.fcfYieldPct ?? (latestObs.pe && latestObs.pe > 0 ? 100 / latestObs.pe : null);
      }

      universeCandidates.push({
        symbol,
        sector: latestObs.sector,
        track,
        obs: latestObs,
        barsWindow,
        score,
        qualifies,
        rankAxisValue,
      });
    }

    const maxPeriodEndUsed =
      universeCandidates.length > 0
        ? universeCandidates.reduce(
            (m, c) => (c.obs.periodEndDate > m ? c.obs.periodEndDate : m),
            universeCandidates[0]!.obs.periodEndDate,
          )
        : null;
    const maxAvailableDateUsed =
      universeCandidates.length > 0
        ? universeCandidates.reduce(
            (m, c) => (c.obs.availableDate > m ? c.obs.availableDate : m),
            universeCandidates[0]!.obs.availableDate,
          )
        : null;

    if (universeCandidates.length < minUniverseSize) {
      rebalanceEvents.push({
        rebalanceDate,
        phase,
        eligibleUniverseCount: universeCandidates.length,
        selectedCount: 0,
        maxPeriodEndUsed,
        maxAvailableDateUsed,
        cohortReturnPct: null,
      });
      continue;
    }

    // Sector-neutral ranking on the strategy axis across all causal candidates at date `t`
    const pctMap = new Map<string, number>();
    const bySector = new Map<string, Candidate[]>();
    for (const cand of universeCandidates) {
      const list = bySector.get(cand.sector) ?? [];
      list.push(cand);
      bySector.set(cand.sector, list);
    }
    for (const sectorPeers of bySector.values()) {
      const sectorRanks = computeSectorPercentileMap(
        sectorPeers.map((c) => ({
          key: c.symbol,
          value: c.rankAxisValue,
        })),
      );
      for (const [sym, pct] of sectorRanks.entries()) {
        pctMap.set(sym, pct);
      }
    }

    const ranked = universeCandidates
      .filter((c) => c.qualifies)
      .map((c) => {
        const sectorPercentile = pctMap.get(c.symbol) ?? 50;
        const compositeRank = c.score * 0.7 + sectorPercentile * 0.3;
        return { ...c, sectorPercentile, compositeRank };
      })
      .sort((a, b) => b.compositeRank - a.compositeRank)
      .slice(0, topK);

    if (ranked.length === 0) {
      rebalanceEvents.push({
        rebalanceDate,
        phase,
        eligibleUniverseCount: universeCandidates.length,
        selectedCount: 0,
        maxPeriodEndUsed,
        maxAvailableDateUsed,
        cohortReturnPct: null,
      });
      continue;
    }

    const dateTrades: FaCohortTrade[] = ranked.map((c) => {
      const grossReturnPct = ((c.barsWindow.exit.close / c.barsWindow.entry.close) - 1) * 100;
      const netReturnPct = grossReturnPct - txCostPct;
      return {
        rebalanceDate,
        exitDate: c.barsWindow.exit.date,
        symbol: c.symbol,
        sector: c.sector,
        industryTrack: c.track,
        periodEndUsed: c.obs.periodEndDate,
        availableDateUsed: c.obs.availableDate,
        entryPrice: c.barsWindow.entry.close,
        exitPrice: c.barsWindow.exit.close,
        grossReturnPct: Number(grossReturnPct.toFixed(2)),
        netReturnPct: Number(netReturnPct.toFixed(2)),
        score: Number(c.score.toFixed(2)),
        sectorPercentile: c.sectorPercentile,
      };
    });

    const cohortReturnPct =
      dateTrades.reduce((acc, t) => acc + t.netReturnPct, 0) / dateTrades.length;

    allTrades.push(...dateTrades);
    if (phase === "calibration") {
      calTrades.push(...dateTrades);
      calCohortReturns.push(cohortReturnPct);
    } else {
      holdTrades.push(...dateTrades);
      holdCohortReturns.push(cohortReturnPct);
    }

    rebalanceEvents.push({
      rebalanceDate,
      phase,
      eligibleUniverseCount: universeCandidates.length,
      selectedCount: dateTrades.length,
      maxPeriodEndUsed,
      maxAvailableDateUsed,
      cohortReturnPct: Number(cohortReturnPct.toFixed(2)),
    });
  }

  const calibrationMetrics = summarizeWindowMetrics(calCohortReturns, calTrades);
  const holdoutMetrics = summarizeWindowMetrics(holdCohortReturns, holdTrades);

  let antiOverfitVerdict: FaBacktestReport["antiOverfitVerdict"] = "PASS";
  let verdictDetail =
    "Out-of-sample holdout performance stays aligned with calibration cohort without severe alpha decay.";

  if (calTrades.length < 2 || holdTrades.length < 2) {
    antiOverfitVerdict = "INSUFFICIENT_OBSERVATIONS";
    verdictDetail =
      "Need >= 2 trades in both calibration and out-of-sample holdout windows for statistical parity.";
  } else if (
    calibrationMetrics.meanReturnPct > 2 &&
    holdoutMetrics.meanReturnPct < calibrationMetrics.meanReturnPct * 0.35
  ) {
    antiOverfitVerdict = "WARN_OOS_DECAY";
    verdictDetail = `Holdout mean (${holdoutMetrics.meanReturnPct}%) decayed >65% relative to Calibration (${calibrationMetrics.meanReturnPct}%).`;
  }

  return {
    strategy: config.strategy,
    filingLagQuarterlyDays: qLag,
    filingLagAnnualDays: aLag,
    calibrationMetrics,
    holdoutMetrics,
    rebalanceEvents,
    trades: allTrades,
    antiOverfitVerdict,
    verdictDetail,
  };
}
