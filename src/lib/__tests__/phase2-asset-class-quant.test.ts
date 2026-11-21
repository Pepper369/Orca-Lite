import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateUniverseMultiFactor,
  computeSpearmanRankIc,
  estimateRollingRankIcWeights,
  orthogonalizeFactorVectorsGramSchmidt,
} from "../engines/multi-factor-quant-composite";
import { computeSectorLeadLagAndMst } from "../engines/rrg-engine";
import {
  resolveVnExchangeLimitThreshold,
  runScreenerBacktest,
} from "../engines/screener-backtest-engine";
import {
  computeDividendAdjustedFairBasis,
  estimateKalmanDynamicHedgeRatio,
  evaluateBasisFlowRegime,
} from "../engines/derivatives-arbitrage-engine";
import {
  computeMicropriceAndSpoofingSignal,
  computeVolumeClockVpin,
  evaluateDeltaNeutralFundingCarry,
  evaluateFundingOiVelocityRegime,
} from "../engines/crypto-derivatives-engine";
import {
  decomposeOrthogonalCurrencyFactors,
  filterRedundantUsdClusterSignals,
} from "../engines/forex-currency-strength";
import { reconstructSyntheticDom } from "../engines/forex-cme-dom-bridge";
import { evaluateSpreadRecoveryHysteresis } from "../engines/forex-news-shield";
import { parseStructuredStrategyDsl } from "../quant/quant-engine";
import { extractVietnameseEventAlpha } from "../services/vietnamese-financial-nlu";
import type { OhlcvBar } from "../types";

