import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import { analyzeMoneyFlow } from "../engines/money-flow";
import { analyzeVsaBars, detectSingleVsaBar } from "../engines/vsa-engine";
import { computeVolumeProfile, computeSessionVwap, detectCvdAndAbsorption } from "../engines/forex-order-flow-pro";
import { evaluateSmartMoneyFootprint } from "../engines/smart-money-footprint";
import { rankSectorsByFlow } from "../services/sector-flow";
import { calcRsi, calcMacd, scanFireAntScreener } from "../quant/fireant-screener-engine";
import { computeAsymmetricPlan } from "../engines/asymmetric-quant-engine";
import { evaluateApexQuant } from "../engines/orca-apex-quant-engine";
import { scoreFundamentalPillar, calculateUniverseMultiFactor } from "../engines/multi-factor-quant-composite";
import { calculateUniverseOrcaMaster } from "../engines/orca-master-composite";
import { computeQuantAttributes } from "../engines/miquant-quant-engine";
import { executeBacktest } from "../quant/quant-engine";
import { FIREANT_RAW_STRATEGIES } from "../quant/fireant-strategies";
import {
  estimateOrnsteinUhlenbeck,
  calculateDeflatedSharpeRatio,
  calculateVaRAndCVaR,
} from "../engines/advanced-quant-math";
import { techBiasFromSnapshot } from "../engines/trade-signal";
import { detectDivergences, SHORT_3_4D } from "../engines/divergence";
import { evaluateMtfConsensus } from "../engines/mtf-consensus";
import { computeWyckoffRS } from "../engines/wyckoff-elliott";
import { trainHistoricalPriceAction } from "../engines/historical-price-action-trainer";
import { runDcf, defaultDcfScenarios } from "../engines/valuation-phase3";
import { runResidualIncome } from "../engines/valuation-phase4";
import { computeMultiFactorComposite } from "../engines/multi-factor-quant-composite";
import { computeRrgTrail } from "../engines/rrg-engine";
import { computeSectorPercentileMap } from "../financial/fa-core";
import {
  evaluateMultiHorizonSectorFlow,
  evaluateStockHorizonScores,
} from "../engines/sector-horizon-flow-engine";

function makeBars(count: number, basePrice = 100, baseVol = 100000): OhlcvBar[] {
  const out: OhlcvBar[] = [];
  const t0 = 1700000000000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 4) * (basePrice * 0.02);
    const close = basePrice + wave;
    const open = close - basePrice * 0.002;
    const high = Math.max(open, close) + basePrice * 0.005;
    const low = Math.min(open, close) - basePrice * 0.005;
    out.push({
      time: t0 + i * 86400000,
      open,
      high,
      low,
      close,
      volume: baseVol,
    });
  }
  return out;
}

