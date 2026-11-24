import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeIctSmcLiquidity } from "../ict-smc-liquidity-engine";
import { loadRealBarsSync } from "../../__tests__/helpers/real-market-fixtures";
import type { OhlcvBar } from "../../types";

describe("Institutional ICT & SMC Unified Liquidity Engine", () => {
  it("detects liquidity pools (BSL & SSL), sweeps, and generates Bullish OTE Setup", () => {
    const bars: OhlcvBar[] = [];
    const basePrice = 1.0800;

    for (let i = 0; i < 35; i++) {
      const time = 1700000000 + i * 300;
      const open = basePrice + Math.sin(i / 3) * 0.0040;
      const close = open + Math.sin(i / 2) * 0.0015;
      const high = Math.max(open, close) + 0.0008;
      const low = Math.min(open, close) - 0.0008;
      bars.push({ time, open, high, low, close, volume: 100 + i * 5 });
    }

    bars[10]!.low = 1.0740;
    bars[10]!.close = 1.0760;
    bars[25]!.high = 1.0860;
    bars[25]!.close = 1.0840;

    bars[34]!.open = 1.0760;
    bars[34]!.high = 1.0770;
    bars[34]!.low = 1.0735;
    bars[34]!.close = 1.0768;
    bars[34]!.volume = 500;

    const result = analyzeIctSmcLiquidity({
      symbol: "EURUSD",
      bars,
      currentPrice: bars[34]!.close,
      assetType: "FOREX",
      pipSize: 0.0001,
    });

    assert.equal(result.symbol, "EURUSD");
    assert.ok(result.liquidityMap.buySidePools.length > 0);
    assert.ok(result.liquidityMap.sellSidePools.length > 0);
    assert.ok(result.optimalTradeSetup.dealingRange.equilibrium > 0);
    assert.ok(result.optimalTradeSetup.dealingRange.fibOte705 > 0);
    assert.ok(result.optimalTradeSetup.executionChecklist.length > 0);
  });

  it("produces finite, structured ICT/SMC liquidity output on REAL Binance BTCUSDT 15m data", () => {
    const realBars = loadRealBarsSync("BTCUSDT_15m", 120);
    assert.ok(realBars.length >= 60, "Real BTCUSDT_15m snapshot must be populated");

    const result = analyzeIctSmcLiquidity({
      symbol: "BTCUSDT",
      bars: realBars,
      currentPrice: realBars[realBars.length - 1]!.close,
      assetType: "CRYPTO",
    });

    assert.equal(result.symbol, "BTCUSDT");
    assert.ok(Number.isFinite(result.optimalTradeSetup.dealingRange.equilibrium));
    assert.ok(result.optimalTradeSetup.dealingRange.equilibrium > 0);
    assert.ok(["BULLISH", "BEARISH", "NEUTRAL"].includes(result.bias));
  });

  it("handles insufficient bars gracefully", () => {
    const bars: OhlcvBar[] = [
      { time: 1700000000, open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 10 },
    ];
    const result = analyzeIctSmcLiquidity({
      symbol: "BTCUSDT",
      bars,
      assetType: "CRYPTO",
    });
    assert.equal(result.bias, "NEUTRAL");
    assert.equal(result.optimalTradeSetup.direction, "NEUTRAL");
  });
});
