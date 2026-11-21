import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OhlcvBar } from "../types";
import {
  applySymmetricCusumFilter,
  computeYangZhangVolatility,
  estimateTailDegreesOfFreedom,
  filterOnlineRegimeHmm,
  forecastHarRealizedVolatility,
  normCdf,
  studentTCdf,
} from "../engines/advanced-quant-math";
import {
  applyIsotonicCalibration,
  buildPurgedEmbargoedSplits,
  calculateCombinatorialPurgedPbo,
  computeBrierScore,
  computeSampleUniquenessWeights,
  fitIsotonicCalibration,
  predictMetaLabelProbability,
  trainPurgedMetaLabelClassifier,
  type MetaLabelTrainingSample,
} from "../engines/meta-labeling-calibration";
import {
  BENCHMARK_ASSETS,
  generateRegimeBars,
  runPurgedMetaLabelWalkForward,
  runRealHistoricalWalkForwardBacktest,
} from "../engines/fx-crypto-backtest-harness";
import { evaluatePrecisionTradeSetup } from "../engines/fx-crypto-precision-engine";
import { calculateRequiredSpeedPace } from "../engines/quant-reversal-pace";
import {
  runScreenerBacktest,
  VN_EQUITY_ROUND_TRIP_COST_PCT,
} from "../engines/screener-backtest-engine";
import { executeBacktest, FIREANT_STRATEGIES } from "../quant/quant-engine";

function makeSyntheticBars(count: number, driftPerBar = 0.002, shockEvery = 0): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 6) * 0.004;
    const shock = shockEvery > 0 && i > 0 && i % shockEvery === 0 ? (i % (shockEvery * 2) === 0 ? 0.045 : -0.045) : 0;
    const open = price * (1 + wave * 0.2);
    const close = Math.max(5, open * (1 + driftPerBar + wave + shock));
    const spread = Math.abs(close - open) + price * 0.006;
    const high = Math.max(open, close) + spread * 0.45;
    const low = Math.max(1, Math.min(open, close) - spread * 0.45);
    bars.push({
      time: 1710000000 + i * 86400,
      open,
      high,
      low,
      close,
      volume: 150000 + (i % 7) * 25000,
    });
    price = close;
  }
  return bars;
}

