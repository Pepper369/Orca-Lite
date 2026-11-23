import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSignalThesisState,
  createDefaultThesisContext,
  type InvestmentThesisContext,
  type LiveMarketEvidence,
} from "../engines/bot-signal-falsification-tracker";

describe("Dynamic Investment Thesis & Signal Falsification Tracker Engine (AlphaEar Parity)", () => {
  const baseBuyThesis: InvestmentThesisContext = {
    orderId: "ord_test_01",
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    direction: "BUY",
    entryPrice: 60000,
    stopLossPrice: 58500, // 1500 pts risk
    takeProfit1Price: 63000,
    openedTimestampMs: 1000000,
    initialThesis: "ICT MSS Bullish + FVG Pullback",
    initialConvictionScore: 75,
  };

  it("evaluateSignalThesisState: keeps thesis UNCHANGED under normal market noise", () => {
    const evidence: LiveMarketEvidence = {
      currentPrice: 60150, // +0.25%
      orderBookImbalance: 0.05,
      adverseSweepDetected: false,
      macroNewsShockDirection: "NEUTRAL",
      structureBroken: false,
      holdingMinutes: 15,
    };

    const result = evaluateSignalThesisState(baseBuyThesis, evidence);
    assert.equal(result.status, "UNCHANGED");
    assert.equal(result.actionDirective, "HOLD_NORMAL");
    assert.ok(result.convictionScore >= 65 && result.convictionScore <= 80);
    assert.equal(result.falsificationReasons.length, 0);
    assert.ok(result.narrativeVi.includes("DUY TRÌ VỊ THẾ BÌNH THƯỜNG"));
  });

  it("evaluateSignalThesisState: transitions to STRENGTHENED when momentum and flow confirm thesis", () => {
    const evidence: LiveMarketEvidence = {
      currentPrice: 61500, // +2.5% move
      orderBookImbalance: 0.45, // strong buy flow
      adverseSweepDetected: false,
      macroNewsShockDirection: "BULLISH",
      structureBroken: false,
      holdingMinutes: 25,
    };

    const result = evaluateSignalThesisState(baseBuyThesis, evidence);
    assert.equal(result.status, "STRENGTHENED");
    assert.equal(result.actionDirective, "HOLD_AGGRESSIVE");
    assert.ok(result.convictionScore >= 85);
    assert.ok(result.narrativeVi.includes("CỦNG CỐ"));
  });

  it("evaluateSignalThesisState: transitions to WEAKENED and tightens Stop-Loss upon warning signs", () => {
    const evidence: LiveMarketEvidence = {
      currentPrice: 59700, // -0.5% slight dip
      orderBookImbalance: -0.50, // Heavy sell wall
      adverseSweepDetected: false,
      macroNewsShockDirection: "NEUTRAL",
      structureBroken: false,
      holdingMinutes: 40,
    };

    const result = evaluateSignalThesisState(baseBuyThesis, evidence);
    assert.equal(result.status, "WEAKENED");
    assert.equal(result.actionDirective, "TIGHTEN_STOP");
    assert.ok(result.falsificationReasons.length >= 1);
    assert.ok(result.recommendedSlAdjustment != null);
    // Tightened SL should be higher than initial 58,500 (cutting downside risk)
    assert.ok(result.recommendedSlAdjustment > 58500);
    assert.ok(result.recommendedSlAdjustment <= 60000);
    assert.ok(result.narrativeVi.includes("SIẾT CHẶT STOP LOSS"));
  });

  it("evaluateSignalThesisState: triggers EMERGENCY_EXIT when market structure is broken (FALSIFIED)", () => {
    const evidence: LiveMarketEvidence = {
      currentPrice: 59200, // before hitting 58,500 full SL
      orderBookImbalance: -0.60,
      adverseSweepDetected: true,
      macroNewsShockDirection: "BEARISH",
      structureBroken: true, // Market Structure Shift confirmed reversal
      holdingMinutes: 10,
    };

    const result = evaluateSignalThesisState(baseBuyThesis, evidence);
    assert.equal(result.status, "FALSIFIED");
    assert.equal(result.actionDirective, "EMERGENCY_EXIT");
    assert.ok(result.convictionScore <= 28);
    assert.ok(result.falsificationReasons.some((r) => r.includes("phá vỡ")));
    assert.ok(result.falsificationReasons.some((r) => r.includes("Quét thanh khoản đối kháng")));
    assert.ok(result.narrativeVi.includes("THOÁT LỆNH KHẨN CẤP"));
  });

  it("evaluateSignalThesisState: works symmetrically for SELL positions", () => {
    const baseSellThesis: InvestmentThesisContext = {
      orderId: "ord_sell_01",
      symbol: "EURUSD",
      assetType: "FOREX",
      direction: "SELL",
      entryPrice: 1.0850,
      stopLossPrice: 1.0880, // 30 pips risk
      openedTimestampMs: 2000000,
      initialThesis: "Bearish Order Flow Breakout",
    };

    // Falsified by bullish macro news shock + adverse buy sweep
    const evidence: LiveMarketEvidence = {
      currentPrice: 1.0865, // floating -15 pips loss
      orderBookImbalance: 0.55,
      adverseSweepDetected: true,
      macroNewsShockDirection: "BULLISH", // opposite to SELL
      structureBroken: true,
    };

    const result = evaluateSignalThesisState(baseSellThesis, evidence);
    assert.equal(result.status, "FALSIFIED");
    assert.equal(result.actionDirective, "EMERGENCY_EXIT");
    assert.ok(result.falsificationReasons.length >= 2);
  });

  it("createDefaultThesisContext: extracts clean context from execution order", () => {
    const order = {
      orderId: "ord_999",
      symbol: "ETHUSDT",
      direction: "BUY" as const,
      entryPrice: 3500,
      stopLossPrice: 3400,
      takeProfit1: 3700,
      timestamp: 1234567,
      message: "[GRADE_A] ICT OTE Setup @ 3500",
    };

    const ctx = createDefaultThesisContext(order, "CRYPTO");
    assert.equal(ctx.orderId, "ord_999");
    assert.equal(ctx.symbol, "ETHUSDT");
    assert.equal(ctx.direction, "BUY");
    assert.equal(ctx.entryPrice, 3500);
    assert.equal(ctx.stopLossPrice, 3400);
    assert.equal(ctx.takeProfit1Price, 3700);
    assert.ok(ctx.initialThesis.includes("GRADE_A"));
  });
});
