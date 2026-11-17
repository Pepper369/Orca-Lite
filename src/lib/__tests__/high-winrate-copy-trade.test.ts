import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHighWinrateGate } from "../engines/high-winrate-gate";
import {
  calculateProportionalCopySize,
  verifySlippageGuard,
  dispatchSignalToFollowers,
  getFollowerAccounts,
  type MasterTradeSignal,
} from "../engines/copy-trade-engine";
import type { OhlcvBar } from "../types";

test("High Winrate Gate: HTF trend alignment, OTE Discount & Liquidity Sweep", () => {
  const bars: OhlcvBar[] = [];
  // Build 40 bars in an uptrend (closes rising above EMA)
  for (let i = 0; i < 40; i++) {
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0800 + i * 0.0003,
      high: 1.0800 + i * 0.0003 + 0.0006,
      low: 1.0800 + i * 0.0003 - 0.0003,
      close: 1.0800 + i * 0.0003 + 0.0002,
      volume: 2000,
    });
  }

  // Create a sweep hammer candle at the end:
  // previous low around bar 30 was 1.088
  // last bar dips to 1.0850 then aggressively rejects back to 1.0910
  const lastBar = bars[bars.length - 1];
  lastBar.low = 1.0830;
  lastBar.open = 1.0900;
  lastBar.close = 1.0910;
  lastBar.high = 1.0915;

  const result = evaluateHighWinrateGate({
    symbol: "EURUSD",
    series: bars,
    candidateDirection: "BUY",
    entryPrice: 1.0870,
    stopLossPrice: 1.0820,
    orderBookImbalance: 25,
    assetType: "FOREX",
  });

  assert.equal(result.htfTrend, "BULLISH");
  assert.equal(result.htfTrendAligned, true);
  assert.equal(result.liquiditySweepDetected, true);
  assert.equal(result.sweepDetails.sweptSide, "SELL_SIDE");
  assert.ok(result.winrateScore >= 75);
  assert.equal(result.isHighWinrateVerified, true);
  assert.equal(result.breakevenPlan.tp1Ratio, 1.2);
  assert.equal(result.breakevenPlan.moveSlToEntryAtTp1, true);
});

test("High Winrate Gate: Penalizes counter-trend and premium buying", () => {
  const bars: OhlcvBar[] = [];
  // Downtrend
  for (let i = 0; i < 40; i++) {
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.1000 - i * 0.0003,
      high: 1.1000 - i * 0.0003 + 0.0002,
      low: 1.1000 - i * 0.0003 - 0.0005,
      close: 1.1000 - i * 0.0003 - 0.0002,
      volume: 2000,
    });
  }

  // Attempting BUY in a strong downtrend at range high (Premium)
  const result = evaluateHighWinrateGate({
    symbol: "EURUSD",
    series: bars,
    candidateDirection: "BUY",
    entryPrice: 1.0980,
    stopLossPrice: 1.0920,
    orderBookImbalance: -20,
    assetType: "FOREX",
  });

  assert.equal(result.htfTrend, "BEARISH");
  assert.equal(result.htfTrendAligned, false);
  assert.equal(result.isHighWinrateVerified, false);
  assert.ok(result.winrateScore < 60);
  assert.ok(result.failedGates.some((g) => g.includes("ngược xu hướng")));
});

test("Copy Trade Engine: Proportional Risk Parity position sizing", () => {
  // Master: 0.5 lot on $10,000 account
  // Follower A: $2,500 balance, 1.0x multiplier -> 0.5 * (2500/10000) * 1.0 = 0.125 -> 0.13 lot
  const followerSizeA = calculateProportionalCopySize({
    masterLotsOrQty: 0.5,
    masterCapitalUsd: 10_000,
    followerBalanceUsd: 2500,
    riskMultiplier: 1.0,
    assetType: "FOREX",
  });
  assert.ok(followerSizeA === 0.12 || followerSizeA === 0.13);

  // Follower B: $10,000 balance, 2.0x multiplier -> 0.5 * (10000/10000) * 2.0 = 1.0 lot
  const followerSizeB = calculateProportionalCopySize({
    masterLotsOrQty: 0.5,
    masterCapitalUsd: 10_000,
    followerBalanceUsd: 10_000,
    riskMultiplier: 2.0,
    assetType: "FOREX",
  });
  assert.equal(followerSizeB, 1.0);

  // Crypto Follower: Master 0.2 BTC on $10,000, Follower $5,000 with 0.5x multiplier -> 0.2 * 0.5 * 0.5 = 0.05 BTC
  const cryptoSize = calculateProportionalCopySize({
    masterLotsOrQty: 0.2,
    masterCapitalUsd: 10_000,
    followerBalanceUsd: 5000,
    riskMultiplier: 0.5,
    assetType: "CRYPTO",
  });
  assert.equal(cryptoSize, 0.05);
});

test("Copy Trade Engine: Slippage Guard protects followers", () => {
  // Normal slippage 1.2 pips with 3.0 pip limit
  const safeSlip = verifySlippageGuard({
    masterEntry: 1.0825,
    currentPrice: 1.08262,
    maxSlippagePips: 3.0,
    pipSize: 0.0001,
  });
  assert.equal(safeSlip.allowed, true);
  assert.equal(safeSlip.slippagePips, 1.2);

  // Extreme slippage 5.0 pips (e.g. news spike delay)
  const extremeSlip = verifySlippageGuard({
    masterEntry: 1.0825,
    currentPrice: 1.0830,
    maxSlippagePips: 3.0,
    pipSize: 0.0001,
  });
  assert.equal(extremeSlip.allowed, false);
  assert.equal(extremeSlip.slippagePips, 5.0);
});

test("Copy Trade Engine: Dispatches signal to all active follower accounts", () => {
  const signal: MasterTradeSignal = {
    id: "sig-test-101",
    symbol: "EURUSD",
    assetType: "FOREX",
    direction: "BUY",
    entryPrice: 1.0825,
    stopLossPrice: 1.0805,
    takeProfit1: 1.0849,
    takeProfit2: 1.0865,
    takeProfit3: 1.0885,
    masterLotsOrQty: 0.4,
    masterCapitalUsd: 10_000,
    winrateScore: 84,
    timestamp: Date.now(),
  };

  const executed = dispatchSignalToFollowers(signal, 1.0825);
  assert.ok(executed.length > 0);

  const filledOrders = executed.filter((o) => o.status === "FILLED");
  assert.ok(filledOrders.length >= 1);
  assert.equal(filledOrders[0].symbol, "EURUSD");
  assert.equal(filledOrders[0].direction, "BUY");
  assert.ok(filledOrders[0].copiedLotsOrQty > 0);
});
