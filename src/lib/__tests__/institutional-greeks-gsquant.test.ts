import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateOptionGreeks,
  calculateImpliedVolatility,
  calibrateSviVolatilitySmile,
  runGsQuantScenarioStressTest,
  normPdf,
} from "../engines/institutional-greeks-gsquant";

describe("Institutional Derivatives Greeks & Scenario Stress Engine (gs-quant Parity)", () => {
  it("normPdf: verifies Gaussian probability density integration and symmetry", () => {
    assert.ok(Math.abs(normPdf(0) - 0.3989) < 1e-3);
    assert.equal(normPdf(1.5), normPdf(-1.5));
  });

  it("calculateOptionGreeks: verifies Put-Call Parity, Greek signs, and second-order cross Greeks", () => {
    const S = 100;
    const K = 100;
    const T = 0.5; // 6 months
    const r = 0.05;
    const sigma = 0.20;

    const call = calculateOptionGreeks({
      optionType: "CALL",
      underlyingPrice: S,
      strikePrice: K,
      timeToMaturityYears: T,
      volatility: sigma,
      riskFreeRate: r,
    });

    const put = calculateOptionGreeks({
      optionType: "PUT",
      underlyingPrice: S,
      strikePrice: K,
      timeToMaturityYears: T,
      volatility: sigma,
      riskFreeRate: r,
    });

    // 1. Put-Call Parity: C - P = S - K * exp(-r * T)
    const expectedDiff = S - K * Math.exp(-r * T);
    const actualDiff = call.price - put.price;
    assert.ok(Math.abs(actualDiff - expectedDiff) < 0.05, `Parity error: got ${actualDiff}, expected ${expectedDiff}`);

    // 2. Greek boundary relationships
    assert.ok(call.delta > 0.5 && call.delta < 1.0, "ATM Call delta should be slightly above 0.5 due to drift");
    assert.ok(put.delta > -1.0 && put.delta < 0, "Put delta must be negative");
    assert.ok(Math.abs(call.delta - put.delta - 1.0) < 0.01, "Call Delta - Put Delta should equal 1.0 (with q=0)");

    // 3. Gamma and Vega equality
    assert.equal(call.gamma, put.gamma, "Call and Put Gamma must be strictly identical");
    assert.equal(call.vega, put.vega, "Call and Put Vega must be strictly identical");
    assert.ok(call.gamma > 0, "Gamma must be positive");
    assert.ok(call.vega > 0, "Vega must be positive");

    // 4. Theta decay
    assert.ok(call.thetaDaily < 0, "Long Call Theta must be negative (time decay)");
    assert.ok(put.thetaDaily < 0, "Long Put Theta must be negative");

    // 5. Cross Greeks
    assert.ok(Number.isFinite(call.vanna));
    assert.ok(Number.isFinite(call.volga));
  });

  it("calculateImpliedVolatility: accurately inverts Black-Scholes price back to input volatility", () => {
    const S = 1300;
    const K = 1320;
    const T = 0.25;
    const targetVol = 0.285; // 28.5%

    const theoreticalCall = calculateOptionGreeks({
      optionType: "CALL",
      underlyingPrice: S,
      strikePrice: K,
      timeToMaturityYears: T,
      volatility: targetVol,
      riskFreeRate: 0.045,
    });

    const solved = calculateImpliedVolatility({
      optionType: "CALL",
      marketPrice: theoreticalCall.price,
      underlyingPrice: S,
      strikePrice: K,
      timeToMaturityYears: T,
      riskFreeRate: 0.045,
    });

    assert.equal(solved.converged, true);
    assert.ok(
      Math.abs(solved.impliedVol - targetVol) < 0.001,
      `Expected IV ~${targetVol}, got ${solved.impliedVol}`
    );
  });

  it("calibrateSviVolatilitySmile: models equity crash put skew and 25-Delta risk reversal", () => {
    const res = calibrateSviVolatilitySmile({
      forwardPrice: 1300,
      timeToMaturityYears: 0.25,
      strikes: [1150, 1200, 1250, 1300, 1350, 1400, 1450],
      sviParams: { rho: -0.40 }, // Strong downside skew
    });

    assert.ok(res.atmVolPct > 10.0);
    assert.ok(res.riskReversal25Pct < 0, "Equities with negative rho must have negative Risk Reversal (Put IV > Call IV)");
    assert.equal(res.skewBias, "CRASH_PROTECTION_PUT_SKEW");
    assert.equal(res.smileCurve.length, 7);
  });

  it("runGsQuantScenarioStressTest: evaluates portfolio under 5 macro stress shocks and sizes VN30F hedge", () => {
    const positions = [
      // Long VN-Index stock basket: 1,000,000,000 VND
      {
        symbol: "VN30_BASKET",
        instrumentType: "EQUITY_SPOT" as const,
        quantity: 1000,
        underlyingPrice: 1000000, // 1 billion VND total
      },
      // Long OTM Put for disaster protection: 50 contracts
      {
        symbol: "VN30_PUT_1250",
        instrumentType: "OPTION_PUT" as const,
        quantity: 50,
        underlyingPrice: 1300,
        strikePrice: 1250,
        timeToMaturityYears: 0.1,
        impliedVol: 0.28,
      },
    ];

    const result = runGsQuantScenarioStressTest({
      positions,
      portfolioRiskBudgetPct: 12.0,
      vn30ContractMultiplier: 100000,
    });

    assert.ok(result.totalPortfolioValueVnd > 0);
    assert.ok(result.netDeltaExposureVnd > 0);
    assert.equal(result.scenarioImpacts.length, 5);

    // Flash crash should produce the most severe drawdown on a long equity portfolio
    assert.ok(result.maxDrawdownVnd < 0);
    assert.ok(result.worstCaseScenario === "FLASH_CRASH_DOWN_10");

    // Sizing VN30F hedge contracts
    assert.ok(result.recommendedDeltaHedgeContracts.vn30FuturesContracts > 0, "Should recommend SHORTING VN30F to neutralize Long Delta");
  });
});
