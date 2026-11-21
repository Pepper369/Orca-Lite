import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateHRP,
  calculateNestedClusteredOptimization,
  classifyAssetFactorCluster,
  computeEmpiricalShrinkageCovariance,
  evaluateContinuousDrawdownGovernor,
  evaluateFactorExposureBudget,
} from "../engines/advanced-quant-math";
import {
  getEmpiricalFrictionTelemetry,
  planSmartOrderExecution,
  recordExecutionSlippageTelemetry,
} from "../engines/exchange-execution-client";
import { dispatchSignalWithVault } from "../services/auto-trade-dispatcher";
import type { FollowerAccount } from "../engines/copy-trade-engine";

describe("Phase 3 Portfolio Construction (HRP/NCO), Factor Exposure Budgeting, Continuous Drawdown Governor & Smart Execution Alpha", () => {
  it("P3-01: Nested Clustered Optimization (NCO) isolates correlated cluster risk better than naive variance", () => {
    const symbols = ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "XAUUSD", "BTCUSDT"];
    // Build synthetic return series where EURUSD/GBPUSD/AUDUSD are 95% correlated (Cluster 1),
    // while USDJPY, XAUUSD, BTCUSDT have independent drivers
    const returnsByAsset = symbols.map((_, assetIdx) =>
      Array.from({ length: 60 }, (__, t) => {
        const commonUsdFactor = Math.sin(t / 4) * 0.012;
        if (assetIdx <= 2) {
          return commonUsdFactor + (assetIdx - 1) * 0.0005;
        }
        if (assetIdx === 3) {
          return -commonUsdFactor * 0.4 + Math.cos(t / 3) * 0.011;
        }
        if (assetIdx === 4) {
          return Math.sin(t / 7) * 0.014;
        }
        return Math.cos(t / 5) * 0.025;
      }),
    );

    const empCov = computeEmpiricalShrinkageCovariance(returnsByAsset);
    const nco = calculateNestedClusteredOptimization(symbols, empCov.covMatrix, 3);
    const hrp = calculateHRP(symbols, empCov.covMatrix);

    const sumNco = Object.values(nco.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumNco - 1.0) < 0.005, `NCO weights must sum to 1.0, got ${sumNco}`);
    assert.ok(nco.effectiveClustersCount >= 2 && nco.effectiveClustersCount <= 3);
    assert.ok(Object.keys(hrp.weights).length === 6);

    // Lower volatility asset (EURUSD) should receive larger weight than high-volatility BTCUSDT
    assert.ok(nco.weights.EURUSD! + nco.weights.GBPUSD! > nco.weights.BTCUSDT!);
  });

  it("P3-02: Macro Factor Exposure Budgeting dampens 2nd correlated position (0.70x) and blocks 3rd USD-cluster duplicate", () => {
    // BUY EURUSD, BUY GBPUSD, SELL USDJPY, and BUY XAUUSD all map to USD_SHORT_RISK_ON
    assert.equal(classifyAssetFactorCluster("EURUSD", "FOREX", "BUY"), "USD_SHORT_RISK_ON");
    assert.equal(classifyAssetFactorCluster("GBPUSD", "FOREX", "BUY"), "USD_SHORT_RISK_ON");
    assert.equal(classifyAssetFactorCluster("USDJPY", "FOREX", "SELL"), "USD_SHORT_RISK_ON");
    assert.equal(classifyAssetFactorCluster("XAUUSD", "FOREX", "BUY"), "USD_SHORT_RISK_ON");
    assert.equal(classifyAssetFactorCluster("USDJPY", "FOREX", "BUY"), "USD_LONG_DEFENSIVE");
    assert.equal(classifyAssetFactorCluster("BTCUSDT", "CRYPTO", "BUY"), "CRYPTO_BETA_LONG");

    // 1st position in cluster -> 1.0x
    const firstEval = evaluateFactorExposureBudget({
      candidateSymbol: "EURUSD",
      candidateAssetType: "FOREX",
      candidateDirection: "BUY",
      openPositions: [],
      maxSameClusterPositions: 2,
    });
    assert.equal(firstEval.allowed, true);
    assert.equal(firstEval.sizeMultiplier, 1.0);

    // 2nd position in same cluster (BUY GBPUSD while already holding BUY EURUSD) -> allowed with 0.70x dampener
    const secondEval = evaluateFactorExposureBudget({
      candidateSymbol: "GBPUSD",
      candidateAssetType: "FOREX",
      candidateDirection: "BUY",
      openPositions: [{ symbol: "EURUSD", assetType: "FOREX", direction: "BUY", riskFractionPct: 1.0 }],
      maxSameClusterPositions: 2,
    });
    assert.equal(secondEval.allowed, true);
    assert.equal(secondEval.sizeMultiplier, 0.70);

    // 3rd position in same cluster (SELL USDJPY while holding BUY EURUSD + BUY GBPUSD) -> blocked!
    const thirdEval = evaluateFactorExposureBudget({
      candidateSymbol: "USDJPY",
      candidateAssetType: "FOREX",
      candidateDirection: "SELL",
      openPositions: [
        { symbol: "EURUSD", assetType: "FOREX", direction: "BUY", riskFractionPct: 1.0 },
        { symbol: "GBPUSD", assetType: "FOREX", direction: "BUY", riskFractionPct: 0.7 },
      ],
      maxSameClusterPositions: 2,
    });
    assert.equal(thirdEval.allowed, false);
    assert.equal(thirdEval.sizeMultiplier, 0);
  });

  it("P3-03: Continuous Drawdown De-leveraging Governor smoothly reduces position scale before hard daily cutoff", async () => {
    // Healthy account (0% DD) -> 1.0x
    const healthy = evaluateContinuousDrawdownGovernor({
      currentBalanceUsd: 10000,
      peakBalanceUsd: 10000,
      dailyRealizedPnlUsd: 50,
      maxDailyLossUsd: 500,
    });
    assert.equal(healthy.isLockedOut, false);
    assert.equal(healthy.drawdownDeleverageScale, 1.0);

    // Account at 65% daily loss utilization (-$325 of $500 limit) -> de-leveraged smoothly (~0.625x)
    const stressed = evaluateContinuousDrawdownGovernor({
      currentBalanceUsd: 9675,
      peakBalanceUsd: 10000,
      dailyRealizedPnlUsd: -325,
      maxDailyLossUsd: 500,
    });
    assert.equal(stressed.isLockedOut, false);
    assert.ok(
      stressed.drawdownDeleverageScale < 0.75 && stressed.drawdownDeleverageScale >= 0.25,
      `Expected de-leveraged scale in [0.25, 0.75), got ${stressed.drawdownDeleverageScale}`,
    );

    // Verify auto-trade-dispatcher scales order size down on stressed account vs healthy account
    const baseAcct: FollowerAccount = {
      id: "acct_healthy",
      name: "Healthy Demo",
      platform: "BINANCE_FUTURES",
      accountNumberMasked: "****11",
      balanceUsd: 10000,
      riskMultiplier: 1.0,
      maxDailyLossUsd: 500,
      dailyRealizedPnlUsd: 0,
      maxAllowedSlippagePips: 5,
      isActive: true,
      killSwitched: false,
      autoExecuteEnabled: true,
      isTestnet: true,
      hasApiKey: false,
      connectionStatus: "CONNECTED_DEMO",
      totalCopiedTrades: 0,
    };
    const stressedAcct: FollowerAccount = {
      ...baseAcct,
      id: "acct_stressed",
      name: "Stressed Demo",
      dailyRealizedPnlUsd: -380, // 76% of maxDailyLossUsd used
    };

    const orders = await dispatchSignalWithVault({
      signal: {
        id: "sig_p3_dd_test",
        symbol: "BTCUSDT",
        assetType: "CRYPTO",
        direction: "BUY",
        entryPrice: 90000,
        stopLossPrice: 89100,
        takeProfit1: 91200,
        takeProfit2: 92000,
        takeProfit3: 93000,
        masterLotsOrQty: 0.1,
        masterCapitalUsd: 10000,
        winrateScore: 84,
        setupGrade: "A+",
        recommendedLeverage: 5,
        timestamp: Date.now(),
      },
      overrideAccounts: [baseAcct, stressedAcct],
    });

    assert.equal(orders.length, 2);
    const healthyOrder = orders.find((o) => o.followerId === "acct_healthy")!;
    const stressedOrder = orders.find((o) => o.followerId === "acct_stressed")!;
    assert.ok(
      stressedOrder.copiedLotsOrQty < healthyOrder.copiedLotsOrQty,
      `Expected stressed account qty (${stressedOrder.copiedLotsOrQty}) < healthy account qty (${healthyOrder.copiedLotsOrQty})`,
    );
  });

  it("P3-04: Smart Order Execution Router (Post-Only Maker Peg vs Almgren-Chriss Slices) & Closed-Loop Slippage Telemetry", () => {
    // 1. Small/Normal order ($9,100 vs $250,000 L2 top-5 depth = 3.6% participation) -> POST_ONLY_MAKER_PEG (GTX)
    const normalPlan = planSmartOrderExecution({
      symbol: "BTCUSDT",
      direction: "BUY",
      totalQty: 0.1,
      entryPrice: 91000,
      bestBid: 90995,
      bestAsk: 91005,
      top5BookDepthUsd: 250000,
      tickSize: "0.1",
      stepSize: "0.001",
    });
    assert.equal(normalPlan.executionMode, "POST_ONLY_MAKER_PEG");
    assert.equal(normalPlan.binanceTimeInForce, "GTX");
    assert.equal(normalPlan.okxOrderType, "post_only");
    assert.equal(normalPlan.slices.length, 1);
    assert.ok(normalPlan.peggedLimitPrice < 91005, "Post-only BUY peg must remain below bestAsk");

    // 2. Large institutional order ($91,000 vs $180,000 L2 top-5 depth = 50.5% participation > 15%) -> ALMGREN_CHRISS_SLICED
    const whalePlan = planSmartOrderExecution({
      symbol: "BTCUSDT",
      direction: "BUY",
      totalQty: 1.0,
      entryPrice: 91000,
      bestBid: 90995,
      bestAsk: 91005,
      top5BookDepthUsd: 180000,
      tickSize: "0.1",
      stepSize: "0.001",
    });
    assert.equal(whalePlan.executionMode, "ALMGREN_CHRISS_SLICED");
    assert.ok(whalePlan.slices.length >= 3, `Expected >= 3 Almgren-Chriss slices, got ${whalePlan.slices.length}`);
    const totalSlicedQty = Number(whalePlan.slices.reduce((s, x) => s + x.qty, 0).toFixed(3));
    assert.equal(totalSlicedQty, 1.0, "Almgren-Chriss slices must sum exactly to totalQty");

    // 3. Closed-Loop Slippage & Implementation Shortfall Calibration
    for (let i = 0; i < 4; i++) {
      recordExecutionSlippageTelemetry({
        symbol: "ETHUSDT",
        assetType: "CRYPTO",
        direction: "BUY",
        intendedEntryPrice: 3000,
        executedFillPrice: 3001.5, // +5 bps adverse slippage
        stopLossPrice: 2970, // 30 USD risk (1%)
      });
    }
    const telemetry = getEmpiricalFrictionTelemetry("ETHUSDT");
    assert.ok(telemetry.sampleCount >= 4);
    assert.equal(telemetry.avgSlippageBps, 5);
    assert.ok(
      telemetry.recommendedFrictionROverride != null && telemetry.recommendedFrictionROverride > 0.08,
      `Expected empirical frictionR override > 0.08, got ${telemetry.recommendedFrictionROverride}`,
    );
  });
});
