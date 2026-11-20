import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calculateCrossAssetKelly,
  calculateT2SettlementRisk,
  checkCeilingFloorHeadroom,
  calibrateBasisOrnsteinUhlenbeck,
  computeOrderFlowImbalance,
  evaluateForexSpreadSafety,
  computeGarmanKlassLeverageCap,
  detectCryptoLiquidationClusters,
} from "../engines/unified-cross-asset-quant";
import { computeAsymmetricPlan } from "../engines/asymmetric-quant-engine";
import { generateDeepFlowSignal } from "../engines/forex-order-flow-pro";
import { buildCryptoDerivativesMetrics } from "../engines/crypto-derivatives-engine";
import type { OhlcvBar } from "../types";

describe("Unified Cross-Asset Quantitative Engines", () => {
  // Shared baseline crypto bars (Garman-Klass testing)
  const normalBars = Array.from({ length: 24 }, (_, i) => ({
    open: 65000 + (i % 2 === 0 ? 50 : -50),
    high: 65200,
    low: 64800,
    close: 65050,
  }));
  // ==========================================================================
  // 1. Dynamic Fractional Kelly & Volatility Targeting
  // ==========================================================================
  it("QUANT-CORE-01: calculates dynamic fractional Kelly and dampens over-betting on high volatility", () => {
    // Favorable edge: winRate 65%, payoff 2.0 (unconstrained Kelly = (0.65*2 - 0.35)/2 = 0.475)
    // Half-Kelly = 0.2375.
    const resLowVol = calculateCrossAssetKelly({
      winRate: 0.65,
      payoffRatio: 2.0,
      targetAnnualVol: 0.18,
    });
    assert.equal(resLowVol.status, "OPTIMAL");
    assert.equal(resLowVol.halfKelly, 0.238);
    assert.ok(resLowVol.recommendedAllocation <= 0.25);
    assert.ok(resLowVol.recommendedAllocation >= 0.20);

    // Negative edge: winRate 30%, payoff 1.0 -> rejects trade
    const resNegative = calculateCrossAssetKelly({
      winRate: 0.30,
      payoffRatio: 1.0,
    });
    assert.equal(resNegative.status, "NEGATIVE_EDGE");
    assert.equal(resNegative.recommendedAllocation, 0);

    // High volatility series: daily returns of ±4% (annualized vol ~ 63%)
    const highVolReturns = [
      0.04, -0.035, 0.042, -0.038, 0.045, -0.04, 0.038, -0.042, 0.041, -0.039,
      0.043, -0.036, 0.04, -0.041, 0.037, -0.042,
    ];
    const resHighVol = calculateCrossAssetKelly({
      winRate: 0.65,
      payoffRatio: 2.0,
      returnsSeries: highVolReturns,
      targetAnnualVol: 0.18,
    });
    assert.equal(resHighVol.status, "VOLATILITY_CAPPED");
    assert.ok(resHighVol.volatilityScaleFactor < 0.6);
    assert.ok(resHighVol.recommendedAllocation < resLowVol.recommendedAllocation);
  });

  // ==========================================================================
  // 2. Vietnam Equities T+2 Settlement Cornish-Fisher VaR & Cushion
  // ==========================================================================
  it("QUANT-EQ-01 & QUANT-EQ-02: evaluates T+2 Cornish-Fisher VaR and enforces statutory price cushions", () => {
    // Normal stable return series
    const stableReturns = [
      0.005, -0.004, 0.006, 0.002, -0.003, 0.008, -0.002, 0.004, -0.005, 0.003,
      0.004, -0.002, 0.007, -0.004, 0.005, 0.001, -0.003, 0.006, -0.002, 0.004,
    ];
    const stableRisk = calculateT2SettlementRisk(stableReturns);
    assert.equal(stableRisk.excessiveTailRisk, false);
    assert.equal(stableRisk.positionSizingMultiplier, 1.0);
    assert.ok(stableRisk.twoDayVaR95Pct < 5.0);

    // Fat-tailed, negatively skewed series with sharp down gaps (T+2 trap)
    const dangerousReturns = [
      0.01, -0.065, -0.045, 0.005, -0.055, 0.012, -0.07, 0.008, -0.06, 0.015,
      -0.05, 0.002, -0.068, 0.01, -0.04, 0.005, -0.062, 0.008,
    ];
    const highRisk = calculateT2SettlementRisk(dangerousReturns);
    assert.equal(highRisk.excessiveTailRisk, true);
    assert.equal(highRisk.positionSizingMultiplier, 0.5);
    assert.ok(highRisk.twoDayVaR95Pct >= 6.0);
    assert.ok(highRisk.skewness < 0);

    // Ceiling / Floor Headroom checks
    // Price = 98.5, Ceiling = 100 (headroom = 1.52% -> close to limit)
    const nearCeiling = checkCeilingFloorHeadroom(98.8, 100, 86);
    assert.equal(nearCeiling.canEnterLong, false);
    assert.ok(nearCeiling.blockReason?.includes("Trần"));

    // Safe middle price
    const normalPrice = checkCeilingFloorHeadroom(93.0, 100, 86);
    assert.equal(normalPrice.canEnterLong, true);
    assert.equal(normalPrice.blockReason, null);

    // Near floor
    const nearFloor = checkCeilingFloorHeadroom(86.5, 100, 86);
    assert.equal(nearFloor.canEnterLong, false);
    assert.equal(nearFloor.canEnterShortOrSell, false);
    assert.ok(nearFloor.blockReason?.includes("Sàn"));
  });

  // ==========================================================================
  // 3. Derivatives VN30F Continuous Ornstein-Uhlenbeck & Level 2 OFI
  // ==========================================================================
  it("QUANT-DER-01 & QUANT-DER-02: calibrates continuous OU basis reversion and computes L2/L3 OFI pressure", () => {
    // True mean-reverting AR(1) basis series: X_t = -0.6 + 0.7 * X_{t-1} + noise
    const basisSeries: number[] = [-2.0];
    for (let i = 1; i < 25; i++) {
      const noise = Math.sin(i * 1.5) * 0.4;
      basisSeries.push(Number((-0.6 + 0.7 * basisSeries[i - 1] + noise).toFixed(2)));
    }
    basisSeries.push(-6.8); // Sudden deep discount at the end

    const ouCalib = calibrateBasisOrnsteinUhlenbeck(basisSeries, 1);
    assert.equal(ouCalib.stationary, true);
    assert.ok(ouCalib.theta > 0);
    assert.ok(ouCalib.halfLifeMinutes < 180);
    assert.ok(Math.abs(ouCalib.currentZScore) >= 2.0);
    assert.ok(ouCalib.signal.includes("BASIS_REVERSION"));

    // Pure trending non-stationary series
    const trendingSeries = [
      1.0, 2.0, 3.2, 4.5, 5.8, 7.2, 8.5, 10.0, 11.4, 13.0,
      14.5, 16.0, 17.8, 19.5, 21.0, 22.8, 24.5,
    ];
    const ouTrending = calibrateBasisOrnsteinUhlenbeck(trendingSeries, 1);
    assert.equal(ouTrending.stationary, false);
    assert.equal(ouTrending.signal, "NON_STATIONARY_DRIFT");

    // Level 2/3 Order Flow Imbalance (OFI)
    const prevBook = [
      { bidPrice: 1285.0, bidQty: 120, askPrice: 1285.5, askQty: 150 },
      { bidPrice: 1284.5, bidQty: 200, askPrice: 1286.0, askQty: 250 },
      { bidPrice: 1284.0, bidQty: 300, askPrice: 1286.5, askQty: 300 },
    ];
    // Next snapshot: Buyers aggressively step up to higher bid and lift asks
    const nextBookAggressiveBuy = [
      { bidPrice: 1285.5, bidQty: 250, askPrice: 1286.0, askQty: 100 },
      { bidPrice: 1285.0, bidQty: 320, askPrice: 1286.5, askQty: 180 },
      { bidPrice: 1284.5, bidQty: 400, askPrice: 1287.0, askQty: 200 },
    ];
    const ofi = computeOrderFlowImbalance(prevBook, nextBookAggressiveBuy);
    assert.ok(ofi.rawOFI > 0);
    assert.ok(ofi.normalizedOFI >= 0.40);
    assert.equal(ofi.institutionalPressure, "STRONG_BUY_PRESSURE");
  });

  // ==========================================================================
  // 4. Forex Real-Time Spread-Spike Circuit Breaker
  // ==========================================================================
  it("QUANT-FX-01: locks out sniper execution during abnormal spread expansion spikes", () => {
    const historicalSpreads = [0.8, 0.9, 0.8, 1.0, 0.9, 0.8, 0.9, 1.0, 0.8]; // Normal ~0.9 pips

    // Normal condition
    const safeSpread = evaluateForexSpreadSafety(0.9, historicalSpreads, "FX_MAJOR");
    assert.equal(safeSpread.isSafe, true);
    assert.equal(safeSpread.lockoutReason, null);

    // Sudden 3.5 pip spike (> 2.2x median and > 1.8 pip max allowed)
    const spikeSpread = evaluateForexSpreadSafety(3.5, historicalSpreads, "FX_MAJOR");
    assert.equal(spikeSpread.isSafe, false);
    assert.ok(spikeSpread.lockoutReason?.includes("vượt giới hạn"));

    // Gold spread test: 6.0 pips ($0.60) exceeds 4.5 pip gold limit
    const goldSpike = evaluateForexSpreadSafety(6.0, [2.5, 2.8, 2.5, 3.0], "GOLD");
    assert.equal(goldSpike.isSafe, false);
  });

  // ==========================================================================
  // 5. Crypto Garman-Klass Volatility & Liquidation Clusters
  // ==========================================================================
  it("QUANT-CRYPTO-01 & QUANT-CRYPTO-03: caps leverage during extreme volatility and detects liquidation clusters", () => {
    // Normal crypto hourly candles
    const levNormal = computeGarmanKlassLeverageCap(normalBars, true);
    assert.ok(levNormal.maxRecommendedLeverage >= 8);
    assert.ok(levNormal.volatilityRegime === "NORMAL" || levNormal.volatilityRegime === "COMPRESSED_COILING");

    // Extreme flash crash candles (wide wicks of 8-10%)
    const flashCrashBars = Array.from({ length: 24 }, (_, i) => ({
      open: 65000 - i * 500,
      high: 68000,
      low: 58000,
      close: 60000,
    }));
    const levShock = computeGarmanKlassLeverageCap(flashCrashBars, true);
    assert.equal(levShock.volatilityRegime, "FLASH_CRASH_SHOCK");
    assert.ok(levShock.maxRecommendedLeverage <= 4);

    // Liquidation Cluster detection
    const liqClusters = detectCryptoLiquidationClusters(65000, 250_000_000, 1200);
    assert.equal(liqClusters.clusters.length, 6);
    assert.ok(liqClusters.primaryMagnetPrice !== null);
    assert.ok(liqClusters.clusters.some((c) => c.isMagnetZone));
  });

  // ==========================================================================
  // 6. Cross-Asset Specialized Engine Integration Invariants
  // ==========================================================================
  it("Integrated Engines: Asymmetric Plan, Forex Order Flow & Crypto Derivatives seamlessly consume quant layer", () => {
    // 1. Asymmetric Plan in Equities
    const asymPlan = computeAsymmetricPlan({
      last: 42.5,
      supports: [41.2, 40.5],
      resistances: [48.0],
      sma20: 41.5,
      sma50: 40.8,
      atr14: 1.2,
      ceilingPrice: 45.4,
      floorPrice: 39.5,
      historicalReturns: [0.01, -0.015, 0.02, -0.01, 0.005, 0.012, -0.008, 0.015, -0.01, 0.008, 0.004, -0.005],
    });
    assert.ok(asymPlan.entry > 0);
    assert.ok(asymPlan.kellyAllocation);
    assert.ok(asymPlan.t2Risk);
    assert.ok(asymPlan.ceilingFloorCheck);
    assert.equal(asymPlan.ceilingFloorCheck?.canEnterLong, true);

    // 2. Forex Deep Flow Signal with Spread Spike
    const dummyFxBars: OhlcvBar[] = Array.from({ length: 30 }, (_, i) => ({
      time: 1700000000 + i * 300,
      open: 1.0850 + Math.sin(i) * 0.001,
      high: 1.0870,
      low: 1.0840,
      close: 1.0860,
      volume: 1200 + i * 10,
    }));
    // Pass high spread spike of 3.8 pips
    const fxSignalWithSpike = generateDeepFlowSignal("EURUSD", dummyFxBars, {
      currentSpreadPips: 3.8,
      historicalSpreadsPips: [0.9, 1.0, 0.8, 0.9],
    });
    assert.ok(fxSignalWithSpike.spreadSafety);
    assert.equal(fxSignalWithSpike.spreadSafety.isSafe, false);
    assert.equal(fxSignalWithSpike.sniperSetup.direction, "STAND_ASIDE");
    assert.ok(fxSignalWithSpike.sniperSetup.rationale[0].includes("CIRCUIT BREAKER SPREAD"));

    // 3. Crypto Derivatives Metrics with Leverage Governor
    const cryptoMetrics = buildCryptoDerivativesMetrics({
      symbol: "BTCUSDT",
      markPrice: 65000,
      indexPrice: 64990,
      fundingRate: 0.0001,
      openInterest: 15000,
      orderBook: {
        lastUpdateId: 1000,
        bids: [["64990", "15.5"], ["64980", "20.2"]],
        asks: [["65010", "12.3"], ["65020", "18.4"]],
      },
      recentBars: normalBars,
    });
    assert.ok(cryptoMetrics.leverageGovernor);
    assert.ok(cryptoMetrics.liquidationClusters);
    assert.ok(cryptoMetrics.leverageGovernor.maxRecommendedLeverage <= 20);
    assert.ok(cryptoMetrics.liquidationClusters.primaryMagnetPrice !== null);
  });
});