describe("Phase 1 Quant Models: Regime HMM, HAR-RV, Meta-Labeling, Isotonic Calibration & VN T+2.5 Microstructure", () => {
  it("P1-01: Fat-Tailed Student-t CDF, Yang-Zhang Volatility & HAR-RV Multi-Horizon Forecast", () => {
    // Student-t has heavier tails than Gaussian: for z = -2.5, P_t(Z <= -2.5) > Phi(-2.5)
    const zNeg = -2.5;
    const pGauss = normCdf(zNeg);
    const pStudentNu4 = studentTCdf(zNeg, 4);
    assert.ok(
      pStudentNu4 > pGauss * 1.8,
      `Expected fat-tailed Student-t(df=4) tail probability ${pStudentNu4} > 1.8x Gaussian ${pGauss}`,
    );
    assert.ok(Math.abs(studentTCdf(0, 5) - 0.5) < 1e-6);

    // Fat-tailed return series should estimate lower degrees of freedom than mild cosine returns
    const fatReturns: number[] = [];
    for (let i = 0; i < 80; i++) {
      fatReturns.push(i % 11 === 0 ? 0.065 : i % 13 === 0 ? -0.062 : ((i % 5) - 2) * 0.0015);
    }
    const dfEst = estimateTailDegreesOfFreedom(fatReturns);
    assert.ok(dfEst >= 3 && dfEst <= 8, `Expected fat-tailed df in [3, 8], got ${dfEst}`);

    // Reversal speed pace exposes fat-tailed Student-t probability alongside Gaussian reference
    const pace = calculateRequiredSpeedPace({
      symbol: "BTCUSDT",
      currentPrice: 91000,
      pivotReversalPrice: 92200,
      atrValue: 400,
      historicalAvgVelocityPerMin: 25,
      historicalStdVelocityPerMin: 12,
      targetTimeMinutes: 15,
      degreesOfFreedom: 4,
    });
    assert.equal(pace.degreesOfFreedom, 4);
    assert.ok(pace.reversalProbability >= pace.gaussianReversalProbability);

    const bars = makeSyntheticBars(70, 0.0015, 9);
    const yz = computeYangZhangVolatility(bars, 20, 252);
    assert.ok(yz.annualizedVol > 0, "Yang-Zhang annualized volatility must be positive");
    assert.ok(yz.rogersSatchellVol > 0, "Rogers-Satchell volatility must be positive");

    const har = forecastHarRealizedVolatility(bars, 252);
    assert.ok(har.forecastAnnualVolPct > 0);
    assert.ok(har.rvDailyPct > 0 && har.rvWeeklyPct > 0 && har.rvMonthlyPct > 0);
    assert.ok(["VOL_COMPRESSING", "VOL_NORMAL", "VOL_EXPANDING", "VOL_SHOCK"].includes(har.harRegime));
  });

  it("P1-02: Causal Online 3-State HMM Forward Filter & Symmetric CUSUM Filter (Zero Look-Ahead)", () => {
    const fullBars = makeSyntheticBars(90, 0.003, 0);
    const cutoff = 60;
    const prefixA = fullBars.slice(0, cutoff);

    // Mutate future bars [cutoff..89] with extreme crash shocks
    const mutatedBars = fullBars.map((b, idx) =>
      idx < cutoff
        ? { ...b }
        : {
            ...b,
            open: b.open * 0.4,
            high: b.high * 0.45,
            low: b.low * 0.25,
            close: b.close * 0.3,
          },
    );
    const prefixB = mutatedBars.slice(0, cutoff);

    const hmmA = filterOnlineRegimeHmm(prefixA);
    const hmmB = filterOnlineRegimeHmm(prefixB);
    assert.deepEqual(hmmA, hmmB, "Online HMM filter must be strictly causal with zero future leakage");
    const probSum =
      hmmA.probabilities.trendExpansion +
      hmmA.probabilities.meanRevertLowVol +
      hmmA.probabilities.crisisHighVol;
    assert.ok(Math.abs(probSum - 1) < 0.002, `HMM state probabilities must sum to 1, got ${probSum}`);

    const cusum = applySymmetricCusumFilter(fullBars, 1.0);
    assert.ok(cusum.eventIndices.length > 0, "Uptrending series must trigger bullish CUSUM structural breaks");
    assert.equal(cusum.latestBreak, "BULL_BREAK");
  });

  it("P1-03: Sample Uniqueness, Purged & Embargoed K-Fold CV, PAVA Isotonic Calibration & CPCV PBO", () => {
    const spans = [
      { startIdx: 0, endIdx: 10 },
      { startIdx: 2, endIdx: 10 },
      { startIdx: 4, endIdx: 10 },
      { startIdx: 25, endIdx: 30 }, // Completely non-overlapping trade
    ];
    const uniqueness = computeSampleUniquenessWeights(spans);
    assert.equal(uniqueness.length, 4);
    assert.ok(
      uniqueness[3]! > uniqueness[1]!,
      "Non-overlapping trade span must receive higher uniqueness weight than overlapping cluster",
    );

    // Purged & Embargoed K-Fold splits must purge overlapping training spans and embargo post-test buffer
    const manySpans = Array.from({ length: 40 }, (_, idx) => ({
      startIdx: idx * 3,
      endIdx: idx * 3 + 5,
    }));
    const splits = buildPurgedEmbargoedSplits(manySpans, 4, 0.05);
    assert.equal(splits.length, 4);
    for (const sp of splits) {
      assert.ok(sp.purgedCount > 0, "Overlapping multi-bar trades across fold boundaries must be purged");
      const testFirst = sp.testIndices[0]!;
      const testLast = sp.testIndices[sp.testIndices.length - 1]!;
      const testStartBar = manySpans[testFirst]!.startIdx;
      const testEndBar = manySpans[testLast]!.endIdx;
      for (const trIdx of sp.trainIndices) {
        const tr = manySpans[trIdx]!;
        const overlapsTest = tr.startIdx <= testEndBar && tr.endIdx >= testStartBar;
        assert.equal(overlapsTest, false, `Train sample ${trIdx} overlaps test window [${testStartBar}, ${testEndBar}]`);
      }
    }

    // PAVA Isotonic Calibration must produce non-decreasing bins and reduce Brier Score
    const rawProbs: number[] = [];
    const samples: MetaLabelTrainingSample[] = Array.from({ length: 48 }, (_, idx) => {
      const scoreNorm = 0.35 + (idx / 48) * 0.58;
      const win: 0 | 1 = scoreNorm >= 0.62 || (scoreNorm >= 0.52 && idx % 3 !== 0) ? 1 : 0;
      const rawProb = Math.min(0.96, Math.max(0.05, scoreNorm * 1.15));
      rawProbs.push(rawProb);
      return {
        startIdx: idx * 4,
        endIdx: idx * 4 + 3,
        outcome: win,
        netR: win ? 1.45 : -1.0,
        features: {
          primaryScoreNorm: scoreNorm,
          hmmTrendProb: win ? 0.68 : 0.25,
          hmmCrisisProb: win ? 0.08 : 0.42,
          cusumAligned: win ? 1 : -1,
          efficiencyRatio: win ? 0.58 : 0.22,
          harVolExpansionRatio: 1.02,
          orderFlowAligned: win ? 0.45 : -0.25,
          liquiditySweepConfirmed: win ? 1 : 0,
          frictionR: 0.06,
        },
      };
    });

    const curve = fitIsotonicCalibration(
      rawProbs,
      samples.map((s) => s.outcome),
    );
    for (let i = 1; i < curve.bins.length; i++) {
      assert.ok(
        curve.bins[i]!.calibratedProb >= curve.bins[i - 1]!.calibratedProb - 1e-9,
        "Isotonic calibration curve must be monotonically non-decreasing",
      );
    }

    const trained = trainPurgedMetaLabelClassifier(samples, 4);
    assert.ok(
      trained.oofBrierScoreAfter <= trained.oofBrierScoreBefore,
      `Expected calibrated Brier score ${trained.oofBrierScoreAfter} <= raw ${trained.oofBrierScoreBefore}`,
    );

    const highPred = predictMetaLabelProbability(samples[45]!.features, trained);
    const lowPred = predictMetaLabelProbability(samples[2]!.features, trained);
    assert.ok(
      highPred.calibratedProbability > lowPred.calibratedProbability,
      "Trained meta-label classifier must assign higher probability to high-confluence setup",
    );

    // Combinatorial Purged PBO on consistent positive-alpha trial matrix must be low (< 0.25)
    const trialMatrix = [
      [1.45, 1.52, 1.48, 1.55, 1.49, 1.51],
      [1.22, 1.25, 1.21, 1.28, 1.24, 1.23],
      [0.95, 0.98, 0.92, 0.96, 0.94, 0.97],
      [0.65, 0.68, 0.62, 0.64, 0.66, 0.63],
    ];
    const pbo = calculateCombinatorialPurgedPbo(trialMatrix);
    assert.ok(pbo.pbo < 0.25, `Expected low PBO < 0.25 for consistent strategy family, got ${pbo.pbo}`);
    assert.equal(pbo.isOverfit, false);
  });

  it("P1-04: Precision Engine Enriched Regime + Purged Walk-Forward & Historical Replay Harness", () => {
    const asset = BENCHMARK_ASSETS[3]!; // BTCUSDT
    const { bars } = generateRegimeBars(asset, "CLEAN_UPTREND_PULLBACK", 404);
    const setup = evaluatePrecisionTradeSetup({
      symbol: asset.symbol,
      assetType: asset.assetType,
      barsExecution: bars.slice(0, 70),
      spreadPipsOrPct: asset.spreadPipsOrPct,
    });
    assert.ok(setup.regime.hmmState != null, "Precision setup must include online HMM regime state");
    assert.ok(setup.regime.yangZhangVolPct != null && setup.regime.yangZhangVolPct > 0);
    assert.ok(setup.regime.harForecastVolPct != null && setup.regime.harForecastVolPct > 0);
    assert.ok(setup.metaLabelProbability != null && setup.metaLabelProbability > 0);

    const wfReport = runPurgedMetaLabelWalkForward({
      calibrationSeeds: [101, 202],
      holdoutSeeds: [404, 505],
      assets: BENCHMARK_ASSETS.slice(0, 3),
    });
    assert.ok(wfReport.calibrationSamplesCount > 20);
    assert.ok(wfReport.holdoutSamplesCount > 20);
    assert.ok(
      wfReport.oosBrierAfter <= wfReport.oosBrierBefore,
      `Expected OOS Brier after calibration (${wfReport.oosBrierAfter}) <= before (${wfReport.oosBrierBefore})`,
    );
    assert.ok(wfReport.metaFilteredMetrics.winRatePct >= 80);

    // Real Historical Walk-Forward Replay with 60/40 Embargoed Split
    const histSeries = BENCHMARK_ASSETS.slice(0, 2).map((a, idx) => ({
      symbol: a.symbol,
      assetType: a.assetType,
      spreadPipsOrPct: a.spreadPipsOrPct,
      bars: generateRegimeBars(a, "CLEAN_UPTREND_PULLBACK", 700 + idx * 19, 120).bars,
    }));
    const histReport = runRealHistoricalWalkForwardBacktest(histSeries);
    assert.ok(histReport.totalBarsEvaluated > 20);
    assert.ok(histReport.holdoutMetrics.totalTrades > 0);
  });

  it("P1-05: Vietnam Equity T+2.5 Settlement Hold Lock, Ceiling-Lock Entry Filter & 0.45% Round-Trip Cost", async () => {
    // Construct a deterministic 90-bar series where a breakout triggers at bar 60,
    // and bar 61 (T+0) / bar 62 (T+1) dip below stop-loss before recovering on T+2 (bar 63).
    // Under Vietnam T+2.5 rule, the position CANNOT exit on T+0 or T+1 (`daysHeld < 2`).
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < 85; i++) {
      let open = 50;
      let high = 50.6;
      let low = 49.5;
      let close = 50 + (i % 4) * 0.1;
      let volume = 200000;

      if (i === 60) {
        // Breakout signal bar: close > maxHigh20 (50.6) and volume >= 1.3x avgVol20
        open = 50.5;
        high = 52.2;
        low = 50.4;
        close = 52.0;
        volume = 650000;
      } else if (i === 61) {
        // T+0 Entry bar: opens at 52.2, then dips intra-bar to 47.0 (-10%, well below 7% SL)
        // Because daysHeld === 0 (< 2), T+2.5 settlement lock prevents selling on T+0!
        open = 52.2;
        high = 52.4;
        low = 47.0;
        close = 47.5;
        volume = 300000;
      } else if (i === 62) {
        // T+1 bar (daysHeld === 1 < 2): still locked in settlement
        open = 48.0;
        high = 53.0;
        low = 47.8;
        close = 52.8;
        volume = 280000;
      } else if (i >= 63) {
        // T+2 onwards (daysHeld >= 2): shares arrive in account and hit +16% Take Profit at bar 64
        open = 53.5 + (i - 63) * 4.0;
        high = open + 4.5;
        low = open - 0.3;
        close = open + 4.0;
        volume = 350000;
      }

      bars.push({
        time: 1704067200 + i * 86400,
        open,
        high,
        low,
        close,
        volume,
      });
    }

    const res = await runScreenerBacktest({
      strategy: "breakout",
      holdingDays: 10,
      stopLossPct: 7,
      takeProfitPct: 15,
      preloadedBars: [{ symbol: "FPT", bars }],
    });

    assert.ok(res.trades.length >= 1, "Expected at least 1 executed breakout trade on FPT");
    const firstTrade = res.trades[0]!;
    assert.equal(firstTrade.t2Locked, true);
    assert.ok(
      firstTrade.holdingDays >= 2,
      `Vietnam T+2.5 rule violated: trade exited after ${firstTrade.holdingDays} days (< 2)`,
    );
    assert.equal(firstTrade.transactionCostPct, VN_EQUITY_ROUND_TRIP_COST_PCT);
    assert.equal(
      Number(((firstTrade.grossReturnPct ?? 0) - VN_EQUITY_ROUND_TRIP_COST_PCT).toFixed(2)),
      firstTrade.returnPct,
      "Net returnPct must equal grossReturnPct minus 0.45% VN round-trip transaction cost",
    );

    // Ceiling-locked open (+7% gap with zero high-low range) must block entry on bar 61
    const ceilingLockedBars = bars.map((b, idx) =>
      idx === 61
        ? {
            ...b,
            open: 55.64, // +7.0% above bar 60 close (52.0)
            high: 55.64,
            low: 55.64,
            close: 55.64,
          }
        : b,
    );
    const ceilingRes = await runScreenerBacktest({
      strategy: "breakout",
      holdingDays: 10,
      stopLossPct: 7,
      takeProfitPct: 15,
      preloadedBars: [{ symbol: "FPT", bars: ceilingLockedBars }],
    });
    const enteredAtBar61 = ceilingRes.trades.some((t) => t.entryPrice === 55.64);
    assert.equal(enteredAtBar61, false, "Must not allow entry when next bar opens locked at +7% ceiling");

    // Quant Engine executeBacktest must differentiate parameters without artificial alphaOffset
    const strat = FIREANT_STRATEGIES[0]!;
    const runFast = executeBacktest(strat, { fast: 6, slow: 22, trail: 0.05 });
    const runSlow = executeBacktest(strat, { fast: 24, slow: 85, trail: 0.16 });
    assert.notEqual(runFast.metrics.totalReturn, runSlow.metrics.totalReturn);
  });
});
