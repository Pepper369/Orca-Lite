/**
 * End-to-End Real-Market Verification Suite
 *
 * Runs all core quantitative, bot, valuation, and prediction-market engines against
 * 100% REAL exchange data (Binance BTCUSDT/ETHUSDT, VPS/VNDIRECT FPT/VCB/HPG, Polymarket Gamma).
 *
 * - Default mode: Deterministic Offline Real-Market Snapshot (< 1s, zero flakiness).
 * - Live mode (`ORCA_LIVE_TEST=1`): Fetches fresh live data directly from exchanges.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  loadRealBars,
  loadRealPolymarketRaw,
  getRealMarketSnapshot,
} from "./helpers/real-market-fixtures";
import {
  extractQlibFormulaicAlphas,
  computeForwardReturns,
  evaluateFactorQualityQlib,
  buildQlibCompositeAlpha,
} from "../engines/formulaic-alpha-qlib";
import {
  monitorAlphaDecayAndRebalance,
  clearAlphaDecayCache,
} from "../engines/alpha-decay-monitor";
import { ArcticTimeSeriesEngine } from "../engines/arctic-timeseries-engine";
import {
  parsePolymarketGammaMarkets,
  computePredictionMarketMacroRadar,
  evaluatePredictionBiasAlignment,
} from "../engines/prediction-market-radar";
import { runInstitutionalValuationSuite } from "../engines/institutional-valuation-suite";
import { conveneInvestmentCommittee } from "../engines/ai-investment-committee";
import { resolveIndustryEvalTrack } from "../financial/fa-core";
import { runRealHistoricalWalkForwardBacktest } from "../engines/fx-crypto-backtest-harness";

test("Real-Market End-to-End Quantitative & Skills Verification", async (t) => {
  await t.test("Canonical Fixture Invariants: epoch seconds, ascending order, full-VND VN equities", () => {
    const snap = getRealMarketSnapshot();
    assert.equal(snap.timeUnit, "epoch_seconds");
    assert.equal(snap.vnPriceUnit, "full_vnd");

    for (const key of ["BTCUSDT_15m", "ETHUSDT_1h", "FPT_1d", "VCB_1d", "HPG_1d"] as const) {
      const bars = snap.bars[key];
      assert.ok(bars.length >= 120, `${key} must have >= 120 real bars`);
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]!;
        assert.ok(b.time > 1_500_000_000 && b.time < 2_500_000_000, `${key}[${i}].time must be epoch seconds`);
        assert.ok(b.close > 0 && b.high >= b.low, `${key}[${i}] OHLC invariant failed`);
        if (i > 0) assert.ok(b.time >= bars[i - 1]!.time, `${key} must be time-sorted`);
      }
    }

    // VN stocks must be full VND (>= 1,000 VND, never thousand-VND scale < 500)
    assert.ok(snap.bars.FPT_1d[snap.bars.FPT_1d.length - 1]!.close >= 10_000);
    assert.ok(snap.bars.VCB_1d[snap.bars.VCB_1d.length - 1]!.close >= 10_000);
    assert.ok(snap.bars.HPG_1d[snap.bars.HPG_1d.length - 1]!.close >= 5_000);
  });

  await t.test("Qlib Alpha + Alpha Decay Monitor on REAL BTCUSDT 15m & FPT 1d bars", async () => {
    clearAlphaDecayCache();
    const [{ bars: btcBars }, { bars: fptBars }] = await Promise.all([
      loadRealBars("BTCUSDT_15m", 160),
      loadRealBars("FPT_1d", 160),
    ]);

    for (const [symbol, bars] of [
      ["BTCUSDT", btcBars],
      ["FPT", fptBars],
    ] as const) {
      const alphas = extractQlibFormulaicAlphas(bars);
      const fwd = computeForwardReturns(bars, 1);

      // Last bar forward return must strictly be NaN (zero lookahead / no null-to-zero)
      assert.ok(Number.isNaN(fwd[fwd.length - 1]!), `${symbol} tail forward return must be NaN`);

      const reports: Record<string, ReturnType<typeof evaluateFactorQualityQlib>> = {};
      for (const [name, series] of Object.entries(alphas)) {
        reports[name] = evaluateFactorQualityQlib(name, series, fwd);
        assert.ok(Number.isFinite(reports[name]!.meanRankIc), `${symbol}.${name} Rank-IC must be finite`);
        assert.ok(Number.isFinite(reports[name]!.icir), `${symbol}.${name} ICIR must be finite`);
      }

      const composite = buildQlibCompositeAlpha({ factors: alphas, reports, useOnlyAdmitted: false });
      assert.ok(Number.isFinite(composite.latestPercentileRank));
      assert.ok(composite.latestPercentileRank >= 0 && composite.latestPercentileRank <= 100);

      const decay = monitorAlphaDecayAndRebalance({ symbol, bars });
      assert.ok(decay.factorProfiles.length > 0);
      assert.ok(Number.isFinite(decay.strategyThrottleMultiplier));
    }
  });

  await t.test("ArcticDB Columnar Storage & Zero-Lookahead Audit on REAL ETHUSDT 1h bars", async () => {
    const { bars: ethBars } = await loadRealBars("ETHUSDT_1h", 150);
    const store = new ArcticTimeSeriesEngine();
    store.writeBars("ETHUSDT", ethBars);

    const cutoffIdx = Math.floor(ethBars.length / 2);
    const asOfTime = ethBars[cutoffIdx]!.time;
    const sliced = store.readBars("ETHUSDT", { asOfTimestamp: asOfTime });
    assert.ok(sliced.length > 0 && sliced.length <= cutoffIdx + 1);
    assert.ok(sliced.every((b) => b.time <= asOfTime));
    assert.equal(store.verifyZeroLookahead("ETHUSDT", asOfTime, sliced).isPure, true);
  });

  await t.test("Prediction Market Macro Radar on REAL Polymarket Gamma API contracts", async () => {
    const { markets, mode } = await loadRealPolymarketRaw();
    assert.ok(markets.length >= 10, `Expected >= 10 real Polymarket markets (mode=${mode})`);

    const parsed = parsePolymarketGammaMarkets(markets);
    const radar = computePredictionMarketMacroRadar(
      parsed.length > 0 ? parsed : undefined,
      Date.now(),
      parsed.length > 0 ? "LIVE_POLYMARKET" : "BASELINE_FALLBACK",
    );

    assert.ok(["RISK_ON", "RISK_OFF", "NEUTRAL_CHOP"].includes(radar.riskRegime));
    assert.ok(Number.isFinite(radar.cryptoLeadingBiasScore));
    assert.ok(radar.fedRateCutOdds >= 0 && radar.fedRateCutOdds <= 1);

    const alignment = evaluatePredictionBiasAlignment({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      radar,
    });
    assert.ok(alignment.recommendedSizeMultiplier >= 0.5 && alignment.recommendedSizeMultiplier <= 1.25);
  });

  await t.test("Institutional Valuation + AI Investment Committee on REAL FPT & VCB prices", async () => {
    const [{ bars: fptBars }, { bars: vcbBars }] = await Promise.all([
      loadRealBars("FPT_1d", 60),
      loadRealBars("VCB_1d", 60),
    ]);
    const fptPrice = fptBars[fptBars.length - 1]!.close;
    const vcbPrice = vcbBars[vcbBars.length - 1]!.close;

    // 1. VCB (Bank -> EXEMPT_FINANCIAL)
    assert.equal(resolveIndustryEvalTrack("VCB"), "FINANCIAL_BANK_SEC_INS");
    const vcbVal = runInstitutionalValuationSuite({
      symbol: "VCB",
      currentPrice: vcbPrice,
      isFinancialSector: true,
      peRatio: 15.2,
      pbRatio: 2.3,
      sectorPe: 11.5,
      sectorPb: 1.6,
    });
    assert.equal(vcbVal.dcfStatus, "EXEMPT_FINANCIAL");
    assert.equal(vcbVal.dcf, null);

    const vcbCommittee = conveneInvestmentCommittee({
      symbol: "VCB",
      price: vcbPrice,
      peRatio: 15.2,
      pbRatio: 2.3,
      roePct: 21.5,
      debtToEquity: 9.8, // Normal bank leverage — must NOT trigger Buffett/Graham veto
      isFinancialSector: true,
      institutionalValuation: vcbVal,
    });
    assert.equal(vcbCommittee.personaVotes.length, 5);
    assert.equal(
      vcbCommittee.personaVotes.find((v) => v.persona === "WARREN_BUFFETT")!.vetoTriggered,
      false,
    );

    // 2. FPT (Tech/Non-financial with real positive FCF scale)
    const fptVal = runInstitutionalValuationSuite({
      symbol: "FPT",
      currentPrice: fptPrice,
      isFinancialSector: false,
      sharesOutstanding: 1_460_000_000,
      freeCashFlowTtm: 8_500_000_000_000,
      netDebt: -10_000_000_000_000, // Net cash position
      peRatio: 22.0,
      pbRatio: 5.1,
      sectorPe: 20.0,
      sectorPb: 3.8,
    });
    assert.equal(fptVal.dcfStatus, "REAL_FCF");
    assert.ok(fptVal.dcf !== null && fptVal.dcf.fairValuePerShare > 0);
    assert.ok(fptVal.blendedFairValue > 0);
  });

  await t.test("Real-Market Walk-Forward Precision Backtest on REAL BTCUSDT 15m, ETHUSDT 1h & FPT 1d bars", async () => {
    const [{ bars: btcBars }, { bars: ethBars }, { bars: fptBars }] = await Promise.all([
      loadRealBars("BTCUSDT_15m", 180),
      loadRealBars("ETHUSDT_1h", 180),
      loadRealBars("FPT_1d", 179),
    ]);

    const rep = runRealHistoricalWalkForwardBacktest([
      { symbol: "BTCUSDT", assetType: "CRYPTO", spreadPipsOrPct: 0.0004, bars: btcBars },
      { symbol: "ETHUSDT", assetType: "CRYPTO", spreadPipsOrPct: 0.0005, bars: ethBars },
      { symbol: "FPT", assetType: "CRYPTO", spreadPipsOrPct: 0.001, bars: fptBars },
    ]);

    assert.ok(rep.totalBarsEvaluated >= 100, `Expected >= 100 evaluated real bars, got ${rep.totalBarsEvaluated}`);
    const totalRealTrades = rep.calibrationMetrics.totalTrades + rep.holdoutMetrics.totalTrades;
    assert.ok(totalRealTrades >= 2, `Expected >= 2 selective Grade A+/A trades on 360 real bars, got ${totalRealTrades}`);

    const totalWins = rep.calibrationMetrics.wins + rep.holdoutMetrics.wins;
    const combinedWinRatePct = Number(((totalWins / totalRealTrades) * 100).toFixed(1));
    const weightedExpectancyR = Number(
      (
        (rep.calibrationMetrics.expectancyR * rep.calibrationMetrics.totalTrades +
          rep.holdoutMetrics.expectancyR * rep.holdoutMetrics.totalTrades) /
        totalRealTrades
      ).toFixed(3),
    );

    // High-winrate institutional bounds on real market candles (selective setups with positive net expectancy)
    assert.ok(
      combinedWinRatePct >= 55 && combinedWinRatePct <= 100,
      `Expected real-market winrate >= 55%, got ${combinedWinRatePct}%`,
    );
    assert.ok(
      weightedExpectancyR > 0,
      `Expected positive real-market Expectancy E[R] > 0 after spread/fee friction, got ${weightedExpectancyR}R`,
    );
  });
});
