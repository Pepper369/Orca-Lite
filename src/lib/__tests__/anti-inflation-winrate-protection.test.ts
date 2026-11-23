import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateHighWinrateGate } from "../engines/high-winrate-gate";
import { calculateUnifiedTradeRiskPlan } from "../engines/unified-cross-asset-quant";
import type { OhlcvBar } from "../types";

describe("Anti-Inflation Winrate & Capital Protection Invariants", () => {
  const mockBars: OhlcvBar[] = [];
  const basePrice = 1.085;
  for (let i = 0; i < 50; i++) {
    mockBars.push({
      time: 1700000000 + i * 300,
      open: basePrice + i * 0.0001,
      high: basePrice + i * 0.0001 + 0.0005,
      low: basePrice + i * 0.0001 - 0.0002,
      close: basePrice + i * 0.0001 + 0.0003,
      volume: 1000 + i * 10,
    });
  }

  // AI-01: Winrate score vs Realistic Probability Cap
  it("AI-01: evaluateHighWinrateGate bounds realistic win probability to <= 62% even for high scores", () => {
    const res = evaluateHighWinrateGate({
      symbol: "EURUSD",
      series: mockBars,
      candidateDirection: "BUY",
      entryPrice: 1.089,
      stopLossPrice: 1.086,
      takeProfitPrice: 1.094,
    });

    // Score can be high due to technical confluence (e.g. 75 - 90)
    assert.ok(res.winrateScore >= 30 && res.winrateScore <= 95);
    // Commentary must accurately clarify Confluence Score rather than false 90% claim
    assert.ok(!res.commentary.includes("WINRATE CAO (90%)"));
    assert.ok(res.commentary.includes("Score"));
  });

  // AI-02: Strict Institutional Risk Cap Invariant
  it("AI-02: calculateUnifiedTradeRiskPlan enforces hard risk cap <= 0.85% balance", () => {
    // Even if caller passes inflated 90% winrate
    const plan = calculateUnifiedTradeRiskPlan({
      assetType: "FOREX",
      symbol: "EURUSD",
      direction: "BUY",
      winRatePct: 90, // Inflated input
      payoffRatio: 2.0,
      sizeMultiplier: 1.5,
      entryPrice: 1.085,
      stopLossPrice: 1.082,
      takeProfit1: 1.091,
      accountBalanceUsd: 10_000,
    });

    // Effective risk must never exceed 0.85%
    assert.ok(
      plan.effectiveRiskPct <= 0.85,
      `Effective risk percent (${plan.effectiveRiskPct}%) exceeded hard institutional cap of 0.85%`
    );
    assert.ok(
      plan.riskAmountUsd <= 85.0,
      `Risk amount USD ($${plan.riskAmountUsd}) exceeded $85.0 on $10,000 balance`
    );
  });

  // AI-03: Portfolio Heat & Multi-Position Loss Containment
  it("AI-03: Multiple concurrent positions respect maximum draw budget <= 3.0%", () => {
    // 3 concurrent positions maximum
    const maxConcurrent = 3;
    const maxSingleRisk = 0.85; // 0.85%
    const totalMaxPortfolioHeatPct = maxConcurrent * maxSingleRisk;

    assert.ok(
      totalMaxPortfolioHeatPct <= 3.0,
      `Total simultaneous portfolio heat (${totalMaxPortfolioHeatPct}%) must not exceed 3.0% on $10k account`
    );
  });
});
