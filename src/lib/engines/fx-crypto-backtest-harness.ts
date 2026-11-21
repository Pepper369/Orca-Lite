import type { OhlcvBar } from "../types";
import { atr, ema, rsi } from "../technical";
import { getAssetPipSize } from "./asset-precision";
import {
  applySymmetricCusumFilter,
  calculateDeflatedSharpeRatio,
  filterOnlineRegimeHmm,
  forecastHarRealizedVolatility,
} from "./advanced-quant-math";
import { evaluatePrecisionTradeSetup, type SetupGrade } from "./fx-crypto-precision-engine";
import {
  applyIsotonicCalibration,
  calculateCombinatorialPurgedPbo,
  computeBrierScore,
  predictMetaLabelProbability,
  trainPurgedMetaLabelClassifier,
  type MetaLabelFeatureVector,
  type MetaLabelTrainingSample,
  type PboEvaluationResult,
  type TrainedMetaLabelModel,
} from "./meta-labeling-calibration";

export type BenchmarkRegime =
  | "CLEAN_UPTREND_PULLBACK"
  | "CLEAN_DOWNTREND_RETEST"
  | "CHOPPY_WHIPSAW_RANGE"
  | "TURTLE_SOUP_SWEEP_REVERSAL"
  | "NEWS_CASCADE_SPIKE"
  | "OVEREXTENDED_EXHAUSTION";

export interface BenchmarkAssetSpec {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  basePrice: number;
  barAtr: number;
  spreadPipsOrPct: number;
}

export const BENCHMARK_ASSETS: BenchmarkAssetSpec[] = [
  { symbol: "EURUSD", assetType: "FOREX", basePrice: 1.085, barAtr: 0.0012, spreadPipsOrPct: 1.0 },
  { symbol: "USDJPY", assetType: "FOREX", basePrice: 154.5, barAtr: 0.16, spreadPipsOrPct: 1.2 },
  { symbol: "XAUUSD", assetType: "FOREX", basePrice: 2650.0, barAtr: 3.2, spreadPipsOrPct: 2.5 },
  { symbol: "BTCUSDT", assetType: "CRYPTO", basePrice: 91500, barAtr: 380, spreadPipsOrPct: 0.0004 },
  { symbol: "SOLUSDT", assetType: "CRYPTO", basePrice: 215.0, barAtr: 1.7, spreadPipsOrPct: 0.0005 },
  { symbol: "PEPEUSDT", assetType: "CRYPTO", basePrice: 0.00000842, barAtr: 0.000000095, spreadPipsOrPct: 0.0006 },
];

export const BENCHMARK_REGIMES: BenchmarkRegime[] = [
  "CLEAN_UPTREND_PULLBACK",
  "CLEAN_DOWNTREND_RETEST",
  "CHOPPY_WHIPSAW_RANGE",
  "TURTLE_SOUP_SWEEP_REVERSAL",
  "NEWS_CASCADE_SPIKE",
  "OVEREXTENDED_EXHAUSTION",
];

export interface BacktestMetrics {
  totalSignalsEvaluated: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  tp1HitRatePct: number;
  expectancyR: number;
  profitFactor: number;
  maxDrawdownR: number;
  trapTradesCount: number;
  deflatedSharpe: number;
}

export interface WalkForwardComparisonReport {
  split: "CALIBRATION" | "HOLDOUT";
  seeds: number[];
  legacyBaseline: BacktestMetrics;
  upgradedAAPlus: BacktestMetrics;
  upgradedAllGrades: BacktestMetrics;
  winRateLiftPp: number;
  trapReductionPct: number;
}

/** Deterministic Mulberry32 PRNG */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates synthetic 110-bar OHLCV series modeling distinct realistic market regimes.
 * Note bars [50..80] represent the primary evaluation window and [81..109] the post-signal realization window.
 */
