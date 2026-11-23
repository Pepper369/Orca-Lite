import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import {
  evaluateUnifiedQlibAlphaRating,
  evaluateUnifiedDerivativesRisk,
  storeAndAuditArcticBars,
} from "../engines/unified-cross-asset-quant";
import {
  computeMultiFactorComposite,
  scoreTechnicalPillar,
  type MultiFactorInput,
} from "../engines/multi-factor-quant-composite";
import { runWalkForwardComparison } from "../engines/fx-crypto-backtest-harness";

describe("Unified Quant Suite Engine End-to-End Integration", () => {
  it("Connects Qlib Alpha Engine into Multi-Factor Composite: boosts technical score for high alpha percentile", () => {
    const bars: OhlcvBar[] = [];
    let p = 100;
    for (let i = 0; i < 40; i++) {
      const open = p;
      const close = p + (i % 2 === 0 ? 1.2 : -0.5);
      const high = Math.max(open, close) + 0.4;
      const low = Math.min(open, close) - 0.4;
      bars.push({ time: i * 60, open, high, low, close, volume: 50000 });
      p = close;
    }

    const inputWithBars: MultiFactorInput = {
      symbol: "FPT",
      rsRating: 85,
      activeBuyRatio: 0.65,
      rawOhlcvBars: bars,
    };

    const techScoring = scoreTechnicalPillar(inputWithBars);
    assert.ok(techScoring.score > 80);
    assert.ok(techScoring.signals.some((s) => s.includes("RS") || s.includes("cầu chủ động")));

    const fullScore = computeMultiFactorComposite(inputWithBars, "BULL_EXPANSION");
    assert.ok(fullScore.compositeScore > 50);
    assert.equal(fullScore.symbol, "FPT");
  });

  it("evaluateUnifiedQlibAlphaRating: computes cross-asset alpha rating and factor breakdown", () => {
    const bars: OhlcvBar[] = Array.from({ length: 50 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101.5 + i,
      volume: 10000,
    }));

    const rating = evaluateUnifiedQlibAlphaRating("BTCUSDT", bars, 1);
    assert.equal(rating.symbol, "BTCUSDT");
    assert.ok(rating.percentileRank >= 0 && rating.percentileRank <= 100);
    assert.ok(rating.topAlphaFactors.length > 0);
  });

  it("evaluateUnifiedDerivativesRisk: calculates portfolio Greeks and VN30F delta-neutral hedge", () => {
    const stressResult = evaluateUnifiedDerivativesRisk({
      positions: [
        {
          symbol: "VN30_PORTFOLIO",
          instrumentType: "EQUITY_SPOT",
          quantity: 1000,
          underlyingPrice: 1300000, // 1.3 billion VND
        },
      ],
      portfolioRiskBudgetPct: 15,
      vn30IndexLevel: 1300,
    });

    assert.ok(stressResult.totalPortfolioValueVnd > 0);
    assert.ok(stressResult.recommendedDeltaHedgeContracts.vn30FuturesContracts > 0);
    assert.ok(stressResult.recommendedDeltaHedgeContracts.rationaleVi.includes("SHORT"));
  });

  it("storeAndAuditArcticBars: stores columnar bars and verifies Zero-Lookahead purity", () => {
    const bars: OhlcvBar[] = Array.from({ length: 100 }, (_, i) => ({
      time: 2000 + i * 60,
      open: 50,
      high: 52,
      low: 48,
      close: 51,
      volume: 2000,
    }));

    // Cutoff at time 5000 (bar 50)
    const auditRes = storeAndAuditArcticBars({
      symbol: "HPG",
      bars,
      asOfTimestamp: 5000,
    });

    assert.equal(auditRes.chunksWritten, 1);
    assert.equal(auditRes.isPurityVerified, true);
    assert.equal(auditRes.leakedCount, 0);
  });

  it("HFT Backtest Harness: verified active queue and latency modeling", () => {
    const report = runWalkForwardComparison({
      split: "CALIBRATION",
      seeds: [999],
      executionOptions: {
        enforceCausalIntraBar: true,
        enableHftQueueSimulation: true,
        hftQueueModel: "POWER_PROB",
        feedLatencyMs: 25,
        orderLatencyMs: 50,
      },
    });

    assert.ok(report.upgradedAAPlus.totalSignalsEvaluated > 0);
  });
});
