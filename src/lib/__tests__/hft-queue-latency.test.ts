import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateHftQueueFillProbability,
  simulateTwoWayLatency,
  evaluateHftExecutionFeasibility,
} from "../engines/advanced-quant-math";
import { runWalkForwardComparison } from "../engines/fx-crypto-backtest-harness";

describe("HFT Queue Position & Latency Simulation Engine (hftbacktest Parity)", () => {
  it("POWER_PROB model: correctly rejects fills when traded volume is insufficient to clear queue ahead", () => {
    const res = calculateHftQueueFillProbability({
      queueAheadVolume: 1000,
      orderSize: 100,
      tradedVolumeAtPrice: 150, // Barely 15% of queue
      modelType: "POWER_PROB",
      alpha: 1.5,
    });

    assert.equal(res.isFilled, false);
    assert.ok(res.fillProbability < 0.2, `Expected low fill prob, got ${res.fillProbability}`);
    assert.ok(res.remainingQueueAhead > 0);
  });

  it("POWER_PROB model: grants fill when traded volume sweeps through queue ahead", () => {
    const res = calculateHftQueueFillProbability({
      queueAheadVolume: 500,
      orderSize: 100,
      tradedVolumeAtPrice: 800, // Fully consumes queue ahead and our order
      modelType: "POWER_PROB",
      alpha: 1.5,
    });

    assert.equal(res.isFilled, true);
    assert.equal(res.fillRatio, 1.0);
    assert.equal(res.remainingQueueAhead, 0);
  });

  it("DETERMINISTIC_FIFO: calculates precise partial and complete fill thresholds", () => {
    // Partial fill test
    const partial = calculateHftQueueFillProbability({
      queueAheadVolume: 100,
      orderSize: 100,
      tradedVolumeAtPrice: 150, // Consumes 100 * (1 - 0.15) = 85 effective queue, leaves 65 for our order
      modelType: "DETERMINISTIC_FIFO",
      queueCancellationRate: 0.15,
    });

    assert.ok(partial.fillRatio > 0.5 && partial.fillRatio < 1.0, `Expected partial fill ratio, got ${partial.fillRatio}`);

    // Complete fill test
    const complete = calculateHftQueueFillProbability({
      queueAheadVolume: 100,
      orderSize: 100,
      tradedVolumeAtPrice: 200,
      modelType: "DETERMINISTIC_FIFO",
      queueCancellationRate: 0.15,
    });

    assert.equal(complete.isFilled, true);
    assert.equal(complete.fillRatio, 1.0);
  });

  it("RISK_ADVERSE model: requires volume buffer to guard against toxic adverse selection", () => {
    const res = calculateHftQueueFillProbability({
      queueAheadVolume: 200,
      orderSize: 50,
      tradedVolumeAtPrice: 210, // Just cleared ahead, but not enough buffer
      modelType: "RISK_ADVERSE",
    });

    assert.equal(res.isFilled, false);
    assert.ok(res.fillRatio < 1.0);
  });

  it("simulateTwoWayLatency: computes feed, order RTT, and adverse selection drift in bps", () => {
    const res = simulateTwoWayLatency({
      feedLatencyMs: 20,
      orderLatencyMs: 40,
      congestionFactor: 1.0,
      volatilityPerSec: 0.0005,
    });

    assert.ok(res.totalRoundTripMs >= 30 && res.totalRoundTripMs <= 180, `Expected realistic RTT, got ${res.totalRoundTripMs}`);
    assert.equal(res.isStaleOrTimeout, false);
    assert.ok(res.adverseDriftBps >= 0);
  });

  it("simulateTwoWayLatency: triggers timeout flag when congestion causes extreme delays", () => {
    const res = simulateTwoWayLatency({
      feedLatencyMs: 150,
      orderLatencyMs: 350,
      congestionFactor: 2.5,
      timeoutThresholdMs: 400,
    });

    assert.equal(res.isStaleOrTimeout, true);
  });

  it("evaluateHftExecutionFeasibility: rejects phantom needle wicks that touch price with zero depth", () => {
    const res = evaluateHftExecutionFeasibility({
      direction: "BUY",
      intendedEntryPrice: 100.0,
      barLow: 99.99, // Penetration is only 0.01
      barHigh: 102.0,
      barClose: 101.5,
      barVolume: 500,
      barAtr: 2.0, // 0.01 < 0.03 * 2.0 (0.06 min penetration)
      minPenetrationFraction: 0.03,
    });

    assert.equal(res.isFeasible, false);
    assert.equal(res.rejectionReason, "INSUFFICIENT_PENETRATION");
  });

  it("evaluateHftExecutionFeasibility: approves valid pullback with genuine volume and queues clearance", () => {
    const res = evaluateHftExecutionFeasibility({
      direction: "BUY",
      intendedEntryPrice: 100.0,
      barLow: 98.8, // Deep pullback penetration
      barHigh: 102.5,
      barClose: 101.0,
      barVolume: 50000,
      barAtr: 1.5,
      queueModel: "POWER_PROB",
    });

    assert.equal(res.isFeasible, true);
    assert.ok(res.fillPrice >= 100.0, "Fill price should include adverse drift for BUY");
    assert.ok(res.fillRatio > 0.8);
  });

  it("Walk-Forward Backtest Harness: seamlessly integrates with enableHftQueueSimulation", () => {
    const report = runWalkForwardComparison({
      split: "CALIBRATION",
      seeds: [777],
      executionOptions: {
        enforceCausalIntraBar: true,
        enableHftQueueSimulation: true,
        hftQueueModel: "POWER_PROB",
        feedLatencyMs: 20,
        orderLatencyMs: 35,
      },
    });

    assert.ok(report.upgradedAAPlus.totalSignalsEvaluated > 0);
    assert.ok(report.upgradedAAPlus.winRatePct >= 0 && report.upgradedAAPlus.winRatePct <= 100);
    assert.ok(Number.isFinite(report.upgradedAAPlus.expectancyR));
  });
});