export function generateRegimeBars(
  asset: BenchmarkAssetSpec,
  regime: BenchmarkRegime,
  seed: number,
  length = 120,
): { bars: OhlcvBar[]; isTrapBar: boolean[] } {
  const rand = createRng(seed);
  const bars: OhlcvBar[] = [];
  const isTrapBar: boolean[] = [];
  let price = asset.basePrice;
  const u = asset.barAtr;
  const baseTimeSec = 1700000000;

  for (let i = 0; i < length; i++) {
    const noise = (rand() - 0.5) * 0.45 * u;
    let body = 0;
    let upWick = (0.15 + rand() * 0.25) * u;
    let downWick = (0.15 + rand() * 0.25) * u;
    let vol = Math.round(1200 + rand() * 800);
    let trap = false;

    if (regime === "CLEAN_UPTREND_PULLBACK") {
      // Rhythmic 6-bar impulse + 2-bar healthy pullback uptrend
      const cycle = i % 8;
      if (cycle === 4 || cycle === 5) {
        body = -0.35 * u + noise * 0.4;
      } else {
        body = 0.52 * u + Math.abs(noise) * 0.4;
      }
      vol = cycle >= 6 ? Math.round(vol * 1.45) : vol;
    } else if (regime === "CLEAN_DOWNTREND_RETEST") {
      const cycle = i % 8;
      if (cycle === 4 || cycle === 5) {
        body = 0.35 * u + noise * 0.4;
      } else {
        body = -0.52 * u - Math.abs(noise) * 0.4;
      }
      vol = cycle >= 6 ? Math.round(vol * 1.45) : vol;
    } else if (regime === "CHOPPY_WHIPSAW_RANGE") {
      // Alternates tight inside range with sharp fake wick traps — classic false-breakout churn
      trap = true;
      const anchor = asset.basePrice;
      const dist = price - anchor;
      body = -dist * 0.58 + (i % 2 === 0 ? 0.32 * u : -0.32 * u) + noise * 0.8;
      upWick = (0.55 + rand() * 0.5) * u;
      downWick = (0.55 + rand() * 0.5) * u;
    } else if (regime === "TURTLE_SOUP_SWEEP_REVERSAL") {
      // Range compression -> SSL sweep spike -> strong bullish expansion rally
      if (i < 55) {
        body = (i % 2 === 0 ? 0.18 : -0.22) * u + noise * 0.3;
      } else if (i >= 55 && i <= 57) {
        // Controlled sweep below prior range low followed by snap reclaim
        if (i === 57) {
          downWick = 2.1 * u;
          upWick = 0.2 * u;
          body = 0.85 * u;
          vol = Math.round(vol * 2.6);
        } else {
          body = -0.45 * u;
        }
      } else {
        body = 0.55 * u + Math.abs(noise) * 0.3;
        vol = Math.round(vol * 1.5);
      }
    } else if (regime === "NEWS_CASCADE_SPIKE") {
      // Calm buildup then massive 3.5x ATR chaotic whipsaw around bars 52..78
      if (i >= 52 && i <= 78) {
        trap = true;
        body = (i % 2 === 0 ? 1 : -1) * (2.6 + rand() * 1.4) * u;
        upWick = 1.4 * u;
        downWick = 1.4 * u;
        vol = Math.round(vol * 3.2);
      } else {
        body = 0.12 * u + noise * 0.5;
      }
    } else if (regime === "OVEREXTENDED_EXHAUSTION") {
      // Gradual rise -> parabolic blow-off chase bars 56..63 -> mean-reversion crash
      if (i < 52) {
        body = 0.25 * u + noise * 0.3;
      } else if (i >= 52 && i <= 62) {
        trap = i >= 59; // Late parabolic chase zone
        body = 1.15 * u;
        vol = Math.round(vol * 1.9);
      } else {
        trap = i <= 68;
        body = -0.95 * u + noise * 0.4;
      }
    }

    const open = Math.max(asset.barAtr * 5, price);
    const close = Math.max(asset.barAtr * 5, open + body);
    const high = Math.max(open, close) + Math.max(asset.barAtr * 0.05, upWick);
    const low = Math.max(asset.barAtr * 2, Math.min(open, close) - Math.max(asset.barAtr * 0.05, downWick));

    bars.push({
      time: baseTimeSec + i * 300,
      open,
      high,
      low,
      close,
      volume: vol,
    });
    isTrapBar.push(trap);
    price = close;
  }

  return { bars, isTrapBar };
}

/**
 * Replicates pre-upgrade Legacy Baseline signal heuristics:
 * EMA9 vs EMA21 / RSI bias + candle color fallback, tight 0.65 ATR SL, 1.5R TP, no chop/chase veto.
 */
function legacyBaselineDecision(bars: OhlcvBar[]): {
  direction: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit: number;
} {
  const n = bars.length;
  const last = bars[n - 1]!;
  const closes = bars.map((b) => b.close);
  const e9 = ema(closes, 9)[n - 1] ?? last.close;
  const e21 = ema(closes, 21)[n - 1] ?? last.close;
  const r = rsi(closes, 14)[n - 1] ?? 50;
  const a = atr(bars, 14) ?? Math.max(1e-10, last.high - last.low);

  // Forced directional choice (pre-upgrade coin-flip fallback in chop)
  let direction: "BUY" | "SELL" = last.close >= last.open ? "BUY" : "SELL";
  if (e9 > e21 && r > 50) direction = "BUY";
  else if (e9 < e21 && r < 50) direction = "SELL";

  const stopDist = Math.max(1e-10, a * 0.65); // Tight pre-upgrade stop inside noise
  const entry = last.close;
  const stopLoss = direction === "BUY" ? entry - stopDist : entry + stopDist;
  const takeProfit = direction === "BUY" ? entry + stopDist * 1.5 : entry - stopDist * 1.5;

  return { direction, entry, stopLoss, takeProfit };
}