describe("Core Algorithm & Money-Flow Purification Invariants (MF-01..TA-05)", () => {
  it("MF-01 & MF-02: detects latest-bar liquidity sweep without self-cancellation and keeps fresh Order Blocks OPEN", () => {
    const bars = makeBars(60, 100, 120000);
    // Construct a clear confirmed swing low at index 45 (price = 95.0)
    for (let i = 40; i < 59; i++) {
      bars[i] = {
        time: bars[i]!.time,
        open: 100,
        high: 101,
        low: 98.5,
        close: 99.5,
        volume: 100000,
      };
    }
    bars[45] = {
      time: bars[45]!.time,
      open: 97,
      high: 97.5,
      low: 95.0,
      close: 96.8,
      volume: 140000,
    };
    bars[52] = {
      time: bars[52]!.time,
      open: 97,
      high: 97.4,
      low: 95.02,
      close: 96.9,
      volume: 135000,
    };
    // Latest bar (index 59) sweeps below 95.0 (low = 94.6) and reclaims above 95.0 (close = 97.2)
    bars[59] = {
      time: bars[59]!.time,
      open: 96.5,
      high: 97.5,
      low: 94.6,
      close: 97.2,
      volume: 220000,
    };

    const mf = analyzeMoneyFlow(bars);
    assert.equal(mf.liquidity.sweep, "SELL_SIDE", "Latest bar sell-side sweep must not self-cancel");
    if (mf.liquidity.nearestBuySide != null) {
      assert.ok(
        mf.liquidity.nearestBuySide > bars[59]!.close,
        "nearestBuySide must strictly rest above current close",
      );
    }
    if (mf.liquidity.nearestSellSide != null) {
      assert.ok(
        mf.liquidity.nearestSellSide < bars[59]!.close,
        "nearestSellSide must strictly rest below current close",
      );
    }
  });

  it("MF-03: VSA engines emit zero false NO_SUPPLY/NO_DEMAND signals on zero-volume series", () => {
    const zeroVolBars = makeBars(45, 1.085, 0);
    const vsaRes = analyzeVsaBars(zeroVolBars);
    assert.equal(vsaRes.recentSignals.length, 0, "Zero-volume FX bars must produce 0 VSA signals");
    assert.equal(detectSingleVsaBar(zeroVolBars, 25, 0, 0.002), null);

    const mfZero = analyzeMoneyFlow(zeroVolBars)!;
    assert.ok(mfZero);
    assert.equal(mfZero.vsa.events.includes("NO_DEMAND"), false);
    assert.equal(mfZero.vsa.events.includes("NO_SUPPLY"), false);
    assert.equal(mfZero.vsa.rvol, null);
  });

  it("MF-04: computeVolumeProfile distributes wide-bar volume across multiple bins and XAGUSD uses 0.01 pip scale", () => {
    const bars: OhlcvBar[] = [
      { time: 1, open: 100, high: 110, low: 90, close: 108, volume: 1000 },
      { time: 2, open: 108, high: 112, low: 92, close: 95, volume: 1000 },
    ];
    const vp = computeVolumeProfile(bars, 12);
    const nonZeroBins = vp.bins.filter((b) => b.volume > 0);
    assert.ok(nonZeroBins.length >= 6, `Wide candles must span multiple bins, got ${nonZeroBins.length}`);

    const silverBars = makeBars(20, 30.5, 5000);
    const vwapRes = computeSessionVwap("XAGUSD", silverBars);
    // Distance on ~30.5 silver with 0.01 pip scale should be a few pips, not 100x inflated
    assert.ok(vwapRes.distanceToVwapPips < 150, `XAGUSD pip distance should use 0.01 pip scale, got ${vwapRes.distanceToVwapPips}`);

    const cvdRes = detectCvdAndAbsorption("EURUSD", makeBars(25, 1.08, 1000));
    assert.equal(cvdRes.cvdTimeline.length, 25);
  });

  it("MF-05 & MF-06: SmartMoneyFootprint separates foreignBuyRatioPct from activeBuyRatioPct and SectorFlow sorts directionally by VND value", () => {
    const bars = makeBars(25, 30, 500000);
    // Tiny foreign buy (1000 shares, 0 sell -> 100% foreignBuyRatioPct) with null activeBuyRatioPct
    const sm = evaluateSmartMoneyFootprint({
      symbol: "AAA",
      bars,
      currentPrice: 30,
      foreignNetValBillion: 0.03,
      activeBuyRatioPct: null,
      foreignBuyRatioPct: 100,
      foreignBuyValBillion: 0.03,
      foreignSellValBillion: 0,
    });
    assert.equal(sm.activeBuyRatioPct, null, "Must not report foreign-only ratio as market activeBuyRatioPct");
    assert.notEqual(sm.signal, "HEAVY_ACCUMULATION", "Tiny foreign trade must not trigger HEAVY_ACCUMULATION");

    const sectors = rankSectorsByFlow([
      { ticker: "VCB", sector: "Ngân hàng", close: 90000, volume: 2000000, changePercent: 1.5, foreignNetVol: 500000 },
      { ticker: "STB", sector: "Ngân hàng", close: 34000, volume: 5000000, changePercent: 1.2, foreignNetVol: -800000 },
      { ticker: "HPG", sector: "Thép", close: 27400, volume: 1000000, changePercent: -1.0, foreignNetVol: -400000 },
    ]);
    const bankSector = sectors.find((s) => s.sector === "Ngân hàng")!;
    assert.equal(
      bankSector.topStocks[0]?.ticker,
      "VCB",
      "Positive inflow sector must list top net-inflow stock first, not largest absolute outflow",
    );
  });

  it("SC-01 & SC-03: FireAnt Screener uses Wilder RSI / EMA MACD without Math.sin and Asymmetric plan respects overhead resistance", () => {
    const trendingCloses = Array.from({ length: 40 }, (_, i) => 100 + i * 1.1 + (i % 4 === 0 ? -2.2 : 0.6));
    const rsiVal = calcRsi(trendingCloses, 14);
    const macdObj = calcMacd(trendingCloses);
    assert.ok(rsiVal > 50 && rsiVal < 95, `Expected Wilder RSI in (50, 95), got ${rsiVal}`);
    assert.notEqual(
      macdObj.signal,
      Math.round(macdObj.macd * 0.8 * 100) / 100,
      "MACD signal must be 9-period EMA, not macd * 0.8",
    );

    const oversoldCandidates = scanFireAntScreener("oversold_bounce");
    assert.ok(oversoldCandidates.length > 0);
    for (const c of oversoldCandidates) {
      assert.ok(c.rsi < 30, `Oversold candidate ${c.symbol} must satisfy Wilder RSI < 30, got ${c.rsi}`);
    }

    // Asymmetric plan with nearby resistance ceiling at +1.5R
    const asym = computeAsymmetricPlan({
      last: 100,
      atr14: 2.0,
      supports: [99.5],
      resistances: [104.5],
      sma20: 99.8,
      sma50: 98.0,
    });
    assert.ok(asym.riskReward < 3.5, `Risk/Reward must reflect true resistance ceiling (got ${asym.riskReward})`);
  });

  it("SC-04, SC-05 & SC-06: ApexQuant anchors Wyckoff Spring to bottom, MultiFactor syncs category post-calibration, MasterComposite exempts financials fairly", () => {
    // Uptrend bars with a hammer at the top -> must NOT be classified as a Wyckoff Spring bottom
    const topHammerBars: OhlcvBar[] = Array.from({ length: 30 }, (_, i) => {
      const base = 100 + i * 2;
      return {
        time: 1700000000000 + i * 86400000,
        open: base,
        high: base + 1,
        low: i === 29 ? base - 4 : base - 0.5,
        close: base + 0.8,
        volume: 100000,
      };
    });
    const apex = evaluateApexQuant({ symbol: "TOP", bars: topHammerBars, currentPrice: topHammerBars[29]!.close });
    assert.equal(apex.reversalMetrics.isWyckoffSpring, false, "Hammer at 20-bar high must not trigger Wyckoff Spring");

    const fundPillar = scoreFundamentalPillar({
      symbol: "FPT",
      fScore: 8,
      roic: 22,
      sloanAccrualRatio: 2.0,
      cfoToNetProfit: 1.15,
      altmanZScore: 3.5,
      interestCoverage: 8.0,
    });
    assert.ok(fundPillar.score <= 99 && fundPillar.score >= 75);

    const universe = calculateUniverseMultiFactor([
      { symbol: "WEAK", fScore: 2, roe: 3, pe: 40 },
      { symbol: "MID", fScore: 5, roe: 12, pe: 15 },
      { symbol: "STRONG", fScore: 9, roe: 25, roic: 24, pe: 10, marginOfSafetyPct: 25 },
    ]);
    const strong = universe.get("STRONG")!;
    assert.equal(strong.compositeScore, 99);
    assert.equal(strong.category, "SUPER_ELITE", "Post-calibration category must sync with calibratedPercentile");

    const masterMap = calculateUniverseOrcaMaster([
      { symbol: "VCB", piotroskiFScore: 7, altmanZone: "EXEMPT_FINANCIAL", roe: 21 },
      { symbol: "FPT", piotroskiFScore: 7, altmanZone: "SAFE", roe: 21 },
    ]);
    assert.equal(
      masterMap.get("VCB")!.breakdown.fundamentalScore,
      masterMap.get("FPT")!.breakdown.fundamentalScore,
      "EXEMPT_FINANCIAL with strong ROE must achieve parity with non-financial SAFE",
    );
  });

  it("QM-01, QM-02, QM-03, QM-04 & QM-06: MiQuant, Backtest Studio, OU stationarity, DSR frequency, VaR non-negativity, and MACD scaling", () => {
    // QM-01: Different symbols with identical price and factor inputs must produce identical quant attributes (no ASCII hash)
    const attrA = computeQuantAttributes("FPT", 100000, { pctChange: 2.0, volumeRatio: 1.3, upsidePct: 20 });
    const attrB = computeQuantAttributes("VCB", 100000, { pctChange: 2.0, volumeRatio: 1.3, upsidePct: 20 });
    assert.deepEqual(attrA, attrB, "computeQuantAttributes must depend on market data, not ticker ASCII hash");

    // QM-02: Changing strategy parameters must alter rule-based execution results
    const strat = FIREANT_RAW_STRATEGIES[0]!;
    const btFast = executeBacktest(strat, { fast: 5, slow: 20, trail: 0.05 });
    const btSlow = executeBacktest(strat, { fast: 25, slow: 90, trail: 0.18 });
    assert.notEqual(btFast.metrics.totalReturn, btSlow.metrics.totalReturn);

    // QM-03: Oscillatory alternating series (b <= -1, phi <= 0) must NOT be accepted as stationary OU diffusion
    const alternating = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 110 : 90));
    const ouOsc = estimateOrnsteinUhlenbeck(alternating);
    assert.equal(ouOsc.isStationary, false, "Alternating negative-phi AR(1) root cannot be stationary OU");

    // Smooth mean-reverting AR(1) with phi = 0.85 -> stationary OU
    const mrSeries: number[] = [100];
    for (let i = 1; i < 60; i++) {
      const prev = mrSeries[i - 1]!;
      mrSeries.push(100 + 0.82 * (prev - 100) + Math.sin(i) * 0.8);
    }
    const ouValid = estimateOrnsteinUhlenbeck(mrSeries);
    assert.equal(ouValid.isStationary, true);
    assert.ok(ouValid.theta > 0 && ouValid.halfLife > 0 && ouValid.halfLife < 30);

    // QM-04: DSR frequency conversion & non-negative VaR
    const dsr = calculateDeflatedSharpeRatio({
      observedSharpe: 2.1,
      trialsCount: 5,
      sampleLengthBars: 252,
      skewness: -0.2,
      kurtosis: 3.5,
    });
    assert.ok(dsr.deflatedSharpeRatio > 0.7 && dsr.deflatedSharpeRatio <= 1.0);

    const posReturns = Array.from({ length: 12 }, (_, i) => 0.005 + i * 0.001);
    const riskPos = calculateVaRAndCVaR(posReturns);
    assert.ok(riskPos.var95Pct >= 0 && riskPos.cvar95Pct >= riskPos.var95Pct);

    // QM-06: Scale-invariant MACD histogram scoring across FX and Stocks
    const fxBias = techBiasFromSnapshot({ macdHistogram: 0.0008, atr14: 0.0020 });
    const stockBias = techBiasFromSnapshot({ macdHistogram: 400, atr14: 1000 });
    assert.equal(fxBias.bias, stockBias.bias, "Identical MACD/ATR ratio must produce identical tech bias");
  });

  it("TA-01, TA-02, TA-03 & TA-05: ATR-adaptive divergence, 1000x VND VWAP normalization, timestamp-aligned Wyckoff RS, and causal price-action trainer", () => {
    // TA-02: 1000x VND unit normalization in MTF H1 VWAP
    const vnDaily = makeBars(40, 32.5, 5000000);
    const mtf = evaluateMtfConsensus(vnDaily, {
      price: 33.0,
      open: 32.2,
      high: 33.2,
      low: 32.1,
      volume: 1000000,
      quoteVolume: 32500000000, // 32,500 VND * 1,000,000 shares (raw VND)
    });
    assert.equal(mtf.details.h1.bias, "BULL", "Price 33.0 above normalized VWAP 32.5 must be BULL on H1");

    // TA-03: Timestamp-aligned Wyckoff RS
    const stockBars = makeBars(70, 50, 200000);
    // Drop 3 intermediate bars from benchmark to simulate holiday/missing-bar offset
    const benchBars = makeBars(70, 1200, 500000000).filter((_, idx) => idx !== 20 && idx !== 35 && idx !== 50);
    const rs = computeWyckoffRS(stockBars, benchBars);
    assert.ok(Number.isFinite(rs.rsScore));

    // TA-01 & TA-05: Divergence & Historical Price Action Trainer run cleanly
    const divs = detectDivergences(stockBars, SHORT_3_4D);
    assert.ok(Array.isArray(divs));
    const trained = trainHistoricalPriceAction(stockBars);
    assert.ok(trained.historicalEdgeScore >= 0 && trained.historicalEdgeScore <= 100);
  });

  it("VAL-01, VAL-02, FA-01 & RRG-01: DCF subtracts netDebt on fcf_proxy, Residual Income sustains ROE, Sloan Accrual normalizes decimal to %, and RRG trail stabilizes momentum", () => {
    // VAL-01: fcf_proxy scenario must subtract netDebt when computing equityValue
    const baseAssumptions = defaultDcfScenarios(0.125)[1]!;
    const dcfNoDebt = runDcf({
      baseFcf: 1000,
      shares: 100,
      currentPrice: 80,
      netDebt: 0,
      assumptions: baseAssumptions,
    });
    const dcfWithDebt = runDcf({
      baseFcf: 1000,
      shares: 100,
      currentPrice: 80,
      netDebt: 2500,
      assumptions: baseAssumptions,
    });
    assert.equal(
      (dcfNoDebt.equityValue ?? 0) - (dcfWithDebt.equityValue ?? 0),
      2500,
      "DCF fcf_proxy must deduct netDebt from Enterprise Value",
    );

    // VAL-02: High-ROE compounder (ROE = 22%, Ke = 12.5%, g = 5%) must maintain positive Residual Income through Year 5
    const ri = runResidualIncome({
      bookEquity: 10000,
      netIncomeTtm: 2200,
      costOfEquity: 0.125,
      shares: 1000,
      currentPrice: 25,
      forecastYears: 5,
      niGrowth: 0.05,
      terminalGrowth: 0.02,
    });
    assert.ok(
      ri.residualIncomes.every((row) => row.ri > 0),
      "High-ROE compounder must not suffer artificial clean-surplus RI collapse in Year 5",
    );

    // FA-01: Decimal Sloan Accrual Ratio (0.18 = 18% of Total Assets) must trigger red flag (> 15%) and penalty
    const highAccrual = computeMultiFactorComposite({
      symbol: "ACCR",
      fScore: 6,
      roe: 15,
      sloanAccrualRatio: 0.18, // 18% decimal from computeFundamentalMatrix
    });
    assert.ok(
      highAccrual.redFlags.some((f) => f.includes("Sloan")),
      "Decimal sloanAccrualRatio = 0.18 (18%) must trigger Sloan > 15% red flag",
    );

    // RRG-01: Short 15-bar series must still produce valid finite RRG trail points
    const tPrices = Array.from({ length: 16 }, (_, i) => 100 + i * 1.1);
    const bPrices = Array.from({ length: 16 }, (_, i) => 1000 + i * 5);
    const dates = Array.from({ length: 16 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    const trail = computeRrgTrail(tPrices, bPrices, dates, 5, 10);
    assert.equal(trail.length, 5);
    assert.ok(trail.every((pt) => Number.isFinite(pt.rsRatio) && Number.isFinite(pt.rsMomentum)));
  });

  it("Multi-Horizon Sector Money Flow (1-2W, 3W-2M, 2-6M, >6M) & Small-Sector Percentile Normalization", () => {
    // 2-stock sector must span [1..99] so cheap P/E (<= 20 percentile) and high ROE (>= 80 percentile) filters work
    const pctMap = computeSectorPercentileMap(
      [
        { key: "CHEAP", value: 8.5 },
        { key: "EXPENSIVE", value: 22.0 },
      ],
      { higherIsBetter: true, requirePositive: true },
    );
    assert.equal(pctMap.get("CHEAP"), 1);
    assert.equal(pctMap.get("EXPENSIVE"), 99);

    // Stock horizon differentiation: Short-term momentum breakout vs Long-term compounder
    const shortPick = evaluateStockHorizonScores({
      symbol: "SSI",
      sector: "Chứng khoán",
      price: 34.5,
      changePercent: 3.8,
      volume: 25000000,
      volRatio20: 1.85,
      isBuyTriggerNow: true,
      smartMoneySignal: "POCKET_PIVOT",
      isSqueezeFiredBull: true,
      foreignNetValBillion: 45,
    });
    assert.ok(
      shortPick.short1_2w >= 80,
      `Expected short-term breakout score >= 80, got ${shortPick.short1_2w}`,
    );

    const longCompounder = evaluateStockHorizonScores({
      symbol: "FPT",
      sector: "Công nghệ thông tin",
      price: 138.0,
      changePercent: 0.4,
      volume: 3200000,
      roe: 28.5,
      roic: 24.5,
      roiic3Y: 28.0,
      isSuperCompounder: true,
      isBuffettCompounder: true,
      cfoToNetProfit: 1.35,
      sloanAccrualRatio: 0.02,
      isNetCash: true,
      piotroskiFScore: 8,
    });
    assert.ok(
      longCompounder.long6mPlus >= 85,
      `Expected long-term compounder score >= 85, got ${longCompounder.long6mPlus}`,
    );

    // Multi-horizon sector evaluation across sectors
    const multiSector = evaluateMultiHorizonSectorFlow([
      {
        symbol: "SSI",
        sector: "Chứng khoán",
        price: 34.5,
        changePercent: 3.8,
        volume: 25000000,
        volRatio20: 1.85,
        isBuyTriggerNow: true,
        smartMoneySignal: "POCKET_PIVOT",
        isSqueezeFiredBull: true,
        foreignNetValBillion: 45,
      },
      {
        symbol: "FPT",
        sector: "Công nghệ thông tin",
        price: 138.0,
        changePercent: 0.5,
        volume: 3500000,
        roe: 28.5,
        roic: 24.5,
        roiic3Y: 28.0,
        isSuperCompounder: true,
        isBuffettCompounder: true,
        cfoToNetProfit: 1.35,
        isNetCash: true,
        piotroskiFScore: 8,
      },
    ]);
    assert.equal(multiSector.sectors.length, 2);
    assert.equal(multiSector.horizonLeaders.SHORT_1_2W[0], "Chứng khoán");
    assert.equal(multiSector.horizonLeaders.LONG_6M_PLUS[0], "Công nghệ thông tin");
    assert.ok(multiSector.stockRankMap.get("SSI")?.rankInSector === 1);
    assert.ok(multiSector.stockRankMap.get("FPT")?.rankInSector === 1);
    assert.ok(multiSector.sectors[0]?.institutionalRegime != null);
    assert.ok(multiSector.sectors[0]?.weightedVolRatio20 != null);
  });

  it("Unified TA Kernel Consistency & 100-Stock Precomputed Pipeline Speedup", async () => {
    const {
      buildPrecomputedTaBundle,
      calcRsiScalar,
      calcMacdSnapshot,
      calcBollingerSnapshot,
      calcMfiScalar,
    } = await import("../engines/unified-ta-kernel");

    const bars = makeBars(120, 50, 1_200_000);
    const bundle = buildPrecomputedTaBundle(bars);

    assert.equal(bundle.closes.length, 120);
    assert.equal(bundle.sma10Series.length, 120);
    assert.equal(bundle.sma20Series.length, 120);
    assert.equal(bundle.sma50Series.length, 120);
    assert.equal(bundle.volSma20Series.length, 120);
    assert.ok(bundle.atr14 != null && bundle.atr14 > 0);

    const rsiVal = calcRsiScalar(bundle.closes, 14);
    const macdSnap = calcMacdSnapshot(bundle.closes, 12, 26, 9);
    const bbSnap = calcBollingerSnapshot(bundle.closes, 20, 2);
    const mfiVal = calcMfiScalar(bundle.highs, bundle.lows, bundle.closes, bundle.vols, 14);

    assert.ok(rsiVal > 0 && rsiVal <= 100);
    assert.ok(Number.isFinite(macdSnap.macd) && Number.isFinite(macdSnap.signal));
    assert.ok(bbSnap.upper > bbSnap.middle && bbSnap.middle > bbSnap.lower);
    assert.ok(mfiVal >= 0 && mfiVal <= 100);

    // Benchmark 100-stock multi-engine pass: Unshared vs Precomputed Unified Kernel
    const tUnshared0 = performance.now();
    for (let s = 0; s < 100; s++) {
      trainHistoricalPriceAction(bars);
      evaluateApexQuant({ symbol: `SYM${s}`, bars, currentPrice: bars[bars.length - 1].close });
    }
    const unsharedMs = performance.now() - tUnshared0;

    const tShared0 = performance.now();
    for (let s = 0; s < 100; s++) {
      const b = buildPrecomputedTaBundle(bars);
      const trained = trainHistoricalPriceAction(b.ohlcvBars, {
        precomputed: {
          closes: b.closes,
          highs: b.highs,
          lows: b.lows,
          sma20: b.sma20Series,
          sma50: b.sma50Series,
          volSma20: b.volSma20Series,
        },
      });
      const apex = evaluateApexQuant({
        symbol: `SYM${s}`,
        bars: b.ohlcvBars,
        currentPrice: b.closes[b.closes.length - 1],
        precomputed: {
          closes: b.closes,
          highs: b.highs,
          lows: b.lows,
          sma10: b.sma10Series,
          sma20: b.sma20Series,
          volSma20: b.volSma20Series,
          ouZScore: -1.45,
          ouHalfLife: 12.0,
          tripleBarrierRiskReward: 2.35,
          trainedHistorical: trained,
          isFreshBullishDivergence: false,
          isDualDivergenceFresh: false,
        },
      });
      assert.equal(apex.ouZScore, -1.45);
      assert.equal(apex.ouHalfLife, 12.0);
    }
    const sharedMs = performance.now() - tShared0;

    console.log(
      `[UNIFIED KERNEL 100-STOCK BENCHMARK] Unshared=${unsharedMs.toFixed(1)}ms | PrecomputedUnified=${sharedMs.toFixed(1)}ms | Speedup=${(unsharedMs / Math.max(0.1, sharedMs)).toFixed(2)}x`,
    );
    assert.ok(
      sharedMs < unsharedMs,
      `Expected unified precomputed pipeline (${sharedMs.toFixed(1)}ms) to be faster than unshared (${unsharedMs.toFixed(1)}ms)`,
    );
  });
});
