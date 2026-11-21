import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchSignalWithVault,
  executePlatformOrder,
  validateDispatchableSignalGeometry,
  type DispatchableSignalInput,
} from "@/lib/services/auto-trade-dispatcher";
import {
  computeMultiTierTpChunks,
  getEmpiricalFrictionTelemetry,
  placeBinanceFuturesOrder,
  placeMetaApiMt5Order,
  placeOkxSwapOrder,
  planSmartOrderExecution,
  recordExecutionSlippageTelemetry,
  validateExchangeOrderGeometry,
} from "@/lib/engines/exchange-execution-client";
import {
  buildMt5EaOrder,
  buildTelegramAlertMessage,
  dispatchForexWebhook,
  sanitizeMt5Comment,
  sanitizeWebhookText,
} from "@/lib/services/forex-webhook-dispatcher";
import type { FollowerAccount } from "@/lib/engines/copy-trade-engine";
import type { ForexQuantSignalItem } from "@/lib/services/forex-signals-hub";

function makeFollower(overrides: Partial<FollowerAccount> = {}): FollowerAccount {
  return {
    id: `hardening_acct_${Math.random().toString(36).slice(2, 8)}`,
    name: "Hardening Test Account",
    platform: "BINANCE_FUTURES",
    accountNumberMasked: "abcd****9999",
    balanceUsd: 10_000,
    riskMultiplier: 1.0,
    maxAllowedSlippagePips: 5.0,
    leverageCap: 10,
    isTestnet: true,
    isActive: true,
    autoExecuteEnabled: true,
    killSwitched: false,
    connectionStatus: "PAPER_SIMULATED",
    maxDailyLossUsd: 500,
    dailyRealizedPnlUsd: 0,
    hasApiKey: false,
    totalCopiedTrades: 0,
    winratePct: 0,
    totalPnlUsd: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

const VALID_BUY_SIGNAL: DispatchableSignalInput = {
  id: "sig_valid_buy",
  symbol: "BTCUSDT",
  assetType: "CRYPTO",
  direction: "BUY",
  entryPrice: 90_000,
  stopLossPrice: 88_500,
  takeProfit1: 93_000,
  takeProfit2: 95_000,
  takeProfit3: 98_000,
  masterLotsOrQty: 0.05,
  masterCapitalUsd: 10_000,
  winrateScore: 86,
  setupGrade: "A+",
  recommendedLeverage: 5,
  timestamp: Date.now(),
};

test("Auto-Trade Dispatcher: Rejects NaN, Infinity, negative prices, and inverted SL/TP geometry before reaching exchange", async () => {
  let executorCalls = 0;
  const spyExecutor: typeof executePlatformOrder = async (...args) => {
    executorCalls++;
    return executePlatformOrder(...args);
  };

  const adversarialSignals: Array<{ label: string; patch: Partial<DispatchableSignalInput>; marketPrice?: number }> = [
    { label: "NaN entryPrice", patch: { entryPrice: Number.NaN } },
    { label: "Infinity entryPrice", patch: { entryPrice: Number.POSITIVE_INFINITY } },
    { label: "Negative entryPrice", patch: { entryPrice: -90_000 } },
    { label: "Zero stopLossPrice", patch: { stopLossPrice: 0 } },
    { label: "NaN stopLossPrice", patch: { stopLossPrice: Number.NaN } },
    { label: "-Infinity takeProfit1", patch: { takeProfit1: Number.NEGATIVE_INFINITY } },
    { label: "Inverted BUY SL >= entryPrice", patch: { direction: "BUY", entryPrice: 90_000, stopLossPrice: 90_500 } },
    { label: "Equal BUY SL == entryPrice", patch: { direction: "BUY", entryPrice: 90_000, stopLossPrice: 90_000 } },
    { label: "Inverted BUY TP1 <= entryPrice", patch: { direction: "BUY", entryPrice: 90_000, takeProfit1: 89_500 } },
    {
      label: "Inverted SELL SL <= entryPrice",
      patch: {
        direction: "SELL",
        entryPrice: 90_000,
        stopLossPrice: 89_000,
        takeProfit1: 87_000,
        takeProfit2: 86_000,
        takeProfit3: 85_000,
      },
    },
    {
      label: "Inverted SELL TP1 >= entryPrice",
      patch: {
        direction: "SELL",
        entryPrice: 90_000,
        stopLossPrice: 91_500,
        takeProfit1: 90_500,
        takeProfit2: 88_000,
        takeProfit3: 86_000,
      },
    },
    { label: "NaN currentMarketPrice", patch: {}, marketPrice: Number.NaN },
    { label: "Negative currentMarketPrice", patch: {}, marketPrice: -100 },
  ];

  for (const item of adversarialSignals) {
    const acct = makeFollower({ id: `acct_${item.label.replace(/\s+/g, "_")}` });
    const sig: DispatchableSignalInput = {
      ...VALID_BUY_SIGNAL,
      id: `sig_${item.label.replace(/\s+/g, "_")}_${Date.now()}`,
      ...item.patch,
    };
    const geom = validateDispatchableSignalGeometry(sig, item.marketPrice ?? sig.entryPrice);
    assert.equal(geom.valid, false, `Expected geometry check to fail for: ${item.label}`);

    const orders = await dispatchSignalWithVault({
      signal: sig,
      currentMarketPrice: item.marketPrice,
      manualOverride: true,
      overrideAccounts: [acct],
      orderExecutor: spyExecutor,
    });
    assert.equal(orders.length, 1);
    assert.equal(orders[0]?.status, "REJECTED_EXCHANGE", `Must reject ${item.label} with REJECTED_EXCHANGE`);
    assert.equal(orders[0]?.copiedLotsOrQty, 0);
  }

  assert.equal(executorCalls, 0, "Order executor must never be invoked when signal geometry is invalid");
});

test("Auto-Trade Dispatcher: Rejects corrupt account balanceUsd / riskMultiplier and clamps extreme leverage to [1, 20]", async () => {
  let capturedLeverage = 0;
  let capturedQty = 0;

  const badAccounts: FollowerAccount[] = [
    makeFollower({ id: "bad_bal_nan", balanceUsd: Number.NaN }),
    makeFollower({ id: "bad_bal_neg", balanceUsd: -5000 }),
    makeFollower({ id: "bad_bal_zero", balanceUsd: 0 }),
    makeFollower({ id: "bad_risk_nan", riskMultiplier: Number.NaN }),
    makeFollower({ id: "bad_risk_neg", riskMultiplier: -1.5 }),
    makeFollower({ id: "bad_risk_inf", riskMultiplier: Number.POSITIVE_INFINITY }),
  ];

  const badOrders = await dispatchSignalWithVault({
    signal: { ...VALID_BUY_SIGNAL, id: `sig_bad_acct_${Date.now()}` },
    manualOverride: true,
    overrideAccounts: badAccounts,
  });

  assert.equal(badOrders.length, badAccounts.length);
  for (const ord of badOrders) {
    assert.equal(ord.status, "REJECTED_EXCHANGE");
    assert.equal(ord.copiedLotsOrQty, 0);
  }

  // Extreme leverage (> 20x) and negative leverage (<= 0) must be clamped to [1, 20]
  const extremeLevAcct = makeFollower({
    id: "acct_extreme_lev",
    leverageCap: 150,
  });
  const highLevRes = await dispatchSignalWithVault({
    signal: {
      ...VALID_BUY_SIGNAL,
      id: `sig_high_lev_${Date.now()}`,
      recommendedLeverage: 500,
    },
    manualOverride: true,
    overrideAccounts: [extremeLevAcct],
    orderExecutor: async (acct, signal, qty, lev, mktPx, slip, idem) => {
      capturedLeverage = lev;
      capturedQty = qty;
      return executePlatformOrder(acct, signal, qty, lev, mktPx, slip, idem);
    },
  });
  assert.equal(highLevRes[0]?.status, "FILLED_PAPER");
  assert.equal(capturedLeverage, 20, "Extreme leverage 500x with cap 150x must be clamped to 20x");
  assert.ok(Number.isFinite(capturedQty) && capturedQty > 0);

  const negLevAcct = makeFollower({
    id: "acct_neg_lev",
    leverageCap: -10,
  });
  await dispatchSignalWithVault({
    signal: {
      ...VALID_BUY_SIGNAL,
      id: `sig_neg_lev_${Date.now()}`,
      recommendedLeverage: -5,
    },
    manualOverride: true,
    overrideAccounts: [negLevAcct],
    orderExecutor: async (acct, signal, qty, lev, mktPx, slip, idem) => {
      capturedLeverage = lev;
      return executePlatformOrder(acct, signal, qty, lev, mktPx, slip, idem);
    },
  });
  assert.ok(capturedLeverage >= 1 && capturedLeverage <= 20, `Negative leverage must clamp to [1, 20], got ${capturedLeverage}`);
});

test("Exchange Execution Client: computeMultiTierTpChunks & planSmartOrderExecution handle non-finite, zero, negative, and inverted inputs safely", () => {
  // 1. computeMultiTierTpChunks adversarial inputs
  assert.deepEqual(
    computeMultiTierTpChunks({
      totalQty: 0,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 91_500,
    }),
    [],
  );
  assert.deepEqual(
    computeMultiTierTpChunks({
      totalQty: -1.5,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 91_500,
    }),
    [],
  );
  assert.deepEqual(
    computeMultiTierTpChunks({
      totalQty: Number.NaN,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 91_500,
    }),
    [],
  );
  assert.deepEqual(
    computeMultiTierTpChunks({
      totalQty: 0.5,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: Number.NaN,
    }),
    [],
  );

  // Inverted TP1 relative to entryPrice + direction must return empty
  assert.deepEqual(
    computeMultiTierTpChunks({
      totalQty: 0.5,
      stepSize: "0.001",
      minQty: 0.001,
      minNotional: 5,
      tickSize: "0.1",
      tp1: 89_000,
      entryPrice: 90_000,
      direction: "BUY",
    }),
    [],
  );

  // Non-monotonic TP3 (e.g. TP1=91500 < TP2=93000, but TP3=92000 <= TP2) collapses out-of-order TP3
  const collapsedChunks = computeMultiTierTpChunks({
    totalQty: 0.2,
    stepSize: "0.001",
    minQty: 0.001,
    minNotional: 5,
    tickSize: "0.1",
    tp1: 91_500,
    tp2: 93_000,
    tp3: 92_000,
  });
  assert.equal(collapsedChunks.length, 2, "Non-monotonic TP3 must be dropped, collapsing cleanly to 2 tiers");

  // 2. planSmartOrderExecution adversarial inputs (0, negative, NaN, Infinity, crossed bid/ask)
  for (const badQty of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = planSmartOrderExecution({
      symbol: "BTCUSDT",
      direction: "BUY",
      totalQty: badQty,
      entryPrice: 91_000,
    });
    assert.equal(plan.totalQty, 0);
    assert.equal(plan.orderNotionalUsd, 0);
    assert.equal(plan.slices.length, 0);
    assert.equal(plan.fallbackToMarketOnTimeout, false);
  }

  for (const badPrice of [0, -91_000, Number.NaN, Number.NEGATIVE_INFINITY]) {
    const plan = planSmartOrderExecution({
      symbol: "BTCUSDT",
      direction: "SELL",
      totalQty: 0.2,
      entryPrice: badPrice,
    });
    assert.equal(plan.totalQty, 0);
    assert.equal(plan.orderNotionalUsd, 0);
    assert.equal(plan.slices.length, 0);
  }

  // Crossed order book (bestBid > bestAsk) and NaN volatility must still produce finite post-only price
  const crossedBookPlan = planSmartOrderExecution({
    symbol: "BTCUSDT",
    direction: "BUY",
    totalQty: 0.1,
    entryPrice: 91_000,
    bestBid: 92_000,
    bestAsk: 90_000,
    top5BookDepthUsd: -5000,
    dailyVolatilityPct: Number.NaN,
    tickSize: "0.1",
  });
  assert.ok(Number.isFinite(crossedBookPlan.peggedLimitPrice) && crossedBookPlan.peggedLimitPrice > 0);
  assert.ok(Number.isFinite(crossedBookPlan.orderNotionalUsd) && crossedBookPlan.orderNotionalUsd > 0);
  assert.equal(crossedBookPlan.slices.length, 1);
});

test("Exchange Execution Client: recordExecutionSlippageTelemetry & direct exchange connectors reject inverted SL and non-finite inputs", async () => {
  const sym = `TESTSLIP${Date.now()}`;

  // Non-finite, zero, negative, or inverted SL must return null and never pollute telemetry buffer
  assert.equal(
    recordExecutionSlippageTelemetry({
      symbol: sym,
      assetType: "CRYPTO",
      direction: "BUY",
      intendedEntryPrice: 90_000,
      executedFillPrice: 90_010,
      stopLossPrice: Number.NaN,
    }),
    null,
  );
  assert.equal(
    recordExecutionSlippageTelemetry({
      symbol: sym,
      assetType: "CRYPTO",
      direction: "BUY",
      intendedEntryPrice: 90_000,
      executedFillPrice: 90_010,
      stopLossPrice: 90_500, // Inverted BUY SL >= entry
    }),
    null,
  );
  assert.equal(
    recordExecutionSlippageTelemetry({
      symbol: sym,
      assetType: "CRYPTO",
      direction: "SELL",
      intendedEntryPrice: 90_000,
      executedFillPrice: 89_990,
      stopLossPrice: 89_500, // Inverted SELL SL <= entry
    }),
    null,
  );
  assert.equal(
    recordExecutionSlippageTelemetry({
      symbol: sym,
      assetType: "CRYPTO",
      direction: "BUY",
      intendedEntryPrice: -90_000,
      executedFillPrice: 90_000,
      stopLossPrice: 88_000,
    }),
    null,
  );

  const summaryAfterBad = getEmpiricalFrictionTelemetry(sym);
  assert.equal(summaryAfterBad.sampleCount, 0, "Invalid slippage samples must not enter telemetry buffer");

  // Direct exchange connectors must reject invalid geometry prior to network I/O
  const dummyCreds = { apiKey: "k", apiSecret: "s", passphrase: "p", isTestnet: true };
  const badOrderReq = {
    credentials: dummyCreds,
    symbol: "BTCUSDT",
    direction: "BUY" as const,
    baseQty: 0.1,
    entryPrice: 90_000,
    stopLossPrice: 91_000, // Inverted BUY SL
    takeProfit1: 93_000,
    leverage: 5,
    idempotencyKey: "idem_bad_geom",
  };
  assert.equal(validateExchangeOrderGeometry(badOrderReq).valid, false);

  const [bnRes, okxRes, mt5Res] = await Promise.all([
    placeBinanceFuturesOrder(badOrderReq),
    placeOkxSwapOrder(badOrderReq),
    placeMetaApiMt5Order(badOrderReq),
  ]);
  assert.equal(bnRes.ok, false);
  assert.equal(bnRes.status, "REJECTED_EXCHANGE");
  assert.equal(okxRes.ok, false);
  assert.equal(okxRes.status, "REJECTED_EXCHANGE");
  assert.equal(mt5Res.ok, false);
  assert.equal(mt5Res.status, "REJECTED_EXCHANGE");
});

test("Forex Webhook Dispatcher: Sanitizes Markdown/JSON/MQL comment injection and guards invalid/inverted geometry", async () => {
  const maliciousSignal: ForexQuantSignalItem = {
    pair: 'EURUSD"; DROP TABLE *\n_[evil](https://evil.test)',
    symbol: 'EUR/USD`*[hack](http://169.254.169.254)`',
    direction: "BUY",
    action: "BUY",
    timeframe: "M15`*[INJECT]*`\n\r",
    status: "ACTIVE",
    strength: 999,
    probability: Number.NaN,
    lastPrice: 1.085,
    entryPrice: 1.085,
    stopLossPrice: 1.095, // Inverted BUY SL (> entryPrice)
    tp1: 1.075, // Inverted BUY TP1 (< entryPrice)
    tp2: Number.NEGATIVE_INFINITY,
    tp3: Number.NaN,
    stopPips: -50,
    riskReward: 2.0,
    session: 'LONDON"}\r\n<script>alert(1)</script>',
    sessionEligible: true,
    spreadPips: 0.8,
    regime: "TRENDING_UP *bold* _italic_ `code` [link](http://evil)",
    recommendedLots: -99,
    riskAmountUsd: 100,
    evidence: [],
    riskNotes: [],
    updatedAt: Date.now(),
  };

  // 1. MT5 EA payload hardening
  const mt5 = buildMt5EaOrder(maliciousSignal, Number.NaN);
  assert.equal(mt5.symbol, "EURUSDDROPTABLEE");
  assert.equal(mt5.magicNumber, 888369);
  assert.match(mt5.comment, /^[A-Za-z0-9_.-]{1,31}$/, "MT5 comment must be strictly alphanumeric/safe and <= 31 chars");
  assert.ok(Number.isFinite(mt5.price) && mt5.price === 1.085);
  assert.ok(Number.isFinite(mt5.sl) && mt5.sl > 0 && mt5.sl < mt5.price, `Repaired BUY SL (${mt5.sl}) must be < entry (${mt5.price})`);
  assert.ok(Number.isFinite(mt5.tp1) && mt5.tp1 > mt5.price, `Repaired BUY TP1 (${mt5.tp1}) must be > entry (${mt5.price})`);
  assert.ok(Number.isFinite(mt5.tp2) && mt5.tp2 >= mt5.tp1);
  assert.ok(Number.isFinite(mt5.tp3) && mt5.tp3 >= mt5.tp2);
  assert.equal(mt5.lots, 0.1, "Negative recommendedLots must fallback to safe 0.1 lot");

  // 2. Completely non-finite entryPrice and lastPrice -> safe zeroed payload
  const deadMt5 = buildMt5EaOrder({
    ...maliciousSignal,
    entryPrice: Number.NaN,
    lastPrice: -10,
  });
  assert.equal(deadMt5.price, 0);
  assert.equal(deadMt5.lots, 0);
  assert.equal(deadMt5.sl, 0);
  assert.equal(deadMt5.tp1, 0);

  // 3. Telegram Markdown message sanitization
  const tg = buildTelegramAlertMessage(maliciousSignal);
  assert.equal(tg.includes("https://evil.test"), false);
  assert.equal(tg.includes("169.254.169.254"), false);
  assert.equal(tg.includes("<script>"), false);
  assert.equal(tg.includes("NaN"), false);
  assert.equal(tg.includes("Infinity"), false);
  // Inverted SL (1.095 > 1.085 on BUY) and inverted TP1 (1.075 < 1.085 on BUY) must be suppressed to "—"
  assert.ok(tg.includes("🛑 *Cắt lỗ (Stop Loss):* `—` (25 pips)"));
  assert.ok(tg.includes("🎯 *Mục tiêu 1 (TP1 - R:R 1.2):* `—`"));

  // 4. Direct helper unit checks
  assert.equal(sanitizeWebhookText('Hello *[world]* `cmd` \n\r <tag>'), "Hello world cmd tag");
  assert.equal(sanitizeMt5Comment('Orca"; DROP TABLE;--\n\r', 31), "OrcaDROPTABLE--");

  // 5. dispatchForexWebhook rejects inverted MT5 order payload before network call
  const badWebhookRes = await dispatchForexWebhook("https://hooks.slack.com/services/T00/B00/X00", {
    cmd: "OP_BUY",
    symbol: "EURUSD",
    price: 1.085,
    sl: 1.09, // Inverted BUY SL >= price
    tp: 1.095,
    lots: 0.1,
  });
  assert.equal(badWebhookRes.success, false);
  assert.equal(badWebhookRes.status, 422);
});
