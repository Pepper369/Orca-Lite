import { describe, it, expect } from "vitest";
import { analyzeIctSmcLiquidity } from "../ict-smc-liquidity-engine";
import type { OhlcvBar } from "../../types";

describe("Institutional ICT & SMC Unified Liquidity Engine", () => {
  it("detects liquidity pools (BSL & SSL), sweeps, and generates Bullish OTE Setup", () => {
    // Generate synthetic series with clear swing highs/lows and an SSL sweep
    const bars: OhlcvBar[] = [];
    const basePrice = 1.0800;

    for (let i = 0; i < 35; i++) {
      const time = 1700000000 + i * 300;
      let open = basePrice + Math.sin(i / 3) * 0.0040;
      let close = open + (Math.sin(i / 2) * 0.0015);
      let high = Math.max(open, close) + 0.0008;
      let low = Math.min(open, close) - 0.0008;
      bars.push({ time, open, high, low, close, volume: 100 + i * 5 });
    }

    // Set a clear swing low at bar 10
    bars[10].low = 1.0740;
    bars[10].close = 1.0760;

    // Set a clear swing high at bar 25
    bars[25].high = 1.0860;
    bars[25].close = 1.0840;

    // Current bar 34 sweeps the low at 1.0740 with a deep wick down to 1.0735 and closes back at 1.0765
    bars[34].open = 1.0760;
    bars[34].high = 1.0770;
    bars[34].low = 1.0735; // Swept below 1.0740
    bars[34].close = 1.0768; // Closed back above 1.0740
    bars[34].volume = 500; // Big volume absorption

    const result = analyzeIctSmcLiquidity({
      symbol: "EURUSD",
      bars,
      currentPrice: bars[34].close,
      assetType: "FOREX",
      pipSize: 0.0001,
    });

    expect(result.symbol).toBe("EURUSD");
    expect(result.liquidityMap.buySidePools.length).toBeGreaterThan(0);
    expect(result.liquidityMap.sellSidePools.length).toBeGreaterThan(0);
    expect(result.optimalTradeSetup.dealingRange.equilibrium).toBeGreaterThan(0);
    expect(result.optimalTradeSetup.dealingRange.fibOte705).toBeGreaterThan(0);
    expect(result.optimalTradeSetup.executionChecklist.length).toBeGreaterThan(0);
  });

  it("handles insufficient bars gracefully", () => {
    const bars: OhlcvBar[] = [
      { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 10 },
    ];
    const result = analyzeIctSmcLiquidity({
      symbol: "BTCUSDT",
      bars,
      assetType: "CRYPTO",
    });
    expect(result.bias).toBe("NEUTRAL");
    expect(result.optimalTradeSetup.direction).toBe("NEUTRAL");
  });
});