function simulateTradeOutcome(params: {
  barsFuture: OhlcvBar[];
  direction: "BUY" | "SELL";
  entryMode: "LIMIT_PULLBACK" | "MARKET_CONFIRMED";
  intendedEntry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  frictionPrice: number;
  useBreakevenScaling: boolean;
}): { filled: boolean; netR: number; tp1Hit: boolean; barsHeld: number } {
  const {
    barsFuture,
    direction,
    entryMode,
    intendedEntry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    frictionPrice,
    useBreakevenScaling,
  } = params;

  if (!barsFuture.length) return { filled: false, netR: 0, tp1Hit: false, barsHeld: 0 };

  let startIdx = 0;
  let fillPrice = barsFuture[0]!.open;

  if (entryMode === "LIMIT_PULLBACK") {
    let found = -1;
    for (let j = 0; j < Math.min(3, barsFuture.length); j++) {
      const b = barsFuture[j]!;
      if (b.low <= intendedEntry && intendedEntry <= b.high) {
        found = j;
        break;
      }
    }
    if (found === -1) return { filled: false, netR: 0, tp1Hit: false, barsHeld: 0 };
    startIdx = found;
    fillPrice = intendedEntry;
  }

  const riskDist = Math.max(1e-12, Math.abs(intendedEntry - stopLoss));
  const frictionR = frictionPrice / riskDist;

  if (!useBreakevenScaling) {
    // Legacy single exit at SL or TP2
    for (let k = startIdx; k < Math.min(barsFuture.length, startIdx + 24); k++) {
      const b = barsFuture[k]!;
      const hitSl = direction === "BUY" ? b.low <= stopLoss : b.high >= stopLoss;
      const hitTp = direction === "BUY" ? b.high >= tp2 : b.low <= tp2;
      // Conservative intra-bar tie-breaker: SL always checked first
      if (hitSl) {
        return { filled: true, netR: -1.0 - frictionR, tp1Hit: false, barsHeld: k - startIdx + 1 };
      }
      if (hitTp) {
        const rr = Math.abs(tp2 - fillPrice) / riskDist;
        return { filled: true, netR: rr - frictionR, tp1Hit: true, barsHeld: k - startIdx + 1 };
      }
    }
    const lastExit = barsFuture[Math.min(barsFuture.length - 1, startIdx + 23)]!.close;
    const rawR = ((direction === "BUY" ? lastExit - fillPrice : fillPrice - lastExit) / riskDist) - frictionR;
    return { filled: true, netR: rawR, tp1Hit: false, barsHeld: Math.min(24, barsFuture.length - startIdx) };
  }

  // Upgraded partial TP1 (50% + move SL to BE), TP2 (30%), TP3 (20%)
  let currentSl = stopLoss;
  let tp1Hit = false;
  let tp2Hit = false;
  let realizedR = 0;
  let remainingWeight = 1.0;

  for (let k = startIdx; k < Math.min(barsFuture.length, startIdx + 24); k++) {
    const b = barsFuture[k]!;
    const hitSl = direction === "BUY" ? b.low <= currentSl : b.high >= currentSl;
    if (hitSl) {
      const exitR = direction === "BUY" ? (currentSl - fillPrice) / riskDist : (fillPrice - currentSl) / riskDist;
      realizedR += remainingWeight * exitR;
      return { filled: true, netR: realizedR - frictionR, tp1Hit, barsHeld: k - startIdx + 1 };
    }

    if (!tp1Hit) {
      const hitTp1 = direction === "BUY" ? b.high >= tp1 : b.low <= tp1;
      if (hitTp1) {
        tp1Hit = true;
        const r1 = Math.abs(tp1 - fillPrice) / riskDist;
        realizedR += 0.5 * r1;
        remainingWeight = 0.5;
        currentSl = fillPrice; // Move SL to Breakeven!
      }
    }

    if (tp1Hit && !tp2Hit) {
      const hitTp2 = direction === "BUY" ? b.high >= tp2 : b.low <= tp2;
      if (hitTp2) {
        tp2Hit = true;
        const r2 = Math.abs(tp2 - fillPrice) / riskDist;
        realizedR += 0.3 * r2;
        remainingWeight = 0.2;
      }
    }

    if (tp2Hit) {
      const hitTp3 = direction === "BUY" ? b.high >= tp3 : b.low <= tp3;
      if (hitTp3) {
        const r3 = Math.abs(tp3 - fillPrice) / riskDist;
        realizedR += 0.2 * r3;
        return { filled: true, netR: realizedR - frictionR, tp1Hit, barsHeld: k - startIdx + 1 };
      }
    }
  }

  const finalClose = barsFuture[Math.min(barsFuture.length - 1, startIdx + 23)]!.close;
  const remR = (direction === "BUY" ? finalClose - fillPrice : fillPrice - finalClose) / riskDist;
  realizedR += remainingWeight * remR;
  return {
    filled: true,
    netR: realizedR - frictionR,
    tp1Hit,
    barsHeld: Math.min(24, barsFuture.length - startIdx),
  };
}

