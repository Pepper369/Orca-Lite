import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDynamicTimeDecayRoiExit,
  evaluatePositiveTrailingStop,
  DEFAULT_ROI_SCHEDULE,
} from "../engines/bot-trade-lifecycle-engine";
import { computeExecutionQualityTelemetry } from "../engines/bot-telemetry-types";

describe("Bot Trade Lifecycle & Dynamic Exit Engine (Freqtrade Parity)", () => {
  it("evaluateDynamicTimeDecayRoiExit: adheres to Freqtrade time-decay ROI schedule", () => {
    const entry = 100.0;
    const sl = 98.0; // riskDist = 2.0 pts = 1.0R
    const openedAt = 1000000;

    // 1. Fresh trade (10 mins old): +0.8R (+1.6 pts) does NOT trigger exit (requires 2.0R)
    const freshRes = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: entry,
      markPrice: 101.6, // +0.8R
      stopLossPrice: sl,
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 10 * 60000,
    });
    assert.equal(freshRes.shouldExit, false);
    assert.equal(freshRes.requiredTargetR, 2.0);

    // 2. Early phase (30 mins old): +1.1R (+2.2 pts) TRIGGERS exit (requires 1.0R)
    const earlyRes = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: entry,
      markPrice: 102.2, // +1.1R
      stopLossPrice: sl,
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 30 * 60000,
    });
    assert.equal(earlyRes.shouldExit, true);
    assert.equal(earlyRes.requiredTargetR, 1.0);
    assert.ok(earlyRes.exitReason.includes("DYNAMIC_ROI_EXIT"));

    // 3. Mid phase (90 mins old): +0.6R (+1.2 pts) TRIGGERS exit (requires 0.5R)
    const midRes = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: entry,
      markPrice: 101.2, // +0.6R
      stopLossPrice: sl,
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 90 * 60000,
    });
    assert.equal(midRes.shouldExit, true);
    assert.equal(midRes.requiredTargetR, 0.5);

    // 4. Stagnant trade (400 mins old, > 6h): +0.1R TRIGGERS timeout exhaustion exit (requires 0.0R)
    const timeoutRes = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: entry,
      markPrice: 100.2, // +0.1R
      stopLossPrice: sl,
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 400 * 60000,
    });
    assert.equal(timeoutRes.shouldExit, true);
    assert.ok(timeoutRes.exitReason.includes("TIME_EXHAUSTION_EXIT"));

    // 5. High-ATR asset protection: when stopLossPrice is present (e.g. 3% riskDist), +0.65% (+0.22R) at 65m must NOT trigger 0.5R exit via minTargetPct fallback
    const highAtrRes = evaluateDynamicTimeDecayRoiExit({
      direction: "BUY",
      entryPrice: 100.0,
      markPrice: 100.65, // +0.65% > 0.6% minTargetPct, but only +0.217R < 0.5R minTargetR
      stopLossPrice: 97.0, // 3.0 pts = 1R
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 65 * 60000,
    });
    assert.equal(highAtrRes.shouldExit, false);
  });

  it("evaluateDynamicTimeDecayRoiExit: works symmetrically on SELL / Short positions", () => {
    const entry = 1.0850;
    const sl = 1.0880; // riskDist = 30 pips
    const openedAt = 2000000;

    // 45 mins old, price drops to 1.0815 -> +35 pips = +1.16R -> triggers exit (tier 20m needs 1.0R)
    const shortRes = evaluateDynamicTimeDecayRoiExit({
      direction: "SELL",
      entryPrice: entry,
      markPrice: 1.0815,
      stopLossPrice: sl,
      openedTimestampMs: openedAt,
      currentTimestampMs: openedAt + 45 * 60000,
    });

    assert.equal(shortRes.shouldExit, true);
    assert.ok(shortRes.currentProfitR > 1.0);
  });

  it("evaluatePositiveTrailingStop: activates only upon reaching positive offset and ratchets monotonically", () => {
    const entry = 90000;
    const sl = 89000; // riskDist = 1000 USD
    const pip = 1.0;

    // 1. Profit is only +0.6R (mark = 90600) -> Trailing is INACTIVE (needs 1.0R activation)
    const inactiveRes = evaluatePositiveTrailingStop({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      entryPrice: entry,
      currentStopLoss: sl,
      markPrice: 90600,
      riskDist: 1000,
      activationOffsetR: 1.0,
      trailingDistanceR: 0.35,
      pipSize: pip,
    });
    assert.equal(inactiveRes.isTrailingActive, false);
    assert.equal(inactiveRes.newStopLossPrice, sl);

    // 2. Profit surges to +2.0R (mark = 92000, peak = 92000) -> Trailing ACTIVATES
    // Trail span = 0.35 * 1000 = 350. Candidate SL = 92000 - 350 = 91650
    const activeRes = evaluatePositiveTrailingStop({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      entryPrice: entry,
      currentStopLoss: sl,
      markPrice: 92000,
      riskDist: 1000,
      activationOffsetR: 1.0,
      trailingDistanceR: 0.35,
      pipSize: pip,
    });

    assert.equal(activeRes.isTrailingActive, true);
    assert.equal(activeRes.isImproved, true);
    assert.ok(activeRes.newStopLossPrice >= 91650, `Expected SL >= 91650, got ${activeRes.newStopLossPrice}`);
    assert.ok(activeRes.lockedProfitR > 1.5);

    // 3. Monotonic Ratchet: Price pulls back to 91800 (peak remains 92000)
    // SL must NOT drop, remains at 91650 or higher
    const retraceRes = evaluatePositiveTrailingStop({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      entryPrice: entry,
      currentStopLoss: activeRes.newStopLossPrice, // Already trailed to 91650
      markPrice: 91800,
      peakPrice: 92000, // Peak established earlier
      riskDist: 1000,
      activationOffsetR: 1.0,
      trailingDistanceR: 0.35,
      pipSize: pip,
    });

    assert.equal(retraceRes.isTrailingActive, true);
    assert.equal(retraceRes.newStopLossPrice, activeRes.newStopLossPrice);
  });

  it("computeExecutionQualityTelemetry: enforces Truth-in-Data nulls on empty orders and computes slippage/runner conversion", () => {
    const empty = computeExecutionQualityTelemetry([], []);
    assert.equal(empty.trackedOrdersCount, 0);
    assert.equal(empty.avgEntrySlippageR, null);
    assert.equal(empty.tp1HitRatePct, null);
    assert.equal(empty.runnerConversionPct, null);
    assert.equal(empty.activeRunnersCount, 0);

    const sample = computeExecutionQualityTelemetry(
      [
        // 1) LIMIT_PULLBACK hit TP1 -> TP2_TRAIL runner (SL moved to profit lock; 1R inferred via tp1/0.72)
        {
          status: "FILLED",
          direction: "BUY",
          entryPrice: 100,
          executionPrice: 100.2, // 0.2 / 2.0 = 0.10R
          stopLossPrice: 100.32, // Trailed to +0.16R
          takeProfit1: 101.44, // 0.72R => risk1R = 2.0
          positionStage: "TP2_TRAIL",
          realizedPnlUsd: 45,
          message: "[AUTO TP2] Chốt 30% + khóa lãi",
          entryMode: "LIMIT_PULLBACK",
        },
        // 2) Hit TP1 then closed on TRAILING PROFIT LOCK
        {
          status: "FILLED",
          direction: "SELL",
          entryPrice: 200,
          executionPrice: 199.8, // 0.2 / 4.0 = 0.05R
          stopLossPrice: 204,
          takeProfit1: 197.12,
          positionStage: "CLOSED",
          realizedPnlUsd: 28,
          message: "[TRAILING PROFIT LOCK] Đóng runner có lãi sau TP1",
          entryMode: "LIMIT_PULLBACK",
        },
        // 3) Full Stop-Loss (AUTO SL GUARD)
        {
          status: "FILLED",
          direction: "BUY",
          entryPrice: 50,
          executionPrice: 50.15, // 0.15 / 1.0 = 0.15R
          stopLossPrice: 49,
          takeProfit1: 50.72,
          positionStage: "CLOSED",
          realizedPnlUsd: -20,
          message: "[AUTO SL GUARD] Chạm cắt lỗ cấu trúc",
          entryMode: "MARKET_CONFIRMED",
        },
        // 4) Rejected order must be excluded from tracked filled metrics
        {
          status: "REJECTED_SLIPPAGE",
          direction: "BUY",
          entryPrice: 100,
          executionPrice: 105,
          stopLossPrice: 98,
          takeProfit1: 101.44,
          positionStage: "CLOSED",
          realizedPnlUsd: 0,
          message: "Slippage exceeded",
          entryMode: "LIMIT_PULLBACK",
        },
      ],
      [{ positionStage: "TP2_TRAIL" }, { positionStage: "INITIAL" }],
    );

    assert.equal(sample.trackedOrdersCount, 3);
    assert.equal(sample.resolvedOrdersCount, 3);
    assert.equal(sample.limitPullbackCount, 2);
    assert.equal(sample.avgEntrySlippageR, 0.1); // mean(0.10, 0.05, 0.15) = 0.100
    assert.equal(sample.tp1HitCount, 2);
    assert.equal(sample.tp1HitRatePct, 66.7);
    assert.equal(sample.runnerConvertedCount, 1);
    assert.equal(sample.runnerConversionPct, 50);
    assert.equal(sample.profitLockStopsCount, 1);
    assert.equal(sample.fullSlStopsCount, 1);
    assert.equal(sample.activeRunnersCount, 1);
  });
});
