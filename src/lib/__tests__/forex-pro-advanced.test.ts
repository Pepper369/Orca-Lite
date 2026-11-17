import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCurrencyStrengthMatrix,
  type PairPriceInput,
} from "../engines/forex-currency-strength";
import { scanForexSmc } from "../engines/forex-smc-scanner";
import {
  buildMt5EaOrder,
  buildTelegramAlertMessage,
} from "../services/forex-webhook-dispatcher";
import type { ForexQuantSignalItem } from "../services/forex-signals-hub";
import type { OhlcvBar } from "../types";

test("Trụ cột 1: Currency Strength Matrix (CSM) & DXY Estimation", () => {
  const samplePairs: PairPriceInput[] = [
    { pair: "EURUSD", price: 1.085, changePercent: -0.65 },
    { pair: "GBPUSD", price: 1.295, changePercent: -0.45 },
    { pair: "USDJPY", price: 155.2, changePercent: 0.85 },
    { pair: "USDCHF", price: 0.885, changePercent: 0.5 },
    { pair: "AUDUSD", price: 0.655, changePercent: -0.7 },
    { pair: "USDCAD", price: 1.405, changePercent: 0.4 },
    { pair: "NZDUSD", price: 0.592, changePercent: -0.6 },
    { pair: "EURJPY", price: 168.4, changePercent: 0.2 },
    { pair: "GBPJPY", price: 201.0, changePercent: 0.4 },
  ];

  const result = calculateCurrencyStrengthMatrix(samplePairs);

  // Must score all 8 currencies
  assert.equal(result.scores.length, 8);
  // Scores must be bounded between 0.1 and 9.9
  for (const s of result.scores) {
    assert.ok(s.score >= 0.1 && s.score <= 9.9);
  }

  // Because USD had large positive changes vs major currencies, USD should be very strong
  const usdScore = result.scores.find((s) => s.currency === "USD");
  assert.ok(usdScore != null && usdScore.score >= 6.0);
  assert.equal(result.dxyEstimate.bias, "BULLISH");

  // Best pair divergence exists
  assert.ok(result.bestPairToTrade != null);
  assert.ok(result.bestPairToTrade.pair.length === 6);
  assert.ok(result.bestPairToTrade.strengthDiff > 0);

  // Check correlations
  assert.ok(result.correlations.length >= 5);
  const eurusdGbpusd = result.correlations.find(
    (c) => c.pairA === "EURUSD" && c.pairB === "GBPUSD"
  );
  assert.ok(eurusdGbpusd != null && eurusdGbpusd.correlation > 0.8);
  assert.ok(eurusdGbpusd.riskWarning != null);
});

test("Trụ cột 2: Server-Side SMC, FVG & Order Block Scanner", () => {
  // Generate sample 40 bars with a clear FVG imbalance and sweep
  const bars: OhlcvBar[] = [];
  let p = 1.0800;
  for (let i = 0; i < 40; i++) {
    // Inject a sudden impulsive jump at bar 20 creating an FVG
    if (i === 20) {
      bars.push({
        time: 1700000000000 + i * 60000,
        open: p,
        high: p + 0.0015,
        low: p - 0.0001,
        close: p + 0.0014,
        volume: 8500,
      });
      p += 0.0014;
    } else {
      p += (i % 2 === 0 ? 0.0001 : -0.0001);
      bars.push({
        time: 1700000000000 + i * 60000,
        open: p,
        high: p + 0.0003,
        low: p - 0.0003,
        close: p,
        volume: 1200,
      });
    }
  }

  const smc = scanForexSmc("EURUSD", bars);
  assert.equal(smc.pair, "EURUSD");
  assert.ok(smc.score >= 30 && smc.score <= 95);
  assert.ok(smc.summary.length > 0);

  // Verify structure detection
  assert.ok(Array.isArray(smc.unmitigatedFvgList));
  assert.ok(Array.isArray(smc.activeOrderBlocks));
  assert.ok(Array.isArray(smc.recentSweeps));

  // Optimal setup has valid properties
  assert.ok(["BUY", "SELL", "WAIT"].includes(smc.optimalTradeSetup.direction));
});

test("Trụ cột 3: Webhook Dispatcher & MetaTrader 4/5 EA Contract", () => {
  const dummySignal: ForexQuantSignalItem = {
    pair: "EURUSD",
    symbol: "EUR/USD",
    direction: "BUY",
    action: "BUY",
    timeframe: "M15/H1",
    status: "ACTIVE",
    strength: 82,
    probability: 85,
    lastPrice: 1.0850,
    entryPrice: 1.0850,
    stopLossPrice: 1.0825,
    tp1: 1.0880,
    tp2: 1.0900,
    tp3: 1.0925,
    stopPips: 25.0,
    riskReward: 2.0,
    session: "LONDON",
    sessionEligible: true,
    spreadPips: 0.8,
    regime: "TRENDING_UP / NORMAL",
    recommendedLots: 0.40,
    riskAmountUsd: 100,
    evidence: ["M15 breakout", "Bullish Order Block"],
    riskNotes: ["Check spread"],
    updatedAt: Date.now(),
  };

  // 1. MT5 EA Order contract
  const mt5 = buildMt5EaOrder(dummySignal, 888369);
  assert.equal(mt5.symbol, "EURUSD");
  assert.equal(mt5.cmd, "OP_BUY");
  assert.equal(mt5.type, "BUY");
  assert.equal(mt5.price, 1.0850);
  assert.equal(mt5.sl, 1.0825);
  assert.equal(mt5.tp1, 1.0880);
  assert.equal(mt5.tp2, 1.0900);
  assert.equal(mt5.tp3, 1.0925);
  assert.equal(mt5.lots, 0.40);
  assert.equal(mt5.magicNumber, 888369);

  // 2. Telegram Alert text
  const tgText = buildTelegramAlertMessage(dummySignal);
  assert.ok(tgText.includes("ORCA QUANT FOREX VIP SIGNAL"));
  assert.ok(tgText.includes("#EURUSD"));
  assert.ok(tgText.includes("MUA (BUY)"));
  assert.ok(tgText.includes("0.4 Lot"));
  assert.ok(tgText.includes("1.0880"));
});
