import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAugmentedDickeyFuller,
  computeChowStructuralBreakTest,
  evaluateEngleGrangerCointegration,
  computeJohansenCointegrationTest,
} from "../engines/advanced-quant-math";
import {
  analyzeCointegratedPairTrade,
  analyzeSyntheticBasisBasketArbitrage,
} from "../engines/derivatives-arbitrage-engine";

describe("Phase 6: High-Dimensional Cointegration & Statistical Arbitrage Engine", () => {
  // P6-01: ADF Stationarity Test Invariants
  it("P6-01: computeAugmentedDickeyFuller detects stationary vs random walk series", () => {
    // Stationary mean-reverting series: y_t = 0.3 * y_{t-1} + noise
    const stationary: number[] = [10];
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let t = 1; t < 100; t++) {
      stationary.push(10 + 0.3 * (stationary[t - 1] - 10) + lcg() * 0.5);
    }
    const resStationary = computeAugmentedDickeyFuller(stationary, 1);
    assert.ok(resStationary.adfStat < -2.88, "Stationary series must yield ADF stat < -2.88");
    assert.strictEqual(resStationary.isStationary, true);

    // Random walk (unit root): y_t = y_{t-1} + noise
    const randomWalk: number[] = [100];
    for (let t = 1; t < 100; t++) {
      randomWalk.push(randomWalk[t - 1] + lcg() * 2);
    }
    const resRw = computeAugmentedDickeyFuller(randomWalk, 1);
    assert.ok(resRw.adfStat > -2.88, "Random walk should fail ADF stationarity test");
    assert.strictEqual(resRw.isStationary, false);
  });

  // P6-02: Chow Structural Break Test
  it("P6-02: computeChowStructuralBreakTest flags regime shifts accurately", () => {
    const x: number[] = [];
    const yStable: number[] = [];
    const yShifted: number[] = [];

    for (let t = 0; t < 60; t++) {
      const valX = 50 + t * 0.5;
      x.push(valX);
      // Stable relation: y = 2.0 * x + eps
      yStable.push(2.0 * valX + (t % 2 === 0 ? 0.2 : -0.2));
      // Shifted relation: first 30 bars beta = 2.0, next 30 bars beta = 0.5
      const beta = t < 30 ? 2.0 : 0.5;
      yShifted.push(beta * valX + (t % 2 === 0 ? 0.2 : -0.2));
    }

    const chowStable = computeChowStructuralBreakTest(yStable, x);
    assert.strictEqual(chowStable.hasBreak, false, "Stable series must not trigger Chow break");

    const chowShifted = computeChowStructuralBreakTest(yShifted, x);
    assert.strictEqual(chowShifted.hasBreak, true, "Shifted regime must trigger Chow break");
    assert.ok(chowShifted.fStat > 3.63, "Chow F-stat must exceed 3.63");
  });

  // P6-03: Engle-Granger Cointegration & Pairs Trading Execution
  it("P6-03: evaluateEngleGrangerCointegration identifies true cointegration & generates signals", () => {
    // Generate true cointegrated pair: Stock B is random walk, Stock A = 1.5 * B + 5 + stationary spread
    const seriesB: number[] = [80];
    let seed = 123;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let t = 1; t < 120; t++) {
      seriesB.push(seriesB[t - 1] + lcg() * 1.5);
    }

    const seriesA: number[] = [];
    let spread = 0;
    for (let t = 0; t < 120; t++) {
      // OU spread with strong mean-reversion
      spread = 0.2 * spread + lcg() * 0.8;
      seriesA.push(1.5 * seriesB[t] + 5 + spread);
    }

    // Force last bar to have positive divergence (Z-Score > 2.0)
    seriesA[seriesA.length - 1] += 6.0;

    const result = evaluateEngleGrangerCointegration(seriesA, seriesB, {
      symbolA: "VCB",
      symbolB: "BID",
      zScoreThreshold: 2.0,
    });

    assert.strictEqual(result.isCointegrated, true, "Cointegrated pair must pass Engle-Granger test");
    assert.ok(result.hedgeRatio > 1.3 && result.hedgeRatio < 1.7, `Hedge ratio should be close to 1.5, got ${result.hedgeRatio}`);
    assert.ok(result.halfLifeBars < 15, `Half-life should be fast, got ${result.halfLifeBars}`);
    assert.ok(result.currentZScore > 2.0, "Forced divergence should give Z-score > 2");
    assert.strictEqual(result.signal, "SELL_A_BUY_B", "Overpriced A must trigger SELL A, BUY B");
  });

  // P6-04: analyzeCointegratedPairTrade Position Sizing
  it("P6-04: analyzeCointegratedPairTrade applies capital allocation and risk bounds", () => {
    // Generate cleanly cointegrated series with stationarity on spread
    const seriesB: number[] = [100];
    let seed = 777;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let t = 1; t < 100; t++) {
      seriesB.push(seriesB[t - 1] + lcg() * 1.0);
    }
    const seriesA: number[] = [];
    let spread = 0;
    for (let t = 0; t < 100; t++) {
      spread = 0.25 * spread + lcg() * 0.5;
      seriesA.push(1.2 * seriesB[t] + 30 + spread);
    }
    // Moderate upward deviation on last bar to trigger SELL A, BUY B without triggering stop-loss (Z-score ~ 2.4, stopLoss is 4.5)
    seriesA[seriesA.length - 1] += 0.8;

    const trade = analyzeCointegratedPairTrade({
      symbolA: "HPG",
      seriesA,
      symbolB: "HSG",
      seriesB,
      portfolioCapitalVnd: 200_000_000,
      entryZScore: 1.8,
      stopLossZScore: 4.5,
    });

    assert.strictEqual(trade.symbolA, "HPG");
    assert.strictEqual(trade.symbolB, "HSG");
    assert.strictEqual(trade.cointegration.isCointegrated, true, "Pair must be cointegrated");
    assert.strictEqual(trade.recommendedPositions.assetA.action, "SELL");
    assert.strictEqual(trade.recommendedPositions.assetB.action, "BUY");
    assert.strictEqual(trade.recommendedPositions.assetA.sizeVnd, 100_000_000);
    assert.ok(trade.recommendedPositions.assetB.sizeVnd > 50_000_000);
  });

  // P6-05: Multivariate Johansen Cointegration Rank Test
  it("P6-05: computeJohansenCointegrationTest determines cointegration rank & eigenvectors", () => {
    // 3 assets: Y1, Y2, Y3 sharing 1 common stochastic trend -> Rank should be at least 1
    const T = 80;
    const commonTrend: number[] = [100];
    let seed = 999;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let t = 1; t < T; t++) {
      commonTrend.push(commonTrend[t - 1] + lcg() * 1.2);
    }

    const dataMatrix: number[][] = [];
    for (let t = 0; t < T; t++) {
      const y1 = commonTrend[t] + lcg() * 0.3;
      const y2 = 0.8 * commonTrend[t] + 10 + lcg() * 0.3;
      const y3 = 1.2 * commonTrend[t] - 5 + lcg() * 0.3;
      dataMatrix.push([y1, y2, y3]);
    }

    const johansen = computeJohansenCointegrationTest(dataMatrix, 1);
    assert.strictEqual(johansen.hasCointegration, true, "Cointegrated system must have rank > 0");
    assert.ok(johansen.rank >= 1, `Rank must be at least 1, got ${johansen.rank}`);
    assert.strictEqual(johansen.cointegratingVectors.length >= 1, true);
    assert.strictEqual(johansen.cointegratingVectors[0].length, 3);
    assert.strictEqual(johansen.cointegratingVectors[0][0], 1.0, "First element normalized to 1.0");
  });

  // P6-06: Synthetic Basis Basket Arbitrage
  it("P6-06: analyzeSyntheticBasisBasketArbitrage generates arbitrage signal for synthetic VN30 vs VN30F", () => {
    const T = 70;
    const futures: number[] = [1250];
    const stock1: number[] = [90];
    const stock2: number[] = [110];

    for (let t = 1; t < T; t++) {
      const step = (t % 2 === 0 ? 1.5 : -1.2);
      futures.push(futures[t - 1] + step);
      stock1.push(stock1[t - 1] + step * 0.4);
      stock2.push(stock2[t - 1] + step * 0.6);
    }

    const basket = [
      { symbol: "VCB", prices: stock1 },
      { symbol: "VHM", prices: stock2 },
    ];

    const result = analyzeSyntheticBasisBasketArbitrage({
      futuresPrices: futures,
      basketMatrix: basket,
    });

    assert.strictEqual(result.basketSymbols.length, 2);
    assert.ok(Number.isFinite(result.syntheticBasisPoints));
    assert.ok(Number.isFinite(result.syntheticSpotPrice));
  });
});
