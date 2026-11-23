import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  filterExecutablePairs,
  recordPairCooldown,
  checkPairCooldown,
  clearPairCooldown,
  evaluateSpreadFilter,
  evaluateVolumeFilter,
  evaluateVolatilityPumpDumpFilter,
  evaluatePrecisionFilter,
  DEFAULT_PAIRLIST_CONFIG,
  type PairMarketSnapshot,
} from "../engines/bot-pairlist-governor";

describe("Bot Pairlist Governor Engine (Freqtrade Parity)", () => {
  beforeEach(() => {
    clearPairCooldown();
  });

  it("evaluateSpreadFilter: rejects crypto pairs with excessive bid-ask spread (> 0.15%)", () => {
    // Normal tight spread: Mid = 50,000, Spread = 25 (0.05%) -> PASS
    const tightSnapshot: PairMarketSnapshot = {
      symbol: "BTCUSDT",
      price: 50000,
      bidPrice: 49987.5,
      askPrice: 50012.5,
    };
    const tightRes = evaluateSpreadFilter(tightSnapshot, "CRYPTO", DEFAULT_PAIRLIST_CONFIG);
    assert.equal(tightRes.passed, true);

    // Wide spread: Mid = 50,000, Spread = 150 (0.30% > 0.15%) -> REJECT
    const wideSnapshot: PairMarketSnapshot = {
      symbol: "SHITCOIN",
      price: 50000,
      bidPrice: 49925,
      askPrice: 50075,
    };
    const wideRes = evaluateSpreadFilter(wideSnapshot, "CRYPTO", DEFAULT_PAIRLIST_CONFIG);
    assert.equal(wideRes.passed, false);
    assert.equal(wideRes.rejection?.filter, "SPREAD");
    assert.ok(wideRes.rejection?.reason.includes("Crypto spread"));
  });

  it("evaluateSpreadFilter: rejects forex pairs with excessive spread in pips", () => {
    // EURUSD: 1.5 pips -> PASS (limit 3.5 pips)
    const fxGood: PairMarketSnapshot = {
      symbol: "EURUSD",
      price: 1.085,
      bidPrice: 1.08492,
      askPrice: 1.08507, // diff = 0.00015 = 1.5 pips
    };
    const fxGoodRes = evaluateSpreadFilter(fxGood, "FOREX", DEFAULT_PAIRLIST_CONFIG);
    assert.equal(fxGoodRes.passed, true);

    // EURUSD: 4.5 pips -> REJECT (> 3.5 pips)
    const fxBad: PairMarketSnapshot = {
      symbol: "EURUSD",
      price: 1.085,
      bidPrice: 1.0847,
      askPrice: 1.08515, // diff = 0.00045 = 4.5 pips
    };
    const fxBadRes = evaluateSpreadFilter(fxBad, "FOREX", DEFAULT_PAIRLIST_CONFIG);
    assert.equal(fxBadRes.passed, false);
    assert.equal(fxBadRes.rejection?.filter, "SPREAD");
  });

  it("evaluateVolumeFilter: enforces minimum 24h quote volume", () => {
    const liquidSnapshot: PairMarketSnapshot = {
      symbol: "SOLUSDT",
      price: 150,
      volume24hUsd: 15_000_000,
    };
    assert.equal(evaluateVolumeFilter(liquidSnapshot, DEFAULT_PAIRLIST_CONFIG).passed, true);

    const illiquidSnapshot: PairMarketSnapshot = {
      symbol: "LOWCAPUSDT",
      price: 1.25,
      volume24hUsd: 150_000, // < $500k
    };
    const illiquidRes = evaluateVolumeFilter(illiquidSnapshot, DEFAULT_PAIRLIST_CONFIG);
    assert.equal(illiquidRes.passed, false);
    assert.equal(illiquidRes.rejection?.filter, "VOLUME");
  });

  it("evaluateVolatilityPumpDumpFilter: detects pump-and-dump candles and excessive 24h moves", () => {
    // Extreme 24h pump (+45% > 30%)
    const pumpSnapshot: PairMarketSnapshot = {
      symbol: "PUMPUSDT",
      price: 10,
      priceChange24hPct: 45.0,
    };
    const pumpRes = evaluateVolatilityPumpDumpFilter(pumpSnapshot, DEFAULT_PAIRLIST_CONFIG);
    assert.equal(pumpRes.passed, false);
    assert.equal(pumpRes.rejection?.filter, "VOLATILITY_PUMP_DUMP");

    // Candle spike > 3.5x ATR
    const spikeSnapshot: PairMarketSnapshot = {
      symbol: "SPIKEUSDT",
      price: 100,
      atr: 2.0,
      latestBar: {
        open: 100,
        high: 110, // range = 11 pts = 5.5x ATR (> 3.5x)
        low: 99,
        close: 108,
        volume: 1000,
      },
    };
    const spikeRes = evaluateVolatilityPumpDumpFilter(spikeSnapshot, DEFAULT_PAIRLIST_CONFIG);
    assert.equal(spikeRes.passed, false);
    assert.ok(spikeRes.rejection?.reason.includes("ATR"));
  });

  it("evaluatePrecisionFilter: filters out zero/negative prices and sub-satoshi dust", () => {
    const deadToken: PairMarketSnapshot = {
      symbol: "DEADCOIN",
      price: 0,
    };
    assert.equal(evaluatePrecisionFilter(deadToken, DEFAULT_PAIRLIST_CONFIG).passed, false);

    const subSatoshi: PairMarketSnapshot = {
      symbol: "SUBDUST",
      price: 1e-11, // below minPriceThreshold (1e-8)
    };
    assert.equal(evaluatePrecisionFilter(subSatoshi, DEFAULT_PAIRLIST_CONFIG).passed, false);
  });

  it("recordPairCooldown & checkPairCooldown: enforces temporary quarantine with backoff", () => {
    const baseTime = 1000000;
    const cooldownEntry = recordPairCooldown("BTCUSDT", "Consecutive StopLoss hit", 15 * 60000, baseTime);

    assert.equal(cooldownEntry.symbol, "BTCUSDT");
    assert.equal(cooldownEntry.consecutiveTriggers, 1);
    assert.equal(cooldownEntry.untilTimestampMs, baseTime + 15 * 60000);

    // Check while active
    const activeCheck = checkPairCooldown("BTCUSDT", baseTime + 5 * 60000);
    assert.equal(activeCheck.inCooldown, true);
    assert.equal(activeCheck.remainingSec, 10 * 60);

    // Repeat trigger within cooldown escalates backoff (1.5x)
    const repeatEntry = recordPairCooldown("BTCUSDT", "Second StopLoss hit", 15 * 60000, baseTime + 6 * 60000);
    assert.equal(repeatEntry.consecutiveTriggers, 2);
    // 15 mins * 1.5 = 22.5 mins
    assert.equal(repeatEntry.untilTimestampMs, baseTime + 6 * 60000 + 22.5 * 60000);

    // Check after expiry
    const expiredCheck = checkPairCooldown("BTCUSDT", baseTime + 40 * 60000);
    assert.equal(expiredCheck.inCooldown, false);
  });

  it("filterExecutablePairs: aggregates gates and produces clean qualified symbol list", () => {
    const candidates = ["BTCUSDT", "ETHUSDT", "BADSPREAD", "LOWVOL", "COOLPAIR"];
    const nowMs = 5000000;

    // Put COOLPAIR in cooldown
    recordPairCooldown("COOLPAIR", "High slippage event", 20 * 60000, nowMs);

    const snapshots = new Map<string, PairMarketSnapshot>([
      [
        "BTCUSDT",
        {
          symbol: "BTCUSDT",
          price: 65000,
          bidPrice: 64995,
          askPrice: 65005,
          volume24hUsd: 800_000_000,
          priceChange24hPct: 2.1,
        },
      ],
      [
        "ETHUSDT",
        {
          symbol: "ETHUSDT",
          price: 3500,
          bidPrice: 3499,
          askPrice: 3501,
          volume24hUsd: 400_000_000,
          priceChange24hPct: -1.2,
        },
      ],
      [
        "BADSPREAD",
        {
          symbol: "BADSPREAD",
          price: 10,
          bidPrice: 9.8,
          askPrice: 10.2, // 4% spread (> 0.15%)
          volume24hUsd: 5_000_000,
        },
      ],
      [
        "LOWVOL",
        {
          symbol: "LOWVOL",
          price: 5,
          bidPrice: 4.999,
          askPrice: 5.001,
          volume24hUsd: 80_000, // < $500k
        },
      ],
      [
        "COOLPAIR",
        {
          symbol: "COOLPAIR",
          price: 25,
          bidPrice: 24.99,
          askPrice: 25.01,
          volume24hUsd: 10_000_000,
        },
      ],
    ]);

    const result = filterExecutablePairs({
      candidates,
      assetType: "CRYPTO",
      marketDataMap: snapshots,
      nowMs,
    });

    assert.deepEqual(result.eligiblePairs, ["BTCUSDT", "ETHUSDT"]);
    assert.equal(result.rejectedPairs.length, 3);

    const coolRej = result.rejectedPairs.find((r) => r.symbol === "COOLPAIR");
    assert.equal(coolRej?.filter, "COOLDOWN");

    const spreadRej = result.rejectedPairs.find((r) => r.symbol === "BADSPREAD");
    assert.equal(spreadRej?.filter, "SPREAD");

    const volRej = result.rejectedPairs.find((r) => r.symbol === "LOWVOL");
    assert.equal(volRej?.filter, "VOLUME");
  });
});