describe("Phase 2 Asset-Class Specialized Quant Models (VN Equities, VN30F, Crypto Perp, Forex & Metals)", () => {
  it("P2-01: VN Equities — Exchange Limit Bands, 10% Volume Cap, DSL Parser, Gram-Schmidt Ortho, RankIC, MST & Event NLP Alpha", async () => {
    // 1. Exchange-aware limit bands (HOSE 7%, HNX 10%, UPCOM 15%)
    const hose = resolveVnExchangeLimitThreshold("FPT");
    const hnx = resolveVnExchangeLimitThreshold("ABB");
    const upcom = resolveVnExchangeLimitThreshold("BVB");
    assert.equal(hose.exchange, "HOSE");
    assert.equal(hose.limitBandPct, 7);
    assert.equal(hnx.exchange, "HNX");
    assert.equal(hnx.limitBandPct, 10);
    assert.equal(upcom.exchange, "UPCOM");
    assert.equal(upcom.limitBandPct, 15);

    // 10% Session Volume Participation Cap on low-liquidity breakout bar
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < 75; i++) {
      const isSignal = i === 55;
      const isEntry = i === 56;
      const open = isEntry ? 52.0 : 50.0;
      const close = isSignal ? 51.8 : i >= 58 ? 61.0 : 50.2;
      const high = Math.max(open, close) + 0.5;
      const low = Math.min(open, close) - 0.3;
      // On entry bar 56, volume is only 2,000 shares -> 20M VND slot / 52,000 VND = 384 shares (> 10% of 2,000)
      const volume = isSignal ? 500000 : isEntry ? 2000 : 200000;
      bars.push({
        time: 1705000000 + i * 86400,
        open,
        high,
        low,
        close,
        volume,
      });
    }
    const btRes = await runScreenerBacktest({
      strategy: "breakout",
      holdingDays: 8,
      stopLossPct: 7,
      takeProfitPct: 15,
      initialCapital: 100_000_000,
      preloadedBars: [{ symbol: "FPT", bars }],
    });
    assert.ok(btRes.trades.length >= 1);
    const cappedTrade = btRes.trades[0]!;
    assert.equal(cappedTrade.liquidityParticipationCapped, true);
    assert.equal(cappedTrade.participationRatioPct, 10);
    assert.equal(cappedTrade.exchangeLimitBandPct, 7);

    // 2. Structured Strategy DSL Parser
    const dslSqueeze = parseStructuredStrategyDsl(
      { id: "bb-squeeze", category: "Xu hướng", code: "const bb = indicator.bollinger(close, 20);" },
      { fast: 12, slow: 35 },
    );
    assert.equal(dslSqueeze.entryMode, "BOLLINGER_SQUEEZE");
    const dslRsi = parseStructuredStrategyDsl(
      { id: "rsi-dip", category: "Đảo chiều", code: "if (rsi < oversold) buy();" },
      { rsi: 28 },
    );
    assert.equal(dslRsi.entryMode, "RSI_MEAN_REVERT");
    assert.equal(dslRsi.rsiEntryLow, 28);

    // 3. Gram-Schmidt Factor Orthogonalization removes collinearity (dot product ~ 0)
    const v1 = [1.2, 0.8, -0.5, -1.1, 0.4, -0.8];
    const v2 = v1.map((x, i) => x * 0.85 + (i % 2 === 0 ? 0.3 : -0.3)); // Highly collinear with v1
    const v3 = [0.2, -0.9, 1.1, 0.4, -0.6, -0.2];
    const [u1, u2, u3] = orthogonalizeFactorVectorsGramSchmidt([v1, v2, v3]);
    let dot12 = 0;
    let dot13 = 0;
    let dot23 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot12 += u1![i]! * u2![i]!;
      dot13 += u1![i]! * u3![i]!;
      dot23 += u2![i]! * u3![i]!;
    }
    assert.ok(Math.abs(dot12) < 1e-3, `Expected u1 ⊥ u2, dot=${dot12}`);
    assert.ok(Math.abs(dot13) < 1e-3, `Expected u1 ⊥ u3, dot=${dot13}`);
    assert.ok(Math.abs(dot23) < 1e-3, `Expected u2 ⊥ u3, dot=${dot23}`);

    // Universe Multi-Factor attaches orthogonalizedZ
    const uniMap = calculateUniverseMultiFactor([
      { symbol: "FPT", rsRating: 92, roe: 28, pe: 18, peMedian5Y: 22, price: 130000 },
      { symbol: "VCB", rsRating: 78, roe: 21, pe: 15, peMedian5Y: 17, price: 92000 },
      { symbol: "HPG", rsRating: 70, roe: 15, pe: 12, peMedian5Y: 14, price: 29000 },
      { symbol: "SSI", rsRating: 84, roe: 16, pe: 16, peMedian5Y: 18, price: 35000 },
    ]);
    assert.ok(uniMap.get("FPT")?.orthogonalizedZ != null);

    // 4. Spearman RankIC & Rolling IC-IR Dynamic Factor Weights
    const rankIcPos = computeSpearmanRankIc([10, 20, 30, 40, 50], [0.01, 0.02, 0.03, 0.05, 0.08]);
    assert.equal(rankIcPos, 1);
    const dynWeights = estimateRollingRankIcWeights(
      [
        {
          techScores: [50, 60, 75, 85, 95],
          fundScores: [80, 70, 65, 55, 50],
          valScores: [60, 65, 70, 72, 74],
          forwardReturns: [0.01, 0.03, 0.05, 0.07, 0.11],
        },
        {
          techScores: [45, 58, 72, 88, 92],
          fundScores: [82, 74, 60, 52, 48],
          valScores: [55, 62, 68, 75, 78],
          forwardReturns: [-0.01, 0.02, 0.04, 0.08, 0.10],
        },
      ],
      "SIDEWAY_CONSOLIDATION",
    );
    const weightSum = dynWeights.weights.wTech + dynWeights.weights.wFund + dynWeights.weights.wVal;
    assert.ok(Math.abs(weightSum - 1) < 0.005);
    assert.ok(
      dynWeights.weights.wTech > dynWeights.weights.wFund,
      "High positive RankIC technical pillar must receive higher weight than negative RankIC pillar",
    );

    // 5. Sector Lead-Lag Cross-Correlation & Kruskal MST
    const leaderPrices: number[] = [100];
    const followerPrices: number[] = [50];
    const thirdPrices: number[] = [80];
    const benchPrices: number[] = [1200];
    for (let t = 1; t < 30; t++) {
      const mktRet = Math.sin(t / 5) * 0.004;
      const leaderIdio = Math.cos(t / 3) * 0.018;
      // Follower reacts 1 bar after Leader's idiosyncratic impulse
      const prevLeaderIdio = t >= 2 ? Math.cos((t - 1) / 3) * 0.018 : 0;
      benchPrices.push(benchPrices[t - 1]! * Math.exp(mktRet));
      leaderPrices.push(leaderPrices[t - 1]! * Math.exp(mktRet + leaderIdio));
      followerPrices.push(followerPrices[t - 1]! * Math.exp(mktRet + 0.85 * prevLeaderIdio));
      thirdPrices.push(thirdPrices[t - 1]! * Math.exp(mktRet + 0.5 * leaderIdio));
    }
    const mstRes = computeSectorLeadLagAndMst({
      sectorCode: "STEEL",
      symbolPrices: { HPG: leaderPrices, HSG: followerPrices, NKG: thirdPrices },
      benchmarkPrices: benchPrices,
    });
    assert.equal(mstRes.mstEdges.length, 2, "MST over 3 sector symbols must have N - 1 = 2 edges");
    const hpgLeadsHsg = mstRes.leadLagEdges.find(
      (e) => e.leaderSymbol === "HPG" && e.followerSymbol === "HSG",
    );
    assert.ok(hpgLeadsHsg != null, "Expected HPG -> HSG Lag-1 lead-lag relationship to be detected");
    assert.equal(hpgLeadsHsg?.optimalLagDays, 1);

    // 6. Event-Driven Vietnamese Financial NLP Alpha (SUE + PEAD + Dilution + Legal Shock)
    const nowMs = 1715000000000;
    const nlpBull = extractVietnameseEventAlpha({
      nowMs,
      reportedNetIncomeGrowthPct: 45,
      expectedNetIncomeGrowthPct: 15,
      earningsStdPct: 12,
      headlines: [
        { title: "FPT báo lãi kỷ lục quý 1, chủ tịch HĐQT đăng ký mua vào 2 triệu cổ phiếu", publishedAtMs: nowMs - 2 * 86400000 },
      ],
    });
    assert.ok((nlpBull.sueScore ?? 0) >= 2.0);
    assert.ok(nlpBull.eventAlphaScore > 25);

    const nlpBear = extractVietnameseEventAlpha({
      nowMs,
      headlines: [
        { title: "Doanh nghiệp chậm trả lãi trái phiếu và chào bán cho cổ đông hiện hữu pha loãng", publishedAtMs: nowMs - 86400000 },
      ],
    });
    assert.ok(nlpBear.bondLegalShockScore < -30);
    assert.ok(nlpBear.dilutionPenaltyScore < -10);
    assert.ok(nlpBear.eventAlphaScore < -40);
  });

  it("P2-02: VN30F Derivatives — Dividend-Adjusted Fair Basis, Causal Kalman Hedge Ratio & OI Flow Guard", () => {
    const divFair = computeDividendAdjustedFairBasis({
      spotPrice: 1300,
      repoRateAnnual: 0.045,
      daysToExpiry: 20,
      upcomingDividends: [
        { symbol: "VCB", weightInVn30: 0.12, cashDividendVnd: 1200, stockPriceVnd: 90000, daysToExDate: 7 },
        { symbol: "FPT", weightInVn30: 0.10, cashDividendVnd: 2000, stockPriceVnd: 130000, daysToExDate: 12 },
      ],
    });
    assert.ok(divFair.presentValueDividendPoints > 3.5);
    assert.ok(
      divFair.fairValuePrice < 1300 + divFair.grossCarryPoints,
      "Cash dividends before expiry must reduce VN30F fair value below unadjusted carry",
    );

    // Causal Kalman Filter Dynamic Hedge Ratio
    const spotSeries = Array.from({ length: 40 }, (_, i) => 1250 + i * 1.5 + Math.sin(i / 3) * 4);
    const futSeries = spotSeries.map((s, i) => 2.5 + 1.04 * s + (i === 39 ? -9.5 : Math.cos(i) * 0.8));
    const kalman = estimateKalmanDynamicHedgeRatio(futSeries, spotSeries);
    assert.ok(kalman.dynamicBetaHedgeRatio > 0.95 && kalman.dynamicBetaHedgeRatio < 1.15);
    assert.ok(kalman.kalmanZScore <= -1.8, `Expected negative Kalman Z-score on -9.5pt dislocation, got ${kalman.kalmanZScore}`);
    assert.equal(kalman.hedgeSignal, "LONG_FUTURES_SHORT_BASKET");

    // Causal invariance check on Kalman Filter
    const kalmanPrefixA = estimateKalmanDynamicHedgeRatio(futSeries.slice(0, 25), spotSeries.slice(0, 25));
    const mutatedFut = futSeries.map((v, idx) => (idx >= 25 ? v * 1.5 : v));
    const kalmanPrefixB = estimateKalmanDynamicHedgeRatio(mutatedFut.slice(0, 25), spotSeries.slice(0, 25));
    assert.deepEqual(kalmanPrefixA, kalmanPrefixB);

    // Institutional Directional Hedging Flow Guard: blocks fading deep backwardation during Short Build-up
    const flowBlocked = evaluateBasisFlowRegime({
      mispricingPts: -8.5,
      kalmanZScore: -2.4,
      priceChangePts: -14.0,
      oiChangeContracts: 4500, // Price down + OI up = SHORT_BUILDUP
    });
    assert.equal(flowBlocked.regime, "DIRECTIONAL_HEDGING_DO_NOT_FADE");
    assert.equal(flowBlocked.canFadeBasis, false);

    const flowActionable = evaluateBasisFlowRegime({
      mispricingPts: -6.5,
      kalmanZScore: -2.2,
      priceChangePts: 3.5,
      oiChangeContracts: -1200, // SHORT_COVERING -> safe to trade basis convergence
    });
    assert.equal(flowActionable.regime, "ACTIONABLE_ARBITRAGE_MISPRICING");
    assert.equal(flowActionable.canFadeBasis, true);
  });

  it("P2-03: Crypto Spot & Perpetuals — Microprice Spoofing/Iceberg, Volume-Clock VPIN & Delta-Neutral Funding Carry", () => {
    // 1. Stoikov Microprice & Iceberg Absorption vs Spoofing
    const icebergBook = {
      lastUpdateId: 1,
      bids: [
        { price: 91000, qty: 18.0 }, // Massive L1 replenishing bid
        { price: 90990, qty: 2.0 },
        { price: 90980, qty: 2.0 },
      ],
      asks: [
        { price: 91010, qty: 3.0 },
        { price: 91020, qty: 2.0 },
        { price: 91030, qty: 2.0 },
      ],
    };
    const microIceberg = computeMicropriceAndSpoofingSignal({
      orderBook: icebergBook,
      aggressiveBuyShare: 0.25, // Heavy aggressive selling absorbed by L1 Bid
    });
    assert.ok(microIceberg.microprice > microIceberg.midPrice, "Large L1 Bid must pull Microprice above MidPrice");
    assert.equal(microIceberg.spoofingOrAbsorptionState, "BULLISH_ICEBERG_ABSORPTION");

    // 2. Volume-Clock VPIN on one-sided crash vs balanced range
    const balancedBars = Array.from({ length: 24 }, (_, i) => ({
      open: 100 + (i % 2 === 0 ? -0.4 : 0.4),
      high: 101,
      low: 99,
      close: 100 + (i % 2 === 0 ? 0.4 : -0.4),
      volume: 1000,
    }));
    const cascadeBars = Array.from({ length: 24 }, (_, i) => ({
      open: 100 - i * 1.5,
      high: 100 - i * 1.5 + 0.1,
      low: 100 - (i + 1) * 1.5,
      close: 100 - (i + 1) * 1.5,
      volume: 2500,
    }));
    const vpinBalanced = computeVolumeClockVpin(balancedBars, 8);
    const vpinCascade = computeVolumeClockVpin(cascadeBars, 8);
    assert.ok(
      vpinCascade.vpin > vpinBalanced.vpin,
      `Expected one-sided cascade VPIN (${vpinCascade.vpin}) > balanced VPIN (${vpinBalanced.vpin})`,
    );

    // 3. 4-State Funding-OI Velocity Regime & Delta-Neutral Funding Carry
    const flushActive = evaluateFundingOiVelocityRegime({
      fundingRate8h: 0.0002,
      priceChange24hPct: -6.5,
      oiChange24hPct: -3.0,
      vpin: 0.65,
    });
    assert.equal(flushActive.state, "LONG_LIQUIDATION_FLUSH");
    assert.equal(flushActive.canEnterContrarianReversal, false);

    const carry = evaluateDeltaNeutralFundingCarry({
      spotPrice: 91000,
      perpMarkPrice: 91120,
      fundingRate8h: 0.00045, // +0.045% per 8h (~49.2%/yr)
      roundTripFeePct: 0.14,
    });
    assert.equal(carry.strategyAction, "LONG_SPOT_SHORT_PERP");
    assert.equal(carry.isViableCarry, true);
    assert.ok(carry.netAnnualizedCarryYieldPct > 35);
  });

  it("P2-04: Forex & Metals — Orthogonal Currency Factor Decomposition, Synthetic DOM Provenance & News Spread Hysteresis", () => {
    // 1. Orthogonal Currency Factor Decomposition: sum_{c in G8} f_c === 0
    const pairs = [
      { pair: "EURUSD", price: 1.08, changePercent: -0.85 },
      { pair: "GBPUSD", price: 1.27, changePercent: -0.82 },
      { pair: "AUDUSD", price: 0.65, changePercent: -0.90 },
      { pair: "NZDUSD", price: 0.60, changePercent: -0.88 },
      { pair: "USDJPY", price: 155.2, changePercent: 0.78 },
      { pair: "USDCAD", price: 1.39, changePercent: 0.75 },
      { pair: "USDCHF", price: 0.88, changePercent: 0.80 },
      { pair: "EURGBP", price: 0.85, changePercent: -0.03 },
    ];
    const ortho = decomposeOrthogonalCurrencyFactors(pairs);
    const factorSum = Object.values(ortho.latentFactorsPct).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(factorSum) < 1e-3, `Orthogonal G8 currency factors must sum to 0, got ${factorSum}`);
    assert.ok(ortho.latentFactorsPct.USD > 0.5, "Broad USD rally must produce positive USD latent factor");
    const eurusdDecomp = ortho.pairDecompositions.find((p) => p.pair === "EURUSD");
    assert.equal(eurusdDecomp?.driverType, "USD_MACRO_SHOCK");

    // Filter redundant USD cluster trades (max 2 same-direction USD bets)
    const filtered = filterRedundantUsdClusterSignals(
      [
        { pair: "EURUSD", direction: "SELL", score: 88 },
        { pair: "GBPUSD", direction: "SELL", score: 85 },
        { pair: "AUDUSD", direction: "SELL", score: 82 },
        { pair: "USDJPY", direction: "BUY", score: 79 },
        { pair: "EURGBP", direction: "BUY", score: 76 },
      ],
      2,
    );
    assert.equal(filtered.accepted.length, 3); // Top 2 Long-USD pairs + 1 non-USD cross pair (EURGBP)
    assert.equal(filtered.rejectedUsdDuplicates.length, 2);

    // 2. Synthetic DOM Provenance Demotion
    const sampleBars: OhlcvBar[] = Array.from({ length: 12 }, (_, i) => ({
      time: 1710000000 + i * 300,
      open: 1.085,
      high: 1.086,
      low: 1.084,
      close: 1.0855,
      volume: 1000,
    }));
    const domSynthetic = reconstructSyntheticDom("EURUSD", sampleBars, 0.9);
    assert.equal(domSynthetic.provenance, "SYNTHETIC_GARMAN_KLASS_PROXY");
    assert.equal(domSynthetic.canGateGradeAPlus, false);

    const domCmeCalibrated = reconstructSyntheticDom("EURUSD", sampleBars, 0.9, 185000);
    assert.equal(domCmeCalibrated.provenance, "CME_EXCHANGE_CALIBRATED");
    assert.equal(domCmeCalibrated.canGateGradeAPlus, true);

    // 3. Post-News Spread-Recovery Hysteresis
    const stillWidened = evaluateSpreadRecoveryHysteresis({
      recentSpreadTicksPips: [3.8, 2.4, 1.1, 1.0], // Only 2 consecutive ticks <= 1.2 pips (needs K = 3)
      rollingMedianSpreadPips: 0.8,
      maxMultiplier: 1.5,
      requiredConsecutiveTicks: 3,
    });
    assert.equal(stillWidened.isLockout, true);
    assert.equal(stillWidened.consecutiveNormalizedTicks, 2);

    const recovered = evaluateSpreadRecoveryHysteresis({
      recentSpreadTicksPips: [3.8, 1.15, 1.05, 0.95], // 3 consecutive ticks <= 1.2 pips
      rollingMedianSpreadPips: 0.8,
      maxMultiplier: 1.5,
      requiredConsecutiveTicks: 3,
    });
    assert.equal(recovered.isLockout, false);
    assert.equal(recovered.consecutiveNormalizedTicks, 3);
  });
});
