import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrecisionTradeSetup } from "../engines/fx-crypto-precision-engine";
import { registerBrokerLiveTick, getBiquoteLiveTickAny } from "../realtime/biquote-poll";
import { evaluateHighWinrateGate } from "../engines/high-winrate-gate";
import type { OhlcvBar } from "../types";

describe("Root-Cause Quant Architecture Invariants (Zero-Chase, Toxic Flow Veto & Robust Limits)", () => {
  const basePrice = 1.085;
  const mockBars: OhlcvBar[] = [];
  for (let i = 0; i < 40; i++) {
    mockBars.push({
      time: 1700000000 + i * 900,
      open: basePrice + i * 0.0001,
      high: basePrice + i * 0.0001 + 0.0006,
      low: basePrice + i * 0.0001 - 0.0002,
      close: basePrice + i * 0.0001 + 0.0004,
      volume: 1500,
    });
  }

  // RC-01: Strict Limit Order Enforcement (Zero Market Chase)
  it("RC-01: evaluatePrecisionTradeSetup enforces entryMode = LIMIT_PULLBACK on valid trade setups", () => {
    const res = evaluatePrecisionTradeSetup({
      symbol: "EURUSD",
      assetType: "FOREX",
      barsExecution: mockBars,
      candidateDirection: "BUY",
      spreadPipsOrPct: 1.0,
    });

    if (res.direction === "BUY") {
      assert.strictEqual(
        res.entryMode,
        "LIMIT_PULLBACK",
        "Valid setup must always demand LIMIT_PULLBACK to prevent retail spread/slippage chase"
      );
      assert.ok(
        res.entry <= mockBars[mockBars.length - 1].close + 1e-6,
        "Limit entry price must not chase above current close for BUY"
      );
    }
  });

  // RC-02: Toxic Adverse Selection Velocity Veto
  it("RC-02: Opposing violent candle triggers Toxic Flow Veto (refusing to catch falling knife)", () => {
    const crashBars: OhlcvBar[] = [...mockBars];
    // Add violent opposing dump candle (dumping 25 pips on EURUSD)
    const lastBar = crashBars[crashBars.length - 1];
    crashBars.push({
      time: lastBar.time + 900,
      open: lastBar.close,
      high: lastBar.close + 0.0001,
      low: lastBar.close - 0.0025,
      close: lastBar.close - 0.0024, // Violent opposing dump
      volume: 8000,
    });

    const res = evaluatePrecisionTradeSetup({
      symbol: "EURUSD",
      assetType: "FOREX",
      barsExecution: crashBars,
      candidateDirection: "BUY", // Asking to buy into a violent dump
      spreadPipsOrPct: 1.0,
    });

    assert.ok(
      res.vetoReasons.some((r) => r.includes("Toxic Adverse Flow") || r.includes("dao rơi") || r.includes("lao dốc")),
      "Must trigger Toxic Adverse Flow veto against violent falling knife"
    );
    assert.strictEqual(res.grade, "NO_TRADE", "Toxic falling knife setup must be downgraded to NO_TRADE");
  });

  // RC-03: Reverse Price Bridge: Live MT5 broker tick registry
  it("RC-03: registerBrokerLiveTick updates broker quote instantaneously without REST delay", () => {
    const testSymbol = "XAUUSD";
    const testBid = 2652.45;
    const testAsk = 2652.75;

    registerBrokerLiveTick(testSymbol, testBid, testAsk, "mt5-ea-bridge");
    const tick = getBiquoteLiveTickAny(testSymbol);

    assert.ok(tick != null, "Tick must be retrieved from cache");
    assert.strictEqual(tick.bid, testBid);
    assert.strictEqual(tick.ask, testAsk);
    assert.strictEqual(tick.price, (testBid + testAsk) / 2);
    assert.ok(Date.now() - tick.ts < 1000, "Timestamp must reflect instantaneous arrival");
  });

  // RC-04: Realistic Bayesian Posterior Win Probability Invariant (Cap <= 58%)
  it("RC-04: Enforces realistic Bayesian posterior win probability cap <= 58%", () => {
    const gateRes = evaluateHighWinrateGate({
      symbol: "EURUSD",
      series: mockBars,
      candidateDirection: "BUY",
      entryPrice: 1.085,
      stopLossPrice: 1.082,
      takeProfitPrice: 1.091,
    });

    const precRes = evaluatePrecisionTradeSetup({
      symbol: "EURUSD",
      assetType: "FOREX",
      barsExecution: mockBars,
      candidateDirection: "BUY",
      spreadPipsOrPct: 1.0,
    });

    assert.ok(
      precRes.calibratedWinRatePct <= 58,
      `calibratedWinRatePct ${precRes.calibratedWinRatePct} must be bounded <= 58%`
    );
    assert.ok(
      gateRes.commentary.includes("Bayes") || gateRes.commentary.includes("Score"),
      "Commentary must cite Bayesian posterior or Score without claiming 90% winrate"
    );
  });
});