function summarizeTrades(
  records: { netR: number; tp1Hit: boolean; isTrap: boolean }[],
  totalSignalsEvaluated: number,
  trialsCount: number,
): BacktestMetrics {
  const n = records.length;
  if (n === 0) {
    return {
      totalSignalsEvaluated,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      tp1HitRatePct: 0,
      expectancyR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      trapTradesCount: 0,
      deflatedSharpe: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let tp1Hits = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let trapTrades = 0;

  for (const r of records) {
    if (r.netR > 0) {
      wins++;
      grossWin += r.netR;
    } else {
      losses++;
      grossLoss += Math.abs(r.netR);
    }
    if (r.tp1Hit) tp1Hits++;
    if (r.isTrap) trapTrades++;
    equity += r.netR;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  const returns = records.map((r) => r.netR);
  const meanR = equity / n;
  const variance = returns.reduce((s, x) => s + (x - meanR) ** 2, 0) / Math.max(1, n - 1);
  const stdR = Math.sqrt(Math.max(1e-6, variance));
  const rawSharpe = (meanR / stdR) * Math.sqrt(Math.min(252, n));
  const dsr = calculateDeflatedSharpeRatio({
    observedSharpe: rawSharpe,
    trialsCount,
    sampleLengthBars: Math.max(12, n),
  });

  return {
    totalSignalsEvaluated,
    totalTrades: n,
    wins,
    losses,
    winRatePct: Number(((wins / n) * 100).toFixed(1)),
    tp1HitRatePct: Number(((tp1Hits / n) * 100).toFixed(1)),
    expectancyR: Number(meanR.toFixed(3)),
    profitFactor: grossLoss > 1e-6 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 9.99 : 0,
    maxDrawdownR: Number(maxDd.toFixed(2)),
    trapTradesCount: trapTrades,
    deflatedSharpe: dsr.deflatedSharpeRatio,
  };
}

/**
 * Executes strictly causal bar-by-bar walk-forward evaluation across Forex + Crypto assets and 6 regimes.
 */
export function runWalkForwardComparison(params: {
  split: "CALIBRATION" | "HOLDOUT";
  seeds?: number[];
  assets?: BenchmarkAssetSpec[];
  regimes?: BenchmarkRegime[];
}): WalkForwardComparisonReport {
  const split = params.split;
  const seeds = params.seeds ?? (split === "CALIBRATION" ? [101, 202, 303] : [404, 505, 606]);
  const assets = params.assets ?? BENCHMARK_ASSETS;
  const regimes = params.regimes ?? BENCHMARK_REGIMES;

  const legacyRecords: { netR: number; tp1Hit: boolean; isTrap: boolean }[] = [];
  const aaPlusRecords: { netR: number; tp1Hit: boolean; isTrap: boolean }[] = [];
  const allGradeRecords: { netR: number; tp1Hit: boolean; isTrap: boolean }[] = [];
  let totalEvaluations = 0;

  for (const seed of seeds) {
    for (let aIdx = 0; aIdx < assets.length; aIdx++) {
      const asset = assets[aIdx]!;
      for (let rIdx = 0; rIdx < regimes.length; rIdx++) {
        const regime = regimes[rIdx]!;
        const { bars, isTrapBar } = generateRegimeBars(asset, regime, seed + aIdx * 31 + rIdx * 97);
        const pip = getAssetPipSize(asset.symbol, asset.assetType, asset.basePrice);

        let nextAllowedLegacy = 50;
        let nextAllowedPrecision = 50;

        for (let t = 50; t <= bars.length - 26; t += 2) {
          totalEvaluations++;
          const barsCausal = bars.slice(0, t + 1);
          const futureBars = bars.slice(t + 1);
          const curPrice = bars[t]!.close;
          const frictionPrice =
            asset.assetType === "FOREX"
              ? (asset.spreadPipsOrPct + 0.35) * pip
              : curPrice * (asset.spreadPipsOrPct + 0.0006);

          // 1. Legacy Baseline
          if (t >= nextAllowedLegacy) {
            const leg = legacyBaselineDecision(barsCausal);
            const legOut = simulateTradeOutcome({
              barsFuture: futureBars,
              direction: leg.direction,
              entryMode: "MARKET_CONFIRMED",
              intendedEntry: leg.entry,
              stopLoss: leg.stopLoss,
              tp1: leg.takeProfit,
              tp2: leg.takeProfit,
              tp3: leg.takeProfit,
              frictionPrice,
              useBreakevenScaling: false,
            });
            if (legOut.filled) {
              legacyRecords.push({
                netR: legOut.netR,
                tp1Hit: legOut.tp1Hit,
                isTrap: Boolean(isTrapBar[t]),
              });
              nextAllowedLegacy = t + Math.max(4, legOut.barsHeld);
            }
          }

          // 2. Upgraded Precision Engine
          if (t >= nextAllowedPrecision) {
            const prec = evaluatePrecisionTradeSetup({
              symbol: asset.symbol,
              assetType: asset.assetType,
              barsExecution: barsCausal,
              spreadPipsOrPct: asset.spreadPipsOrPct,
            });
            const acceptedGrade: SetupGrade = prec.grade;
            if (
              acceptedGrade !== "NO_TRADE" &&
              prec.direction !== "NEUTRAL" &&
              prec.entry != null &&
              prec.stopLoss != null &&
              prec.tp1 != null &&
              prec.tp2 != null &&
              prec.tp3 != null
            ) {
              const out = simulateTradeOutcome({
                barsFuture: futureBars,
                direction: prec.direction,
                entryMode: prec.entryMode === "LIMIT_PULLBACK" ? "LIMIT_PULLBACK" : "MARKET_CONFIRMED",
                intendedEntry: prec.entry,
                stopLoss: prec.stopLoss,
                tp1: prec.tp1,
                tp2: prec.tp2,
                tp3: prec.tp3,
                frictionPrice,
                useBreakevenScaling: true,
              });
              if (out.filled) {
                const rec = {
                  netR: out.netR,
                  tp1Hit: out.tp1Hit,
                  isTrap: Boolean(isTrapBar[t]),
                };
                allGradeRecords.push(rec);
                if (acceptedGrade === "A+" || acceptedGrade === "A") {
                  aaPlusRecords.push(rec);
                }
                nextAllowedPrecision = t + Math.max(4, out.barsHeld);
              }
            }
          }
        }
      }
    }
  }

  const legacyBaseline = summarizeTrades(legacyRecords, totalEvaluations, 1);
  const upgradedAAPlus = summarizeTrades(aaPlusRecords, totalEvaluations, 3);
  const upgradedAllGrades = summarizeTrades(allGradeRecords, totalEvaluations, 3);

  const winRateLiftPp = Number((upgradedAAPlus.winRatePct - legacyBaseline.winRatePct).toFixed(1));
  const trapReductionPct =
    legacyBaseline.trapTradesCount > 0
      ? Number(
          (((legacyBaseline.trapTradesCount - upgradedAAPlus.trapTradesCount) / legacyBaseline.trapTradesCount) * 100).toFixed(1),
        )
      : 100;

  return {
    split,
    seeds,
    legacyBaseline,
    upgradedAAPlus,
    upgradedAllGrades,
    winRateLiftPp,
    trapReductionPct,
  };
}

export interface PurgedMetaLabelWalkForwardReport {
  calibrationSamplesCount: number;
  holdoutSamplesCount: number;
  model: TrainedMetaLabelModel;
  oosBrierBefore: number;
  oosBrierAfter: number;
  brierImprovementPct: number;
  metaFilteredMetrics: BacktestMetrics;
  pbo: PboEvaluationResult;
}

export interface HistoricalAssetSeriesInput {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  spreadPipsOrPct: number;
  bars: OhlcvBar[];
}

export interface RealHistoricalWalkForwardReport {
  totalBarsEvaluated: number;
  calibrationMetrics: BacktestMetrics;
  holdoutMetrics: BacktestMetrics;
  oosBrierBefore: number;
  oosBrierAfter: number;
  pbo: PboEvaluationResult;
}

function collectWalkForwardMetaSamples(params: {
  seeds: number[];
  assets: BenchmarkAssetSpec[];
  regimes: BenchmarkRegime[];
}): {
  samples: MetaLabelTrainingSample[];
  records: {
    netR: number;
    tp1Hit: boolean;
    isTrap: boolean;
    grade: SetupGrade;
    rawProb: number;
    features: MetaLabelFeatureVector;
  }[];
  totalEvaluations: number;
} {
  const { seeds, assets, regimes } = params;
  const samples: MetaLabelTrainingSample[] = [];
  const records: {
    netR: number;
    tp1Hit: boolean;
    isTrap: boolean;
    grade: SetupGrade;
    rawProb: number;
    features: MetaLabelFeatureVector;
  }[] = [];
  let totalEvaluations = 0;
  let globalIdxOffset = 0;

  for (const seed of seeds) {
    for (let aIdx = 0; aIdx < assets.length; aIdx++) {
      const asset = assets[aIdx]!;
      for (let rIdx = 0; rIdx < regimes.length; rIdx++) {
        const regime = regimes[rIdx]!;
        const { bars, isTrapBar } = generateRegimeBars(asset, regime, seed + aIdx * 31 + rIdx * 97);
        const pip = getAssetPipSize(asset.symbol, asset.assetType, asset.basePrice);
        let nextAllowedPrecision = 50;

        for (let t = 50; t <= bars.length - 26; t += 2) {
          totalEvaluations++;
          if (t < nextAllowedPrecision) continue;
          const barsCausal = bars.slice(0, t + 1);
          const futureBars = bars.slice(t + 1);
          const curPrice = bars[t]!.close;
          const frictionPrice =
            asset.assetType === "FOREX"
              ? (asset.spreadPipsOrPct + 0.35) * pip
              : curPrice * (asset.spreadPipsOrPct + 0.0006);

          const prec = evaluatePrecisionTradeSetup({
            symbol: asset.symbol,
            assetType: asset.assetType,
            barsExecution: barsCausal,
            spreadPipsOrPct: asset.spreadPipsOrPct,
          });

          if (
            prec.grade !== "NO_TRADE" &&
            prec.direction !== "NEUTRAL" &&
            prec.entry != null &&
            prec.stopLoss != null &&
            prec.tp1 != null &&
            prec.tp2 != null &&
            prec.tp3 != null
          ) {
            const out = simulateTradeOutcome({
              barsFuture: futureBars,
              direction: prec.direction,
              entryMode: prec.entryMode === "LIMIT_PULLBACK" ? "LIMIT_PULLBACK" : "MARKET_CONFIRMED",
              intendedEntry: prec.entry,
              stopLoss: prec.stopLoss,
              tp1: prec.tp1,
              tp2: prec.tp2,
              tp3: prec.tp3,
              frictionPrice,
              useBreakevenScaling: true,
            });

            if (out.filled) {
              const isBuy = prec.direction === "BUY";
              const hmm = filterOnlineRegimeHmm(barsCausal);
              const cusum = applySymmetricCusumFilter(barsCausal);
              const har = forecastHarRealizedVolatility(barsCausal, asset.assetType === "CRYPTO" ? 365 : 252);
              const cusumAligned =
                (isBuy && cusum.latestBreak === "BULL_BREAK") || (!isBuy && cusum.latestBreak === "BEAR_BREAK")
                  ? 1
                  : (isBuy && cusum.latestBreak === "BEAR_BREAK") || (!isBuy && cusum.latestBreak === "BULL_BREAK")
                    ? -1
                    : 0;

              const features: MetaLabelFeatureVector = {
                primaryScoreNorm: prec.precisionScore / 100,
                hmmTrendProb: hmm.probabilities.trendExpansion,
                hmmCrisisProb: hmm.probabilities.crisisHighVol,
                cusumAligned,
                efficiencyRatio: prec.regime.efficiencyRatio,
                harVolExpansionRatio: har.expansionRatio,
                orderFlowAligned: prec.liquiditySweepDetected ? 0.55 : 0.25,
                liquiditySweepConfirmed: prec.liquiditySweepDetected ? 1 : 0,
                frictionR: prec.frictionR,
              };

              const rawLinearProb = Math.min(0.84, Math.max(0.38, 0.30 + (prec.precisionScore / 100) * 0.56));
              const outcomeWin: 0 | 1 = out.netR > 0 ? 1 : 0;

              samples.push({
                startIdx: globalIdxOffset + t,
                endIdx: globalIdxOffset + t + Math.max(1, out.barsHeld),
                outcome: outcomeWin,
                netR: out.netR,
                features,
              });

              records.push({
                netR: out.netR,
                tp1Hit: out.tp1Hit,
                isTrap: Boolean(isTrapBar[t]),
                grade: prec.grade,
                rawProb: rawLinearProb,
                features,
              });

              nextAllowedPrecision = t + Math.max(4, out.barsHeld);
            }
          }
        }
        globalIdxOffset += bars.length + 10;
      }
    }
  }

  return { samples, records, totalEvaluations };
}

/**
 * Runs Purged & Embargoed K-Fold Meta-Labeling + Isotonic Calibration Walk-Forward
 * and evaluates Out-of-Sample Brier Score reduction + Combinatorial Purged PBO.
 */
export function runPurgedMetaLabelWalkForward(params?: {
  calibrationSeeds?: number[];
  holdoutSeeds?: number[];
  assets?: BenchmarkAssetSpec[];
  regimes?: BenchmarkRegime[];
}): PurgedMetaLabelWalkForwardReport {
  const calibrationSeeds = params?.calibrationSeeds ?? [101, 202, 303];
  const holdoutSeeds = params?.holdoutSeeds ?? [404, 505, 606];
  const assets = params?.assets ?? BENCHMARK_ASSETS;
  const regimes = params?.regimes ?? BENCHMARK_REGIMES;

  const cal = collectWalkForwardMetaSamples({ seeds: calibrationSeeds, assets, regimes });
  const hold = collectWalkForwardMetaSamples({ seeds: holdoutSeeds, assets, regimes });

  const model = trainPurgedMetaLabelClassifier(cal.samples, 4);

  const oosRawProbs = hold.records.map((r) => r.rawProb);
  const oosOutcomes = hold.records.map((r) => (r.netR > 0 ? (1 as const) : (0 as const)));
  const oosCalibratedProbs = hold.records.map((r) => {
    const iso = applyIsotonicCalibration(r.rawProb, model.calibration);
    const meta = predictMetaLabelProbability(r.features, model).calibratedProbability;
    return Number((0.6 * iso + 0.4 * meta).toFixed(4));
  });

  const oosBrierBefore = computeBrierScore(oosRawProbs, oosOutcomes);
  const oosBrierAfter = computeBrierScore(oosCalibratedProbs, oosOutcomes);
  const brierImprovementPct =
    oosBrierBefore > 0
      ? Number((((oosBrierBefore - oosBrierAfter) / oosBrierBefore) * 100).toFixed(2))
      : 0;

  const metaAccepted = hold.records.filter(
    (r, idx) => (r.grade === "A+" || r.grade === "A") && oosCalibratedProbs[idx]! >= 0.55,
  );
  const metaFilteredMetrics = summarizeTrades(metaAccepted, hold.totalEvaluations, 6);

  // Build M = 6 trial fold-performance series across meta-probability thresholds for CPCV PBO
  const thresholds = [0.50, 0.54, 0.58, 0.62, 0.66, 0.70];
  const allSamples = [...cal.records, ...hold.records];
  const allCalProbs = allSamples.map((r) => applyIsotonicCalibration(r.rawProb, model.calibration));
  const foldCount = 6;
  const foldSize = Math.max(1, Math.floor(allSamples.length / foldCount));
  const trialMatrix = thresholds.map((th) => {
    const foldPerf: number[] = [];
    for (let f = 0; f < foldCount; f++) {
      const s = f * foldSize;
      const e = f === foldCount - 1 ? allSamples.length : (f + 1) * foldSize;
      let sumR = 0;
      for (let idx = s; idx < e; idx++) {
        if (allCalProbs[idx]! >= th) sumR += allSamples[idx]!.netR;
      }
      foldPerf.push(sumR);
    }
    return foldPerf;
  });
  const pbo = calculateCombinatorialPurgedPbo(trialMatrix);

  return {
    calibrationSamplesCount: cal.samples.length,
    holdoutSamplesCount: hold.samples.length,
    model,
    oosBrierBefore,
    oosBrierAfter,
    brierImprovementPct,
    metaFilteredMetrics,
    pbo,
  };
}

/**
 * Replays real historical OHLCV bar series causally with an embossed 60/40 Purged Walk-Forward split.
 */
export function runRealHistoricalWalkForwardBacktest(
  seriesList: HistoricalAssetSeriesInput[],
): RealHistoricalWalkForwardReport {
  const calSamples: MetaLabelTrainingSample[] = [];
  const calRecords: { netR: number; tp1Hit: boolean; isTrap: boolean }[] = [];
  const holdRecords: {
    netR: number;
    tp1Hit: boolean;
    isTrap: boolean;
    rawProb: number;
    features: MetaLabelFeatureVector;
  }[] = [];
  let totalBarsEvaluated = 0;
  let globalOffset = 0;

  for (const item of seriesList) {
    const { symbol, assetType, spreadPipsOrPct, bars } = item;
    if (bars.length < 85) continue;
    const pip = getAssetPipSize(symbol, assetType, bars[bars.length - 1]!.close);
    const splitBar = Math.floor(bars.length * 0.6);
    const embargoBars = 5;
    let nextAllowed = 45;

    for (let t = 45; t <= bars.length - 20; t += 2) {
      totalBarsEvaluated++;
      if (t < nextAllowed) continue;
      if (t > splitBar && t < splitBar + embargoBars) continue; // Embargo zone between Calibration and Holdout

      const barsCausal = bars.slice(0, t + 1);
      const futureBars = bars.slice(t + 1);
      const curPrice = bars[t]!.close;
      const frictionPrice =
        assetType === "FOREX" ? (spreadPipsOrPct + 0.35) * pip : curPrice * (spreadPipsOrPct + 0.0006);

      const prec = evaluatePrecisionTradeSetup({
        symbol,
        assetType,
        barsExecution: barsCausal,
        spreadPipsOrPct,
      });

      if (
        (prec.grade === "A+" || prec.grade === "A" || prec.grade === "B") &&
        prec.direction !== "NEUTRAL" &&
        prec.entry != null &&
        prec.stopLoss != null &&
        prec.tp1 != null &&
        prec.tp2 != null &&
        prec.tp3 != null
      ) {
        const out = simulateTradeOutcome({
          barsFuture: futureBars,
          direction: prec.direction,
          entryMode: prec.entryMode === "LIMIT_PULLBACK" ? "LIMIT_PULLBACK" : "MARKET_CONFIRMED",
          intendedEntry: prec.entry,
          stopLoss: prec.stopLoss,
          tp1: prec.tp1,
          tp2: prec.tp2,
          tp3: prec.tp3,
          frictionPrice,
          useBreakevenScaling: true,
        });

        if (out.filled) {
          const hmm = filterOnlineRegimeHmm(barsCausal);
          const cusum = applySymmetricCusumFilter(barsCausal);
          const har = forecastHarRealizedVolatility(barsCausal, assetType === "CRYPTO" ? 365 : 252);
          const isBuy = prec.direction === "BUY";
          const cusumAligned =
            (isBuy && cusum.latestBreak === "BULL_BREAK") || (!isBuy && cusum.latestBreak === "BEAR_BREAK")
              ? 1
              : -1;
          const features: MetaLabelFeatureVector = {
            primaryScoreNorm: prec.precisionScore / 100,
            hmmTrendProb: hmm.probabilities.trendExpansion,
            hmmCrisisProb: hmm.probabilities.crisisHighVol,
            cusumAligned,
            efficiencyRatio: prec.regime.efficiencyRatio,
            harVolExpansionRatio: har.expansionRatio,
            orderFlowAligned: prec.liquiditySweepDetected ? 0.5 : 0.2,
            liquiditySweepConfirmed: prec.liquiditySweepDetected ? 1 : 0,
            frictionR: prec.frictionR,
          };
          const rawProb = Math.min(0.84, Math.max(0.38, 0.30 + (prec.precisionScore / 100) * 0.56));

          if (t <= splitBar) {
            calSamples.push({
              startIdx: globalOffset + t,
              endIdx: globalOffset + t + Math.max(1, out.barsHeld),
              outcome: out.netR > 0 ? 1 : 0,
              netR: out.netR,
              features,
            });
            calRecords.push({ netR: out.netR, tp1Hit: out.tp1Hit, isTrap: false });
          } else {
            holdRecords.push({
              netR: out.netR,
              tp1Hit: out.tp1Hit,
              isTrap: false,
              rawProb,
              features,
            });
          }
          nextAllowed = t + Math.max(3, out.barsHeld);
        }
      }
    }
    globalOffset += bars.length + 20;
  }

  const model = trainPurgedMetaLabelClassifier(calSamples, 3);
  const oosOutcomes = holdRecords.map((r) => (r.netR > 0 ? (1 as const) : (0 as const)));
  const oosRawProbs = holdRecords.map((r) => r.rawProb);
  const oosCalProbs = holdRecords.map((r) => applyIsotonicCalibration(r.rawProb, model.calibration));
  const oosBrierBefore = computeBrierScore(oosRawProbs, oosOutcomes);
  const oosBrierAfter = computeBrierScore(oosCalProbs, oosOutcomes);

  const calibrationMetrics = summarizeTrades(calRecords, Math.floor(totalBarsEvaluated * 0.6), 4);
  const holdoutMetrics = summarizeTrades(holdRecords, Math.ceil(totalBarsEvaluated * 0.4), 4);

  const thresholds = [0.48, 0.53, 0.58, 0.63];
  const combined = [
    ...calSamples.map((s) => ({ netR: s.netR, prob: s.features.primaryScoreNorm })),
    ...holdRecords.map((r) => ({ netR: r.netR, prob: r.rawProb })),
  ];
  const foldCount = 4;
  const foldSize = Math.max(1, Math.floor(combined.length / foldCount));
  const trialMatrix = thresholds.map((th) => {
    const foldPerf: number[] = [];
    for (let f = 0; f < foldCount; f++) {
      const s = f * foldSize;
      const e = f === foldCount - 1 ? combined.length : (f + 1) * foldSize;
      let sumR = 0;
      for (let idx = s; idx < e; idx++) {
        if (combined[idx]!.prob >= th) sumR += combined[idx]!.netR;
      }
      foldPerf.push(sumR);
    }
    return foldPerf;
  });
  const pbo = calculateCombinatorialPurgedPbo(trialMatrix);

  return {
    totalBarsEvaluated,
    calibrationMetrics,
    holdoutMetrics,
    oosBrierBefore,
    oosBrierAfter,
    pbo,
  };
}
