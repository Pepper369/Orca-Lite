import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeEmpiricalShrinkageCovariance, calculateHRP } from "../engines/advanced-quant-math";
import { computeMultiTierTpChunks } from "../engines/exchange-execution-client";
import { calculateForexPositionSize, calculatePipValueUsd } from "../engines/forex-position-sizer";
import { generateMakerPeggingGuide } from "../engines/quant-reversal-pace";
import { getMacroRadarSnapshot } from "../engines/macro-radar-engine";
import { getDerivativesArbitrageSignal } from "../engines/derivatives-arbitrage-engine";
import { buildMt5EaOrder } from "../services/forex-webhook-dispatcher";
import { dispatchSignalWithVault } from "../services/auto-trade-dispatcher";
import { buildBotLiveTelemetrySnapshot, evaluateRealtimePositionExits } from "../services/bot-live-telemetry";
import { getBrokerConnectionById } from "../services/broker-vault-store";
import type { ForexQuantSignalItem } from "../services/forex-signals-hub";

describe("Phase 0: SSOT Quant Pipeline, Multi-Tier TP/BE & Truth-in-Data Invariants", () => {
  it("P0-01: computeMultiTierTpChunks splits 50%/30%/20% when viable and collapses cleanly on small qty", () => {
    const chunksFull = computeMultiTierTpChunks({
      totalQty: 0.2,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 91500.04,
      tp2: 93000.06,
      tp3: 95000.09,
    });
    assert.equal(chunksFull.length, 3);
    assert.deepEqual(
      chunksFull.map((c) => [c.tier, c.qty, c.closePosition]),
      [
        ["TP1", 0.1, false],
        ["TP2", 0.06, false],
        ["TP3", 0.04, false],
      ],
    );

    const chunksTiny = computeMultiTierTpChunks({
      totalQty: 0.001,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 91500,
      tp2: 93000,
      tp3: 95000,
    });
    assert.equal(chunksTiny.length, 1);
    assert.equal(chunksTiny[0]?.closePosition, true);
    assert.equal(chunksTiny[0]?.qty, 0.001);
  });

  it("P0-02: evaluateRealtimePositionExits enforces 3-stage partial close (TP1 50%+BE -> TP2 30%+Lock -> TP3 20%)", async () => {
    const signalId = `p0_tp3_btc_${Date.now()}`;
    const orders = await dispatchSignalWithVault({
      signal: {
        id: signalId,
        symbol: "BTCUSDT",
        assetType: "CRYPTO",
        direction: "BUY",
        entryPrice: 90_000,
        stopLossPrice: 88_500,
        takeProfit1: 91_500,
        takeProfit2: 93_000,
        takeProfit3: 95_000,
        masterLotsOrQty: 0.2,
        masterCapitalUsd: 10_000,
        winrateScore: 86,
        setupGrade: "A+",
        recommendedLeverage: 5,
        timestamp: Date.now(),
      },
      currentMarketPrice: 90_000,
      manualOverride: true,
      targetFollowerIds: ["paper-binance-sandbox"],
    });

    const placed = orders[0]!;
    assert.equal(placed.status, "FILLED_PAPER");
    const initialQty = placed.copiedLotsOrQty;
    assert.ok(initialQty > 0);

    const acctBefore = await getBrokerConnectionById("paper-binance-sandbox");
    const balanceBefore = acctBefore!.balanceUsd;

    // Step 1: Hit TP1 -> closes 50% and moves SL above entry (Breakeven + buffer)
    const step1 = await evaluateRealtimePositionExits({
      forceEvaluate: true,
      overrideMarkPrices: new Map([["BTCUSDT", 91_520]]),
    });
    assert.ok((step1.partialClosedCount ?? 0) >= 1, "TP1 must trigger 50% partial close");

    let snap = await buildBotLiveTelemetrySnapshot();
    let pos = snap.openPositions.find((p) => p.orderId === placed.orderId);
    assert.ok(pos, "Position must stay open after 50% TP1 partial close");
    assert.equal(pos.positionStage, "TP1_BE");
    assert.ok(pos.qtyOrLots < initialQty && Math.abs(pos.qtyOrLots - initialQty * 0.5) < 0.001);
    assert.ok((pos.stopLossPrice ?? 0) > 90_000, "SL must move above entry for BUY breakeven protection");
    assert.ok((pos.realizedPnlUsd ?? 0) > 0);

    // Step 2: Hit TP2 -> closes 30% of initial, leaving ~20% for TP3 runner
    const step2 = await evaluateRealtimePositionExits({
      forceEvaluate: true,
      overrideMarkPrices: new Map([["BTCUSDT", 93_050]]),
    });
    assert.ok((step2.partialClosedCount ?? 0) >= 1, "TP2 must trigger 30% partial close");

    snap = await buildBotLiveTelemetrySnapshot();
    pos = snap.openPositions.find((p) => p.orderId === placed.orderId);
    assert.ok(pos, "Final 20% runner must stay open after TP2");
    assert.equal(pos.positionStage, "TP2_TRAIL");
    assert.ok(Math.abs(pos.qtyOrLots - initialQty * 0.2) < 0.001);
    assert.ok((pos.stopLossPrice ?? 0) > 90_500, "SL must lock profit after TP2");

    // Step 3: Hit TP3 -> closes remaining 20% completely
    const step3 = await evaluateRealtimePositionExits({
      forceEvaluate: true,
      overrideMarkPrices: new Map([["BTCUSDT", 95_050]]),
    });
    assert.ok(step3.closedCount >= 1, "TP3 must close remaining 20% runner completely");

    snap = await buildBotLiveTelemetrySnapshot();
    assert.equal(snap.openPositions.find((p) => p.orderId === placed.orderId), undefined);

    const acctAfter = await getBrokerConnectionById("paper-binance-sandbox");
    assert.ok(acctAfter!.balanceUsd > balanceBefore, "Account balance must reflect realized multi-tier profit");
  });

  it("P0-03: Asset-accurate decimals in MT5 EA dispatcher, Reversal Pace micro-coins, and live cross-rate FX sizing", () => {
    const eurusdSig: ForexQuantSignalItem = {
      pair: "EURUSD",
      symbol: "EUR/USD",
      direction: "BUY",
      action: "BUY",
      timeframe: "M15/H1",
      status: "ACTIVE",
      strength: 85,
      probability: 82,
      lastPrice: 1.08495,
      entryPrice: 1.08495,
      stopLossPrice: 1.08245,
      tp1: 1.08795,
      tp2: 1.09015,
      tp3: 1.09325,
      stopPips: 25,
      riskReward: 2.0,
      session: "LONDON",
      sessionEligible: true,
      spreadPips: 0.7,
      regime: "TRENDING_UP",
      recommendedLots: 0.25,
      riskAmountUsd: 100,
      evidence: [],
      riskNotes: [],
      updatedAt: Date.now(),
    };
    const mt5 = buildMt5EaOrder(eurusdSig);
    assert.equal(mt5.price, 1.08495, "5th decimal pipettes must not truncate to 4 decimals");
    assert.equal(mt5.sl, 1.08245);
    assert.equal(mt5.tp3, 1.09325);

    const pepePeg = generateMakerPeggingGuide({
      symbol: "PEPEUSDT",
      currentPrice: 0.00001085,
      direction: "BUY",
      favoriteProbability: 0.98,
      tailProbability: 0.03,
      assetType: "CRYPTO",
    });
    assert.ok(
      pepePeg.peggedPrice > 0.00001 && pepePeg.peggedPrice < 0.000011,
      "Micro-coin maker peg must preserve 8 decimals instead of .toFixed(5)",
    );

    // Live cross rates change pipValueUsd accurately vs bootstrap fallback
    const pipJpy140 = calculatePipValueUsd("EURJPY", 158.0, { usdJpy: 140.0 });
    const pipJpy160 = calculatePipValueUsd("EURJPY", 172.0, { usdJpy: 160.0 });
    assert.ok(Math.abs(pipJpy140 - 1000 / 140) < 1e-6);
    assert.ok(pipJpy140 > pipJpy160);

    const sizedLive = calculateForexPositionSize({
      accountBalance: 10_000,
      riskPercent: 1.0,
      pair: "EURGBP",
      entryPrice: 0.85,
      stopLossPrice: 0.848,
      crossRates: { gbpUsd: 1.35 },
    });
    assert.equal(sizedLive.pipValueSource, "LIVE_CROSS_RATE");
    assert.equal(sizedLive.pipValuePerStandardLot, 13.5);
  });

  it("P0-04: Empirical Ledoit-Wolf shrinkage covariance feeds non-trivial correlation into HRP", () => {
    // Asset 0 and Asset 1 are highly correlated (~0.95), Asset 2 is inversely correlated
    const r0 = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.4) * 0.02 + 0.001);
    const r1 = r0.map((v, i) => v * 0.95 + Math.cos(i) * 0.002);
    const r2 = r0.map((v) => -v * 0.7);
    const emp = computeEmpiricalShrinkageCovariance([r0, r1, r2], [0.02, 0.02, 0.02], 0.2);

    assert.equal(emp.isEmpirical, true);
    assert.equal(emp.sampleLength, 30);
    // Cov(0, 1) > 0 while Cov(0, 2) < 0
    assert.ok(emp.covMatrix[0]![1]! > 0);
    assert.ok(emp.covMatrix[0]![2]! < 0);

    const hrp = calculateHRP(["A", "B", "C"], emp.covMatrix);
    const sumW = Object.values(hrp.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumW - 1) < 0.01);
    // Diversifier Asset C should receive significant weight vs two duplicate assets A & B
    assert.ok((hrp.weights["C"] ?? 0) > (hrp.weights["A"] ?? 0));
  });

  it("P0-05: Macro radar removes static 2026-10 values and Derivatives Arbitrage respects OU dtMinutes", async () => {
    const macro = await getMacroRadarSnapshot();
    assert.ok(macro.indicators.length >= 4);
    assert.ok(
      macro.indicators.every((i) => i.updatedAt !== "2026-10"),
      "Macro radar indicators must come from live/bootstrap feeds, never stale hardcoded 2026-10",
    );
    assert.ok(macro.provenance === "LIVE_MACRO_FEED" || macro.provenance === "BOOTSTRAP_CACHED");

    const syntheticBasis = [-2.0];
    for (let i = 1; i < 22; i++) {
      syntheticBasis.push(Number((-0.5 + 0.72 * syntheticBasis[i - 1]! + Math.sin(i) * 0.35).toFixed(2)));
    }
    syntheticBasis.push(-6.5);
    const derivDailyDt = await getDerivativesArbitrageSignal("VN30F1M", syntheticBasis, 1440);
    assert.equal(derivDailyDt.ouDtMinutes, 1440);
    assert.ok(
      derivDailyDt.ouCalibration == null ||
        !derivDailyDt.ouCalibration.stationary ||
        derivDailyDt.ouCalibration.halfLifeMinutes >= 1440,
      "Passing dtMinutes=1440 for daily series must scale halfLifeMinutes into day scale (>=1440m), not 1-minute scale",
    );
  });
});
