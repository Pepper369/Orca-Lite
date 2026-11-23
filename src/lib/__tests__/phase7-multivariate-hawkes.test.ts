import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMultivariateHawkesContagion,
  DEFAULT_CROSS_ASSET_INFECTIVITY,
  type HawkesPointEvent,
} from "../engines/advanced-quant-math";
import { projectUnifiedMacroScenarioReport } from "../engines/multi-scenario-engine";

describe("Phase 7: Multivariate Cross-Exciting Hawkes Process & Contagion Network", () => {
  // P7-01: Spectral Radius & Subcritical Stability Condition
  it("P7-01: Spectral radius calculation correctly verifies subcritical stability vs supercritical avalanche", () => {
    const baseTime = 1700000000000;
    const events: HawkesPointEvent[] = [
      { nodeId: "BTC", timestampMs: baseTime - 10000, magnitude: 2.0 },
    ];

    // Standard stable matrix
    const stableRes = evaluateMultivariateHawkesContagion({
      eventStream: events,
      evaluationTimeMs: baseTime,
      alphaMatrix: DEFAULT_CROSS_ASSET_INFECTIVITY,
    });

    assert.ok(stableRes.spectralRadius > 0 && stableRes.spectralRadius < 1.0, `Spectral radius should be < 1.0, got ${stableRes.spectralRadius}`);
    assert.strictEqual(stableRes.isSubcriticalStable, true, "Standard cross-asset infectivity must be subcritically stable");
    assert.notStrictEqual(stableRes.contagionAlertLevel, "CRITICAL_CASCADE");

    // Explosive / Supercritical matrix (e.g. self-excitation > 1.0)
    const explosiveAlpha: Record<string, Record<string, number>> = {
      BTC: { BTC: 1.2, ETH: 0.8 },
      ETH: { BTC: 0.9, ETH: 1.1 },
    };
    const explosiveRes = evaluateMultivariateHawkesContagion({
      eventStream: events,
      evaluationTimeMs: baseTime,
      alphaMatrix: explosiveAlpha,
    });

    assert.ok(explosiveRes.spectralRadius >= 1.0, `Explosive matrix must have spectral radius >= 1.0, got ${explosiveRes.spectralRadius}`);
    assert.strictEqual(explosiveRes.isSubcriticalStable, false, "Explosive network must be flagged as unstable");
    assert.strictEqual(explosiveRes.contagionAlertLevel, "CRITICAL_CASCADE");
  });

  // P7-02: Cross-Asset Contagion Propagation (BTC Liquidation -> ETH & VN30F)
  it("P7-02: BTC liquidation shock propagates cross-excitation to ETH, VN30F, and VNINDEX", () => {
    const evalTime = 1700000000000;
    // BTC experiences massive liquidation shock 5 minutes ago
    const events: HawkesPointEvent[] = [
      { nodeId: "BTC", timestampMs: evalTime - 5 * 60 * 1000, magnitude: 5.0 },
    ];

    const result = evaluateMultivariateHawkesContagion({
      eventStream: events,
      evaluationTimeMs: evalTime,
    });

    // Dominant shock origin should be identified as BTC
    assert.strictEqual(result.dominantShockOrigin, "BTC");
    // BTC node intensity should surge
    const btcNode = result.nodeIntensities["BTC"];
    assert.ok(btcNode);
    assert.ok(btcNode.instantaneousIntensity > btcNode.baselineMu * 2, "BTC intensity should surge after shock");
    assert.strictEqual(btcNode.isHighExcitationRisk, true);

    // ETH should receive cross excitation from BTC
    const ethNode = result.nodeIntensities["ETH"];
    assert.ok(ethNode);
    assert.ok((ethNode.crossExcitations["BTC"] ?? 0) > 0.5, "ETH must receive cross-excitation from BTC");

    // VN30F should also receive non-zero cross-asset shock
    const vn30fNode = result.nodeIntensities["VN30F"];
    assert.ok(vn30fNode);
    assert.ok((vn30fNode.crossExcitations["BTC"] ?? 0) > 0, "VN30F should register cross-excitation");

    assert.ok(result.expectedAftershockBars > 0, "Aftershock duration must be positive");
  });

  // P7-03: Hawkes Exponential Time Dissipation
  it("P7-03: Hawkes intensity decays exponentially as elapsed time increases", () => {
    const eventTime = 1700000000000;
    const events: HawkesPointEvent[] = [
      { nodeId: "DXY", timestampMs: eventTime, magnitude: 4.0 },
    ];

    // Evaluate 5 minutes after event
    const resImmediate = evaluateMultivariateHawkesContagion({
      eventStream: events,
      evaluationTimeMs: eventTime + 5 * 60 * 1000,
    });

    // Evaluate 4 hours after event
    const resLate = evaluateMultivariateHawkesContagion({
      eventStream: events,
      evaluationTimeMs: eventTime + 240 * 60 * 1000,
    });

    assert.ok(
      resImmediate.networkIntensityTotal > resLate.networkIntensityTotal,
      `Immediate intensity (${resImmediate.networkIntensityTotal}) must exceed late intensity (${resLate.networkIntensityTotal})`
    );
    assert.ok(
      resLate.nodeIntensities["DXY"].instantaneousIntensity < resImmediate.nodeIntensities["DXY"].instantaneousIntensity * 0.25,
      "DXY intensity should decay significantly after 4 hours"
    );
  });

  // P7-04: Multi-Scenario Engine Integration with Hawkes Contagion
  it("P7-04: projectUnifiedMacroScenarioReport integrates Hawkes Contagion state without regressions", () => {
    const baseTime = 1700000000000;
    const hawkesEvents: HawkesPointEvent[] = [
      { nodeId: "VN30F", timestampMs: baseTime - 2 * 60 * 1000, magnitude: 3.5 },
      { nodeId: "DXY", timestampMs: baseTime - 10 * 60 * 1000, magnitude: 2.0 },
    ];

    const report = projectUnifiedMacroScenarioReport({
      symbol: "VNINDEX",
      currentPrice: 1285.5,
      portfolioValueVND: 600_000_000,
      portfolioBeta: 1.1,
      hawkesEvents,
      macroEvents: [
        {
          eventId: "us-cpi",
          name: "US CPI MoM",
          currency: "USD",
          importance: "HIGH",
          standardizedSurpriseScore: -1.2,
          minutesToEvent: 15,
        },
      ],
    });

    assert.ok(report.hawkesContagion, "Report must include Hawkes contagion data when events are passed");
    assert.ok(report.hawkesContagion.spectralRadius > 0);
    assert.strictEqual(report.hawkesContagion.isSubcriticalStable, true);
    assert.ok(report.metrics.netExpectedReturnPct !== undefined);
  });
});
