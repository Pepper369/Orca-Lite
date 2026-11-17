import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCriticalNewsEvent,
  isPairAffectedByCurrency,
  evaluateNewsCircuitBreaker,
  calculateDynamicSlippageBuffer,
} from "../engines/forex-news-shield";
import {
  getCmeMappingForPair,
  reconstructSyntheticDom,
} from "../engines/forex-cme-dom-bridge";
import type { OhlcvBar } from "../types";

test("News Shield: isCriticalNewsEvent detects high impact macro events", () => {
  assert.equal(isCriticalNewsEvent("US Non-Farm Payrolls"), true);
  assert.equal(isCriticalNewsEvent("Core CPI MoM"), true);
  assert.equal(isCriticalNewsEvent("FOMC Rate Decision"), true);
  assert.equal(isCriticalNewsEvent("Fed Chair Powell Speaks"), true);
  assert.equal(isCriticalNewsEvent("ECB President Lagarde Speech"), true);
  assert.equal(isCriticalNewsEvent("Minor Trade Balance"), false);
});

test("News Shield: isPairAffectedByCurrency maps currencies accurately", () => {
  assert.equal(isPairAffectedByCurrency("EURUSD", "USD"), true);
  assert.equal(isPairAffectedByCurrency("EURUSD", "EUR"), true);
  assert.equal(isPairAffectedByCurrency("USDJPY", "JPY"), true);
  assert.equal(isPairAffectedByCurrency("EURGBP", "USD"), true); // USD affects global FX liquidity
  assert.equal(isPairAffectedByCurrency("EURGBP", "JPY"), false);
});

test("News Shield: Circuit Breaker activates PRE_NEWS_FREEZE and POST_NEWS_COOLDOWN", () => {
  const baseTime = 1700000000000;
  const nfpEventTime = baseTime + 10 * 60 * 1000; // NFP in 10 minutes

  const calendarEvents = [
    {
      name: "Non-Farm Payrolls",
      currency: "USD",
      time: new Date(nfpEventTime).toISOString(),
      importance: "CRITICAL",
    },
  ];

  // 1. 10 minutes before NFP -> PRE_NEWS_FREEZE
  const preResult = evaluateNewsCircuitBreaker("EURUSD", baseTime, calendarEvents);
  assert.equal(preResult.isLockout, true);
  assert.equal(preResult.stage, "PRE_NEWS_FREEZE");
  assert.equal(preResult.recommendedAction, "CANCEL_PENDING_ORDERS");
  assert.ok(preResult.warningMessage?.includes("Non-Farm Payrolls"));

  // 2. 5 minutes after NFP -> POST_NEWS_COOLDOWN
  const postTime = nfpEventTime + 5 * 60 * 1000;
  const postResult = evaluateNewsCircuitBreaker("EURUSD", postTime, calendarEvents);
  assert.equal(postResult.isLockout, true);
  assert.equal(postResult.stage, "POST_NEWS_COOLDOWN");
  assert.equal(postResult.recommendedAction, "WAIT_SPREAD_NORMALIZATION");

  // 3. 45 minutes after NFP -> NORMAL stage
  const safeTime = nfpEventTime + 45 * 60 * 1000;
  const safeResult = evaluateNewsCircuitBreaker("EURUSD", safeTime, calendarEvents);
  assert.equal(safeResult.isLockout, false);
  assert.equal(safeResult.stage, "NORMAL");
  assert.equal(safeResult.recommendedAction, "NORMAL_TRADING");
});

test("News Shield: calculateDynamicSlippageBuffer widens buffer during news", () => {
  const calmBuffer = calculateDynamicSlippageBuffer("EURUSD", 1.2);
  assert.equal(calmBuffer.urgencyLevel, "LOW");
  assert.ok(calmBuffer.recommendedSlippagePips <= 2.5);

  const nfpTime = Date.now() + 5 * 60 * 1000; // in 5 mins
  const newsEvents = [
    {
      name: "US CPI MoM",
      currency: "USD",
      time: new Date(nfpTime).toISOString(),
      importance: "CRITICAL",
    },
  ];
  const cb = evaluateNewsCircuitBreaker("EURUSD", Date.now(), newsEvents);
  assert.equal(cb.isLockout, true);
  assert.ok(cb.slippageBufferPips >= 8.0);
});

test("CME DOM Bridge: maps Spot FX pairs to CME Currency Futures", () => {
  const eurusd = getCmeMappingForPair("EURUSD");
  assert.ok(eurusd);
  assert.equal(eurusd?.cmeTicker, "6E=F");
  assert.equal(eurusd?.exchange, "CME");

  const xauusd = getCmeMappingForPair("XAUUSD");
  assert.ok(xauusd);
  assert.equal(xauusd?.cmeTicker, "GC=F");
  assert.equal(xauusd?.exchange, "COMEX");

  const usdjpy = getCmeMappingForPair("USDJPY");
  assert.ok(usdjpy);
  assert.equal(usdjpy?.cmeTicker, "6J=F");
  assert.equal(usdjpy?.isInverse, true);
});

test("CME DOM Bridge: reconstructs 5 Bids x 5 Asks synthetic Level 2 DOM", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 25; i++) {
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0800,
      high: 1.0830,
      low: 1.0790,
      close: 1.0825,
      volume: 5000,
    });
  }

  const dom = reconstructSyntheticDom("EURUSD", bars, 1.2);
  assert.ok(dom.cmeContract);
  assert.equal(dom.cmeContract?.cmeTicker, "6E=F");
  assert.equal(dom.depthLevels.length, 5);

  // Check 5 levels
  for (let i = 0; i < 5; i++) {
    const lvl = dom.depthLevels[i];
    assert.equal(lvl.level, i + 1);
    assert.ok(lvl.bidPrice < lvl.askPrice);
    assert.ok(lvl.bidVolume > 0);
    assert.ok(lvl.askVolume > 0);

    if (i > 0) {
      // Bids descend, Asks ascend
      assert.ok(lvl.bidPrice < dom.depthLevels[i - 1].bidPrice);
      assert.ok(lvl.askPrice > dom.depthLevels[i - 1].askPrice);
    }
  }

  assert.ok(dom.totalBidLiquidity > 0);
  assert.ok(dom.totalAskLiquidity > 0);
  assert.ok(dom.orderBookImbalanceRatio >= -100 && dom.orderBookImbalanceRatio <= 100);
});
