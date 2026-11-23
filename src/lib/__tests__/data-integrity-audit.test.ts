import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import { computeForwardReturns } from "../engines/formulaic-alpha-qlib";
import {
  estimateAlphaHalfLife,
  rebalanceFactorWeights,
  monitorAlphaDecayAndRebalance,
  clearAlphaDecayCache,
} from "../engines/alpha-decay-monitor";
import { ArcticTimeSeriesEngine } from "../engines/arctic-timeseries-engine";
import {
  evaluateBuffettPersona,
  evaluateGrahamPersona,
  evaluateBurryPersona,
} from "../engines/ai-investment-committee";
import {
  calculateWaccFromComponents,
  computeRelativeMultiplesScorecard,
} from "../engines/institutional-valuation-suite";
import { calculateOptionGreeks } from "../engines/institutional-greeks-gsquant";
import {
  computePredictionMarketMacroRadar,
  type PredictionMarketContract,
} from "../engines/prediction-market-radar";
import {
  evaluateDynamicTimeDecayRoiExit,
  evaluatePositiveTrailingStop,
} from "../engines/bot-trade-lifecycle-engine";

describe("Data Integrity & Quantitative Truth-in-Data Audit Regressions", () => {
  it("computeForwardReturns leaves unrealized tail as NaN (no null-to-zero coercion)", () => {
    const bars: OhlcvBar[] = [
      { time: 1, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
      { time: 2, open: 100, high: 112, low: 99, close: 110, volume: 1000 },
      { time: 3, open: 110, high: 122, low: 108, close: 121, volume: 1000 },
    ];
    const ret1 = computeForwardReturns(bars, 1);
    assert.equal(ret1.length, 3);
    assert.equal(ret1[0], 0.1);
    assert.equal(ret1[1], 0.1);
    assert.ok(Number.isNaN(ret1[2]), "Last bar forward return must be NaN, not 0");

    const ret2 = computeForwardReturns(bars, 2);
    assert.equal(ret2[0], 0.21);
    assert.ok(Number.isNaN(ret2[1]));
    assert.ok(Number.isNaN(ret2[2]));
  });

  it("alpha-decay-monitor handles NaN values safely without poisoning weights", () => {
    const hl = estimateAlphaHalfLife([1, Number.NaN, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.ok(Number.isFinite(hl) && hl > 0);

    const rebalanced = rebalanceFactorWeights([
      {
        factorName: "BAD_NAN",
        historicalRankIc: 0.05,
        recentRankIc: Number.NaN,
        deltaRankIc: Number.NaN,
        decayRatePct: 0,
        recentIcir: Number.NaN,
        halfLifeBars: 10,
        isDecaying: false,
        status: "STABLE",
        statusVi: "Ổn định",
      },
      {
        factorName: "GOOD",
        historicalRankIc: 0.05,
        recentRankIc: 0.08,
        deltaRankIc: 0.03,
        decayRatePct: 60,
        recentIcir: 0.9,
        halfLifeBars: 15,
        isDecaying: false,
        status: "EXPANDING",
        statusVi: "Mở rộng",
      },
    ]);
    assert.equal(rebalanced[0]!.rebalancedWeight, 0);
    assert.equal(rebalanced[1]!.rebalancedWeight, 1);
    clearAlphaDecayCache();
    const shortReport = monitorAlphaDecayAndRebalance({ symbol: "TEST", bars: [] });
    assert.equal(shortReport.evaluatedBarsCount, 0);
  });

  it("ArcticTimeSeriesEngine preserves customColumns alignment when input bars are unsorted", () => {
    const engine = new ArcticTimeSeriesEngine();
    const unsortedBars: OhlcvBar[] = [
      { time: 300, open: 30, high: 31, low: 29, close: 30, volume: 300 },
      { time: 100, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: 200, open: 20, high: 21, low: 19, close: 20, volume: 200 },
    ];
    engine.writeBars("VCB", unsortedBars, {
      customColumns: { vwap: [30.5, 10.5, 20.5] },
    });
    const out = engine.readBars("VCB");
    assert.deepEqual(
      out.map((b) => b.time),
      [100, 200, 300],
    );
    // Access chunk directly via private inspection or snapshot stats
    const anyEngine = engine as unknown as {
      chunks: Map<string, { timestamps: number[]; customColumns: Record<string, number[]> }>;
    };
    const firstChunk = [...anyEngine.chunks.values()][0]!;
    assert.deepEqual(firstChunk.timestamps, [100, 200, 300]);
    assert.deepEqual(firstChunk.customColumns.vwap, [10.5, 20.5, 30.5]);
  });

  it("AI Investment Committee exempts Bank/Financial sector from D/E and Current Ratio penalties", () => {
    const bankInput = {
      symbol: "VCB",
      price: 90_000,
      isFinancialSector: true,
      roePct: 21,
      peRatio: 12,
      pbRatio: 1.4,
      debtToEquity: 11.5, // normal bank leverage
      currentRatio: 0.4, // meaningless for banks
      tailRiskScore: 25,
    };
    const buffett = evaluateBuffettPersona(bankInput, 0.25);
    const graham = evaluateGrahamPersona(bankInput, 0.25);
    const burry = evaluateBurryPersona(bankInput, 0.25);

    assert.equal(buffett.vetoTriggered, false);
    assert.equal(graham.vetoTriggered, false);
    assert.ok(buffett.convictionScore > 50);
    assert.ok(graham.convictionScore >= 50);
    assert.ok(burry.convictionScore > 0);
  });

  it("Institutional Valuation Suite guards zero/NaN weights and zero sector medians", () => {
    const wacc = calculateWaccFromComponents({ equityWeight: 0, debtWeight: 0 });
    assert.ok(Number.isFinite(wacc) && wacc >= 0.06 && wacc <= 0.25);

    const card = computeRelativeMultiplesScorecard({
      currentPrice: 50_000,
      pe: 12,
      sectorPe: 0, // must not divide by zero
      pb: 1.5,
      sectorPb: Number.NaN,
      evEbitda: Number.POSITIVE_INFINITY, // must be ignored
    });
    assert.ok(Number.isFinite(card.impliedFairValuePerShare));
    assert.ok(Number.isFinite(card.upsidePct));
    assert.equal(card.multiples.length, 2);
  });

  it("calculateOptionGreeks never leaks NaN/Infinity on zero or negative spot/strike", () => {
    const res = calculateOptionGreeks({
      optionType: "CALL",
      underlyingPrice: 0,
      strikePrice: -10,
      timeToMaturityYears: 0.5,
      volatility: 0.25,
    });
    assert.ok(Number.isFinite(res.price));
    assert.ok(Number.isFinite(res.delta));
    assert.ok(Number.isFinite(res.gamma));
    assert.ok(Number.isFinite(res.vega));
    assert.ok(Number.isFinite(res.thetaDaily));
  });

  it("Prediction Market Radar ignores NaN probability contracts and clamps out-of-range values", () => {
    const contracts: PredictionMarketContract[] = [
      {
        id: "bad_nan",
        platform: "POLYMARKET",
        title: "Malformed",
        category: "FED_RATES",
        impliedProbability: Number.NaN,
        volume24hUsd: 1_000_000,
        lastUpdatedTimestamp: Date.now(),
      },
      {
        id: "over_one",
        platform: "POLYMARKET",
        title: "Clamped",
        category: "FED_RATES",
        impliedProbability: 1.8,
        volume24hUsd: 1_000_000,
        lastUpdatedTimestamp: Date.now(),
      },
    ];
    const snap = computePredictionMarketMacroRadar(contracts, Date.now(), "CUSTOM_INPUT");
    assert.equal(snap.fedRateCutOdds, 1);
    assert.ok(Number.isFinite(snap.cryptoLeadingBiasScore));
  });

  it("Bot Trade Lifecycle handles empty customSchedule and uses asset-accurate pipSize for JPY/XAU", () => {
    const roi = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: 100,
      markPrice: 101,
      stopLossPrice: 99,
      openedTimestampMs: Date.now() - 30 * 60_000,
      customSchedule: [],
    });
    assert.equal(roi.shouldExit, true);

    const xauTrail = evaluatePositiveTrailingStop({
      symbol: "XAUUSD",
      assetType: "FOREX",
      direction: "BUY",
      entryPrice: 2600,
      currentStopLoss: 2580,
      markPrice: 2630,
      riskDist: 20,
    });
    assert.equal(xauTrail.isTrailingActive, true);
    assert.equal(xauTrail.isImproved, true);
    assert.ok(xauTrail.newStopLossPrice > 2600);
  });
});
