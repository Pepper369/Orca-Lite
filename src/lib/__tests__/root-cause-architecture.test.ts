import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrecisionTradeSetup } from "../engines/fx-crypto-precision-engine";
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
});
